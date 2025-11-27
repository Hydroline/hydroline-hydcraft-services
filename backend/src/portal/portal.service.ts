import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ContactVerificationStatus,
  LifecycleEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortalConfigService } from '../portal-config/portal-config.service';
import { MinecraftServerService } from '../minecraft/minecraft-server.service';
import { BeaconLibService } from '../lib/hydroline-beacon';
import { IpLocationService } from '../lib/ip2region/ip-location.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { buildPublicUrl } from '../lib/shared/url';
import { AuthmeService } from '../authme/authme.service';
import { normalizeIpAddress } from '../lib/ip2region/ip-normalizer';
import {
  DEFAULT_PORTAL_HOME_CONFIG,
  PORTAL_CARD_REGISTRY,
} from '../portal-config/portal-config.constants';
import type { PortalCardVisibilityConfig } from '../portal-config/portal-config.types';

type AdminHealthStatus = 'normal' | 'warning' | 'critical';

type NavigationLink = {
  id: string;
  label: string;
  tooltip: string | null;
  url: string | null;
  available: boolean;
  icon: string | null;
};

type PortalUserAccessContext = {
  id: string;
  email: string;
  roleKeys: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const NUMBER_FORMATTER = new Intl.NumberFormat('zh-CN');

function startOfDay(date: Date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function addDays(date: Date, days: number) {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
}

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolvePeriodLabel(date: Date) {
  const hour = date.getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatPercent(value: number) {
  const rounded = Math.round(value);
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded}%`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

const MINUTE_MS = 60 * 1000;
const DEFAULT_LOGIN_MAP_RANGE_DAYS = 30;

type PortalDashboardCard = {
  id: string;
  title: string;
  description?: string | null;
  value: string;
  unit?: string | null;
  trend?: 'up' | 'down' | 'flat';
  trendLabel?: string | null;
  badge?: string | null;
};

type PortalServerSnapshot = {
  id: string;
  displayName: string;
  edition: string;
  lastPingAt: Date | null;
  onlinePlayers: number | null;
  maxPlayers: number | null;
  latency: number | null;
};

type PortalServerOverview = {
  totalServers: number;
  healthyServers: number;
  onlinePlayers: number;
  maxPlayers: number;
  averageLatencyMs: number | null;
  busiestServer: {
    id: string;
    name: string;
    onlinePlayers: number;
    latency: number | null;
  } | null;
  lastUpdatedAt: string;
};

type PortalOwnershipOverview = {
  authmeBindings: number;
  permissionGroups: number;
  rbacLabels: number;
};

type PortalApplicationOverview = {
  pendingContacts: number;
  activeSessions: number;
  securityHolds: number;
  profileCompleteness: number;
  profileCompletenessLabel: string;
};

type PortalDashboardPayload = {
  serverOverview: PortalServerOverview;
  ownershipOverview: PortalOwnershipOverview;
  applicationOverview: PortalApplicationOverview;
  updatedAt: string;
};

type PlayerLoginCluster = {
  id: string;
  count: number;
  lastSeenAt: string;
  province: string | null;
  city: string | null;
  country: string | null;
  isp: string | null;
  sampleIp: string | null;
};

type RankCategory = {
  id: string;
  name: string;
  description: string;
  unit: string;
  source: 'sessions' | 'authmeHistory' | 'attachments';
};

const RANK_CATEGORIES: RankCategory[] = [
  {
    id: 'login-count',
    name: '上线次数',
    description: '根据用户 session 记录估算的上线次数',
    unit: '次',
    source: 'sessions',
  },
  {
    id: 'authme-events',
    name: '账号操作',
    description: 'AuthMe 绑定历史事件数量',
    unit: '条',
    source: 'authmeHistory',
  },
  {
    id: 'attachment-uploads',
    name: '附件贡献',
    description: '上传到附件库的文件数量',
    unit: '个',
    source: 'attachments',
  },
];

const RANK_PERIODS: Record<string, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

const RANK_SOURCES = {
  sessions: {
    table: 'sessions',
    userColumn: 'user_id',
    dateColumn: 'created_at',
  },
  authmeHistory: {
    table: 'authme_binding_history',
    userColumn: 'user_id',
    dateColumn: 'created_at',
  },
  attachments: {
    table: 'attachments',
    userColumn: 'owner_id',
    dateColumn: 'created_at',
  },
} as const;

function buildTrend(current: number, previous: number) {
  if (previous === 0 && current === 0) {
    return { trend: 'flat' as const, label: '0%' };
  }
  if (previous === 0) {
    return {
      trend: current > 0 ? ('up' as const) : ('flat' as const),
      label: current > 0 ? '+100%' : '0%',
    };
  }
  const diffPercent = ((current - previous) / previous) * 100;
  if (Math.abs(diffPercent) < 1) {
    return { trend: 'flat' as const, label: '≈0%' };
  }
  return diffPercent > 0
    ? { trend: 'up' as const, label: formatPercent(diffPercent) }
    : { trend: 'down' as const, label: formatPercent(diffPercent) };
}

type TrendInfo = ReturnType<typeof buildTrend>;

function formatLoginSubtext(
  lastLoginAt?: Date | null,
  lastLoginIp?: string | null,
) {
  if (!lastLoginAt) {
    return '尚无登录记录';
  }
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const ipHint = lastLoginIp ? ` · ${lastLoginIp}` : '';
  return `上次登录：${formatter.format(lastLoginAt)}${ipHint}`;
}

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly portalConfigService: PortalConfigService,
    private readonly minecraftServers: MinecraftServerService,
    private readonly beaconLib: BeaconLibService,
    private readonly ipLocationService: IpLocationService,
    private readonly attachmentsService: AttachmentsService,
    private readonly authmeService: AuthmeService,
  ) {}

  /**
   * 将 Minecraft 世界时间 tick (0-23999) 粗略映射为 HH:mm 字符串。
   * Minecraft 一天 24000 tick，游戏内 6:00 对应 tick=0，这里做一个常见换算：
   * tick 0 -> 06:00，tick 6000 -> 12:00，tick 18000 -> 00:00。
   */
  private formatMcWorldTime(timeTicks: number): {
    text: string;
    minutes: number;
  } {
    const TICKS_PER_DAY = 24000;
    const MINUTES_PER_MC_DAY = 24 * 60;
    const minutesPerTick = MINUTES_PER_MC_DAY / TICKS_PER_DAY; // 1 tick ~= 0.06 分钟
    // Minecraft tick=0 是 6:00，先平移 6 小时
    const totalMinutes =
      (timeTicks * minutesPerTick + 6 * 60) % MINUTES_PER_MC_DAY;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    return {
      text: `${pad(hours)}:${pad(minutes)}`,
      minutes: Math.floor(totalMinutes),
    };
  }

  async getHomePortal(userId?: string) {
    // Simplified home portal response as per new requirement:
    // Only return hero section. Keep minimal config loading; omit user/authme/mcsm/server aggregations.
    // We still attempt to read portal home config to allow future extension without changing this method signature.
    let hero: {
      subtitle: string;
      background: Array<{
        imageUrl: string;
        description: string | null;
        id: string;
        title: string | null;
        subtitle: string | null;
        shootAt: string | null;
        photographer: string | null;
      }>;
    };
    try {
      const resolved = await this.portalConfigService.getResolvedHomeContent();
      hero = resolved.hero;
    } catch (error) {
      this.logger.warn(`Failed to load portal home config: ${String(error)}`);
      hero = {
        subtitle: DEFAULT_PORTAL_HOME_CONFIG.hero.subtitle,
        background: [],
      };
    }

    // Return only hero plus empty placeholders to keep frontend shape stable.
    return {
      hero: {
        subtitle: hero.subtitle,
        background: hero.background,
      },
      navigation: [],
      cards: [],
    };
  }

  async getPlayerPortalData(
    viewerId: string | null,
    targetUserId: string,
    options: {
      period?: string;
      actionsPage?: number;
      actionsPageSize?: number;
    } = {},
  ) {
    const period = options.period ?? '30d';
    const actionsPage = Math.max(options.actionsPage ?? 1, 1);
    const actionsPageSize = Math.min(
      Math.max(options.actionsPageSize ?? 10, 1),
      50,
    );
    const [summary, assets, region, minecraft, stats, actions] =
      await Promise.all([
        this.getPlayerSummary(targetUserId),
        this.getPlayerAssets(targetUserId),
        this.getPlayerRegion(targetUserId),
        this.getPlayerMinecraftData(targetUserId),
        this.getPlayerStats(targetUserId, period),
        this.getPlayerActions(targetUserId, {
          page: actionsPage,
          pageSize: actionsPageSize,
        }),
      ]);
    return {
      viewerId,
      targetId: targetUserId,
      summary,
      assets,
      region,
      minecraft,
      stats,
      actions,
    };
  }

  private async collectServerSnapshots(): Promise<PortalServerSnapshot[]> {
    const servers = await this.prisma.minecraftServer.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (!servers.length) {
      return [];
    }
    const snapshots = await Promise.all(
      servers.map(async (server) => {
        const ping = await this.prisma.minecraftServerPingRecord.findFirst({
          where: { serverId: server.id },
          orderBy: { createdAt: 'desc' },
        });
        return {
          id: server.id,
          displayName: server.displayName,
          edition: server.edition,
          lastPingAt: ping?.createdAt ?? null,
          onlinePlayers: ping?.onlinePlayers ?? null,
          maxPlayers: ping?.maxPlayers ?? null,
          latency: ping?.latency ?? null,
        };
      }),
    );
    return snapshots;
  }

  private async buildDashboardPayload(
    userContext: PortalUserAccessContext | null,
    snapshots: PortalServerSnapshot[],
  ): Promise<PortalDashboardPayload> {
    const serverOverview = this.summarizeServerSnapshots(snapshots);
    if (!userContext) {
      return {
        serverOverview,
        ownershipOverview: {
          authmeBindings: 0,
          permissionGroups: 0,
          rbacLabels: 0,
        },
        applicationOverview: {
          pendingContacts: 0,
          activeSessions: 0,
          securityHolds: 0,
          profileCompleteness: 0,
          profileCompletenessLabel: '访客',
        },
        updatedAt: new Date().toISOString(),
      };
    }
    const [ownershipOverview, applicationOverview] = await Promise.all([
      this.computeOwnershipOverview(userContext.id),
      this.computeApplicationOverview(userContext.id),
    ]);
    return {
      serverOverview,
      ownershipOverview,
      applicationOverview,
      updatedAt: new Date().toISOString(),
    };
  }

  private summarizeServerSnapshots(
    snapshots: PortalServerSnapshot[],
  ): PortalServerOverview {
    const nowIso = new Date().toISOString();
    if (!snapshots.length) {
      return {
        totalServers: 0,
        healthyServers: 0,
        onlinePlayers: 0,
        maxPlayers: 0,
        averageLatencyMs: null,
        busiestServer: null,
        lastUpdatedAt: nowIso,
      };
    }
    const now = Date.now();
    let onlinePlayers = 0;
    let maxPlayers = 0;
    const latencies: number[] = [];
    let healthiest = 0;
    let busiest: PortalServerSnapshot | null = null;
    for (const snapshot of snapshots) {
      const online = snapshot.onlinePlayers ?? 0;
      const max = snapshot.maxPlayers ?? 0;
      onlinePlayers += online;
      maxPlayers += max;
      if (
        snapshot.latency != null &&
        snapshot.lastPingAt &&
        now - snapshot.lastPingAt.getTime() <= 10 * MINUTE_MS
      ) {
        healthiest += 1;
        latencies.push(snapshot.latency);
      } else if (snapshot.latency != null) {
        latencies.push(snapshot.latency);
      }
      if (!busiest || online > (busiest.onlinePlayers ?? 0)) {
        busiest = snapshot;
      }
    }
    const averageLatencyMs = latencies.length
      ? Math.round(
          latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
        )
      : null;
    return {
      totalServers: snapshots.length,
      healthyServers: healthiest,
      onlinePlayers,
      maxPlayers,
      averageLatencyMs,
      busiestServer: busiest
        ? {
            id: busiest.id,
            name: busiest.displayName,
            onlinePlayers: busiest.onlinePlayers ?? 0,
            latency: busiest.latency,
          }
        : null,
      lastUpdatedAt: nowIso,
    };
  }

  private async computeOwnershipOverview(
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

  private async computeApplicationOverview(
    userId: string,
  ): Promise<PortalApplicationOverview> {
    const now = new Date();
    const [user, pendingContacts, activeSessions] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          passwordNeedsReset: true,
          profile: {
            select: {
              displayName: true,
              piic: true,
              timezone: true,
              locale: true,
              primaryMinecraftProfileId: true,
              primaryAuthmeBindingId: true,
            },
          },
        },
      }),
      this.prisma.userContact.count({
        where: {
          userId,
          verification: { not: ContactVerificationStatus.VERIFIED },
        },
      }),
      this.prisma.session.count({
        where: { userId, expiresAt: { gt: now } },
      }),
    ]);
    const completeness = this.computeProfileCompleteness(user?.profile ?? null);
    return {
      pendingContacts,
      activeSessions,
      securityHolds: user?.passwordNeedsReset ? 1 : 0,
      profileCompleteness: completeness.score,
      profileCompletenessLabel: completeness.label,
    };
  }

  private computeProfileCompleteness(
    profile: {
      displayName?: string | null;
      piic?: string | null;
      timezone?: string | null;
      locale?: string | null;
      primaryMinecraftProfileId?: string | null;
      primaryAuthmeBindingId?: string | null;
    } | null,
  ) {
    const fields = [
      Boolean(profile?.displayName),
      Boolean(profile?.piic),
      Boolean(profile?.timezone),
      Boolean(profile?.locale),
      Boolean(profile?.primaryMinecraftProfileId),
      Boolean(profile?.primaryAuthmeBindingId),
    ];
    const filled = fields.filter(Boolean).length;
    const score = fields.length
      ? Math.round((filled / fields.length) * 100)
      : 0;
    return {
      score,
      label: `${filled}/${fields.length}`,
    };
  }

  private async fetchAuthmeAccount(username?: string | null) {
    if (!username) {
      return null;
    }
    try {
      return await this.authmeService.getAccount(username);
    } catch (error) {
      this.logger.debug(
        `无法获取 AuthMe 账号 ${username}: ${String(error)}`,
      );
      return null;
    }
  }

  private async lookupLocationWithCache(
    ip: string | null | undefined,
    cache: Map<
      string,
      Awaited<ReturnType<IpLocationService['lookup']>> | null
    >,
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
          lastKnownLocation: includeBoundLocation
            ? boundLocation?.display ?? null
            : null,
          lastLoginIp,
          lastLoginLocation: lastLoginLocation?.display ?? null,
          regIp,
          regIpLocation: regIpLocation?.display ?? null,
        };
      }),
    );
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

  private resolvePeriodStart(period?: string) {
    const days =
      period && Object.prototype.hasOwnProperty.call(RANK_PERIODS, period)
        ? RANK_PERIODS[period]
        : RANK_PERIODS['30d'];
    if (!days) {
      return undefined;
    }
    if (typeof days !== 'number') {
      return undefined;
    }
    return new Date(Date.now() - days * DAY_MS);
  }

  private resolveRankCategory(categoryId: string): RankCategory {
    return (
      RANK_CATEGORIES.find((entry) => entry.id === categoryId) ??
      RANK_CATEGORIES[0]
    );
  }

  private buildRankWhereClause(
    config: (typeof RANK_SOURCES)[keyof typeof RANK_SOURCES],
    since?: Date,
    extras: Prisma.Sql[] = [],
  ) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`${Prisma.raw(`"${config.userColumn}"`)} IS NOT NULL`,
    ];
    if (since) {
      conditions.push(
        Prisma.sql`${Prisma.raw(`"${config.dateColumn}"`)} >= ${since}`,
      );
    }
    if (extras.length) {
      conditions.push(...extras);
    }
    if (!conditions.length) {
      return Prisma.sql``;
    }
    return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  private async aggregateRankSource(
    source: RankCategory['source'],
    options: { since?: Date; skip: number; take: number },
  ) {
    const config = RANK_SOURCES[source];
    const table = Prisma.raw(`"${config.table}"`);
    const userColumn = Prisma.raw(`"${config.userColumn}"`);
    const whereSql = this.buildRankWhereClause(config, options.since);
    const query = Prisma.sql`
      SELECT ${userColumn} AS "userId", COUNT(*)::bigint AS "value"
      FROM ${table}
      ${whereSql}
      GROUP BY ${userColumn}
      ORDER BY "value" DESC, ${userColumn} ASC
      LIMIT ${options.take} OFFSET ${options.skip}
    `;
    const rows =
      await this.prisma.$queryRaw<Array<{ userId: string; value: bigint }>>(
        query,
      );
    const totalQuery = Prisma.sql`
      SELECT COUNT(*)::bigint AS "total"
      FROM (
        SELECT 1
        FROM ${table}
        ${whereSql}
        GROUP BY ${userColumn}
      ) AS counted
    `;
    const totalRows =
      await this.prisma.$queryRaw<Array<{ total: bigint }>>(totalQuery);
    const total = Number(totalRows[0]?.total ?? 0);
    return {
      total,
      items: rows,
    };
  }

  private async fetchRankValue(
    source: RankCategory['source'],
    userId: string,
    since?: Date,
  ) {
    const config = RANK_SOURCES[source];
    const table = Prisma.raw(`"${config.table}"`);
    const whereSql = this.buildRankWhereClause(config, since, [
      Prisma.sql`${Prisma.raw(`"${config.userColumn}"`)} = ${userId}`,
    ]);
    const query = Prisma.sql`
      SELECT COUNT(*)::bigint AS "value"
      FROM ${table}
      ${whereSql}
    `;
    const rows = await this.prisma.$queryRaw<Array<{ value: bigint }>>(query);
    return Number(rows[0]?.value ?? 0);
  }

  private async fetchRankAheadCount(
    source: RankCategory['source'],
    userId: string,
    since: Date | undefined,
    value: number,
  ) {
    const config = RANK_SOURCES[source];
    const table = Prisma.raw(`"${config.table}"`);
    const userColumn = Prisma.raw(`"${config.userColumn}"`);
    const baseWhere = this.buildRankWhereClause(config, since);
    const baseQuery = Prisma.sql`
      SELECT ${userColumn} AS "uid", COUNT(*)::bigint AS "value"
      FROM ${table}
      ${baseWhere}
      GROUP BY ${userColumn}
    `;
    const aheadQuery = Prisma.sql`
      SELECT COUNT(*)::bigint AS "ahead"
      FROM (${baseQuery}) AS ranked
      WHERE "value" > ${value} OR ("value" = ${value} AND "uid" < ${userId})
    `;
    const rows =
      await this.prisma.$queryRaw<Array<{ ahead: bigint }>>(aheadQuery);
    return Number(rows[0]?.ahead ?? 0);
  }

  private async fetchLeaderboardUsers(userIds: string[]) {
    if (!userIds.length) {
      return new Map<
        string,
        {
          id: string;
          displayName: string | null;
          email: string | null;
          minecraftName: string | null;
        }
      >();
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        name: true,
        profile: {
          select: {
            displayName: true,
            primaryMinecraftProfile: {
              select: { nickname: true },
            },
          },
        },
      },
    });
    const map = new Map<
      string,
      {
        id: string;
        displayName: string | null;
        email: string | null;
        minecraftName: string | null;
      }
    >();
    for (const user of users) {
      map.set(user.id, {
        id: user.id,
        displayName:
          user.profile?.displayName ?? user.name ?? user.email ?? null,
        email: user.email,
        minecraftName: user.profile?.primaryMinecraftProfile?.nickname ?? null,
      });
    }
    return map;
  }

  private buildPagination(total: number, page: number, pageSize: number) {
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    return {
      total,
      page,
      pageSize,
      pageCount,
    };
  }

  private async buildServerCards(
    snapshots: PortalServerSnapshot[],
  ): Promise<PortalDashboardCard[]> {
    const overview = this.summarizeServerSnapshots(snapshots);
    const serverIds = snapshots.map((snapshot) => snapshot.id);
    let uptimeRatio = 0;
    if (serverIds.length) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [totalSamples, healthySamples] = await Promise.all([
        this.prisma.minecraftServerPingRecord.count({
          where: { serverId: { in: serverIds }, createdAt: { gte: since } },
        }),
        this.prisma.minecraftServerPingRecord.count({
          where: {
            serverId: { in: serverIds },
            createdAt: { gte: since },
            latency: { not: null },
          },
        }),
      ]);
      uptimeRatio = totalSamples > 0 ? healthySamples / totalSamples : 0;
    }
    const occupancy =
      overview.maxPlayers > 0
        ? overview.onlinePlayers / overview.maxPlayers
        : 0;
    const cards: PortalDashboardCard[] = [];
    cards.push({
      id: 'server-online',
      title: '在线玩家',
      description: '当前在线玩家总数',
      value: formatNumber(overview.onlinePlayers),
      unit: '人',
      trend: occupancy >= 0.5 ? 'up' : occupancy >= 0.2 ? 'flat' : 'down',
      trendLabel: `${Math.round(occupancy * 100)}%`,
      badge: overview.busiestServer?.name ?? null,
    });
    cards.push({
      id: 'server-latency',
      title: '平均延迟',
      description: '最近一次 Ping 的平均值',
      value:
        overview.averageLatencyMs != null
          ? formatNumber(overview.averageLatencyMs)
          : 'N/A',
      unit: overview.averageLatencyMs != null ? 'ms' : '',
      trend:
        overview.averageLatencyMs == null
          ? 'flat'
          : overview.averageLatencyMs <= 120
            ? 'up'
            : overview.averageLatencyMs <= 200
              ? 'flat'
              : 'down',
      trendLabel:
        overview.averageLatencyMs != null
          ? `${overview.averageLatencyMs} ms`
          : '无数据',
    });
    cards.push({
      id: 'server-health',
      title: '健康服务器',
      description: '10 分钟内仍在线的服务器数量',
      value: `${overview.healthyServers}/${overview.totalServers}`,
      trend:
        overview.totalServers === 0
          ? 'flat'
          : overview.healthyServers === overview.totalServers
            ? 'up'
            : overview.healthyServers === 0
              ? 'down'
              : 'flat',
      trendLabel:
        overview.totalServers === 0
          ? '0%'
          : `${Math.round(
              (overview.healthyServers / overview.totalServers) * 100,
            )}%`,
    });
    cards.push({
      id: 'server-uptime',
      title: '24 小时可用性',
      description: '近 24 小时成功采样占比',
      value: `${Math.round(uptimeRatio * 100)}%`,
      trend: uptimeRatio >= 0.95 ? 'up' : uptimeRatio >= 0.8 ? 'flat' : 'down',
      trendLabel: uptimeRatio ? `${(uptimeRatio * 100).toFixed(1)}%` : '---',
    });
    return cards;
  }

  /**
   * 门户 Header 公共 Minecraft 状态聚合（无需登录）
   * - 基于 MinecraftServer 配置
   * - 结合最近一次 Ping 记录、Beacon 时间信息、MCSM 状态
   */
  async getPublicHeaderMinecraftStatus() {
    // 仅取启用的、已激活的服务器，按 displayOrder 排序
    const servers = await this.prisma.minecraftServer.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (!servers.length) {
      return { servers: [] } as const;
    }

    // 批量查询：最近一次 ping 记录 + 可能的 beacon 缓存 + mcsm 状态
    const results = await Promise.all(
      servers.map(async (server) => {
        // 最近一条 Ping 记录
        const lastPing = await this.prisma.minecraftServerPingRecord.findFirst({
          where: { serverId: server.id },
          orderBy: { createdAt: 'desc' },
        });

        // 直接通过 Beacon WS 调用 get_server_time / get_status 推导时钟与在线信息
        let beaconClock: { displayTime?: string; locked?: boolean } | null =
          null;
        let beaconOnlinePlayers: number | null = null;
        let beaconMaxPlayers: number | null = null;

        try {
          const [timePayload, statusPayload] = await Promise.all([
            this.beaconLib.fetchServerTimeNow(server.id),
            this.beaconLib.fetchStatusNow(server.id),
          ]);

          if (timePayload && (timePayload as any).success) {
            const anyTime = timePayload as any;
            const doCycle = anyTime.do_daylight_cycle;
            const locked =
              doCycle === 'false' || doCycle === false || doCycle === '0';

            const timeTicks: number | null =
              typeof anyTime.time === 'number' ? anyTime.time : null;

            let displayTime: string | undefined;
            let worldMinutes: number | undefined;
            if (timeTicks != null) {
              const formatted = this.formatMcWorldTime(timeTicks);
              displayTime = formatted.text;
              worldMinutes = formatted.minutes;
            }

            beaconClock = {
              displayTime,
              locked,
              // 前端用于本地 tick 驱动的规范化世界分钟数（0-1439）
              worldMinutes,
            } as any;
          }

          if (statusPayload && (statusPayload as any).success) {
            const anyStatus = statusPayload as any;
            if (typeof anyStatus.online_player_count === 'number') {
              beaconOnlinePlayers = anyStatus.online_player_count;
            }
            if (typeof anyStatus.server_max_players === 'number') {
              beaconMaxPlayers = anyStatus.server_max_players;
            }
          }
        } catch (e) {
          this.logger.debug(
            `Beacon realtime status failed for server ${server.id}: ${String(
              e,
            )}`,
          );
        }

        // MCSM 连接状态（通过元数据/最近一次状态记录或配置来粗略判断）
        const mcsmConfigured = Boolean(
          server.mcsmPanelUrl && server.mcsmInstanceUuid,
        );
        let mcsm: { status?: number } | null = null;
        if (mcsmConfigured) {
          try {
            const mcsmStatus = await this.minecraftServers.getMcsmStatus(
              server.id,
            );
            if (
              mcsmStatus?.detail &&
              typeof mcsmStatus.detail.status === 'number'
            ) {
              mcsm = { status: mcsmStatus.detail.status };
            } else {
              mcsm = { status: undefined };
            }
          } catch (e) {
            this.logger.debug(
              `MCSM status fetch failed for server ${server.id}: ${String(e)}`,
            );
            mcsm = { status: undefined };
          }
        }

        // 将最近一次 ping 记录映射为公共结构（不暴露 raw），并在必要时用作 Beacon 的兜底
        let ping: {
          edition: 'JAVA' | 'BEDROCK';
          response: {
            latency?: number | null;
            players?: { online?: number | null; max?: number | null };
            motdText?: string | null;
          };
        } | null = null;

        if (lastPing) {
          const fallbackOnline = lastPing.onlinePlayers;
          const fallbackMax = lastPing.maxPlayers;
          ping = {
            edition: lastPing.edition as 'JAVA' | 'BEDROCK',
            response: {
              latency: lastPing.latency,
              players: {
                online: beaconOnlinePlayers ?? fallbackOnline,
                max: beaconMaxPlayers ?? fallbackMax,
              },
              motdText: lastPing.motd,
            },
          };
        }

        return {
          id: server.id,
          displayName: server.displayName,
          code: `${server.internalCodeCn} / ${server.internalCodeEn}`,
          edition: server.edition,
          beacon: beaconClock ? { clock: beaconClock } : null,
          ping,
          mcsm,
        };
      }),
    );

    return { servers: results };
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
      },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const location = await this.ipLocationService.lookup(user.lastLoginIp);
    const ownership = await this.computeOwnershipOverview(userId);
    
    // 计算用户头像 URL
    let avatarUrl: string | null = null;
    if (user.avatarAttachmentId) {
      try {
        const attachment = await this.attachmentsService.getAttachmentOrThrow(
          user.avatarAttachmentId,
        );
        if (attachment.isPublic) {
          avatarUrl = buildPublicUrl(`/attachments/public/${user.avatarAttachmentId}`);
        }
      } catch {
        avatarUrl = null;
      }
    }
    
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
      lastLoginLocation: location?.display ?? null,
      displayName: user.profile?.displayName ?? null,
      piic: user.profile?.piic ?? null,
      gender: user.profile?.gender ?? null,
      profileExtra: this.normalizeProfileExtra(user.profile?.extra),
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
      authmeBindings: await this.buildAuthmeBindingPayloads(
        user.authmeBindings,
        { includeBoundLocation: true },
      ),
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
      pagination: this.buildPagination(total, page, pageSize),
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
      bindings: enrichedBindings,
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
        location: lastLoginLocation?.display ?? null,
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
      bindings: enrichedBindings,
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

  async getPlayerStats(userId: string, period: string | undefined) {
    const since = this.resolvePeriodStart(period);
    const [sessions, bindingEvents, attachments] = await Promise.all([
      this.prisma.session.findMany({
        where: {
          userId,
          createdAt: since ? { gte: since } : undefined,
        },
        select: {
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.authmeBindingHistory.count({
        where: {
          userId,
          createdAt: since ? { gte: since } : undefined,
        },
      }),
      this.prisma.attachment.count({
        where: {
          ownerId: userId,
          createdAt: since ? { gte: since } : undefined,
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
      period: period ?? '30d',
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
          id: 'binding-events',
          label: '绑定历史事件',
          value: bindingEvents,
          unit: 'events',
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

  getRankCategories() {
    return RANK_CATEGORIES;
  }

  async getRankLeaderboard(
    categoryId: string,
    period: string | undefined,
    params: { page?: number; pageSize?: number },
  ) {
    const category = this.resolveRankCategory(categoryId);
    const since = this.resolvePeriodStart(period);
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 50);
    const skip = (page - 1) * pageSize;
    const { total, items } = await this.aggregateRankSource(category.source, {
      since,
      skip,
      take: pageSize,
    });
    const userMap = await this.fetchLeaderboardUsers(
      items.map((item) => item.userId),
    );
    const leaderboard = items.map((item, index) => ({
      rank: skip + index + 1,
      value: Number(item.value),
      user: userMap.get(item.userId) ?? {
        id: item.userId,
        displayName: null,
        email: null,
        minecraftName: null,
      },
    }));
    return {
      category,
      period: period ?? '30d',
      pagination: this.buildPagination(total, page, pageSize),
      items: leaderboard,
    };
  }

  async getRankContextForUser(
    categoryId: string,
    period: string | undefined,
    userId: string,
  ) {
    const category = this.resolveRankCategory(categoryId);
    const since = this.resolvePeriodStart(period);
    const value = await this.fetchRankValue(category.source, userId, since);
    if (value === 0) {
      return {
        category,
        period: period ?? '30d',
        me: null,
        around: [],
      };
    }
    const ahead = await this.fetchRankAheadCount(
      category.source,
      userId,
      since,
      value,
    );
    const rank = ahead + 1;
    const windowSkip = Math.max(rank - 3, 0);
    const { items } = await this.aggregateRankSource(category.source, {
      since,
      skip: windowSkip,
      take: 5,
    });
    const userMap = await this.fetchLeaderboardUsers(
      items.map((item) => item.userId),
    );
    return {
      category,
      period: period ?? '30d',
      me: { rank, value },
      around: items.map((item, index) => ({
        rank: windowSkip + index + 1,
        value: Number(item.value),
        user: userMap.get(item.userId) ?? {
          id: item.userId,
          displayName: null,
          email: null,
          minecraftName: null,
        },
      })),
    };
  }

  async getAdminOverview(operatorId: string | null) {
    try {
      const now = new Date();
      const today = startOfDay(now);
      const rangeDays = 7;
      const rangeStart = addDays(today, -(rangeDays - 1));
      const previousRangeStart = addDays(rangeStart, -rangeDays);
      const previousRangeEnd = rangeStart;
      const twentyFourHoursAgo = new Date(now.getTime() - DAY_MS);
      const fortyEightHoursAgo = new Date(now.getTime() - 2 * DAY_MS);

      const dayKeys: string[] = [];
      for (let i = 0; i < rangeDays; i += 1) {
        dayKeys.push(formatDayKey(addDays(rangeStart, i)));
      }

      const [
        operator,
        usersInRange,
        usersPrevRange,
        attachmentsInRange,
        attachmentsPrevRange,
        totalUsers,
        totalAttachments,
        pendingBindings,
        activeSessions,
        sessionsToday,
        sessionsYesterday,
        pendingVerifications,
        attachmentSizeAggregate,
        authmeTotal,
        authmeActive,
        lastAuthmeRecord,
        rolesTotal,
        roleAssignments,
        latestRoleAssignment,
      ] = await Promise.all([
        operatorId
          ? this.prisma.user.findUnique({
              where: { id: operatorId },
              select: {
                id: true,
                email: true,
                name: true,
                lastLoginAt: true,
                lastLoginIp: true,
                profile: { select: { displayName: true } },
              },
            })
          : Promise.resolve(null),
        this.prisma.user.findMany({
          where: { createdAt: { gte: rangeStart } },
          select: { createdAt: true },
        }),
        this.prisma.user.findMany({
          where: {
            createdAt: {
              gte: previousRangeStart,
              lt: previousRangeEnd,
            },
          },
          select: { createdAt: true },
        }),
        this.prisma.attachment.findMany({
          where: { deletedAt: null, createdAt: { gte: rangeStart } },
          select: { createdAt: true },
        }),
        this.prisma.attachment.findMany({
          where: {
            deletedAt: null,
            createdAt: { gte: previousRangeStart, lt: previousRangeEnd },
          },
          select: { createdAt: true },
        }),
        this.prisma.user.count(),
        this.prisma.attachment.count({ where: { deletedAt: null } }),
        this.prisma.user.count({
          where: {
            minecraftIds: { some: {} },
            authmeBindings: { none: {} },
          },
        }),
        this.prisma.session.count({ where: { expiresAt: { gt: now } } }),
        this.prisma.session.count({
          where: { createdAt: { gte: twentyFourHoursAgo } },
        }),
        this.prisma.session.count({
          where: {
            createdAt: { gte: fortyEightHoursAgo, lt: twentyFourHoursAgo },
          },
        }),
        this.prisma.verification.count({ where: { expiresAt: { gt: now } } }),
        this.prisma.attachment.aggregate({
          where: { deletedAt: null },
          _sum: { size: true },
        }),
        this.prisma.userAuthmeBinding.count(),
        this.prisma.userAuthmeBinding.count({
          where: { status: 'ACTIVE' },
        }),
        this.prisma.userAuthmeBinding.findFirst({
          orderBy: [{ lastSyncedAt: 'desc' }, { boundAt: 'desc' }],
          select: { lastSyncedAt: true, boundAt: true },
        }),
        this.prisma.role.count(),
        this.prisma.userRole.count(),
        this.prisma.userRole.findFirst({
          orderBy: { assignedAt: 'desc' },
          select: { assignedAt: true },
        }),
      ]);

      const regCounts = dayKeys.reduce<Record<string, number>>((acc, key) => {
        acc[key] = 0;
        return acc;
      }, {});
      for (const record of usersInRange) {
        const key = formatDayKey(record.createdAt);
        if (regCounts[key] !== undefined) {
          regCounts[key] += 1;
        }
      }

      const attachmentCounts = dayKeys.reduce<Record<string, number>>(
        (acc, key) => {
          acc[key] = 0;
          return acc;
        },
        {},
      );
      for (const record of attachmentsInRange) {
        const key = formatDayKey(record.createdAt);
        if (attachmentCounts[key] !== undefined) {
          attachmentCounts[key] += 1;
        }
      }

      const points = dayKeys.map((dateKey) => ({
        date: dateKey,
        registrations: regCounts[dateKey] ?? 0,
        attachments: attachmentCounts[dateKey] ?? 0,
      }));

      const registrationsThisWeek = points.reduce(
        (sum, point) => sum + point.registrations,
        0,
      );
      const attachmentsThisWeek = points.reduce(
        (sum, point) => sum + point.attachments,
        0,
      );
      const prevWeekRegistrations = usersPrevRange.length;
      const prevWeekAttachments = attachmentsPrevRange.length;
      const todayKey = dayKeys[dayKeys.length - 1];
      const todayRegistrations = regCounts[todayKey] ?? 0;
      const attachmentSizeBytes = attachmentSizeAggregate._sum.size ?? 0;

      const authmeLastSync =
        lastAuthmeRecord?.lastSyncedAt ?? lastAuthmeRecord?.boundAt ?? null;
      const authmeStatus = this.resolveIntegrationStatus(
        authmeLastSync,
        now,
        pendingBindings,
      );

      const luckpermsStatus = this.resolveLuckpermsStatus(
        latestRoleAssignment?.assignedAt ?? null,
        now,
        roleAssignments,
      );

      const greetingName =
        operator?.profile?.displayName ??
        operator?.name ??
        operator?.email ??
        '管理员';

      const greetingMessage = `今日新增 ${formatNumber(
        todayRegistrations,
      )} 位用户，仍有 ${formatNumber(pendingBindings)} 个玩家待绑定。`;

      const sessionTrend = buildTrend(sessionsToday, sessionsYesterday);

      return {
        greeting: {
          operator: greetingName,
          periodLabel: resolvePeriodLabel(now),
          message: greetingMessage,
          subtext: formatLoginSubtext(
            operator?.lastLoginAt,
            operator?.lastLoginIp,
          ),
          highlights: [
            {
              label: '本周新增',
              value: formatNumber(registrationsThisWeek),
              ...this.mapTrend(
                buildTrend(registrationsThisWeek, prevWeekRegistrations),
              ),
            },
            {
              label: '活跃会话',
              value: formatNumber(activeSessions),
              ...this.mapTrend(sessionTrend),
            },
            {
              label: '附件增量',
              value: formatNumber(attachmentsThisWeek),
              ...this.mapTrend(
                buildTrend(attachmentsThisWeek, prevWeekAttachments),
              ),
            },
          ],
        },
        summary: {
          totalUsers,
          totalAttachments,
          pendingBindings,
          recentActivity: `过去 24 小时创建 ${formatNumber(
            sessionsToday,
          )} 个新会话`,
        },
        activity: {
          rangeLabel: '近 7 天',
          registrationsThisWeek,
          attachmentsThisWeek,
          points,
        },
        system: {
          updatedAt: now.toISOString(),
          metrics: [
            {
              id: 'active-sessions',
              label: '活跃会话',
              value: formatNumber(activeSessions),
              hint: '未过期的 Session',
            },
            {
              id: 'pending-verifications',
              label: '待验证请求',
              value: formatNumber(pendingVerifications),
              hint: '邮件/短信验证码',
            },
            {
              id: 'storage-usage',
              label: '附件总容量',
              value: formatBytes(attachmentSizeBytes),
              hint: '不含已删除文件',
            },
          ],
        },
        integrations: [
          {
            id: 'authme',
            name: 'AuthMe',
            status: authmeStatus,
            lastSync: authmeLastSync?.toISOString() ?? '',
            metrics: [
              { label: '绑定总数', value: formatNumber(authmeTotal) },
              { label: '活跃绑定', value: formatNumber(authmeActive) },
            ],
          },
          {
            id: 'luckperms',
            name: 'LuckPerms',
            status: luckpermsStatus,
            lastSync: latestRoleAssignment?.assignedAt?.toISOString() ?? '',
            metrics: [
              { label: '角色数', value: formatNumber(rolesTotal) },
              { label: '分配总数', value: formatNumber(roleAssignments) },
            ],
          },
        ],
        quickActions: [
          {
            id: 'unlinked-users',
            title: '查看未绑定用户',
            description: `还有 ${formatNumber(
              pendingBindings,
            )} 个玩家等待关联 AuthMe 账户。`,
            to: '/admin/users',
            badge: `${formatNumber(pendingBindings)} 个待处理`,
          },
          {
            id: 'authme-players',
            title: '查看 AuthMe 玩家',
            description: `共有 ${formatNumber(
              authmeTotal,
            )} 条绑定记录，留意异常状态。`,
            to: '/admin/players',
            badge: `${formatNumber(authmeActive)} 条活跃`,
          },
          {
            id: 'user-list',
            title: '查看用户列表',
            description: `系统总计 ${formatNumber(
              totalUsers,
            )} 位用户，可筛选最近注册。`,
            to: '/admin/users',
            badge: `${formatNumber(totalUsers)} 人`,
          },
        ],
      };
    } catch (error) {
      this.logger.warn(`Admin overview fallback: ${String(error)}`);
      return {
        greeting: {
          operator: '管理员',
          periodLabel: resolvePeriodLabel(new Date()),
          message: '暂时无法获取实时数据，请稍后再试。',
          subtext: '系统概览请求失败',
          highlights: [],
        },
        summary: {
          totalUsers: 0,
          totalAttachments: 0,
          pendingBindings: 0,
          recentActivity: '暂无数据',
        },
        activity: {
          rangeLabel: '近 7 天',
          registrationsThisWeek: 0,
          attachmentsThisWeek: 0,
          points: [],
        },
        system: {
          updatedAt: new Date().toISOString(),
          metrics: [],
        },
        integrations: [],
        quickActions: [],
      };
    }
  }

  private resolveIntegrationStatus(
    lastSync: Date | null,
    now: Date,
    backlogCount: number,
  ): AdminHealthStatus {
    if (!lastSync) {
      return 'critical';
    }
    const hoursDiff = (now.getTime() - lastSync.getTime()) / (60 * 60 * 1000);
    if (hoursDiff <= 24 && backlogCount < 20) {
      return 'normal';
    }
    if (hoursDiff <= 72) {
      return backlogCount > 50 ? 'critical' : 'warning';
    }
    return 'critical';
  }

  private resolveLuckpermsStatus(
    lastAssignment: Date | null,
    now: Date,
    totalAssignments: number,
  ): AdminHealthStatus {
    if (!lastAssignment) {
      return totalAssignments > 0 ? 'warning' : 'critical';
    }
    const hoursDiff =
      (now.getTime() - lastAssignment.getTime()) / (60 * 60 * 1000);
    if (hoursDiff <= 24) {
      return 'normal';
    }
    if (hoursDiff <= 72) {
      return 'warning';
    }
    return 'critical';
  }

  private mapTrend(info: TrendInfo) {
    return {
      trend: info.trend,
      trendLabel: info.label,
    };
  }

  private async getUserAccessContext(
    userId: string,
  ): Promise<PortalUserAccessContext | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        roles: {
          select: {
            role: {
              select: {
                key: true,
              },
            },
          },
        },
      },
    });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      roleKeys: user.roles.map(({ role }) => role.key),
    };
  }

  private computeAccessibleCards(
    config: Record<string, PortalCardVisibilityConfig>,
    user: PortalUserAccessContext | null,
  ) {
    const result = new Set<string>();

    for (const card of PORTAL_CARD_REGISTRY) {
      const visibility = config[card.id];
      if (!visibility || !visibility.enabled) {
        continue;
      }

      if (visibility.allowGuests) {
        result.add(card.id);
        continue;
      }

      if (!user) {
        continue;
      }

      const allowedUsers = visibility.allowedUsers ?? [];
      if (allowedUsers.some((entry) => this.matchesUser(entry, user))) {
        result.add(card.id);
        continue;
      }

      const allowedRoles = visibility.allowedRoles ?? [];
      if (allowedRoles.length === 0 && allowedUsers.length === 0) {
        result.add(card.id);
        continue;
      }

      if (allowedRoles.some((role) => user.roleKeys.includes(role))) {
        result.add(card.id);
      }
    }

    return Array.from(result);
  }

  private matchesUser(entry: string, user: PortalUserAccessContext) {
    const normalized = entry.trim();
    if (!normalized) {
      return false;
    }
    if (normalized === user.id) {
      return true;
    }
    if (normalized.toLowerCase() === user.email.toLowerCase()) {
      return true;
    }
    return false;
  }
}
