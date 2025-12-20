import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthmeUser } from '../authme/authme.interfaces';

type AuthmeAccountCacheRecord = Prisma.AuthmeAccountCacheGetPayload<{}>;

type AuthmeCacheListField = 'username' | 'realname' | 'lastlogin' | 'regdate';

@Injectable()
export class AuthmeCacheService {
  private static readonly DEFAULT_PAGE_SIZE = 20;
  private static readonly MAX_PAGE_SIZE = 100;

  constructor(private readonly prisma: PrismaService) {}

  async getAccountByUsername(username: string) {
    const key = this.normalizeKey(username);
    if (!key) {
      return null;
    }
    return this.prisma.authmeAccountCache.findUnique({
      where: { usernameLower: key },
    });
  }

  async getAccountsByUsernames(usernames: string[]) {
    const normalized = usernames
      .map((value) => this.normalizeKey(value))
      .filter((value): value is string => Boolean(value));
    const keys = Array.from(new Set(normalized));
    if (keys.length === 0) {
      return [];
    }
    return this.prisma.authmeAccountCache.findMany({
      where: { usernameLower: { in: keys } },
    });
  }

  async upsertAccounts(accounts: AuthmeUser[]) {
    if (!accounts.length) {
      return;
    }
    const operations = accounts
      .map((account) => {
        const normalized = this.normalizeKey(account.username);
        if (!normalized) {
          return null;
        }
        const metadata = this.buildMetadata(account);
        const payload: Prisma.AuthmeAccountCacheCreateInput = {
          username: account.username,
          usernameLower: normalized,
          realname: account.realname,
          ip: account.ip ?? null,
          regip: account.regip ?? null,
          lastlogin: account.lastlogin ?? null,
          regdate: account.regdate ?? null,
          email: account.email ?? null,
          world: account.world ?? null,
          isLogged: account.isLogged ?? 0,
          hasSession: account.hasSession ?? 0,
          syncedAt: new Date(),
        };
        const updatePayload: Prisma.AuthmeAccountCacheUpdateInput = {
          username: account.username,
          realname: account.realname,
          ip: account.ip ?? null,
          regip: account.regip ?? null,
          lastlogin: account.lastlogin ?? null,
          regdate: account.regdate ?? null,
          email: account.email ?? null,
          world: account.world ?? null,
          isLogged: account.isLogged ?? 0,
          hasSession: account.hasSession ?? 0,
          syncedAt: new Date(),
        };
        if (metadata !== undefined) {
          payload.metadata = metadata;
          updatePayload.metadata = metadata;
        }
        return this.prisma.authmeAccountCache.upsert({
          where: { usernameLower: normalized },
          create: payload,
          update: updatePayload,
        });
      })
      .filter(
        (
          operation,
        ): operation is Prisma.PrismaPromise<AuthmeAccountCacheRecord> =>
          Boolean(operation),
      );
    if (operations.length === 0) {
      return;
    }
    await this.prisma.$transaction(operations);
  }

  async getLastSyncedAt(): Promise<Date | null> {
    const record = await this.prisma.authmeAccountCache.findFirst({
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    });
    return record?.syncedAt ?? null;
  }

  async listPlayers(params: {
    keyword?: string | null;
    page?: number;
    pageSize?: number;
    sortField?: AuthmeCacheListField;
    sortOrder?: 'asc' | 'desc';
  }) {
    const pageSize = Math.min(
      Math.max(params.pageSize ?? AuthmeCacheService.DEFAULT_PAGE_SIZE, 1),
      AuthmeCacheService.MAX_PAGE_SIZE,
    );
    const page = Math.max(params.page ?? 1, 1);
    const keyword = params.keyword?.trim().toLowerCase() ?? null;
    const orderBy = this.buildOrder(
      params.sortField ?? 'lastlogin',
      params.sortOrder ?? 'desc',
    );
    const where: Prisma.AuthmeAccountCacheWhereInput | undefined = keyword
      ? {
          OR: [
            { usernameLower: { contains: keyword } },
            { realname: { contains: keyword } },
            { email: { contains: keyword } },
          ],
        }
      : undefined;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.authmeAccountCache.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.authmeAccountCache.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  private buildOrder(field: AuthmeCacheListField, order: 'asc' | 'desc') {
    const column = this.mapSortField(field);
    return {
      [column]: order,
    } satisfies Prisma.AuthmeAccountCacheOrderByWithRelationInput;
  }

  private mapSortField(field: AuthmeCacheListField) {
    switch (field) {
      case 'realname':
        return 'realname';
      case 'lastlogin':
        return 'lastlogin';
      case 'regdate':
        return 'regdate';
      case 'username':
      default:
        return 'usernameLower';
    }
  }

  private normalizeKey(value: string | undefined | null) {
    if (!value) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private buildMetadata(account: AuthmeUser): Prisma.JsonObject | undefined {
    const metadata: Prisma.JsonObject = {
      x: account.x,
      y: account.y,
      z: account.z,
      yaw: account.yaw ?? null,
      pitch: account.pitch ?? null,
      totp: account.totp ?? null,
    } as Prisma.JsonObject;
    const hasContent = Object.values(metadata).some(
      (value) => value !== null && value !== undefined,
    );
    return hasContent ? metadata : undefined;
  }
}
