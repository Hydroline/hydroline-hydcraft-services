import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PlayerDataCacheRecord = Prisma.PlayerDataCacheGetPayload<{}>;

type PlayerDataIdentity = {
  uuid: string | null;
  name: string | null;
};

type IdentityKey = {
  identityType: 'uuid' | 'name';
  identityKey: string;
  playerUuid: string | null;
  playerName: string | null;
  playerNameLower: string | null;
};

@Injectable()
export class PlayerDataCacheService {
  constructor(private readonly prisma: PrismaService) {}

  async getCacheEntry(serverId: string, identity: PlayerDataIdentity) {
    const key = this.buildIdentityKey(identity);
    if (!key) {
      return null;
    }
    return this.prisma.playerDataCache.findUnique({
      where: {
        serverId_identityType_identityKey: {
          serverId,
          identityType: key.identityType,
          identityKey: key.identityKey,
        },
      },
    });
  }

  async upsertStats(params: {
    serverId: string;
    identity: PlayerDataIdentity;
    stats: Prisma.JsonValue | null;
    metrics: Prisma.JsonValue | null;
    fetchedAt: Date;
  }) {
    const key = this.buildIdentityKey(params.identity);
    if (!key) {
      return;
    }
    await this.prisma.playerDataCache.upsert({
      where: {
        serverId_identityType_identityKey: {
          serverId: params.serverId,
          identityType: key.identityType,
          identityKey: key.identityKey,
        },
      },
      create: {
        serverId: params.serverId,
        identityType: key.identityType,
        identityKey: key.identityKey,
        playerUuid: key.playerUuid,
        playerName: key.playerName,
        playerNameLower: key.playerNameLower,
        stats: params.stats ?? undefined,
        metrics: params.metrics ?? undefined,
        statsFetchedAt: params.fetchedAt,
      },
      update: {
        playerUuid: key.playerUuid,
        playerName: key.playerName,
        playerNameLower: key.playerNameLower,
        stats: params.stats ?? undefined,
        metrics: params.metrics ?? undefined,
        statsFetchedAt: params.fetchedAt,
      },
    });
  }

  async upsertAdvancements(params: {
    serverId: string;
    identity: PlayerDataIdentity;
    achievementsTotal: number;
    fetchedAt: Date;
  }) {
    const key = this.buildIdentityKey(params.identity);
    if (!key) {
      return;
    }
    await this.prisma.playerDataCache.upsert({
      where: {
        serverId_identityType_identityKey: {
          serverId: params.serverId,
          identityType: key.identityType,
          identityKey: key.identityKey,
        },
      },
      create: {
        serverId: params.serverId,
        identityType: key.identityType,
        identityKey: key.identityKey,
        playerUuid: key.playerUuid,
        playerName: key.playerName,
        playerNameLower: key.playerNameLower,
        achievementsTotal: params.achievementsTotal,
        advancementsFetchedAt: params.fetchedAt,
      },
      update: {
        playerUuid: key.playerUuid,
        playerName: key.playerName,
        playerNameLower: key.playerNameLower,
        achievementsTotal: params.achievementsTotal,
        advancementsFetchedAt: params.fetchedAt,
      },
    });
  }

  private buildIdentityKey(identity: PlayerDataIdentity): IdentityKey | null {
    const uuid = identity.uuid?.trim();
    const name = identity.name?.trim();
    if (uuid) {
      return {
        identityType: 'uuid',
        identityKey: uuid.toLowerCase(),
        playerUuid: uuid,
        playerName: name ?? null,
        playerNameLower: name ? name.toLowerCase() : null,
      };
    }
    if (name) {
      return {
        identityType: 'name',
        identityKey: name.toLowerCase(),
        playerUuid: null,
        playerName: name,
        playerNameLower: name.toLowerCase(),
      };
    }
    return null;
  }
}

export type { PlayerDataCacheRecord, PlayerDataIdentity };
