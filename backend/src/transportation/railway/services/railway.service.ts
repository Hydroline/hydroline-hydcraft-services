import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TransportationRailwayFeaturedItem,
  TransportationRailwayFeaturedType,
  TransportationRailwayMod,
} from '@prisma/client';
import { HydrolineBeaconPoolService } from '../../../lib/hydroline-beacon';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateRailwayFeaturedItemDto } from '../../dto/railway.dto';
import { BeaconServerRecord } from '../utils/railway-common';
import {
  fetchRailwaySnapshot,
  queryRailwayEntities,
} from '../utils/railway-beacon.util';
import type {
  NormalizedEntity,
  NormalizedRoute,
  OverviewStats,
  OverviewLatest,
  OverviewRecentItem,
  QueryMtrEntityRow,
} from '../types/railway-types';
import {
  normalizeEntity,
  normalizeRouteRow,
} from '../utils/railway-normalizer';
import { DEFAULT_RAILWAY_TYPE } from '../config/railway-type.config';

const FEATURED_TYPE_LABELS = {
  [TransportationRailwayFeaturedType.ROUTE]: 'route',
  [TransportationRailwayFeaturedType.STATION]: 'station',
  [TransportationRailwayFeaturedType.DEPOT]: 'depot',
} as const;

type FeaturedItemPayload = {
  id: string;
  type: 'route' | 'station' | 'depot';
  item: NormalizedRoute | NormalizedEntity;
  displayOrder: number;
};

@Injectable()
export class TransportationRailwayService {
  private readonly logger = new Logger(TransportationRailwayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beaconPool: HydrolineBeaconPoolService,
  ) {}

  async getOverview() {
    const [featuredItems, servers] = await Promise.all([
      this.listFeaturedItems(),
      this.listBeaconServers(),
    ]);

    const stats: OverviewStats = {
      serverCount: servers.length,
      routes: 0,
      stations: 0,
      depots: 0,
    };
    const latest: OverviewLatest = {
      depots: [],
      stations: [],
      routes: [],
    };
    const warnings: Array<{ serverId: string; message: string }> = [];
    const recentUpdates: OverviewRecentItem[] = [];

    await Promise.all(
      servers.map(async (server) => {
        try {
          const summary = await this.fetchServerOverview(server);
          stats.routes += summary.routeCount;
          stats.stations += summary.stationCount;
          stats.depots += summary.depotCount;
          latest.depots.push(...summary.latestDepots);
          latest.stations.push(...summary.latestStations);
          latest.routes.push(...summary.latestRoutes);
          recentUpdates.push(
            ...summary.latestRoutes.map((item) => ({
              id: `route:${item.server.id}:${item.id}`,
              type: 'route' as const,
              item,
              lastUpdated: item.lastUpdated ?? null,
            })),
            ...summary.latestStations.map((item) => ({
              id: `station:${item.server.id}:${item.id}`,
              type: 'station' as const,
              item,
              lastUpdated: item.lastUpdated ?? null,
            })),
            ...summary.latestDepots.map((item) => ({
              id: `depot:${item.server.id}:${item.id}`,
              type: 'depot' as const,
              item,
              lastUpdated: item.lastUpdated ?? null,
            })),
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          warnings.push({ serverId: server.id, message });
          this.logger.warn(
            `Failed to fetch railway overview for ${server.displayName}: ${message}`,
          );
        }
      }),
    );

    latest.depots.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));
    latest.stations.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));
    latest.routes.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));

    latest.depots.splice(8);
    latest.stations.splice(8);
    latest.routes.splice(8);
    recentUpdates.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));

    return {
      stats,
      latest,
      recentUpdates,
      recommendations: featuredItems,
      warnings,
    };
  }

  async adminListFeaturedItems() {
    return this.listFeaturedItems();
  }

  async createFeaturedItem(userId: string, dto: CreateRailwayFeaturedItemDto) {
    const railwayMod = dto.railwayType ?? DEFAULT_RAILWAY_TYPE;
    await this.ensureFeaturedTargetExists(
      dto.entityType,
      dto.serverId,
      railwayMod,
      dto.entityId,
    );

    const displayOrder =
      dto.displayOrder ?? (await this.nextFeaturedDisplayOrder());

    const created = await this.prisma.transportationRailwayFeaturedItem.create({
      data: {
        entityType: dto.entityType,
        serverId: dto.serverId,
        railwayMod,
        entityId: dto.entityId,
        displayOrder,
        createdById: userId,
        updatedById: userId,
      },
    });

    const resolved = await this.serializeFeaturedItem(created);
    if (!resolved) {
      throw new NotFoundException('Featured item not found');
    }
    return resolved;
  }

  async deleteFeaturedItem(id: string) {
    await this.prisma.transportationRailwayFeaturedItem.delete({
      where: { id },
    });
    return { success: true };
  }

  private async fetchServerOverview(server: BeaconServerRecord): Promise<{
    server: BeaconServerRecord;
    routeCount: number;
    stationCount: number;
    depotCount: number;
    latestDepots: NormalizedEntity[];
    latestStations: NormalizedEntity[];
    latestRoutes: NormalizedRoute[];
  }> {
    const [snapshotRes, depotRows, stationRows, routeRows] = await Promise.all([
      this.fetchRailwaySnapshot(server),
      queryRailwayEntities(
        this.beaconPool,
        server,
        server.railwayMod,
        'depots',
        {
          limit: 20,
        },
      ),
      queryRailwayEntities(
        this.beaconPool,
        server,
        server.railwayMod,
        'stations',
        {
          limit: 20,
        },
      ),
      queryRailwayEntities(
        this.beaconPool,
        server,
        server.railwayMod,
        'routes',
        {
          limit: 20,
        },
      ),
    ]);

    const counts = snapshotRes.snapshots?.reduce(
      (acc, entry) => {
        acc.routes += entry.payload?.routes?.length ?? 0;
        acc.stations += entry.payload?.stations?.length ?? 0;
        acc.depots += entry.payload?.depots?.length ?? 0;
        return acc;
      },
      { routes: 0, stations: 0, depots: 0 },
    ) ?? { routes: 0, stations: 0, depots: 0 };

    const normalizedRoutes = (routeRows.rows ?? [])
      .map((row) => normalizeRouteRow(row, server))
      .filter((row): row is NormalizedRoute => Boolean(row));
    return {
      server,
      routeCount: counts.routes,
      stationCount: counts.stations,
      depotCount: counts.depots,
      latestDepots: (depotRows.rows ?? [])
        .map((row) => normalizeEntity(row, server))
        .filter((row): row is NormalizedEntity => Boolean(row)),
      latestStations: (stationRows.rows ?? [])
        .map((row) => normalizeEntity(row, server))
        .filter((row): row is NormalizedEntity => Boolean(row)),
      latestRoutes: normalizedRoutes,
    };
  }

  private async fetchRailwaySnapshot(server: BeaconServerRecord) {
    return fetchRailwaySnapshot(this.beaconPool, server);
  }

  private async listBeaconServers() {
    const rows = await this.prisma.minecraftServer.findMany({
      where: {
        isActive: true,
        beaconEnabled: true,
        beaconEndpoint: { not: null },
        beaconKey: { not: null },
      },
      select: {
        id: true,
        displayName: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        beaconMaxRetry: true,
        transportationRailwayMod: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows
      .filter((row) => row.beaconEndpoint && row.beaconKey)
      .map((row) => ({
        id: row.id,
        displayName: row.displayName,
        beaconEndpoint: row.beaconEndpoint!,
        beaconKey: row.beaconKey!,
        beaconRequestTimeoutMs: row.beaconRequestTimeoutMs,
        beaconMaxRetry: row.beaconMaxRetry,
        railwayMod: row.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
        railwayType: row.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
      }));
  }

  private async listFeaturedItems(): Promise<FeaturedItemPayload[]> {
    const featuredRows =
      await this.prisma.transportationRailwayFeaturedItem.findMany({
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      });

    if (!featuredRows.length) return [];

    const serverIds = Array.from(
      new Set(featuredRows.map((row) => row.serverId)),
    );
    const serverMap = await this.resolveServerRecordMap(serverIds);

    const results: FeaturedItemPayload[] = [];
    for (const row of featuredRows) {
      const resolved = await this.serializeFeaturedItem(row, serverMap);
      if (resolved) {
        results.push(resolved);
      }
    }
    return results;
  }

  private async serializeFeaturedItem(
    row: TransportationRailwayFeaturedItem,
    serverMap?: Map<string, BeaconServerRecord>,
  ): Promise<FeaturedItemPayload | null> {
    const servers =
      serverMap ?? (await this.resolveServerRecordMap([row.serverId]));
    const server =
      servers.get(row.serverId) ??
      this.buildFallbackServer(row.serverId, row.railwayMod);

    const entity = await this.resolveFeaturedEntity(row, server);
    if (!entity) return null;

    return {
      id: row.id,
      type: FEATURED_TYPE_LABELS[row.entityType],
      item: entity,
      displayOrder: row.displayOrder,
    };
  }

  private async resolveFeaturedEntity(
    row: TransportationRailwayFeaturedItem,
    server: BeaconServerRecord,
  ): Promise<NormalizedRoute | NormalizedEntity | null> {
    const targetServer = { ...server, railwayMod: row.railwayMod };

    if (row.entityType === TransportationRailwayFeaturedType.ROUTE) {
      const route = await this.prisma.transportationRailwayRoute.findUnique({
        where: {
          serverId_railwayMod_entityId: {
            serverId: row.serverId,
            railwayMod: row.railwayMod,
            entityId: row.entityId,
          },
        },
      });
      if (!route) return null;
      const normalized = normalizeRouteRow(
        this.buildQueryRowFromStoredEntity(route),
        targetServer,
      );
      return normalized;
    }

    if (row.entityType === TransportationRailwayFeaturedType.STATION) {
      const station = await this.prisma.transportationRailwayStation.findUnique(
        {
          where: {
            serverId_railwayMod_entityId: {
              serverId: row.serverId,
              railwayMod: row.railwayMod,
              entityId: row.entityId,
            },
          },
        },
      );
      if (!station) return null;
      return normalizeEntity(
        this.buildQueryRowFromStoredEntity(station),
        targetServer,
      );
    }

    const depot = await this.prisma.transportationRailwayDepot.findUnique({
      where: {
        serverId_railwayMod_entityId: {
          serverId: row.serverId,
          railwayMod: row.railwayMod,
          entityId: row.entityId,
        },
      },
    });
    if (!depot) return null;
    return normalizeEntity(
      this.buildQueryRowFromStoredEntity(depot),
      targetServer,
    );
  }

  private buildQueryRowFromStoredEntity(row: {
    entityId: string;
    transportMode: string | null;
    name: string | null;
    color: number | null;
    filePath: string | null;
    payload: Prisma.JsonValue;
    lastBeaconUpdatedAt: Date | null;
    updatedAt: Date;
  }): QueryMtrEntityRow {
    return {
      entity_id: row.entityId,
      transport_mode: row.transportMode,
      name: row.name,
      color: row.color,
      file_path: row.filePath,
      last_updated:
        row.lastBeaconUpdatedAt?.getTime() ?? row.updatedAt.getTime(),
      payload:
        row.payload &&
        typeof row.payload === 'object' &&
        !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null,
    };
  }

  private async resolveServerRecordMap(serverIds: string[]) {
    if (!serverIds.length) return new Map<string, BeaconServerRecord>();
    const rows = await this.prisma.minecraftServer.findMany({
      where: { id: { in: serverIds } },
      select: {
        id: true,
        displayName: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        beaconMaxRetry: true,
        transportationRailwayMod: true,
      },
    });

    const map = new Map<string, BeaconServerRecord>();
    for (const row of rows) {
      map.set(row.id, {
        id: row.id,
        displayName: row.displayName,
        beaconEndpoint: row.beaconEndpoint ?? '',
        beaconKey: row.beaconKey ?? '',
        beaconRequestTimeoutMs: row.beaconRequestTimeoutMs,
        beaconMaxRetry: row.beaconMaxRetry,
        railwayMod: row.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
      });
    }
    return map;
  }

  private buildFallbackServer(
    serverId: string,
    railwayMod: TransportationRailwayMod,
  ): BeaconServerRecord {
    return {
      id: serverId,
      displayName: serverId,
      beaconEndpoint: '',
      beaconKey: '',
      beaconRequestTimeoutMs: null,
      beaconMaxRetry: null,
      railwayMod,
    };
  }

  private async ensureFeaturedTargetExists(
    entityType: TransportationRailwayFeaturedType,
    serverId: string,
    railwayMod: TransportationRailwayMod,
    entityId: string,
  ) {
    if (entityType === TransportationRailwayFeaturedType.ROUTE) {
      const exists = await this.prisma.transportationRailwayRoute.findUnique({
        where: {
          serverId_railwayMod_entityId: {
            serverId,
            railwayMod,
            entityId,
          },
        },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException('线路不存在');
      }
      return;
    }

    if (entityType === TransportationRailwayFeaturedType.STATION) {
      const exists = await this.prisma.transportationRailwayStation.findUnique({
        where: {
          serverId_railwayMod_entityId: {
            serverId,
            railwayMod,
            entityId,
          },
        },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException('车站不存在');
      }
      return;
    }

    const exists = await this.prisma.transportationRailwayDepot.findUnique({
      where: {
        serverId_railwayMod_entityId: {
          serverId,
          railwayMod,
          entityId,
        },
      },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('车厂不存在');
    }
  }

  private async nextFeaturedDisplayOrder() {
    const row = await this.prisma.transportationRailwayFeaturedItem.findFirst({
      select: { displayOrder: true },
      orderBy: { displayOrder: 'desc' },
    });
    return (row?.displayOrder ?? 0) + 1;
  }
}
