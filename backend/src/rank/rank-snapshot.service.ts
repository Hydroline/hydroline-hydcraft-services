import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type RankSnapshotPayload = {
  serverId: string;
  playerUuid: string;
  playerName?: string | null;
  bindingId?: string | null;
  userId?: string | null;
  displayName?: string | null;
  lastLoginAt?: Date | null;
  registeredAt?: Date | null;
  walkDistanceKm?: number | null;
  flyDistanceKm?: number | null;
  swimDistanceKm?: number | null;
  achievements?: number | null;
  deaths?: number | null;
  playerKilledByCount?: number | null;
  jumpCount?: number | null;
  playTimeHours?: number | null;
  useWandCount?: number | null;
  logoutCount?: number | null;
  mtrBalance?: number | null;
  metrics?: Record<string, unknown> | null;
  stats?: Record<string, unknown> | null;
};

@Injectable()
export class RankSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(payload: RankSnapshotPayload) {
    if (!payload.playerUuid) {
      return;
    }
    const data: Prisma.RankPlayerSnapshotUpsertArgs['create'] = {
      serverId: payload.serverId,
      playerUuid: payload.playerUuid,
      playerName: payload.playerName,
      bindingId: payload.bindingId,
      userId: payload.userId,
      displayName: payload.displayName,
      lastLoginAt: payload.lastLoginAt,
      registeredAt: payload.registeredAt,
      walkDistanceKm: payload.walkDistanceKm,
      flyDistanceKm: payload.flyDistanceKm,
      swimDistanceKm: payload.swimDistanceKm,
      achievements: payload.achievements,
      deaths: payload.deaths,
      playerKilledByCount: payload.playerKilledByCount,
      jumpCount: payload.jumpCount,
      playTimeHours: payload.playTimeHours,
      useWandCount: payload.useWandCount,
      logoutCount: payload.logoutCount,
      mtrBalance: payload.mtrBalance,
      metrics: mapJsonValue(payload.metrics),
      stats: mapJsonValue(payload.stats),
    };
    await this.prisma.rankPlayerSnapshot.upsert({
      where: {
        serverId_playerUuid: {
          serverId: payload.serverId,
          playerUuid: payload.playerUuid,
        },
      },
      create: data,
      update: data,
    });
  }

  async getLatestUpdate(serverId: string) {
    const record = await this.prisma.rankPlayerSnapshot.findFirst({
      where: { serverId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    return record?.updatedAt ?? null;
  }
}

function mapJsonValue(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === null) {
    return Prisma.JsonNull;
  }
  if (value === undefined) {
    return undefined;
  }
  return sanitizeJsonMeta(value);
}

function sanitizeJsonMeta(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) {
    return Prisma.JsonNull;
  }
  try {
    const serialized = JSON.stringify(value, (_key, val) => {
      if (val && typeof val === 'object' && '$type' in val && 'value' in val) {
        return (val as Record<string, unknown>).value;
      }
      return val;
    });
    if (!serialized) {
      return Prisma.JsonNull;
    }
    return JSON.parse(serialized);
  } catch {
    return Prisma.JsonNull;
  }
}
