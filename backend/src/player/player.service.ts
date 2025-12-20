import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LifecycleEventType,
  Prisma,
  PlayerMessageReactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IpLocationService } from '../lib/ip2region/ip-location.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthmeCacheService } from '../cache/authme-cache.service';
import { PlayerDataCacheService } from '../cache/playerdata-cache.service';
import { AuthmeService } from '../authme/authme.service';
import { AuthmeLookupService } from '../authme/authme-lookup.service';
import type { AuthmeUser } from '../authme/authme.interfaces';
import { LuckpermsService } from '../luckperms/luckperms.service';
import { LuckpermsLookupService } from '../luckperms/luckperms-lookup.service';
import { buildPublicUrl } from '../lib/shared/url';
import { buildPagination } from '../lib/shared/pagination';
import { normalizeIpAddress } from '../lib/ip2region/ip-normalizer';
import type { LuckpermsPlayer } from '../luckperms/luckperms.interfaces';
import type {
  PlayerLoginCluster,
  PortalOwnershipOverview,
  PlayerLuckpermsSnapshot,
  PlayerLikeSummary,
  PlayerLikeDetail,
  PlayerBiographyPayload,
  PlayerMessageBoardEntry,
  PlayerSessionUser,
} from './player.types';
import { PlayerAutomationService } from './player-automation.service';
import { MinecraftServerService } from '../minecraft/minecraft-server.service';
import { RedisService } from '../lib/redis/redis.service';
import { DEFAULT_ROLES } from '../auth/services/roles.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOGIN_MAP_RANGE_DAYS = 30;
const PLAYER_STATS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PLAYER_STATS_CACHE_VERSION = 'v2';
const PLAYER_DATA_CACHE_TTL_MS = 30 * 60 * 1000;
const PLAYER_GAME_METRIC_KEYS = {
  walkOneCm: 'minecraft:custom:minecraft:walk_one_cm',
  flyOneCm: 'minecraft:custom:minecraft:fly_one_cm',
  swimOneCm: 'minecraft:custom:minecraft:swim_one_cm',
  totalWorldTime: 'minecraft:custom:minecraft:total_world_time',
  playerKills: 'minecraft:custom:minecraft:player_kills',
  deaths: 'minecraft:custom:minecraft:deaths',
  jump: 'minecraft:custom:minecraft:jump',
  playTime: 'minecraft:custom:minecraft:play_time',
  useWand: 'minecraft:custom:minecraft:use_wand',
  leaveGame: 'minecraft:custom:minecraft:leave_game',
} as const;
const PLAYER_GAME_METRIC_KEY_LIST = Object.values(PLAYER_GAME_METRIC_KEYS);
const PLAYER_ADVANCEMENT_PAGE_SIZE = 1000;
const PLAYER_ADVANCEMENT_MAX_PAGES = 10;
const RECOMMENDED_PLAYER_LIMIT = 100;
const RECOMMENDED_PAGE_SIZE_DEFAULT = 10;
const RECOMMENDED_PAGE_SIZE_MAX = 12;

type PlayerRecommendationItem = {
  id: string;
  targetId: string;
  type: 'user' | 'authme';
  displayName: string;
  avatarUrl: string | null;
};

type PlayerBeaconIdentity = {
  uuid: string | null;
  name: string | null;
};

type PlayerGameServerDescriptor = {
  serverId: string;
  serverName: string;
  beaconEnabled: boolean;
  beaconConfigured: boolean;
};

type PlayerGameServerMetrics = {
  walkOneCm: number | null;
  flyOneCm: number | null;
  swimOneCm: number | null;
  totalWorldTime: number | null;
  playerKills: number | null;
  deaths: number | null;
  jump: number | null;
  playTime: number | null;
  useWand: number | null;
  leaveGame: number | null;
};

type PlayerMtrLogSummary = {
  id: number | null;
  timestamp: string | null;
  rawTimestamp: string | null;
  changeType: string | null;
  entryName: string | null;
  entryId: string | null;
  className: string | null;
  dimensionContext: string | null;
  description: string | null;
};

type PlayerNbtPosition = {
  x: number;
  y: number;
  z: number;
};

type PlayerGameServerStat = PlayerGameServerDescriptor & {
  metrics: PlayerGameServerMetrics | null;
  lastMtrLog: PlayerMtrLogSummary | null;
  mtrBalance: number | null;
  mtrBalanceFetchedAt: string | null;
  mtrBalanceError: string | null;
  mtrBalanceErrorMessage: string | null;
  fetchedAt: string | null;
  error: string | null;
  errorMessage: string | null;
  mtrError: string | null;
  mtrErrorMessage: string | null;
  achievementsTotal: number | null;
  nbtPosition: PlayerNbtPosition | null;
  nbtPositionFetchedAt: string | null;
  nbtPositionError: string | null;
  nbtPositionErrorMessage: string | null;
};

type PlayerGameStatsPayload = {
  identity: PlayerBeaconIdentity;
  identityMissing: boolean;
  updatedAt: string;
  servers: PlayerGameServerStat[];
};

function hasAdminRole(user?: PlayerSessionUser | null) {
  if (!user?.roles) return false;
  return user.roles.some((link) => link.role.key === DEFAULT_ROLES.ADMIN);
}

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ipLocationService: IpLocationService,
    private readonly attachmentsService: AttachmentsService,
    private readonly authmeCache: AuthmeCacheService,
    private readonly playerDataCache: PlayerDataCacheService,
    private readonly authmeService: AuthmeService,
    private readonly authmeLookupService: AuthmeLookupService,
    private readonly luckpermsService: LuckpermsService,
    private readonly luckpermsLookupService: LuckpermsLookupService,
    private readonly automation: PlayerAutomationService,
    private readonly minecraftServerService: MinecraftServerService,
    private readonly redis: RedisService,
  ) {}

  async getPlayerPortalData(
    viewer: PlayerSessionUser | null,
    targetUserId: string,
  ) {
    const viewerId = viewer?.id ?? null;
    const [
      summary,
      rawAssets,
      region,
      minecraft,
      stats,
      statusSnapshot,
      likes,
      biography,
      messages,
    ] = await Promise.all([
      this.getPlayerSummary(targetUserId),
      this.getPlayerAssets(targetUserId),
      this.getPlayerRegion(targetUserId),
      this.getPlayerMinecraftData(targetUserId),
      this.getPlayerStats(targetUserId),
      this.getPlayerStatusSnapshot(targetUserId),
      this.getPlayerLikeSummary(viewerId, targetUserId),
      this.getPlayerBiography(targetUserId),
      this.getPlayerMessages(targetUserId, viewer),
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
      likes,
      biography,
      messages,
    };
  }

  async getPlayerPortalDataByAuthmeUsername(
    viewer: PlayerSessionUser | null,
    username: string,
  ) {
    const normalized = username.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Player name is required');
    }
    const binding = await this.prisma.userAuthmeBinding.findFirst({
      where: {
        OR: [
          { authmeUsernameLower: normalized },
          { authmeUsername: { equals: username.trim() } },
        ],
      },
      select: { userId: true },
    });
    if (!binding) {
      throw new NotFoundException('Player not found');
    }
    return this.getPlayerPortalData(viewer, binding.userId);
  }

  async listRecommendedPlayers(
    options: { page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = this.normalizeRecommendationPageSize(options.pageSize);
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: RECOMMENDED_PLAYER_LIMIT,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        avatarAttachmentId: true,
        profile: {
          select: {
            displayName: true,
          },
        },
      },
    });
    const userEntries = await Promise.all(
      users.map((user) => this.buildRecommendationEntryForUser(user)),
    );
    const slots = Math.max(RECOMMENDED_PLAYER_LIMIT - userEntries.length, 0);
    const authmeEntries =
      slots > 0 ? await this.fetchAuthmeRecommendationEntries(slots) : [];
    const combined = [...userEntries, ...authmeEntries].slice(
      0,
      RECOMMENDED_PLAYER_LIMIT,
    );
    const start = (page - 1) * pageSize;
    const items = combined.slice(start, start + pageSize);
    return {
      items,
      total: combined.length,
      page,
      pageSize,
    };
  }

  async getAuthmePlayerProfile(username: string) {
    const normalized = username?.trim();
    if (!normalized) {
      throw new BadRequestException('Username is required');
    }
    const allowFallback = this.authmeService.isEnabled();
    if (!allowFallback) {
      throw new BadRequestException('AuthMe integration is unavailable');
    }
    let account: AuthmeUser | null;
    try {
      account = await this.authmeLookupService.getAccount(normalized, {
        allowFallback,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to load AuthMe account ${normalized}: ${String(error)}`,
      );
      throw new BadRequestException('Unable to load AuthMe account');
    }
    if (!account) {
      throw new NotFoundException('Player not found');
    }

    const bindingKey = normalized.toLowerCase();
    const binding = await this.prisma.userAuthmeBinding.findUnique({
      where: { authmeUsernameLower: bindingKey },
      select: {
        authmeUsername: true,
        authmeUuid: true,
        authmeRealname: true,
        status: true,
        boundAt: true,
        boundByIp: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            avatarAttachmentId: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });

    const locationCache = new Map<
      string,
      Awaited<ReturnType<IpLocationService['lookup']>> | null
    >();
    const lastLoginIp = normalizeIpAddress(account.ip ?? null);
    const regIp = normalizeIpAddress(account.regip ?? null);
    const boundIp = binding?.boundByIp
      ? normalizeIpAddress(binding.boundByIp)
      : null;
    const [lastLoginLocation, regIpLocation, boundLocation] = await Promise.all(
      [
        this.lookupLocationWithCache(lastLoginIp, locationCache),
        this.lookupLocationWithCache(regIp, locationCache),
        boundIp ? this.lookupLocationWithCache(boundIp, locationCache) : null,
      ],
    );

    const luckperms = await this.buildLuckpermsSnapshots([
      {
        authmeUsername: account.username,
        authmeRealname:
          binding?.authmeRealname?.trim() || account.realname?.trim() || null,
        authmeUuid: binding?.authmeUuid ?? null,
      },
    ]);
    const resolvedBindingName = binding
      ? this.resolveLookupName(binding)
      : null;
    const resolvedIdentityName =
      resolvedBindingName ?? this.normalizeLookupKey(account.username);
    const firstLuckpermsUuid = this.normalizeLookupKey(
      luckperms[0]?.uuid ?? null,
    );
    const identityUuid = this.normalizeLookupKey(
      binding?.authmeUuid ?? firstLuckpermsUuid ?? null,
    );
    const identity: PlayerBeaconIdentity = {
      uuid: identityUuid,
      name: resolvedIdentityName,
    };

    let linkedUser: {
      id: string;
      displayName: string | null;
      avatarUrl: string | null;
    } | null = null;
    if (binding?.user) {
      linkedUser = {
        id: binding.user.id,
        displayName:
          binding.user.profile?.displayName?.trim() ||
          binding.user.name?.trim() ||
          binding.user.email ||
          null,
        avatarUrl: await this.resolveUserAvatarUrl(
          binding.user.avatarAttachmentId,
          binding.user.image ?? null,
        ),
      };
    }

    const servers = await this.prisma.minecraftServer.findMany({
      where: { isActive: true },
      select: {
        id: true,
        displayName: true,
        beaconEnabled: true,
        beaconEndpoint: true,
        beaconKey: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const stats = {
      period: '30d',
      generatedAt: new Date().toISOString(),
      metrics: [
        { id: 'playtime', label: '上线时长', value: 0, unit: 'seconds' },
        { id: 'login-count', label: '上线次数', value: 0, unit: 'times' },
        {
          id: 'attachment-uploads',
          label: '附件上传',
          value: 0,
          unit: 'files',
        },
        { id: 'active-days', label: '活跃天数', value: 0, unit: 'days' },
      ],
      gameStats: await this.buildPlayerGameStats(identity, servers),
    };

    return {
      username: account.username,
      realname:
        binding?.authmeRealname?.trim() || account.realname?.trim() || null,
      uuid: binding?.authmeUuid ?? null,
      lastlogin: account.lastlogin ?? null,
      regdate: account.regdate ?? null,
      ip: account.ip ?? null,
      ipLocation: lastLoginLocation?.raw ?? null,
      ipLocationDisplay: lastLoginLocation?.display ?? null,
      regIp: account.regip ?? null,
      regIpLocation: regIpLocation?.raw ?? null,
      regIpLocationDisplay: regIpLocation?.display ?? null,
      lastKnownLocation: boundLocation?.raw ?? null,
      lastKnownLocationDisplay: boundLocation?.display ?? null,
      status: binding?.status ?? null,
      boundAt: binding?.boundAt?.toISOString() ?? null,
      luckperms,
      linkedUser,
      stats,
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
      throw new NotFoundException('User not found');
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

  async getPlayerStats(
    userId: string,
    options: { period?: string | null; forceRefresh?: boolean } = {},
  ) {
    const period = this.normalizeStatsPeriod(options.period);
    const cacheKey = this.buildPlayerStatsCacheKey(userId, period);
    if (!options.forceRefresh) {
      const cached =
        await this.redis.get<
          Awaited<ReturnType<PlayerService['computePlayerStatsPayload']>>
        >(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const [sessions, attachments, profile, bindings, servers] =
      await Promise.all([
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
        this.prisma.userProfile.findUnique({
          where: { userId },
          select: {
            primaryAuthmeBindingId: true,
          },
        }),
        this.prisma.userAuthmeBinding.findMany({
          where: { userId },
          orderBy: { boundAt: 'asc' },
          select: {
            id: true,
            authmeUuid: true,
            authmeUsername: true,
            authmeRealname: true,
          },
        }),
        this.prisma.minecraftServer.findMany({
          where: { isActive: true },
          select: {
            id: true,
            displayName: true,
            beaconEnabled: true,
            beaconEndpoint: true,
            beaconKey: true,
          },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        }),
      ]);

    const payload = await this.computePlayerStatsPayload({
      sessions,
      attachments,
      period,
      profile,
      bindings,
      servers,
    });

    await this.redis.set(cacheKey, payload, PLAYER_STATS_CACHE_TTL_MS);
    return payload;
  }

  async getPlayerGameStatsForBinding(
    userId: string,
    bindingId: string,
    options: { serverId?: string | null } = {},
  ) {
    const binding = await this.prisma.userAuthmeBinding.findFirst({
      where: { id: bindingId, userId },
      select: {
        id: true,
        authmeUuid: true,
        authmeUsername: true,
        authmeRealname: true,
      },
    });
    if (!binding) {
      throw new BadRequestException('AuthMe account not found');
    }

    const servers = await this.prisma.minecraftServer.findMany({
      where: {
        isActive: true,
        ...(options.serverId ? { id: options.serverId } : {}),
      },
      select: {
        id: true,
        displayName: true,
        beaconEnabled: true,
        beaconEndpoint: true,
        beaconKey: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (options.serverId && servers.length === 0) {
      throw new NotFoundException('Specified server not found');
    }

    const identity = {
      uuid: this.normalizeLookupKey(binding.authmeUuid),
      name: this.resolveLookupName(binding),
    };

    return this.buildPlayerGameStats(identity, servers);
  }

  async getPlayerLikeSummary(
    viewerId: string | null,
    targetUserId: string,
  ): Promise<PlayerLikeSummary> {
    const [total, viewerTrace] = await Promise.all([
      this.prisma.playerLike.count({ where: { targetId: targetUserId } }),
      viewerId
        ? this.prisma.playerLike.findUnique({
            where: {
              likerId_targetId: {
                likerId: viewerId,
                targetId: targetUserId,
              },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      total,
      viewerLiked: Boolean(viewerTrace),
    };
  }

  async likePlayer(likerId: string, targetUserId: string) {
    try {
      await this.prisma.playerLike.create({
        data: {
          likerId,
          targetId: targetUserId,
        },
      });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
      ) {
        throw error;
      }
    }
    return this.getPlayerLikeSummary(likerId, targetUserId);
  }

  async unlikePlayer(likerId: string, targetUserId: string) {
    await this.prisma.playerLike.deleteMany({
      where: { likerId, targetId: targetUserId },
    });
    return this.getPlayerLikeSummary(likerId, targetUserId);
  }

  async listPlayerLikes(targetUserId: string): Promise<PlayerLikeDetail[]> {
    const likes = await this.prisma.playerLike.findMany({
      where: { targetId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        liker: {
          select: {
            id: true,
            email: true,
            name: true,
            profile: { select: { displayName: true } },
            authmeBindings: {
              orderBy: { boundAt: 'desc' },
              take: 1,
              select: {
                authmeUsername: true,
                authmeRealname: true,
              },
            },
          },
        },
      },
    });
    return likes.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      liker: {
        id: entry.liker.id,
        email: entry.liker.email ?? null,
        displayName:
          entry.liker.profile?.displayName ?? entry.liker.name ?? null,
        primaryAuthmeUsername:
          entry.liker.authmeBindings?.[0]?.authmeUsername ?? null,
        primaryAuthmeRealname:
          entry.liker.authmeBindings?.[0]?.authmeRealname ?? null,
      },
    }));
  }

  async getPlayerBiography(
    targetUserId: string,
  ): Promise<PlayerBiographyPayload | null> {
    const biography = await this.prisma.playerBiography.findUnique({
      where: { userId: targetUserId },
      include: {
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
    if (!biography) return null;
    return {
      markdown: biography.markdown,
      updatedAt: biography.updatedAt.toISOString(),
      updatedBy: biography.updatedBy
        ? {
            id: biography.updatedBy.id,
            displayName:
              biography.updatedBy.profile?.displayName ??
              biography.updatedBy.name ??
              biography.updatedBy.email ??
              null,
          }
        : null,
    };
  }

  async upsertPlayerBiography(
    targetUserId: string,
    actor: PlayerSessionUser,
    markdown: string,
  ): Promise<PlayerBiographyPayload> {
    if (actor.id !== targetUserId && !hasAdminRole(actor)) {
      throw new ForbiddenException('Not allowed to update biography');
    }
    await this.prisma.playerBiography.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        markdown,
        updatedById: actor.id,
      },
      update: {
        markdown,
        updatedById: actor.id,
      },
    });
    const result = await this.getPlayerBiography(targetUserId);
    if (!result) {
      throw new NotFoundException('Biography not found after write');
    }
    return result;
  }

  async getPlayerMessages(
    targetUserId: string,
    viewer: PlayerSessionUser | null,
    limit = 5,
  ): Promise<PlayerMessageBoardEntry[]> {
    const entries = await this.prisma.playerMessage.findMany({
      where: { targetUserId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        reactions: {
          select: {
            userId: true,
            reaction: true,
          },
        },
      },
    });
    const viewerId = viewer?.id ?? null;
    const viewerIsAdmin = hasAdminRole(viewer);
    return entries.map((entry) =>
      buildMessageEntry(entry, viewerId, viewerIsAdmin, targetUserId),
    );
  }

  async createPlayerMessage(
    targetUserId: string,
    author: PlayerSessionUser,
    content: string,
  ): Promise<PlayerMessageBoardEntry> {
    const message = await this.prisma.playerMessage.create({
      data: {
        targetUserId,
        authorId: author.id,
        content,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        reactions: {
          select: {
            userId: true,
            reaction: true,
          },
        },
      },
    });
    const viewerIsAdmin = hasAdminRole(author);
    return buildMessageEntry(message, author.id, viewerIsAdmin, targetUserId);
  }

  async deletePlayerMessage(messageId: string, actor: PlayerSessionUser) {
    const message = await this.prisma.playerMessage.findUnique({
      where: { id: messageId },
      select: { targetUserId: true },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    if (message.targetUserId !== actor.id && !hasAdminRole(actor)) {
      throw new ForbiddenException('Not allowed to delete message');
    }
    await this.prisma.playerMessage.delete({ where: { id: messageId } });
  }

  async setPlayerMessageReaction(
    messageId: string,
    actor: PlayerSessionUser,
    reaction: PlayerMessageReactionType,
  ) {
    const message = await this.prisma.playerMessage.findUnique({
      where: { id: messageId },
      select: { id: true },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    await this.prisma.playerMessageReaction.upsert({
      where: {
        uq_player_message_reaction_user: {
          messageId,
          userId: actor.id,
        },
      },
      create: {
        messageId,
        userId: actor.id,
        reaction,
      },
      update: {
        reaction,
      },
    });
  }

  async clearPlayerMessageReaction(
    messageId: string,
    actor: PlayerSessionUser,
  ) {
    await this.prisma.playerMessageReaction.deleteMany({
      where: { messageId, userId: actor.id },
    });
  }

  private async computePlayerStatsPayload(params: {
    sessions: Array<{ createdAt: Date; updatedAt: Date | null }>;
    attachments: number;
    period: string;
    profile: { primaryAuthmeBindingId: string | null } | null;
    bindings: Array<{
      id: string;
      authmeUuid: string | null;
      authmeUsername: string;
      authmeRealname: string | null;
    }>;
    servers: Array<{
      id: string;
      displayName: string;
      beaconEnabled: boolean | null;
      beaconEndpoint: string | null;
      beaconKey: string | null;
    }>;
  }) {
    const now = Date.now();
    const playSeconds = params.sessions.reduce((total, session) => {
      const end = session.updatedAt?.getTime() ?? now;
      const duration = Math.max(0, (end - session.createdAt.getTime()) / 1000);
      return total + duration;
    }, 0);
    const activeDays = new Set(
      params.sessions.map((session) =>
        session.createdAt.toISOString().slice(0, 10),
      ),
    ).size;

    const identity = this.resolvePlayerBeaconIdentity(
      params.profile,
      params.bindings,
    );
    const gameStats = await this.buildPlayerGameStats(identity, params.servers);

    return {
      period: params.period,
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
          value: params.sessions.length,
          unit: 'times',
        },
        {
          id: 'attachment-uploads',
          label: '附件上传',
          value: params.attachments,
          unit: 'files',
        },
        {
          id: 'active-days',
          label: '活跃天数',
          value: activeDays,
          unit: 'days',
        },
      ],
      gameStats,
    };
  }

  private normalizeStatsPeriod(period?: string | null) {
    const trimmed = period?.trim();
    if (!trimmed) return '30d';
    return trimmed;
  }

  private buildPlayerStatsCacheKey(userId: string, period: string) {
    return `player:stats:${PLAYER_STATS_CACHE_VERSION}:${userId}:${period}`;
  }

  private resolvePlayerBeaconIdentity(
    profile: { primaryAuthmeBindingId: string | null } | null,
    bindings: Array<{
      id: string;
      authmeUuid: string | null;
      authmeUsername: string;
      authmeRealname: string | null;
    }>,
  ): PlayerBeaconIdentity {
    if (!bindings.length) {
      return { uuid: null, name: null };
    }
    const preferred = bindings.find(
      (binding) => binding.id === profile?.primaryAuthmeBindingId,
    );
    const target = preferred ?? bindings[0];
    const uuid = this.normalizeLookupKey(target.authmeUuid);
    const name = this.resolveLookupName({
      authmeUsername: target.authmeUsername,
      authmeRealname: target.authmeRealname,
    });
    return { uuid, name };
  }

  private async buildPlayerGameStats(
    identity: PlayerBeaconIdentity,
    servers: Array<{
      id: string;
      displayName: string;
      beaconEnabled: boolean | null;
      beaconEndpoint: string | null;
      beaconKey: string | null;
    }>,
  ): Promise<PlayerGameStatsPayload> {
    const descriptors: PlayerGameServerDescriptor[] = servers.map((server) => ({
      serverId: server.id,
      serverName: server.displayName,
      beaconEnabled: Boolean(server.beaconEnabled),
      beaconConfigured: Boolean(
        server.beaconEnabled && server.beaconEndpoint && server.beaconKey,
      ),
    }));

    const base: PlayerGameStatsPayload = {
      identity,
      identityMissing: !identity.uuid && !identity.name,
      updatedAt: new Date().toISOString(),
      servers: [],
    };

    if (!descriptors.length) {
      return { ...base, servers: [] };
    }

    if (!identity.uuid && !identity.name) {
      return {
        ...base,
        servers: descriptors.map((server) => ({
          ...server,
          metrics: null,
          lastMtrLog: null,
          mtrBalance: null,
          mtrBalanceFetchedAt: null,
          mtrBalanceError: null,
          mtrBalanceErrorMessage: null,
          fetchedAt: null,
          error: 'IDENTITY_NOT_FOUND',
          errorMessage: '未找到玩家的 AuthMe 绑定，无法查询 Beacon 数据',
          mtrError: null,
          mtrErrorMessage: null,
          achievementsTotal: null,
          nbtPosition: null,
          nbtPositionFetchedAt: null,
          nbtPositionError: null,
          nbtPositionErrorMessage: null,
        })),
      };
    }

    const results = await Promise.all(
      descriptors.map((server) =>
        this.fetchGameStatsForServer(server, identity).catch((error) => ({
          ...server,
          metrics: null,
          lastMtrLog: null,
          mtrBalance: null,
          mtrBalanceFetchedAt: null,
          mtrBalanceError: null,
          mtrBalanceErrorMessage: null,
          fetchedAt: new Date().toISOString(),
          error: 'BEACON_REQUEST_FAILED',
          errorMessage:
            error instanceof Error
              ? error.message
              : String(error ?? '未知错误'),
          mtrError: null,
          mtrErrorMessage: null,
          achievementsTotal: null,
          nbtPosition: null,
          nbtPositionFetchedAt: null,
          nbtPositionError: null,
          nbtPositionErrorMessage: null,
        })),
      ),
    );

    return { ...base, servers: results };
  }

  private async fetchGameStatsForServer(
    server: PlayerGameServerDescriptor,
    identity: PlayerBeaconIdentity,
  ): Promise<PlayerGameServerStat> {
    if (!server.beaconEnabled) {
      return {
        ...server,
        metrics: null,
        lastMtrLog: null,
        mtrBalance: null,
        mtrBalanceFetchedAt: null,
        mtrBalanceError: null,
        mtrBalanceErrorMessage: null,
        fetchedAt: null,
        error: 'BEACON_DISABLED',
        errorMessage: '服务器未启用 Beacon，无法查询数据',
        mtrError: null,
        mtrErrorMessage: null,
        achievementsTotal: null,
        nbtPosition: null,
        nbtPositionFetchedAt: null,
        nbtPositionError: null,
        nbtPositionErrorMessage: null,
      };
    }
    if (!server.beaconConfigured) {
      return {
        ...server,
        metrics: null,
        lastMtrLog: null,
        mtrBalance: null,
        mtrBalanceFetchedAt: null,
        mtrBalanceError: null,
        mtrBalanceErrorMessage: null,
        fetchedAt: null,
        error: 'BEACON_NOT_CONFIGURED',
        errorMessage: 'Beacon 配置不完整，无法查询数据',
        mtrError: null,
        mtrErrorMessage: null,
        achievementsTotal: null,
        nbtPosition: null,
        nbtPositionFetchedAt: null,
        nbtPositionError: null,
        nbtPositionErrorMessage: null,
      };
    }

    const now = new Date();
    const cachedEntry = await this.playerDataCache.getCacheEntry(
      server.serverId,
      identity,
    );
    const statsFresh = this.isCacheFresh(
      cachedEntry?.statsFetchedAt ?? null,
      now,
      PLAYER_DATA_CACHE_TTL_MS,
    );
    const advancementsFresh = this.isCacheFresh(
      cachedEntry?.advancementsFetchedAt ?? null,
      now,
      PLAYER_DATA_CACHE_TTL_MS,
    );

    let metrics: PlayerGameServerMetrics | null = statsFresh
      ? this.readCachedMetrics(cachedEntry?.metrics ?? null)
      : null;
    let error: string | null = null;
    let errorMessage: string | null = null;
    let statsFetchedAt = statsFresh
      ? (cachedEntry?.statsFetchedAt ?? null)
      : null;

    if (!metrics) {
      try {
        const statsResponse =
          await this.minecraftServerService.getBeaconPlayerStats(
            server.serverId,
            {
              playerUuid: identity.uuid ?? undefined,
              playerName: identity.name ?? undefined,
              keys: PLAYER_GAME_METRIC_KEY_LIST,
              page: 1,
              pageSize: PLAYER_GAME_METRIC_KEY_LIST.length,
            },
          );
        metrics = this.extractGameMetrics(statsResponse.result);
        statsFetchedAt = now;
        await this.playerDataCache.upsertStats({
          serverId: server.serverId,
          identity,
          stats: (statsResponse.result as { stats?: unknown })?.stats ?? null,
          metrics,
          fetchedAt: now,
        });
      } catch (err) {
        metrics = this.readCachedMetrics(cachedEntry?.metrics ?? null);
        statsFetchedAt = cachedEntry?.statsFetchedAt ?? null;
        if (!metrics) {
          error = 'BEACON_STATS_FAILED';
          errorMessage = err instanceof Error ? err.message : String(err);
        }
      }
    }

    let achievementsTotal: number | null = advancementsFresh
      ? (cachedEntry?.achievementsTotal ?? null)
      : null;
    if (achievementsTotal === null) {
      try {
        achievementsTotal = await this.countPlayerCompletedAdvancements(
          server.serverId,
          identity,
        );
        await this.playerDataCache.upsertAdvancements({
          serverId: server.serverId,
          identity,
          achievementsTotal,
          fetchedAt: now,
        });
      } catch (err) {
        achievementsTotal = cachedEntry?.achievementsTotal ?? null;
        const fallbackMessage =
          err instanceof Error ? err.message : String(err ?? 'Unknown error');
        this.logger.warn(
          `Failed to fetch player advancements for server ${server.serverName} (${server.serverId}): ${fallbackMessage}`,
        );
      }
    }

    let lastMtrLog: PlayerMtrLogSummary | null = null;
    let mtrError: string | null = null;
    let mtrErrorMessage: string | null = null;
    try {
      const mtrResponse = await this.minecraftServerService.getBeaconMtrLogs(
        server.serverId,
        {
          playerUuid: identity.uuid ?? undefined,
          playerName: identity.name ?? undefined,
          page: 1,
          pageSize: 1,
          order: 'desc',
          orderColumn: 'timestamp',
        },
      );
      lastMtrLog = this.extractLatestMtrLog(mtrResponse.result);
    } catch (err) {
      mtrError = 'BEACON_MTR_FAILED';
      mtrErrorMessage = err instanceof Error ? err.message : String(err);
    }

    let mtrBalance: number | null = null;
    let mtrBalanceFetchedAt: string | null = null;
    let mtrBalanceError: string | null = null;
    let mtrBalanceErrorMessage: string | null = null;
    try {
      const balanceResponse =
        await this.minecraftServerService.getBeaconPlayerBalance(
          server.serverId,
          {
            playerUuid: identity.uuid ?? undefined,
            playerName: identity.name ?? undefined,
          },
        );
      mtrBalanceFetchedAt = new Date().toISOString();
      if (!balanceResponse.result || balanceResponse.result.success === false) {
        mtrBalanceError = 'BEACON_MTR_BALANCE_FAILED';
        mtrBalanceErrorMessage =
          balanceResponse.result?.error ??
          'Beacon did not return player balance (get_player_balance)';
      } else {
        const parsed = Number(balanceResponse.result.balance);
        if (Number.isFinite(parsed)) {
          mtrBalance = parsed;
        } else {
          mtrBalanceError = 'BEACON_MTR_BALANCE_INVALID';
          mtrBalanceErrorMessage = `Beacon returned invalid balance value: ${balanceResponse.result.balance}`;
        }
      }
    } catch (err) {
      mtrBalanceFetchedAt = new Date().toISOString();
      mtrBalanceError = 'BEACON_MTR_BALANCE_FAILED';
      mtrBalanceErrorMessage =
        err instanceof Error ? err.message : String(err ?? 'Unknown error');
    }

    let nbtPosition: PlayerNbtPosition | null = null;
    let nbtPositionFetchedAt: string | null = null;
    let nbtPositionError: string | null = null;
    let nbtPositionErrorMessage: string | null = null;
    try {
      const nbtResponse = await this.minecraftServerService.getBeaconPlayerNbt(
        server.serverId,
        {
          playerUuid: identity.uuid ?? undefined,
          playerName: identity.name ?? undefined,
        },
      );
      nbtPositionFetchedAt = new Date().toISOString();
      nbtPosition = this.extractNbtPosition(nbtResponse.result);
    } catch (err) {
      nbtPositionFetchedAt = new Date().toISOString();
      nbtPositionError = 'BEACON_NBT_FAILED';
      nbtPositionErrorMessage =
        err instanceof Error ? err.message : String(err ?? 'Unknown error');
    }

    return {
      ...server,
      metrics,
      lastMtrLog,
      mtrBalance,
      mtrBalanceFetchedAt,
      mtrBalanceError,
      mtrBalanceErrorMessage,
      fetchedAt: (statsFetchedAt ?? now).toISOString(),
      error,
      errorMessage,
      mtrError,
      mtrErrorMessage,
      achievementsTotal,
      nbtPosition,
      nbtPositionFetchedAt,
      nbtPositionError,
      nbtPositionErrorMessage,
    };
  }

  private extractGameMetrics(result: any): PlayerGameServerMetrics | null {
    if (!result || result.success === false) {
      throw new Error(
        result?.error ?? 'Beacon 未返回玩家统计信息 (get_player_stats)',
      );
    }
    const stats = result.stats ?? {};
    const readNumber = (key: string) => {
      const value = stats?.[key];
      if (value === undefined || value === null) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return {
      walkOneCm: readNumber(PLAYER_GAME_METRIC_KEYS.walkOneCm) ?? 0,
      flyOneCm: readNumber(PLAYER_GAME_METRIC_KEYS.flyOneCm) ?? 0,
      swimOneCm: readNumber(PLAYER_GAME_METRIC_KEYS.swimOneCm) ?? 0,
      totalWorldTime: readNumber(PLAYER_GAME_METRIC_KEYS.totalWorldTime) ?? 0,
      playerKills: readNumber(PLAYER_GAME_METRIC_KEYS.playerKills) ?? 0,
      deaths: readNumber(PLAYER_GAME_METRIC_KEYS.deaths) ?? 0,
      jump: readNumber(PLAYER_GAME_METRIC_KEYS.jump) ?? 0,
      playTime: readNumber(PLAYER_GAME_METRIC_KEYS.playTime) ?? 0,
      useWand: readNumber(PLAYER_GAME_METRIC_KEYS.useWand) ?? 0,
      leaveGame: readNumber(PLAYER_GAME_METRIC_KEYS.leaveGame) ?? 0,
    };
  }

  private extractNbtPosition(result: any): PlayerNbtPosition | null {
    if (!result) {
      throw new Error('Beacon 未返回玩家 NBT (get_player_nbt)');
    }
    if (result.success === false) {
      throw new Error(
        result?.error ?? 'Beacon 未返回玩家 NBT (get_player_nbt)',
      );
    }
    const nbt = result.nbt ?? null;
    if (!nbt) return null;
    const raw = nbt.Pos ?? nbt.pos ?? null;
    if (!Array.isArray(raw) || raw.length < 3) {
      return null;
    }
    const [xRaw, yRaw, zRaw] = raw;
    const x = Number(xRaw);
    const y = Number(yRaw);
    const z = Number(zRaw);
    if (![x, y, z].every((value) => Number.isFinite(value))) {
      return null;
    }
    return { x, y, z };
  }

  private extractLatestMtrLog(result: any): PlayerMtrLogSummary | null {
    if (!result || result.success === false) {
      return null;
    }
    const records = Array.isArray(result.records) ? result.records : [];
    if (!records.length) {
      return null;
    }
    const record = records[0];
    const timestamp = this.parseMtrTimestamp(record?.timestamp ?? null);
    const descriptorParts = [
      typeof record?.change_type === 'string'
        ? record.change_type.trim().toUpperCase()
        : null,
      record?.entry_name ?? record?.entry_id ?? record?.class_name ?? null,
    ].filter((part): part is string => Boolean(part));

    return {
      id:
        typeof record?.id === 'number'
          ? record.id
          : Number.isFinite(Number(record?.id))
            ? Number(record.id)
            : null,
      timestamp: timestamp.iso,
      rawTimestamp: timestamp.raw,
      changeType: record?.change_type ?? null,
      entryName: record?.entry_name ?? null,
      entryId: record?.entry_id ?? null,
      className: record?.class_name ?? null,
      dimensionContext: record?.dimension_context ?? null,
      description: descriptorParts.length ? descriptorParts.join(' · ') : null,
    };
  }

  private async countPlayerCompletedAdvancements(
    serverId: string,
    identity: PlayerBeaconIdentity,
  ): Promise<number> {
    const query: { playerUuid?: string; playerName?: string } = {};
    if (identity.uuid) {
      query.playerUuid = identity.uuid;
    }
    if (identity.name) {
      query.playerName = identity.name;
    }
    if (!query.playerUuid && !query.playerName) {
      return 0;
    }

    let processedEntries = 0;
    let completedCount = 0;
    let totalEntries: number | null = null;
    for (let page = 1; page <= PLAYER_ADVANCEMENT_MAX_PAGES; page += 1) {
      const response =
        await this.minecraftServerService.getBeaconPlayerAdvancements(
          serverId,
          {
            ...query,
            page,
            pageSize: PLAYER_ADVANCEMENT_PAGE_SIZE,
          },
        );
      const result = response.result;
      if (!result || result.success === false) {
        throw new Error(
          result?.error ??
            'Beacon 未返回玩家成就信息 (get_player_advancements)',
        );
      }
      const entries = Object.values(result.advancements ?? {});
      for (const raw of entries) {
        if (typeof raw !== 'string') continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.done === true) {
            completedCount += 1;
          }
        } catch {
          continue;
        }
      }
      const fetched = entries.length;
      processedEntries += fetched;
      const declaredTotal = this.parseBeaconTotal(result.total);
      if (declaredTotal !== null) {
        totalEntries = declaredTotal;
      }
      if (
        fetched === 0 ||
        (totalEntries !== null && processedEntries >= totalEntries) ||
        fetched < PLAYER_ADVANCEMENT_PAGE_SIZE
      ) {
        return completedCount;
      }
    }
    if (totalEntries !== null && processedEntries < totalEntries) {
      this.logger.warn(
        `Reached advancement pagination limit for server ${serverId}: ${
          totalEntries - processedEntries
        } entries may be unprocessed`,
      );
    }
    return completedCount;
  }

  private parseBeaconTotal(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private isCacheFresh(date: Date | null, now: Date, ttlMs: number): boolean {
    if (!date) {
      return false;
    }
    return now.getTime() - date.getTime() <= ttlMs;
  }

  private readCachedMetrics(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object') {
      return null;
    }
    return value as PlayerGameServerMetrics;
  }

  private parseMtrTimestamp(raw: string | null | undefined) {
    if (!raw) {
      return { iso: null, raw: null };
    }
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      return { iso: null, raw };
    }
    return { iso: new Date(parsed).toISOString(), raw };
  }

  async submitAuthmeResetRequest(
    userId: string,
    payload: {
      serverId: string;
      password: string;
      bindingId?: string | null;
      reason?: string | null;
    },
  ) {
    if (!payload.serverId?.trim()) {
      throw new BadRequestException('Please select a server');
    }
    if (!payload.password || payload.password.trim().length < 6) {
      throw new BadRequestException(
        'Please enter a new password with at least 6 characters',
      );
    }
    return this.automation.submitAuthmePasswordReset(userId, payload);
  }

  async submitAuthmeForceLogin(
    userId: string,
    payload: {
      serverId: string;
      bindingId?: string | null;
      reason?: string | null;
    },
  ) {
    if (!payload.serverId?.trim()) {
      throw new BadRequestException('Please select a server');
    }
    return this.automation.submitAuthmeForceLogin(userId, payload);
  }

  async submitPermissionChangeRequest(
    userId: string,
    payload: {
      targetGroup: string;
      serverId: string;
      bindingId?: string | null;
      reason?: string | null;
    },
  ) {
    const sanitized = this.toNullableString(payload.targetGroup);
    if (!sanitized) {
      throw new BadRequestException(
        'Please select the target permission group',
      );
    }
    if (!payload.serverId?.trim()) {
      throw new BadRequestException('Please select a server');
    }
    return this.automation.submitPermissionGroupAdjustment(userId, {
      ...payload,
      targetGroup: sanitized,
    });
  }

  async getPlayerMtrBalance(
    actor: PlayerSessionUser | null,
    payload: {
      serverId: string;
      bindingId?: string | null;
      playerName?: string | null;
    },
  ) {
    if (!payload.serverId?.trim()) {
      throw new BadRequestException('Server ID is required');
    }
    const identity = await this.resolveMtrPlayerIdentity({
      actor,
      bindingId: payload.bindingId ?? null,
      playerName: payload.playerName ?? null,
    });
    const response = await this.minecraftServerService.getBeaconPlayerBalance(
      payload.serverId,
      {
        playerName: identity.playerName,
        playerUuid: identity.playerUuid ?? undefined,
      },
    );
    const result = response.result;
    if (!result?.success) {
      throw new BadRequestException(
        result?.error ?? 'Beacon did not return player balance',
      );
    }
    const balance = Number(result.balance);
    if (!Number.isFinite(balance)) {
      throw new BadRequestException('Beacon returned invalid balance value');
    }
    return {
      success: true,
      player: result.player ?? identity.playerName,
      balance,
    };
  }

  async setPlayerMtrBalance(
    actor: PlayerSessionUser | null,
    payload: {
      serverId: string;
      bindingId?: string | null;
      playerName?: string | null;
      amount: unknown;
    },
  ) {
    if (!payload.serverId?.trim()) {
      throw new BadRequestException('Server ID is required');
    }
    const amount = this.parseBalanceAmount(payload.amount);
    const identity = await this.resolveMtrPlayerIdentity({
      actor,
      bindingId: payload.bindingId ?? null,
      playerName: payload.playerName ?? null,
    });
    const response = await this.minecraftServerService.setBeaconPlayerBalance(
      payload.serverId,
      {
        playerUuid: identity.playerUuid ?? undefined,
        playerName: identity.playerName,
        amount: Math.trunc(amount),
      },
    );
    const result = response.result;
    if (!result?.success) {
      throw new BadRequestException(
        result?.error ?? 'Beacon did not return player balance',
      );
    }
    const balance = Number(result.balance);
    if (!Number.isFinite(balance)) {
      throw new BadRequestException('Beacon returned invalid balance value');
    }
    return {
      success: true,
      player: result.player ?? identity.playerName,
      balance,
    };
  }

  async addPlayerMtrBalance(
    actor: PlayerSessionUser | null,
    payload: {
      serverId: string;
      bindingId?: string | null;
      playerName?: string | null;
      amount: unknown;
    },
  ) {
    if (!payload.serverId?.trim()) {
      throw new BadRequestException('Server ID is required');
    }
    const amount = this.parseBalanceAmount(payload.amount);
    const identity = await this.resolveMtrPlayerIdentity({
      actor,
      bindingId: payload.bindingId ?? null,
      playerName: payload.playerName ?? null,
    });
    const response = await this.minecraftServerService.addBeaconPlayerBalance(
      payload.serverId,
      {
        playerUuid: identity.playerUuid ?? undefined,
        playerName: identity.playerName,
        amount: Math.trunc(amount),
      },
    );
    const result = response.result;
    if (!result?.success) {
      throw new BadRequestException(
        result?.error ?? 'Beacon did not return player balance',
      );
    }
    const balance = Number(result.balance);
    if (!Number.isFinite(balance)) {
      throw new BadRequestException('Beacon returned invalid balance value');
    }
    return {
      success: true,
      player: result.player ?? identity.playerName,
      balance,
    };
  }

  async getLifecycleEvents(
    userId: string,
    options: { sources?: string[]; limit?: number },
  ) {
    return this.automation.listLifecycleEvents(userId, options);
  }

  async getPermissionAdjustmentOptions(userId: string, bindingId?: string) {
    if (!this.luckpermsService.isEnabled()) {
      return {
        currentGroup: null,
        currentGroupLabel: null,
        options: [],
      } as const;
    }
    const binding = await this.prisma.userAuthmeBinding.findFirst({
      where: bindingId ? { id: bindingId, userId } : { userId },
      orderBy: { boundAt: 'desc' },
    });
    if (!binding) {
      throw new BadRequestException('No valid AuthMe binding found');
    }
    const snapshot = await this.buildLuckpermsSnapshotForBinding(
      {
        authmeUsername: binding.authmeUsername,
        authmeRealname: binding.authmeRealname,
        authmeUuid: binding.authmeUuid,
      },
      new Map(),
      new Map(),
    );
    const priorityEntries = this.luckpermsService.getGroupPriorityEntries();
    const currentGroup = snapshot.primaryGroup;
    const currentPriority = currentGroup
      ? this.luckpermsService.getGroupPriority(currentGroup)
      : null;
    const options = priorityEntries
      .filter((entry) =>
        currentPriority == null ? true : entry.priority >= currentPriority,
      )
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => ({
        value: entry.group,
        label:
          this.luckpermsService.getGroupDisplayName(entry.group) ?? entry.group,
        priority: entry.priority,
      }));
    return {
      currentGroup,
      currentGroupLabel: snapshot.primaryGroupDisplayName,
      options,
    } as const;
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
      throw new NotFoundException('Server not found');
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
      return await this.authmeLookupService.getAccount(username, {
        allowFallback: true,
      });
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

  private normalizeRecommendationPageSize(size?: number) {
    if (!Number.isFinite(size ?? NaN)) {
      return RECOMMENDED_PAGE_SIZE_DEFAULT;
    }
    const normalized = Math.max(Math.floor(size ?? 0), 1);
    return Math.min(normalized, RECOMMENDED_PAGE_SIZE_MAX);
  }

  private async buildRecommendationEntryForUser(user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    avatarAttachmentId: string | null;
    profile: { displayName: string | null } | null;
  }) {
    const displayName =
      user.profile?.displayName?.trim() ||
      user.name?.trim() ||
      user.email ||
      'Player';
    const avatarUrl = await this.resolveUserAvatarUrl(
      user.avatarAttachmentId,
      user.image ?? null,
    );
    return {
      id: `user-${user.id}`,
      targetId: user.id,
      type: 'user' as const,
      displayName,
      avatarUrl,
    };
  }

  private async resolveUserAvatarUrl(
    attachmentId?: string | null,
    fallback?: string | null,
  ) {
    if (attachmentId) {
      try {
        const attachment =
          await this.attachmentsService.getAttachmentOrThrow(attachmentId);
        if (attachment.isPublic) {
          return buildPublicUrl(`/attachments/public/${attachmentId}`);
        }
      } catch {
        // ignore
      }
    }
    return fallback ?? null;
  }

  private async fetchAuthmeRecommendationEntries(limit: number) {
    if (limit <= 0) {
      return [];
    }
    try {
      const response = await this.authmeCache.listPlayers({
        page: 1,
        pageSize: limit,
        sortField: 'lastlogin',
        sortOrder: 'desc',
      });
      return response.items.map((account) => ({
        id: `authme-${account.username}`,
        targetId: account.username,
        type: 'authme' as const,
        displayName: this.resolveAuthmeDisplayName(account),
        avatarUrl: null,
      }));
    } catch (error) {
      this.logger.warn(
        `Failed to load AuthMe recommendations from cache: ${String(error)}`,
      );
      return [];
    }
  }

  private resolveAuthmeDisplayName(account: {
    username: string;
    realname?: string | null;
  }) {
    const realname = account.realname?.trim();
    if (realname) {
      return realname;
    }
    return account.username;
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
    const allowFallback = this.luckpermsService.isEnabled();
    const normalizedUuid = this.normalizeLookupKey(binding.authmeUuid);
    if (normalizedUuid) {
      const uuidKey = normalizedUuid.toLowerCase();
      if (uuidCache.has(uuidKey)) {
        return uuidCache.get(uuidKey) ?? null;
      }
      try {
        const player = await this.luckpermsLookupService.getPlayerByUuid(
          normalizedUuid,
          {
            allowFallback,
          },
        );
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
        const player = await this.luckpermsLookupService.getPlayerByUsername(
          lookupName,
          {
            allowFallback,
          },
        );
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

  private async resolveMtrPlayerIdentity(options: {
    actor: PlayerSessionUser | null;
    bindingId?: string | null;
    playerName?: string | null;
  }) {
    if (options.bindingId) {
      if (!options.actor) {
        throw new ForbiddenException(
          'Binding does not belong to the current user',
        );
      }
      const binding = await this.prisma.userAuthmeBinding.findFirst({
        where: { id: options.bindingId },
        select: {
          userId: true,
          authmeUuid: true,
          authmeUsername: true,
          authmeRealname: true,
        },
      });
      if (!binding) {
        throw new BadRequestException('Binding not found');
      }
      if (binding.userId !== options.actor.id) {
        throw new ForbiddenException(
          'Binding does not belong to the current user',
        );
      }
      const resolvedName = this.resolveLookupName(binding);
      if (!resolvedName) {
        throw new BadRequestException('Binding does not expose a player name');
      }
      return {
        playerName: resolvedName,
        playerUuid: this.normalizeLookupKey(binding.authmeUuid),
      };
    }
    const playerName = this.normalizeLookupKey(options.playerName ?? null);
    if (playerName) {
      if (!hasAdminRole(options.actor)) {
        throw new ForbiddenException(
          'Admin permission required to specify playerName',
        );
      }
      return { playerName, playerUuid: null };
    }
    throw new BadRequestException('Binding or playerName is required');
  }

  private parseBalanceAmount(value: unknown) {
    if (value === null || value === undefined) {
      throw new BadRequestException('Amount is required');
    }
    const normalized =
      typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(normalized)) {
      throw new BadRequestException('Amount must be a finite number');
    }
    return normalized;
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

type PlayerMessageWithRelations = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  targetUserId: string;
  author: {
    id: string;
    name: string | null;
    email: string | null;
    profile?: { displayName: string | null } | null;
  };
  reactions: Array<{
    userId: string;
    reaction: PlayerMessageReactionType;
  }>;
};

function resolveDisplayName(source: {
  name: string | null;
  email: string | null;
  profile?: { displayName: string | null } | null;
}) {
  return source.profile?.displayName ?? source.name ?? source.email ?? null;
}

function buildMessageEntry(
  entry: PlayerMessageWithRelations,
  viewerId: string | null,
  viewerIsAdmin: boolean,
  targetUserId: string,
): PlayerMessageBoardEntry {
  const positiveCount = entry.reactions.filter(
    (reaction) => reaction.reaction === PlayerMessageReactionType.UP,
  ).length;
  const negativeCount = entry.reactions.filter(
    (reaction) => reaction.reaction === PlayerMessageReactionType.DOWN,
  ).length;
  const viewerReaction =
    entry.reactions.find((reaction) => reaction.userId === viewerId)
      ?.reaction ?? null;
  return {
    id: entry.id,
    author: {
      id: entry.author.id,
      displayName: resolveDisplayName(entry.author),
      email: entry.author.email,
    },
    content: entry.content,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    positiveCount,
    negativeCount,
    viewerReaction,
    viewerCanDelete: viewerIsAdmin || viewerId === targetUserId,
  };
}
