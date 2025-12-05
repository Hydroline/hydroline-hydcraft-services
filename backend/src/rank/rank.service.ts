import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPagination } from '../lib/shared/pagination';
import {
  RANK_DEFAULT_PAGE_SIZE,
  RANK_MAX_PAGE_SIZE,
  RANK_SORT_DEFAULT_FIELD,
  RANK_SORT_FIELDS,
} from './constants';
import type { RankQueryDto, RankSortOrder } from './dto/rank-query.dto';
import type { RankPlayerSnapshot, Prisma } from '@prisma/client';

type RankSortField = (typeof RANK_SORT_FIELDS)[number];

interface RankServerOption {
  id: string;
  displayName: string;
}

interface RankListItem {
  rank: number;
  playerUuid: string | null;
  playerName: string | null;
  displayName: string | null;
  bindingId: string | null;
  lastLoginAt: Date | null;
  registeredAt: Date | null;
  walkDistanceKm: number | null;
  flyDistanceKm: number | null;
  swimDistanceKm: number | null;
  achievements: number | null;
  deaths: number | null;
  playerKilledByCount: number | null;
  jumpCount: number | null;
  playTimeHours: number | null;
  useWandCount: number | null;
  logoutCount: number | null;
  mtrBalance: number | null;
  metrics: Record<string, unknown> | null;
  stats: Record<string, unknown> | null;
}

type RankSnapshotOrderKey =
  | 'lastLoginAt'
  | 'registeredAt'
  | 'walkDistanceKm'
  | 'flyDistanceKm'
  | 'swimDistanceKm'
  | 'achievements'
  | 'deaths'
  | 'playerKilledByCount'
  | 'jumpCount'
  | 'playTimeHours'
  | 'useWandCount'
  | 'logoutCount'
  | 'mtrBalance';

export interface RankResponse {
  servers: Array<RankServerOption>;
  selectedServer: {
    id: string;
    displayName: string;
    lastSyncedAt: string | null;
  };
  pagination: ReturnType<typeof buildPagination>;
  sortField: RankSortField;
  sortOrder: RankSortOrder;
  items: RankListItem[];
}

@Injectable()
export class RankService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: RankQueryDto): Promise<RankResponse> {
    const servers = await this.loadServers();
    if (!servers.length) {
      throw new NotFoundException('No beacon server is configured for ranking');
    }
    const selectedServer = this.resolveServer(
      query.serverId ?? servers[0].id,
      servers,
    );

    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(
      Math.max(query.pageSize ?? RANK_DEFAULT_PAGE_SIZE, 5),
      RANK_MAX_PAGE_SIZE,
    );
    const sortField = query.sortField ?? RANK_SORT_DEFAULT_FIELD;
    const sortOrder = query.order ?? 'desc';
    const orderBy = this.buildOrderBy(sortField, sortOrder);

    const total = await this.prisma.rankPlayerSnapshot.count({
      where: { serverId: selectedServer.id },
    });

    const snapshots = await this.prisma.rankPlayerSnapshot.findMany({
      where: { serverId: selectedServer.id },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const pagination = buildPagination(total, page, pageSize);
    const startRank = (pagination.page - 1) * pageSize;

    const items = snapshots.map((snapshot, index) =>
      this.mapSnapshotToItem(snapshot, startRank + index + 1),
    );

    const latestSnapshot = await this.prisma.rankPlayerSnapshot.findFirst({
      where: { serverId: selectedServer.id },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    return {
      servers,
      selectedServer: {
        id: selectedServer.id,
        displayName: selectedServer.displayName,
        lastSyncedAt: latestSnapshot?.updatedAt?.toISOString() ?? null,
      },
      pagination,
      sortField,
      sortOrder,
      items,
    };
  }

  private resolveServer(serverId: string, servers: RankServerOption[]) {
    const found = servers.find((entry) => entry.id === serverId);
    if (!found) {
      throw new BadRequestException(
        'Specified server is not available for ranking',
      );
    }
    return found;
  }

  private buildOrderBy(field: RankSortField, order: RankSortOrder) {
    const column = this.mapSortField(field);
    const nulls = order === 'desc' ? 'last' : 'first';
    const primaryOrder = {
      [column]: { sort: order, nulls },
    } satisfies Prisma.RankPlayerSnapshotOrderByWithRelationInput;
    const orderBy: Prisma.RankPlayerSnapshotOrderByWithRelationInput[] = [
      primaryOrder,
      { displayName: 'asc' },
    ];
    return orderBy;
  }

  private mapSortField(field: RankSortField): RankSnapshotOrderKey {
    switch (field) {
      case 'lastLogin':
        return 'lastLoginAt';
      case 'registered':
        return 'registeredAt';
      case 'walkDistance':
        return 'walkDistanceKm';
      case 'flyDistance':
        return 'flyDistanceKm';
      case 'swimDistance':
        return 'swimDistanceKm';
      case 'achievements':
        return 'achievements';
      case 'deaths':
        return 'deaths';
      case 'playerKilledBy':
        return 'playerKilledByCount';
      case 'jumpCount':
        return 'jumpCount';
      case 'playTime':
        return 'playTimeHours';
      case 'wandUses':
        return 'useWandCount';
      case 'logoutCount':
        return 'logoutCount';
      case 'mtrBalance':
        return 'mtrBalance';
      default:
        return 'walkDistanceKm';
    }
  }

  private mapSnapshotToItem(
    snapshot: RankPlayerSnapshot,
    rank: number,
  ): RankListItem {
    return {
      rank,
      playerUuid: snapshot.playerUuid,
      playerName: snapshot.playerName,
      displayName: snapshot.displayName,
      bindingId: snapshot.bindingId,
      lastLoginAt: snapshot.lastLoginAt,
      registeredAt: snapshot.registeredAt,
      walkDistanceKm: snapshot.walkDistanceKm ?? 0,
      flyDistanceKm: snapshot.flyDistanceKm ?? 0,
      swimDistanceKm: snapshot.swimDistanceKm ?? 0,
      achievements: snapshot.achievements ?? 0,
      deaths: snapshot.deaths ?? 0,
      playerKilledByCount: snapshot.playerKilledByCount ?? 0,
      jumpCount: snapshot.jumpCount ?? 0,
      playTimeHours: snapshot.playTimeHours ?? 0,
      useWandCount: snapshot.useWandCount ?? 0,
      logoutCount: snapshot.logoutCount ?? 0,
      mtrBalance: snapshot.mtrBalance ?? 0,
      metrics: snapshot.metrics as Record<string, unknown> | null,
      stats: snapshot.stats as Record<string, unknown> | null,
    };
  }

  private async loadServers(): Promise<RankServerOption[]> {
    const servers = await this.prisma.minecraftServer.findMany({
      where: {
        isActive: true,
        beaconEnabled: true,
        beaconEndpoint: { not: null },
        beaconKey: { not: null },
      },
      select: {
        id: true,
        displayName: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return servers;
  }
}
