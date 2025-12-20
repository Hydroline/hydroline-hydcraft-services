import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthmeService } from '../../authme/authme.service';
import { AuthmeBindingService } from '../../authme/authme-binding.service';
import { CreateAuthmeHistoryEntryDto } from '../../authme/dto/create-authme-history-entry.dto';
import { AuthmeBindingAction, Prisma } from '@prisma/client';
import { IpLocationService } from '../../lib/ip2region/ip-location.service';
import type { AuthmeUser } from '../../authme/authme.interfaces';
import { AuthmeLookupService } from '../../authme/authme-lookup.service';
import { AuthmeCacheService } from '../../cache/authme-cache.service';

type SortOrder = 'asc' | 'desc';

type RegionSortField = 'ip_region' | 'regip_region';

type AuthmeSortField =
  | 'lastlogin'
  | 'regdate'
  | 'username'
  | 'ip'
  | 'regip'
  | 'id';

type LocationSummary = {
  raw: string | null;
  display: string | null;
};

type AuthmeUserWithLocation = AuthmeUser & {
  __ipLocation: LocationSummary;
  __regipLocation: LocationSummary;
};

type AuthmeAccountCacheRecord = Prisma.AuthmeAccountCacheGetPayload<{}>;

interface ListPlayersParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: SortOrder;
}

interface HistoryQuery {
  page?: number;
  pageSize?: number;
}

@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private readonly authmeService: AuthmeService,
    private readonly prisma: PrismaService,
    private readonly authmeBindingService: AuthmeBindingService,
    private readonly ipLocationService: IpLocationService,
    private readonly authmeLookupService: AuthmeLookupService,
    private readonly authmeCache: AuthmeCacheService,
  ) {}

  async getPlayerDetail(username: string) {
    const normalized = username.trim();
    if (!normalized) {
      return {
        player: null,
        sourceStatus: 'ok' as const,
      };
    }

    try {
      const authme = await this.authmeLookupService.getAccount(normalized, {
        allowFallback: true,
      });
      if (!authme) {
        return {
          player: null,
          sourceStatus: 'ok' as const,
        };
      }
      const enriched = await this.enrichWithLocations([authme]);
      const payload = await this.buildPlayersPayload(enriched, {
        total: 1,
        page: 1,
        pageSize: 1,
      });
      return {
        player: payload.items[0] ?? null,
        sourceStatus: payload.sourceStatus,
      };
    } catch (error) {
      this.logger.warn(
        `AuthMe player detail degraded for "${normalized}": ${String(error)}`,
      );
      const usernameLower = normalized.toLowerCase();
      const binding = await this.prisma.userAuthmeBinding.findUnique({
        where: { authmeUsernameLower: usernameLower },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      });
      if (!binding) {
        return {
          player: null,
          sourceStatus: 'degraded' as const,
        };
      }
      const histories = await this.prisma.authmeBindingHistory.findMany({
        where: {
          OR: [
            { authmeUsernameLower: usernameLower },
            { bindingId: binding.id },
          ],
        },
        orderBy: { createdAt: 'desc' },
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
              authmeRealname: true,
              authmeUuid: true,
            },
          },
        },
      });
      return {
        player: {
          authme: null,
          binding,
          history: histories.slice(0, 10),
        },
        sourceStatus: 'degraded' as const,
      };
    }
  }

  async listPlayers(params: ListPlayersParams) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    try {
      const sortField = (params.sortField ?? 'lastlogin').toLowerCase();
      const sortOrder: SortOrder =
        params.sortOrder === 'asc' || params.sortOrder === 'desc'
          ? params.sortOrder
          : 'desc';

      if (this.isRegionSortField(sortField)) {
        return await this.listPlayersSortedByRegion({
          keyword: params.keyword,
          page,
          pageSize,
          sortField,
          sortOrder,
        });
      }

      const authmeSortField = this.resolveAuthmeSortField(sortField);
      return await this.listPlayersFromCache({
        keyword: params.keyword,
        page,
        pageSize,
        sortField: authmeSortField,
        sortOrder,
      });
    } catch (error) {
      this.logger.warn(`AuthMe players degraded: ${String(error)}`);
      const keyword = params.keyword?.toLowerCase();
      const where = keyword
        ? {
            authmeUsernameLower: {
              contains: keyword,
            },
          }
        : undefined;
      const [bindings, total] = await Promise.all([
        this.prisma.userAuthmeBinding.findMany({
          where,
          orderBy: { boundAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                profile: { select: { displayName: true } },
              },
            },
          },
        }),
        this.prisma.userAuthmeBinding.count({ where }),
      ]);
      const usernameKeys = bindings.map(
        (binding) => binding.authmeUsernameLower,
      );
      const bindingIds = bindings.map((binding) => binding.id);
      const degradedOr: Prisma.AuthmeBindingHistoryWhereInput[] = [];
      if (usernameKeys.length) {
        degradedOr.push({ authmeUsernameLower: { in: usernameKeys } });
        if (bindingIds.length) {
          degradedOr.push({ bindingId: { in: bindingIds } });
        }
      }
      const degradedHistoryWhere =
        degradedOr.length > 0 ? { OR: degradedOr } : undefined;
      const histories = await this.prisma.authmeBindingHistory.findMany({
        where: degradedHistoryWhere,
        orderBy: { createdAt: 'desc' },
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
              authmeRealname: true,
              authmeUuid: true,
            },
          },
        },
      });
      const historyMap = new Map<string, typeof histories>();
      for (const entry of histories) {
        const bucket = historyMap.get(entry.authmeUsernameLower) ?? [];
        bucket.push(entry);
        historyMap.set(entry.authmeUsernameLower, bucket);
      }
      const items = bindings.map((binding) => ({
        authme: null,
        binding,
        history: (historyMap.get(binding.authmeUsernameLower) ?? []).slice(
          0,
          10,
        ),
      }));
      return {
        items,
        pagination: {
          total,
          page,
          pageSize,
          pageCount: Math.max(1, Math.ceil(total / pageSize)),
        },
        sourceStatus: 'degraded' as const,
        error: error instanceof Error ? error.message : 'AuthMe 数据源不可用',
      };
    }
  }

  private isRegionSortField(field: string): field is RegionSortField {
    return field === 'ip_region' || field === 'regip_region';
  }

  private resolveAuthmeSortField(field: string): AuthmeSortField {
    switch (field) {
      case 'username':
        return 'username';
      case 'regdate':
        return 'regdate';
      case 'lastlogin':
        return 'lastlogin';
      case 'ip':
        return 'ip';
      case 'regip':
        return 'regip';
      case 'id':
        return 'id';
      default:
        return 'lastlogin';
    }
  }

  private mapCacheSortField(field: AuthmeSortField) {
    switch (field) {
      case 'username':
        return 'username';
      case 'regdate':
        return 'regdate';
      case 'lastlogin':
        return 'lastlogin';
      default:
        return 'lastlogin';
    }
  }

  private async listPlayersFromCache(options: {
    keyword?: string;
    page: number;
    pageSize: number;
    sortField: AuthmeSortField;
    sortOrder: SortOrder;
  }) {
    const response = await this.authmeCache.listPlayers({
      keyword: options.keyword,
      page: options.page,
      pageSize: options.pageSize,
      sortField: this.mapCacheSortField(options.sortField),
      sortOrder: options.sortOrder,
    });
    const cachedUsers = response.items.map((entry) =>
      this.mapCacheEntryToAuthmeUser(entry),
    );
    const enriched = await this.enrichWithLocations(cachedUsers);
    return this.buildPlayersPayload(enriched, {
      total: response.total,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  private async listPlayersSortedByRegion(options: {
    keyword?: string;
    page: number;
    pageSize: number;
    sortField: RegionSortField;
    sortOrder: SortOrder;
  }) {
    const { items, total } = await this.collectAllAuthmePlayers(
      options.keyword,
    );
    const enrichedAll = await this.enrichWithLocations(items);
    const orderFactor = options.sortOrder === 'asc' ? 1 : -1;
    const sorted = [...enrichedAll].sort((a, b) => {
      const aKey =
        options.sortField === 'ip_region'
          ? (a.__ipLocation.display ?? '')
          : (a.__regipLocation.display ?? '');
      const bKey =
        options.sortField === 'ip_region'
          ? (b.__ipLocation.display ?? '')
          : (b.__regipLocation.display ?? '');
      const cmp = aKey.localeCompare(bKey);
      if (cmp !== 0) {
        return cmp * orderFactor;
      }
      const lastLoginDiff = (a.lastlogin ?? 0) - (b.lastlogin ?? 0);
      if (lastLoginDiff !== 0) {
        return lastLoginDiff * orderFactor;
      }
      return (
        a.username.toLowerCase().localeCompare(b.username.toLowerCase()) *
        orderFactor
      );
    });

    const totalCount = Math.max(total, sorted.length);
    const start = (options.page - 1) * options.pageSize;
    const paged = sorted.slice(start, start + options.pageSize);

    return this.buildPlayersPayload(paged, {
      total: totalCount,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  private async collectAllAuthmePlayers(keyword?: string) {
    const aggregated: AuthmeUser[] = [];
    const pageSize = 100;
    let page = 1;
    let total = 0;
    while (true) {
      const result = await this.authmeCache.listPlayers({
        keyword,
        page,
        pageSize,
        sortField: 'username',
        sortOrder: 'asc',
      });
      aggregated.push(
        ...result.items.map((entry) => ({
          id: 0,
          username: entry.username,
          realname: entry.realname ?? entry.username,
          password: '',
          ip: entry.ip ?? null,
          lastlogin: Number(entry.lastlogin ?? 0),
          x: 0,
          y: 0,
          z: 0,
          world: entry.world ?? 'world',
          regdate: Number(entry.regdate ?? 0),
          regip: entry.regip ?? null,
          yaw: null,
          pitch: null,
          email: entry.email ?? null,
          isLogged: entry.isLogged,
          hasSession: entry.hasSession,
          totp: null,
        })),
      );
      total = result.total;
      if (aggregated.length >= total || result.items.length < pageSize) {
        break;
      }
      page += 1;
      if (page > 1000) {
        break;
      }
    }
    return { items: aggregated, total };
  }

  private mapCacheEntryToAuthmeUser(
    entry: AuthmeAccountCacheRecord,
  ): AuthmeUser {
    return {
      id: 0,
      username: entry.username,
      realname: entry.realname ?? entry.username,
      password: '',
      ip: entry.ip ?? null,
      lastlogin: Number(entry.lastlogin ?? 0),
      x: 0,
      y: 0,
      z: 0,
      world: entry.world ?? 'world',
      regdate: Number(entry.regdate ?? 0),
      regip: entry.regip ?? null,
      yaw: null,
      pitch: null,
      email: entry.email ?? null,
      isLogged: entry.isLogged,
      hasSession: entry.hasSession,
      totp: null,
    };
  }

  private async enrichWithLocations(
    rows: AuthmeUser[],
    cache = new Map<string, LocationSummary>(),
  ): Promise<AuthmeUserWithLocation[]> {
    return Promise.all(
      rows.map(async (row) => {
        const [ipLocation, regipLocation] = await Promise.all([
          this.lookupLocationCached(row.ip ?? null, cache),
          this.lookupLocationCached(row.regip ?? null, cache),
        ]);
        return {
          ...row,
          __ipLocation: ipLocation,
          __regipLocation: regipLocation,
        };
      }),
    );
  }

  private async lookupLocationCached(
    ip: string | null | undefined,
    cache: Map<string, LocationSummary>,
  ): Promise<LocationSummary> {
    if (!ip) {
      return { raw: null, display: null };
    }
    const normalized = ip.trim();
    if (!normalized) {
      return { raw: null, display: null };
    }
    const cached = cache.get(normalized);
    if (cached) {
      return cached;
    }
    const result = await this.ipLocationService.lookup(normalized);
    const summary: LocationSummary = {
      raw: result?.raw ?? null,
      display: result?.display ?? null,
    };
    cache.set(normalized, summary);
    return summary;
  }

  private async buildPlayersPayload(
    rows: AuthmeUserWithLocation[],
    pagination: { total: number; page: number; pageSize: number },
  ) {
    const usernameKeys = rows.map((player) => player.username.toLowerCase());
    const bindings = usernameKeys.length
      ? await this.prisma.userAuthmeBinding.findMany({
          where: { authmeUsernameLower: { in: usernameKeys } },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                profile: { select: { displayName: true } },
              },
            },
          },
        })
      : [];
    const bindingIds = bindings.map((binding) => binding.id);
    const historyOr: Prisma.AuthmeBindingHistoryWhereInput[] = [];
    if (usernameKeys.length) {
      historyOr.push({ authmeUsernameLower: { in: usernameKeys } });
      if (bindingIds.length) {
        historyOr.push({ bindingId: { in: bindingIds } });
      }
    }
    const histories =
      historyOr.length > 0
        ? await this.prisma.authmeBindingHistory.findMany({
            where: { OR: historyOr },
            orderBy: { createdAt: 'desc' },
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
                  authmeRealname: true,
                  authmeUuid: true,
                },
              },
            },
          })
        : [];

    const bindingMap = new Map<string, (typeof bindings)[number]>(
      bindings.map(
        (
          binding: {
            authmeUsernameLower: string;
          } & (typeof bindings)[number],
        ) => [binding.authmeUsernameLower, binding] as const,
      ),
    );
    const historyMap = new Map<string, typeof histories>();
    for (const entry of histories) {
      const bucket = historyMap.get(entry.authmeUsernameLower) ?? [];
      bucket.push(entry);
      historyMap.set(entry.authmeUsernameLower, bucket);
    }

    const items = rows.map((player) => {
      const key = player.username.toLowerCase();
      return {
        authme: {
          username: player.username,
          realname: player.realname,
          uuid: player.id,
          lastlogin: player.lastlogin ?? null,
          regdate: player.regdate ?? null,
          ip: player.ip ?? null,
          regip: player.regip ?? null,
          ipLocation: player.__ipLocation.display ?? null,
          regipLocation: player.__regipLocation.display ?? null,
          ip_location: player.__ipLocation.raw ?? null,
          ip_location_display: player.__ipLocation.display ?? null,
          regip_location: player.__regipLocation.raw ?? null,
          regip_location_display: player.__regipLocation.display ?? null,
        },
        binding: bindingMap.get(key) ?? null,
        history: (historyMap.get(key) ?? []).slice(0, 10),
      };
    });

    return {
      items,
      pagination: {
        total: pagination.total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        pageCount: Math.max(
          1,
          Math.ceil(pagination.total / Math.max(pagination.pageSize, 1)),
        ),
      },
      sourceStatus: 'ok' as const,
    };
  }

  async getHistoryByUsername(username: string, params: HistoryQuery = {}) {
    const usernameLower = username.toLowerCase();
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    const relatedBindings = await this.prisma.userAuthmeBinding.findMany({
      where: { authmeUsernameLower: usernameLower },
      select: { id: true },
    });
    const bindingIds = relatedBindings.map((binding) => binding.id);
    const historyOr: Prisma.AuthmeBindingHistoryWhereInput[] = [
      { authmeUsernameLower: usernameLower },
    ];
    if (bindingIds.length) {
      historyOr.push({ bindingId: { in: bindingIds } });
    }
    const where: Prisma.AuthmeBindingHistoryWhereInput = { OR: historyOr };
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
              authmeRealname: true,
              authmeUuid: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.authmeBindingHistory.count({ where }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async createHistoryEntry(
    username: string,
    dto: CreateAuthmeHistoryEntryDto,
    actorId?: string,
  ) {
    const usernameLower = username.toLowerCase();
    const binding =
      dto.bindingId && dto.bindingId.length > 0
        ? await this.prisma.userAuthmeBinding.findUnique({
            where: { id: dto.bindingId },
          })
        : await this.prisma.userAuthmeBinding.findUnique({
            where: { authmeUsernameLower: usernameLower },
          });

    const action = dto.action ?? AuthmeBindingAction.MANUAL_ENTRY;

    return this.authmeBindingService.recordHistoryEntry({
      bindingId: dto.bindingId ?? binding?.id ?? null,
      userId: dto.userId ?? binding?.userId ?? null,
      operatorId: actorId ?? null,
      authmeUsername: binding?.authmeUsername ?? username,
      authmeRealname: binding?.authmeRealname ?? null,
      authmeUuid: binding?.authmeUuid ?? null,
      action,
      reason: dto.reason ?? 'manual-entry',
      payload: {
        ...(dto.payload ?? {}),
        manual: true,
      },
    });
  }

  async bindPlayerToUser(username: string, userId: string, actorId?: string) {
    const authme = await this.authmeService.getAccount(username);
    if (!authme) {
      // 即使 AuthMe 不可用，也允许通过历史/缓存信息绑定，但此处需要 authme 基础字段；若获取失败则用最小信息绑定
      return this.authmeBindingService.bindUser({
        userId,
        authmeUser: {
          username,
          realname: username,
          password: '',
          ip: null,
          regip: null,
          lastlogin: null,
          regdate: 0,
          id: 0,
          // 补齐位置/世界字段占位（AuthmeUser接口要求）
          x: 0,
          y: 0,
          z: 0,
          world: 'unknown',
          isLogged: 0,
          hasSession: 0,
        },
        operatorUserId: actorId ?? userId,
        sourceIp: null,
      });
    }
    return this.authmeBindingService.bindUser({
      userId,
      authmeUser: authme,
      operatorUserId: actorId ?? userId,
      sourceIp: null,
    });
  }
}
