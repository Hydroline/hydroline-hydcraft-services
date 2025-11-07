import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthmeService } from '../authme/authme.service';
import { AuthmeBindingService } from '../authme/authme-binding.service';
import { CreateAuthmeHistoryEntryDto } from '../authme/dto/create-authme-history-entry.dto';
import { AuthmeBindingAction } from '@prisma/client';

interface ListPlayersParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
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
  ) {}

  async listPlayers(params: ListPlayersParams) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    try {
      const result = await this.authmeService.listPlayers({
        keyword: params.keyword,
        page,
        pageSize,
      });
      const usernameKeys = result.items.map((player) =>
        player.username.toLowerCase(),
      );
      const [bindings, histories] = await Promise.all([
        usernameKeys.length
          ? this.prisma.userAuthmeBinding.findMany({
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
          : [],
        usernameKeys.length
          ? this.prisma.authmeBindingHistory.findMany({
              where: { authmeUsernameLower: { in: usernameKeys } },
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
          : [],
      ]);

      const bindingMap = new Map<
        string,
        (typeof bindings)[number]
      >(
        bindings.map(
          (binding) =>
            [binding.authmeUsernameLower, binding] as [
              string,
              (typeof bindings)[number],
            ],
        ),
      );
      const historyMap = new Map<string, typeof histories>();
      for (const entry of histories) {
        const bucket = historyMap.get(entry.authmeUsernameLower) ?? [];
        bucket.push(entry);
        historyMap.set(entry.authmeUsernameLower, bucket);
      }

      const items = result.items.map((player) => {
        const key = player.username.toLowerCase();
        return {
          authme: {
            username: player.username,
            realname: player.realname,
            uuid: player.id,
            lastlogin: player.lastlogin,
            regdate: player.regdate,
            ip: player.ip ?? null,
            regip: player.regip ?? null,
          },
          binding: bindingMap.get(key) ?? null,
          history: (historyMap.get(key) ?? []).slice(0, 10),
        };
      });

      return {
        items,
        pagination: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          pageCount: Math.max(1, Math.ceil(result.total / result.pageSize)),
        },
        sourceStatus: 'ok' as const,
      };
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
      const histories = await this.prisma.authmeBindingHistory.findMany({
        where: usernameKeys.length
          ? { authmeUsernameLower: { in: usernameKeys } }
          : undefined,
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

  async getHistoryByUsername(username: string, params: HistoryQuery = {}) {
    const usernameLower = username.toLowerCase();
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    const where = { authmeUsernameLower: usernameLower };
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
}
