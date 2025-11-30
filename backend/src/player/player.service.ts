import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LifecycleEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IpLocationService } from '../lib/ip2region/ip-location.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthmeService } from '../authme/authme.service';
import { LuckpermsService } from '../luckperms/luckperms.service';
import { buildPublicUrl } from '../lib/shared/url';
import { buildPagination } from '../lib/shared/pagination';
import { normalizeIpAddress } from '../lib/ip2region/ip-normalizer';
import type { LuckpermsPlayer } from '../luckperms/luckperms.interfaces';
import type {
  PlayerLoginCluster,
  PortalOwnershipOverview,
  PlayerLuckpermsSnapshot,
} from './player.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOGIN_MAP_RANGE_DAYS = 30;

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ipLocationService: IpLocationService,
    private readonly attachmentsService: AttachmentsService,
    private readonly authmeService: AuthmeService,
    private readonly luckpermsService: LuckpermsService,
  ) {}

  async getPlayerPortalData(viewerId: string | null, targetUserId: string) {
    const [summary, rawAssets, region, minecraft, stats, statusSnapshot] =
      await Promise.all([
        this.getPlayerSummary(targetUserId),
        this.getPlayerAssets(targetUserId),
        this.getPlayerRegion(targetUserId),
        this.getPlayerMinecraftData(targetUserId),
        this.getPlayerStats(targetUserId),
        this.getPlayerStatusSnapshot(targetUserId),
      ]);
    const assets = {
      companies: rawAssets.companies ?? [],
      railways: rawAssets.railways ?? [],
    };
    return {
      viewerId,
      targetId: targetUserId,
      summary,
      assets,
      region,
      minecraft,
      stats,
      statusSnapshot,
    };
  }

  async computeOwnershipOverview(
    userId: string,
  ): Promise<PortalOwnershipOverview> {
    const [bindings, permissionGroups, labels] = await Promise.all([
      this.prisma.userAuthmeBinding.count({ where: { userId } }),
      this.prisma.userRole.count({ where: { userId } }),
      this.prisma.userPermissionLabel.count({ where: { userId } }),
    ]);
    return {
      authmeBindings: bindings,
      permissionGroups,
      rbacLabels: labels,
    };
  }

  async getPlayerSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        avatarAttachmentId: true,
        createdAt: true,
        joinDate: true,
        lastLoginAt: true,
        lastLoginIp: true,
        profile: {
          select: {
            piic: true,
            displayName: true,
            primaryMinecraftProfileId: true,
            primaryAuthmeBindingId: true,
            birthday: true,
            gender: true,
            extra: true,
          },
        },
        contacts: {
          select: {
            id: true,
            value: true,
            verification: true,
            channel: {
              select: {
                key: true,
                displayName: true,
              },
            },
          },
        },
        minecraftIds: {
          select: {
            id: true,
            nickname: true,
            isPrimary: true,
            authmeBindingId: true,
            verifiedAt: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        authmeBindings: {
          select: {
            id: true,
            authmeUsername: true,
            authmeRealname: true,
            authmeUuid: true,
            boundAt: true,
            status: true,
            notes: true,
            boundByIp: true,
          },
          orderBy: { boundAt: 'asc' },
        },
        permissionLabels: {
          select: {
            id: true,
            label: {
              select: {
                id: true,
                key: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const locationPromise = this.ipLocationService.lookup(user.lastLoginIp);
    const ownershipPromise = this.computeOwnershipOverview(userId);
    const luckpermsPromise = this.buildLuckpermsSnapshots(
      user.authmeBindings ?? [],
    );
    const [location, ownership, luckperms] = await Promise.all([
      locationPromise,
      ownershipPromise,
      luckpermsPromise,
    ]);

    let avatarUrl: string | null = null;
    if (user.avatarAttachmentId) {
      try {
        const attachment = await this.attachmentsService.getAttachmentOrThrow(
          user.avatarAttachmentId,
        );
        if (attachment.isPublic) {
          avatarUrl = buildPublicUrl(
            `/attachments/public/${user.avatarAttachmentId}`,
          );
        }
      } catch {
        avatarUrl = null;
      }
    }

    const profileExtra = this.normalizeProfileExtra(user.profile?.extra);
    const birthday = user.profile?.birthday?.toISOString() ?? null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      avatarUrl,
      createdAt: user.createdAt.toISOString(),
      joinDate: user.joinDate?.toISOString() ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      lastLoginIp: user.lastLoginIp ?? null,
      lastLoginLocation: location?.raw ?? null,
      displayName: user.profile?.displayName ?? null,
      piic: user.profile?.piic ?? null,
      gender: user.profile?.gender ?? null,
      birthday,
      profileExtra,
      contacts: user.contacts.map((contact) => ({
        id: contact.id,
        value: contact.value,
        channel: contact.channel?.displayName ?? contact.channel?.key ?? '',
        verified: contact.verification === 'VERIFIED',
      })),
      minecraftProfiles: user.minecraftIds.map((profile) => ({
        id: profile.id,
        nickname: profile.nickname,
        isPrimary: profile.isPrimary,
        authmeBindingId: profile.authmeBindingId,
        verifiedAt: profile.verifiedAt?.toISOString() ?? null,
      })),
      authmeBindings: (
        await this.buildAuthmeBindingPayloads(user.authmeBindings, {
          includeBoundLocation: true,
        })
      ).map(({ status, ...rest }) => rest),
      rbacLabels: user.permissionLabels
        .map((entry) => {
          if (!entry.label) {
            return null;
          }
          return {
            id: entry.label.id,
            key: entry.label.key,
            name: entry.label.name,
            color: entry.label.color ?? null,
          };
        })
        .filter(
          (
            label,
          ): label is {
            id: string;
            key: string;
            name: string;
            color: string | null;
          } => Boolean(label),
        ),
      luckperms,
      ownership,
    };
  }

  async getPlayerLoginMap(userId: string, params: { from?: Date; to?: Date }) {
    const to = params.to ?? new Date();
    const from =
      params.from ??
      new Date(to.getTime() - DEFAULT_LOGIN_MAP_RANGE_DAYS * DAY_MS);

    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        createdAt: true,
        ipAddress: true,
      },
    });

    const buckets = new Map<string, { count: number; lastSeen: Date }>();
    for (const session of sessions) {
      const ip = this.toNullableString(session.ipAddress);
      if (!ip) continue;
      const bucket = buckets.get(ip) ?? {
        count: 0,
        lastSeen: session.createdAt,
      };
      bucket.count += 1;
      if (session.createdAt > bucket.lastSeen) {
        bucket.lastSeen = session.createdAt;
      }
      buckets.set(ip, bucket);
    }

    const clusters: PlayerLoginCluster[] = [];
    await Promise.all(
      Array.from(buckets.entries()).map(async ([ip, meta]) => {
        const location = await this.ipLocationService.lookup(ip);
        clusters.push({
          id: this.normalizeRegionKey(location) ?? ip,
          count: meta.count,
          lastSeenAt: meta.lastSeen.toISOString(),
          province: location?.province ?? null,
          city: location?.city ?? null,
          country: location?.country ?? null,
          isp: location?.isp ?? null,
          sampleIp: ip,
        });
      }),
    );

    clusters.sort((a, b) => b.count - a.count);

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totalEntries: sessions.length,
      clusters,
    };
  }

  async getPlayerActions(
    userId: string,
    params: { page?: number; pageSize?: number },
  ) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 50);
    const where: Prisma.AuthmeBindingHistoryWhereInput = {
      OR: [
        { userId },
        {
          binding: {
            userId,
          },
        },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.authmeBindingHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          operator: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } },
            },
          },
          binding: {
            select: {
              id: true,
              authmeUsername: true,
            },
          },
        },
      }),
      this.prisma.authmeBindingHistory.count({ where }),
    ]);

    return {
      pagination: buildPagination(total, page, pageSize),
      items: items.map((entry) => ({
        id: entry.id,
        action: entry.action,
        createdAt: entry.createdAt.toISOString(),
        reason: entry.reason ?? null,
        operator: entry.operator
          ? {
              id: entry.operator.id,
              email: entry.operator.email,
              displayName:
                entry.operator.profile?.displayName ?? entry.operator.email,
            }
          : null,
        binding: entry.binding
          ? {
              id: entry.binding.id,
              username: entry.binding.authmeUsername,
            }
          : null,
        payload: entry.payload ?? null,
      })),
    };
  }

  async getPlayerAssets(userId: string) {
    const [bindings, minecraftProfiles, roles, ownership] = await Promise.all([
      this.prisma.userAuthmeBinding.findMany({
        where: { userId },
        orderBy: { boundAt: 'asc' },
      }),
      this.prisma.userMinecraftProfile.findMany({
        where: { userId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.userRole.findMany({
        where: { userId },
        include: {
          role: true,
        },
      }),
      this.computeOwnershipOverview(userId),
    ]);
    const enrichedBindings = await this.buildAuthmeBindingPayloads(bindings, {
      includeBoundLocation: true,
    });

    return {
      ownership,
      bindings: enrichedBindings.map(({ status, ...rest }) => rest),
      minecraftProfiles: minecraftProfiles.map((profile) => ({
        id: profile.id,
        nickname: profile.nickname,
        authmeBindingId: profile.authmeBindingId,
        isPrimary: profile.isPrimary,
        source: profile.source,
        verifiedAt: profile.verifiedAt?.toISOString() ?? null,
      })),
      roles: roles.map((entry) => ({
        id: entry.roleId,
        key: entry.role?.key ?? '',
        name: entry.role?.name ?? '',
      })),
      companies: [],
      railways: [],
    };
  }

  async getPlayerRegion(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: {
        extra: true,
        user: {
          select: {
            lastLoginIp: true,
            lastLoginAt: true,
          },
        },
      },
    });
    const extra = this.normalizeProfileExtra(profile?.extra);
    const lastLoginLocation = await this.ipLocationService.lookup(
      profile?.user?.lastLoginIp ?? null,
    );

    return {
      region: {
        country: extra.regionCountry ?? extra.country ?? null,
        province: extra.regionProvince ?? extra.state ?? null,
        city: extra.regionCity ?? extra.city ?? null,
        district: extra.regionDistrict ?? null,
        addressLine1: extra.addressLine1 ?? null,
        addressLine2: extra.addressLine2 ?? null,
        postalCode: extra.postalCode ?? null,
      },
      lastLogin: {
        at: profile?.user?.lastLoginAt?.toISOString() ?? null,
        ip: profile?.user?.lastLoginIp ?? null,
        location: lastLoginLocation?.raw ?? null,
      },
    };
  }

  async getPlayerMinecraftData(userId: string) {
    const [bindings, minecraftProfiles, roles] = await Promise.all([
      this.prisma.userAuthmeBinding.findMany({
        where: { userId },
        orderBy: { boundAt: 'asc' },
      }),
      this.prisma.userMinecraftProfile.findMany({
        where: { userId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.userRole.findMany({
        where: { userId },
        include: { role: true },
      }),
    ]);
    const enrichedBindings = await this.buildAuthmeBindingPayloads(bindings, {
      includeBoundLocation: true,
    });
    return {
      bindings: enrichedBindings.map(({ status, ...rest }) => rest),
      minecraftProfiles: minecraftProfiles.map((profile) => ({
        id: profile.id,
        nickname: profile.nickname,
        source: profile.source,
        isPrimary: profile.isPrimary,
      })),
      permissionRoles: roles.map((entry) => ({
        id: entry.roleId,
        key: entry.role?.key ?? '',
        name: entry.role?.name ?? '',
      })),
    };
  }

  async getPlayerLoggedStatus(userId: string) {
    const bindings = await this.prisma.userAuthmeBinding.findMany({
      where: { userId },
      select: { authmeUsername: true },
      orderBy: { boundAt: 'desc' },
    });
    for (const binding of bindings) {
      const account = await this.fetchAuthmeAccount(binding.authmeUsername);
      if (account?.isLogged) {
        return true;
      }
    }
    return false;
  }

  async getPlayerStats(userId: string) {
    const [sessions, attachments] = await Promise.all([
      this.prisma.session.findMany({
        where: {
          userId,
        },
        select: {
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.attachment.count({
        where: {
          ownerId: userId,
        },
      }),
    ]);
    const now = Date.now();
    const playSeconds = sessions.reduce((total, session) => {
      const end = session.updatedAt?.getTime() ?? now;
      const duration = Math.max(0, (end - session.createdAt.getTime()) / 1000);
      return total + duration;
    }, 0);
    const activeDays = new Set(
      sessions.map((session) => session.createdAt.toISOString().slice(0, 10)),
    ).size;

    return {
      period: 'all',
      generatedAt: new Date().toISOString(),
      metrics: [
        {
          id: 'playtime',
          label: '上线时长',
          value: Math.round(playSeconds),
          unit: 'seconds',
        },
        {
          id: 'login-count',
          label: '上线次数',
          value: sessions.length,
          unit: 'times',
        },
        {
          id: 'attachment-uploads',
          label: '附件上传',
          value: attachments,
          unit: 'files',
        },
        {
          id: 'active-days',
          label: '活跃天数',
          value: activeDays,
          unit: 'days',
        },
      ],
    };
  }

  async submitAuthmeResetRequest(userId: string, reason?: string | null) {
    const bindingCount = await this.prisma.userAuthmeBinding.count({
      where: { userId },
    });
    if (bindingCount === 0) {
      throw new BadRequestException('未找到有效的 AuthMe 绑定');
    }
    const event = await this.prisma.userLifecycleEvent.create({
      data: {
        userId,
        eventType: LifecycleEventType.OTHER,
        occurredAt: new Date(),
        source: 'portal.player.authme-reset',
        notes: this.toNullableString(reason),
        metadata: {
          reason: this.toNullableString(reason),
        },
      },
    });
    return { success: true, requestId: event.id };
  }

  async submitAuthmeForceLogin(userId: string, reason?: string | null) {
    const bindingCount = await this.prisma.userAuthmeBinding.count({
      where: { userId },
    });
    if (bindingCount === 0) {
      throw new BadRequestException('未找到有效的 AuthMe 绑定');
    }
    const event = await this.prisma.userLifecycleEvent.create({
      data: {
        userId,
        eventType: LifecycleEventType.OTHER,
        occurredAt: new Date(),
        source: 'portal.player.force-login',
        notes: this.toNullableString(reason),
        metadata: {
          reason: this.toNullableString(reason),
        },
      },
    });
    return { success: true, requestId: event.id };
  }

  async submitPermissionChangeRequest(
    userId: string,
    payload: { targetGroup: string; reason?: string },
  ) {
    const sanitized = this.toNullableString(payload.targetGroup);
    if (!sanitized) {
      throw new BadRequestException('请选择目标权限组');
    }
    const log = await this.prisma.adminAuditLog.create({
      data: {
        actorId: userId,
        action: 'portal.player.permission.request',
        targetType: 'permission-group',
        targetId: sanitized,
        payload: {
          reason: this.toNullableString(payload.reason),
        },
      },
    });
    return { success: true, requestId: log.id };
  }

  async submitServerRestartRequest(
    userId: string,
    payload: { serverId: string; reason: string },
  ) {
    const server = await this.prisma.minecraftServer.findUnique({
      where: { id: payload.serverId },
      select: { id: true, displayName: true },
    });
    if (!server) {
      throw new NotFoundException('服务器不存在');
    }
    const log = await this.prisma.adminAuditLog.create({
      data: {
        actorId: userId,
        action: 'portal.player.server.restart-request',
        targetType: 'minecraft-server',
        targetId: server.id,
        payload: {
          reason: this.toNullableString(payload.reason),
          serverName: server.displayName,
        },
      },
    });
    return { success: true, requestId: log.id };
  }

  private async fetchAuthmeAccount(username?: string | null) {
    if (!username) {
      return null;
    }
    try {
      return await this.authmeService.getAccount(username);
    } catch (error) {
      this.logger.debug(`无法获取 AuthMe 账号 ${username}: ${String(error)}`);
      return null;
    }
  }

  private async lookupLocationWithCache(
    ip: string | null | undefined,
    cache: Map<string, Awaited<ReturnType<IpLocationService['lookup']>> | null>,
  ) {
    const normalized = normalizeIpAddress(ip);
    if (!normalized) {
      return null;
    }
    if (cache.has(normalized)) {
      return cache.get(normalized) ?? null;
    }
    const location = await this.ipLocationService.lookup(normalized);
    cache.set(normalized, location);
    return location;
  }

  private async buildAuthmeBindingPayloads(
    bindings: Array<{
      id: string;
      authmeUsername: string;
      authmeRealname: string | null;
      authmeUuid: string | null;
      boundAt: Date;
      status: string;
      boundByIp?: string | null;
    }>,
    options: { includeBoundLocation?: boolean } = {},
  ) {
    const includeBoundLocation = Boolean(options.includeBoundLocation);
    const accountCache = new Map<
      string,
      Awaited<ReturnType<AuthmeService['getAccount']>> | null
    >();
    const locationCache = new Map<
      string,
      Awaited<ReturnType<IpLocationService['lookup']>> | null
    >();

    const resolveAccount = async (username?: string | null) => {
      if (!username) return null;
      const key = username.toLowerCase();
      if (accountCache.has(key)) {
        return accountCache.get(key) ?? null;
      }
      const account = await this.fetchAuthmeAccount(username);
      accountCache.set(key, account);
      return account;
    };

    return Promise.all(
      bindings.map(async (binding) => {
        const account = await resolveAccount(binding.authmeUsername);
        const lastLoginIp = normalizeIpAddress(account?.ip ?? null);
        const regIp = normalizeIpAddress(account?.regip ?? null);
        const [lastLoginLocation, regIpLocation, boundLocation] =
          await Promise.all([
            this.lookupLocationWithCache(lastLoginIp, locationCache),
            this.lookupLocationWithCache(regIp, locationCache),
            includeBoundLocation
              ? this.lookupLocationWithCache(
                  binding.boundByIp ?? null,
                  locationCache,
                )
              : Promise.resolve(null),
          ]);
        return {
          id: binding.id,
          username: binding.authmeUsername,
          realname: binding.authmeRealname,
          uuid: binding.authmeUuid,
          boundAt: binding.boundAt.toISOString(),
          status: binding.status,
          lastlogin: account?.lastlogin ?? null,
          regdate: account?.regdate ?? null,
          lastKnownLocation: includeBoundLocation
            ? (boundLocation?.raw ?? null)
            : null,
          lastLoginLocation: lastLoginLocation?.raw ?? null,
          regIpLocation: regIpLocation?.raw ?? null,
        };
      }),
    );
  }

  private async buildLuckpermsSnapshots(
    bindings: Array<{
      authmeUsername: string;
      authmeRealname: string | null;
      authmeUuid: string | null;
    }>,
  ) {
    if (
      bindings.length === 0 ||
      !this.luckpermsService ||
      !this.luckpermsService.isEnabled()
    ) {
      return [];
    }
    const uuidCache = new Map<string, LuckpermsPlayer | null>();
    const usernameCache = new Map<string, LuckpermsPlayer | null>();
    const snapshotPromises = bindings.map((binding) =>
      this.buildLuckpermsSnapshotForBinding(binding, uuidCache, usernameCache),
    );
    return Promise.all(snapshotPromises);
  }

  private async buildLuckpermsSnapshotForBinding(
    binding: {
      authmeUsername: string;
      authmeRealname: string | null;
      authmeUuid: string | null;
    },
    uuidCache: Map<string, LuckpermsPlayer | null>,
    usernameCache: Map<string, LuckpermsPlayer | null>,
  ) {
    const player = await this.lookupLuckpermsPlayer(
      binding,
      uuidCache,
      usernameCache,
    );
    return this.createLuckpermsSnapshot(binding, player);
  }

  private async lookupLuckpermsPlayer(
    binding: {
      authmeUsername: string;
      authmeRealname: string | null;
      authmeUuid: string | null;
    },
    uuidCache: Map<string, LuckpermsPlayer | null>,
    usernameCache: Map<string, LuckpermsPlayer | null>,
  ) {
    if (!this.luckpermsService.isEnabled()) {
      return null;
    }
    const normalizedUuid = this.normalizeLookupKey(binding.authmeUuid);
    if (normalizedUuid) {
      const uuidKey = normalizedUuid.toLowerCase();
      if (uuidCache.has(uuidKey)) {
        return uuidCache.get(uuidKey) ?? null;
      }
      try {
        const player =
          await this.luckpermsService.getPlayerByUuid(normalizedUuid);
        uuidCache.set(uuidKey, player);
        return player;
      } catch (error) {
        this.logger.debug(
          `无法获取 LuckPerms 数据 (UUID: ${normalizedUuid}): ${String(error)}`,
        );
        uuidCache.set(uuidKey, null);
      }
    }
    const lookupName = this.resolveLookupName(binding);
    if (lookupName) {
      const lookupKey = lookupName.toLowerCase();
      if (usernameCache.has(lookupKey)) {
        return usernameCache.get(lookupKey) ?? null;
      }
      try {
        const player =
          await this.luckpermsService.getPlayerByUsername(lookupName);
        usernameCache.set(lookupKey, player);
        return player;
      } catch (error) {
        this.logger.debug(
          `无法获取 LuckPerms 数据 (用户名: ${lookupName}): ${String(error)}`,
        );
        usernameCache.set(lookupKey, null);
      }
    }
    return null;
  }

  private createLuckpermsSnapshot(
    binding: {
      authmeUsername: string;
      authmeRealname: string | null;
      authmeUuid: string | null;
    },
    player: LuckpermsPlayer | null,
  ) {
    const realname =
      typeof binding.authmeRealname === 'string' &&
      binding.authmeRealname.length
        ? binding.authmeRealname.trim()
        : null;
    const username =
      player?.username && player.username.length > 0
        ? player.username
        : (realname ?? binding.authmeUsername);
    const groups = (player?.groups ?? []).map((membership) => ({
      ...membership,
      displayName: this.luckpermsService.getGroupDisplayName(membership.group),
    }));
    const primaryGroup = player?.primaryGroup ?? null;
    return {
      authmeUsername: binding.authmeUsername,
      username,
      uuid: player?.uuid ?? binding.authmeUuid ?? null,
      primaryGroup,
      primaryGroupDisplayName:
        this.luckpermsService.getGroupDisplayName(primaryGroup),
      groups,
      synced: Boolean(player),
    } as PlayerLuckpermsSnapshot;
  }

  private resolveLookupName(binding: {
    authmeUsername: string;
    authmeRealname: string | null;
  }) {
    const realname = this.normalizeLookupKey(binding.authmeRealname);
    if (realname) {
      return realname;
    }
    return this.normalizeLookupKey(binding.authmeUsername);
  }

  private normalizeLookupKey(value: string | null | undefined) {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async getPlayerStatusSnapshot(userId: string) {
    const snapshot = await this.prisma.userStatusSnapshot.findUnique({
      where: { userId },
      include: {
        event: true,
      },
    });
    if (!snapshot) {
      return null;
    }
    return {
      userId: snapshot.userId,
      status: snapshot.status,
      updatedAt: snapshot.updatedAt.toISOString(),
      statusEventId: snapshot.statusEventId,
      event: snapshot.event
        ? {
            id: snapshot.event.id,
            status: snapshot.event.status,
            reasonCode: snapshot.event.reasonCode,
            source: snapshot.event.source,
            createdAt: snapshot.event.createdAt.toISOString(),
            metadata: snapshot.event.metadata ?? null,
          }
        : null,
    };
  }

  private normalizeProfileExtra(extra: unknown) {
    if (!extra || typeof extra !== 'object') {
      return {};
    }
    const record = extra as Record<string, unknown>;
    return {
      addressLine1: this.toNullableString(record.addressLine1),
      addressLine2: this.toNullableString(record.addressLine2),
      city: this.toNullableString(record.city),
      state: this.toNullableString(record.state),
      postalCode: this.toNullableString(record.postalCode),
      country: this.toNullableString(record.country),
      regionCountry: this.toNullableString(record.regionCountry),
      regionProvince: this.toNullableString(record.regionProvince),
      regionCity: this.toNullableString(record.regionCity),
      regionDistrict: this.toNullableString(record.regionDistrict),
    };
  }

  private toNullableString(value: unknown) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    return null;
  }

  private normalizeRegionKey(
    location: Awaited<ReturnType<IpLocationService['lookup']>>,
  ) {
    if (!location) {
      return null;
    }
    return (
      this.toNullableString(location.city) ??
      this.toNullableString(location.province) ??
      this.toNullableString(location.country)
    );
  }
}
