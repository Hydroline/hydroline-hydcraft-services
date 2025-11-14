import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PortalConfigService } from '../portal-config/portal-config.service';
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
  ) {}

  async getHomePortal(userId?: string) {
    let config: {
      hero: {
        subtitle: string;
        background: Array<{ imageUrl: string; description: string | null }>;
      };
      navigation: NavigationLink[];
      cardsConfig: Record<string, PortalCardVisibilityConfig>;
    };

    try {
      const resolved = await this.portalConfigService.getResolvedHomeContent();
      config = {
        hero: resolved.hero,
        navigation: resolved.navigation as NavigationLink[],
        cardsConfig: resolved.cardsConfig,
      };
    } catch (error) {
      this.logger.warn(`Failed to load portal home config: ${String(error)}`);
      config = {
        hero: {
          subtitle: DEFAULT_PORTAL_HOME_CONFIG.hero.subtitle,
          background: [],
        },
        navigation: [],
        cardsConfig: DEFAULT_PORTAL_HOME_CONFIG.cards,
      };
    }

    let userContext: PortalUserAccessContext | null = null;
    if (userId) {
      try {
        userContext = await this.getUserAccessContext(userId);
      } catch (error) {
        this.logger.warn(
          `Failed to resolve user context ${userId}: ${String(error)}`,
        );
      }
    }

    const cards = this.computeAccessibleCards(config.cardsConfig, userContext);

    return {
      hero: {
        subtitle: config.hero.subtitle,
        background: config.hero.background,
      },
      navigation: config.navigation,
      cards,
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
