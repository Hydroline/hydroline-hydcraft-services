import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LuckpermsPlayer } from '../luckperms/luckperms.interfaces';

type LuckpermsPlayerCacheRecord = Prisma.LuckpermsPlayerCacheGetPayload<{}>;

@Injectable()
export class LuckpermsCacheService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlayerByUuid(
    uuid?: string | null,
  ): Promise<LuckpermsPlayerCacheRecord | null> {
    if (!uuid) {
      return null;
    }
    return this.prisma.luckpermsPlayerCache.findUnique({
      where: { uuid },
    });
  }

  async getPlayerByUsername(
    username?: string | null,
  ): Promise<LuckpermsPlayerCacheRecord | null> {
    const key = this.normalizeUsername(username);
    if (!key) {
      return null;
    }
    return this.prisma.luckpermsPlayerCache.findUnique({
      where: { usernameLower: key },
    });
  }

  async upsertPlayers(players: LuckpermsPlayer[]) {
    if (!players.length) {
      return;
    }
    const operations = players.map((player) => {
      const normalized = this.normalizeUsername(player.username);
      if (!normalized) {
        return null;
      }
      const groupsPayload = JSON.parse(
        JSON.stringify(player.groups ?? []),
      ) as Prisma.InputJsonValue;
      const payload = {
        uuid: player.uuid,
        username: player.username,
        usernameLower: normalized,
        primaryGroup: player.primaryGroup,
        groups: groupsPayload,
        syncedAt: new Date(),
      };
      return this.prisma.luckpermsPlayerCache.upsert({
        where: { uuid: player.uuid },
        create: payload,
        update: payload,
      });
    });
    const tasks = operations.filter(
      (
        operation,
      ): operation is Prisma.PrismaPromise<LuckpermsPlayerCacheRecord> =>
        Boolean(operation),
    );
    if (tasks.length === 0) {
      return;
    }
    await this.prisma.$transaction(tasks);
  }

  async getLastSyncedAt(): Promise<Date | null> {
    const record = await this.prisma.luckpermsPlayerCache.findFirst({
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    });
    return record?.syncedAt ?? null;
  }

  private normalizeUsername(value?: string | null) {
    if (!value) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }
}
