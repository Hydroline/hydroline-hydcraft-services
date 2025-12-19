import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TransportationRailwayMod } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  RailConnectionMetadata,
  RailCurveParameters,
  RailGeometrySegment,
  RailGraph,
  RailGraphNode,
  PreferredRailCurve,
} from './railway-graph.types';
import {
  type BlockPosition,
  decodeBlockPosition,
  encodeBlockPosition,
} from '../utils/block-pos.util';
import { MtrRouteFinder } from '../../lib/mtr/mtr-route-finder';
import type {
  RailwayPlatformRecord,
  RailwayRouteRecord,
  RailwayStationRecord,
} from './railway-types';
import {
  normalizeId,
  normalizeIdList,
  normalizePayloadRecord,
  readString,
  toBoolean,
  toNumber,
} from './railway-normalizer';

const MAX_ROUTE_GEOMETRY_CONCURRENCY = 2;
const MAX_STATION_MAP_CONCURRENCY = 2;

type ScopeKey = {
  serverId: string;
  railwayMod: TransportationRailwayMod;
  dimensionContext: string;
};

type RouteRow = {
  entityId: string;
  payload: Prisma.JsonValue;
  name: string | null;
  color: number | null;
};

type RouteGeometrySnapshotValue = {
  paths: Array<Array<{ x: number; z: number }>>;
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number } | null;
  stops: Array<{
    stationId: string | null;
    x: number;
    z: number;
    label: string;
  }>;
  pathNodes3d: BlockPosition[] | null;
  pathEdges: RailGeometrySegment[] | null;
};

type StationRouteMapGroup = {
  key: string;
  displayName: string;
  color: number | null;
  routeIds: string[];
  paths: Array<Array<{ x: number; z: number }>>;
  stops: Array<{
    stationId: string | null;
    x: number;
    z: number;
    label: string;
  }>;
};

export type StationRouteMapPayload = {
  stationId: string;
  serverId: string;
  railwayType: TransportationRailwayMod;
  dimension: string | null;
  generatedAt: number;
  groups: StationRouteMapGroup[];
};

@Injectable()
export class TransportationRailwaySnapshotService {
  private readonly logger = new Logger(
    TransportationRailwaySnapshotService.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  async computeAndPersistAllSnapshotsForServer(input: {
    serverId: string;
    railwayMod: TransportationRailwayMod;
  }) {
    const dimensionContexts = await this.listDimensionContexts(input);
    for (const dimensionContext of dimensionContexts) {
      await this.computeAndPersistScopeSnapshots({
        serverId: input.serverId,
        railwayMod: input.railwayMod,
        dimensionContext,
      });
    }
  }

  private async listDimensionContexts(input: {
    serverId: string;
    railwayMod: TransportationRailwayMod;
  }): Promise<string[]> {
    const rows = await this.prisma.transportationRailwayDimension.findMany({
      where: { serverId: input.serverId, railwayMod: input.railwayMod },
      select: { dimensionContext: true },
      orderBy: { dimensionContext: 'asc' },
    });
    const contexts = rows
      .map((row) => row.dimensionContext)
      .filter((ctx): ctx is string => Boolean(ctx?.trim()));
    if (contexts.length) {
      return contexts;
    }
    const rails = await this.prisma.transportationRailwayRail.findMany({
      where: { serverId: input.serverId, railwayMod: input.railwayMod },
      distinct: ['dimensionContext'],
      select: { dimensionContext: true },
    });
    return rails
      .map((row) => row.dimensionContext?.trim() ?? '')
      .filter(Boolean);
  }

  private async computeAndPersistScopeSnapshots(scope: ScopeKey) {
    const fingerprint = await this.computeScopeFingerprint(scope);
    const existing =
      await this.prisma.transportationRailwayComputeScope.findUnique({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
          },
        },
      });

    if (
      existing?.fingerprint === fingerprint &&
      existing.status === 'SUCCEEDED'
    ) {
      this.logger.log(
        `Skip compute: ${scope.serverId} ${scope.railwayMod} ${scope.dimensionContext} fingerprint unchanged`,
      );
      return;
    }

    await this.prisma.transportationRailwayComputeScope.upsert({
      where: {
        serverId_railwayMod_dimensionContext: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
      },
      update: {
        fingerprint,
        status: 'RUNNING',
        message: null,
        computedAt: null,
      },
      create: {
        id: randomUUID(),
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
        fingerprint,
        status: 'RUNNING',
      },
    });

    try {
      const dataset = await this.loadScopeDataset(scope);
      const graph = this.buildRailGraph(dataset.rails);

      const routeGeometryById = await this.computeRouteGeometrySnapshots({
        scope,
        graph,
        routeRecords: dataset.routeRecords,
        platformMap: dataset.platformMap,
        stationRecords: dataset.stationRecords,
        stationMap: dataset.stationMap,
        fingerprint,
      });

      await this.computeStationMapSnapshots({
        scope,
        stationRecords: dataset.stationRecords,
        platformRecords: dataset.platformRecords,
        platformRouteIds: dataset.platformRouteIds,
        routeRowsById: dataset.routeRowsById,
        routeGeometryById,
        fingerprint,
      });

      await this.prisma.transportationRailwayComputeScope.update({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
          },
        },
        data: {
          status: 'SUCCEEDED',
          computedAt: new Date(),
          message: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.transportationRailwayComputeScope.update({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
          },
        },
        data: {
          status: 'FAILED',
          message,
        },
      });
      this.logger.error(
        `Compute scope failed: ${scope.serverId} ${scope.railwayMod} ${scope.dimensionContext}: ${message}`,
      );
    }
  }

  private async computeScopeFingerprint(scope: ScopeKey): Promise<string> {
    const [routes, platforms, stations, rails] = await Promise.all([
      this.prisma.transportationRailwayRoute.aggregate({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
        _count: { _all: true },
        _max: { lastBeaconUpdatedAt: true },
      }),
      this.prisma.transportationRailwayPlatform.aggregate({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
        _count: { _all: true },
        _max: { lastBeaconUpdatedAt: true },
      }),
      this.prisma.transportationRailwayStation.aggregate({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
        _count: { _all: true },
        _max: { lastBeaconUpdatedAt: true },
      }),
      this.prisma.transportationRailwayRail.aggregate({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
        _count: { _all: true },
        _max: { lastBeaconUpdatedAt: true },
      }),
    ]);

    const format = (value: Date | null | undefined) =>
      value ? String(value.getTime()) : 'null';

    return [
      `routes:${routes._count._all}:${format(routes._max.lastBeaconUpdatedAt)}`,
      `platforms:${platforms._count._all}:${format(
        platforms._max.lastBeaconUpdatedAt,
      )}`,
      `stations:${stations._count._all}:${format(
        stations._max.lastBeaconUpdatedAt,
      )}`,
      `rails:${rails._count._all}:${format(rails._max.lastBeaconUpdatedAt)}`,
    ].join('|');
  }

  private async loadScopeDataset(scope: ScopeKey) {
    const [routes, platforms, stations, rails] = await Promise.all([
      this.prisma.transportationRailwayRoute.findMany({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
        select: {
          entityId: true,
          payload: true,
          name: true,
          color: true,
        },
      }),
      this.prisma.transportationRailwayPlatform.findMany({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
        select: {
          entityId: true,
          payload: true,
          name: true,
          transportMode: true,
        },
      }),
      this.prisma.transportationRailwayStation.findMany({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
        select: {
          entityId: true,
          payload: true,
          name: true,
        },
      }),
      this.prisma.transportationRailwayRail.findMany({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
        select: { entityId: true, payload: true },
      }),
    ]);

    const stationRecords: RailwayStationRecord[] = [];
    for (const row of stations) {
      const payload = this.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.buildStationRecordFromEntity(row.entityId, payload);
      if (record) {
        stationRecords.push(record);
      }
    }
    const stationMap = new Map(
      stationRecords.map((record) => [normalizeId(record.id), record]),
    );

    const platformRecords: RailwayPlatformRecord[] = [];
    for (const row of platforms) {
      const payload = this.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.buildPlatformRecordFromEntity(
        {
          entityId: row.entityId,
          name: row.name,
          transportMode: row.transportMode,
        },
        payload,
      );
      if (record) {
        platformRecords.push(record);
      }
    }
    const platformMap = new Map(
      platformRecords.map((record) => [normalizeId(record.id), record]),
    );

    const routeRecords: RailwayRouteRecord[] = [];
    const routeRowsById = new Map<string, RouteRow>();
    for (const row of routes as RouteRow[]) {
      const record = this.buildRouteRecordFromRow(row);
      if (!record) continue;
      routeRecords.push(record);
      const routeId = normalizeId(record.id) ?? row.entityId;
      if (routeId) {
        routeRowsById.set(routeId, row);
      }
    }

    const platformRouteIds = this.buildPlatformRouteIds(
      platformRecords,
      routeRecords,
    );

    return {
      routes,
      routeRecords,
      routeRowsById,
      platforms,
      platformRecords,
      platformMap,
      platformRouteIds,
      stations,
      stationRecords,
      stationMap,
      rails,
    };
  }

  private buildPlatformRouteIds(
    platformRecords: RailwayPlatformRecord[],
    routeRecords: RailwayRouteRecord[],
  ) {
    const mapping = new Map<string, Set<string>>();
    for (const platform of platformRecords) {
      const platformId = normalizeId(platform.id);
      if (!platformId) continue;
      const routeIds = normalizeIdList((platform.route_ids as unknown[]) ?? []);
      if (!routeIds.length) continue;
      mapping.set(platformId, new Set(routeIds));
    }
    const needsFallback = platformRecords.some((platform) => {
      const platformId = normalizeId(platform.id);
      if (!platformId) return false;
      return !mapping.get(platformId)?.size;
    });
    if (needsFallback) {
      for (const route of routeRecords) {
        const routeId = normalizeId(route.id);
        if (!routeId) continue;
        const platformIds = normalizeIdList(route.platform_ids ?? []);
        for (const platformId of platformIds) {
          const bucket = mapping.get(platformId) ?? new Set<string>();
          bucket.add(routeId);
          mapping.set(platformId, bucket);
        }
      }
    }
    return new Map(
      Array.from(mapping.entries()).map(([key, set]) => [key, Array.from(set)]),
    );
  }

  private async computeRouteGeometrySnapshots(input: {
    scope: ScopeKey;
    graph: RailGraph | null;
    routeRecords: RailwayRouteRecord[];
    platformMap: Map<string | null, RailwayPlatformRecord>;
    stationRecords: RailwayStationRecord[];
    stationMap: Map<string | null, RailwayStationRecord>;
    fingerprint: string;
  }) {
    const routeGeometryById = new Map<string, RouteGeometrySnapshotValue>();
    const allRoutes = input.routeRecords;

    const run = async (record: RailwayRouteRecord) => {
      const routeId = normalizeId(record.id);
      if (!routeId) return;
      const routePlatforms = this.resolvePlatformsForRoute(
        record,
        input.platformMap,
      );
      if (!routePlatforms.length) return;

      const { geometry, pathNodes3d, pathEdges } =
        await this.buildRouteGeometryForSnapshot({
          railwayMod: input.scope.railwayMod,
          dimensionContext: input.scope.dimensionContext,
          platforms: routePlatforms,
          graph: input.graph,
          stations: input.stationRecords,
          stationMap: input.stationMap,
        });

      const geometryPaths = await this.buildRouteGeometryPathsForSnapshot({
        railwayMod: input.scope.railwayMod,
        dimensionContext: input.scope.dimensionContext,
        normalizedRouteId: routeId,
        mainRoute: record,
        allRoutes,
        platformMap: input.platformMap,
        mainGeometry: geometry,
        graph: input.graph,
        stationRecords: input.stationRecords,
        stationMap: input.stationMap,
      });

      const paths2d: Array<Array<{ x: number; z: number }>> = [];
      for (const entry of geometryPaths) {
        const points = entry?.points ?? [];
        if (!points.length) continue;
        paths2d.push(points.map((point) => ({ x: point.x, z: point.z })));
      }
      if (!paths2d.length && geometry.points?.length) {
        paths2d.push(
          geometry.points.map((point) => ({ x: point.x, z: point.z })),
        );
      }

      const bounds = this.computeBoundsFromPaths(paths2d);

      const stops = await this.buildRouteStopsForSnapshot({
        route: record,
        platformMap: input.platformMap,
        stationMap: input.stationMap,
      });

      const value: RouteGeometrySnapshotValue = {
        paths: paths2d,
        bounds,
        stops,
        pathNodes3d,
        pathEdges,
      };
      routeGeometryById.set(routeId, value);

      await this.prisma.transportationRailwayRouteGeometrySnapshot.upsert({
        where: {
          serverId_railwayMod_dimensionContext_routeEntityId: {
            serverId: input.scope.serverId,
            railwayMod: input.scope.railwayMod,
            dimensionContext: input.scope.dimensionContext,
            routeEntityId: routeId,
          },
        },
        update: {
          sourceFingerprint: input.fingerprint,
          status: 'READY',
          errorMessage: null,
          geometry2d: { paths: paths2d } as Prisma.InputJsonValue,
          bounds: bounds as unknown as Prisma.InputJsonValue,
          stops: stops as unknown as Prisma.InputJsonValue,
          pathNodes3d: (pathNodes3d ??
            null) as unknown as Prisma.InputJsonValue,
          pathEdges: (pathEdges ?? null) as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
        },
        create: {
          id: randomUUID(),
          serverId: input.scope.serverId,
          railwayMod: input.scope.railwayMod,
          dimensionContext: input.scope.dimensionContext,
          routeEntityId: routeId,
          sourceFingerprint: input.fingerprint,
          status: 'READY',
          geometry2d: { paths: paths2d } as Prisma.InputJsonValue,
          bounds: bounds as unknown as Prisma.InputJsonValue,
          stops: stops as unknown as Prisma.InputJsonValue,
          pathNodes3d: (pathNodes3d ??
            null) as unknown as Prisma.InputJsonValue,
          pathEdges: (pathEdges ?? null) as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
        },
      });
    };

    const concurrency = Math.max(1, MAX_ROUTE_GEOMETRY_CONCURRENCY);
    await this.runWithConcurrency(
      input.routeRecords,
      concurrency,
      async (record) => {
        try {
          await run(record);
        } catch (error) {
          const routeId =
            normalizeId(record.id) ??
            (typeof record.id === 'string'
              ? record.id
              : typeof record.id === 'number'
                ? String(Math.trunc(record.id))
                : null);
          const message =
            error instanceof Error ? error.message : String(error);
          if (routeId) {
            await this.prisma.transportationRailwayRouteGeometrySnapshot.upsert(
              {
                where: {
                  serverId_railwayMod_dimensionContext_routeEntityId: {
                    serverId: input.scope.serverId,
                    railwayMod: input.scope.railwayMod,
                    dimensionContext: input.scope.dimensionContext,
                    routeEntityId: routeId,
                  },
                },
                update: {
                  sourceFingerprint: input.fingerprint,
                  status: 'FAILED',
                  errorMessage: message,
                  generatedAt: new Date(),
                },
                create: {
                  id: randomUUID(),
                  serverId: input.scope.serverId,
                  railwayMod: input.scope.railwayMod,
                  dimensionContext: input.scope.dimensionContext,
                  routeEntityId: routeId,
                  sourceFingerprint: input.fingerprint,
                  status: 'FAILED',
                  errorMessage: message,
                  geometry2d: {} as Prisma.InputJsonValue,
                  generatedAt: new Date(),
                },
              },
            );
          }
        }
      },
    );

    return routeGeometryById;
  }

  private async computeStationMapSnapshots(input: {
    scope: ScopeKey;
    stationRecords: RailwayStationRecord[];
    platformRecords: RailwayPlatformRecord[];
    platformRouteIds: Map<string, string[]>;
    routeRowsById: Map<string, RouteRow>;
    routeGeometryById: Map<string, RouteGeometrySnapshotValue>;
    fingerprint: string;
  }) {
    const routeNameById = new Map<string, string | null>();
    const routeColorById = new Map<string, number | null>();
    for (const [routeId, row] of input.routeRowsById.entries()) {
      const payload = this.toJsonRecord(row.payload);
      const normalized = payload ? normalizePayloadRecord(payload) : null;
      const name =
        readString(normalized?.['name'] ?? payload?.['name']) ??
        row.name ??
        null;
      const color =
        toNumber(normalized?.['color'] ?? payload?.['color']) ??
        row.color ??
        null;
      routeNameById.set(routeId, name);
      routeColorById.set(routeId, color);
    }

    const buildForStation = async (station: RailwayStationRecord) => {
      const stationId = normalizeId(station.id);
      if (!stationId) return;

      const stationPlatforms = this.fetchPlatformsForStationByBounds(
        stationId,
        station,
        input.platformRecords,
      );
      if (!stationPlatforms.length) {
        return;
      }
      const routeIdSet = new Set<string>();
      for (const platform of stationPlatforms) {
        const platformId = normalizeId(platform.id);
        if (!platformId) continue;
        const routeIds = input.platformRouteIds.get(platformId) ?? [];
        for (const routeId of routeIds) {
          if (routeId) routeIdSet.add(routeId);
        }
      }
      if (!routeIdSet.size) {
        return;
      }

      type GroupBucket = {
        key: string;
        displayName: string;
        color: number | null;
        routeIds: Set<string>;
        paths: Array<Array<{ x: number; z: number }>>;
        bounds: {
          xMin: number;
          xMax: number;
          zMin: number;
          zMax: number;
        } | null;
        stops: RouteGeometrySnapshotValue['stops'];
      };

      const groupMap = new Map<string, GroupBucket[]>();

      for (const routeId of routeIdSet) {
        const routeName = routeNameById.get(routeId) ?? null;
        const groupKey = this.extractRouteGroupKey(routeName);
        if (!groupKey) continue;

        const geometry = input.routeGeometryById.get(routeId) ?? null;
        if (!geometry?.paths?.length) continue;

        const buckets = groupMap.get(groupKey) ?? [];
        const selected = this.selectOrCreateBucket({
          groupKey,
          buckets,
          routeColor: routeColorById.get(routeId) ?? null,
          routeBounds: geometry.bounds,
        });

        if (selected.color == null) {
          const c = routeColorById.get(routeId) ?? null;
          if (c != null) selected.color = c;
        }
        selected.routeIds.add(routeId);
        selected.paths.push(...geometry.paths);
        if (geometry.stops?.length) {
          this.mergeStopMarkers(selected, geometry.stops);
        }
        selected.bounds = this.mergeBounds(selected.bounds, geometry.bounds);

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, buckets);
        }
      }

      const groups: StationRouteMapGroup[] = Array.from(groupMap.values())
        .flatMap((buckets) => buckets)
        .map((bucket) => ({
          key: bucket.key,
          displayName: bucket.displayName,
          color: bucket.color,
          routeIds: Array.from(bucket.routeIds),
          paths: bucket.paths,
          stops: bucket.stops,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      const payload: StationRouteMapPayload = {
        stationId,
        serverId: input.scope.serverId,
        railwayType: input.scope.railwayMod,
        dimension: this.extractDimensionFromContext(
          input.scope.dimensionContext,
        ),
        generatedAt: Date.now(),
        groups,
      };

      await this.prisma.transportationRailwayStationMapSnapshot.upsert({
        where: {
          serverId_railwayMod_dimensionContext_stationEntityId: {
            serverId: input.scope.serverId,
            railwayMod: input.scope.railwayMod,
            dimensionContext: input.scope.dimensionContext,
            stationEntityId: stationId,
          },
        },
        update: {
          sourceFingerprint: input.fingerprint,
          payload: payload as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
        },
        create: {
          id: randomUUID(),
          serverId: input.scope.serverId,
          railwayMod: input.scope.railwayMod,
          dimensionContext: input.scope.dimensionContext,
          stationEntityId: stationId,
          sourceFingerprint: input.fingerprint,
          payload: payload as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
        },
      });
    };

    const concurrency = Math.max(1, MAX_STATION_MAP_CONCURRENCY);
    await this.runWithConcurrency(
      input.stationRecords,
      concurrency,
      async (station) => {
        try {
          await buildForStation(station);
        } catch (error) {
          const stationId = normalizeId(station.id);
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Station map snapshot failed for ${stationId ?? 'unknown'}: ${message}`,
          );
        }
      },
    );
  }

  private fetchPlatformsForStationByBounds(
    stationId: string,
    station: RailwayStationRecord,
    platforms: RailwayPlatformRecord[],
  ) {
    const normalizedStationId = normalizeId(stationId);
    if (!normalizedStationId) {
      return [] as RailwayPlatformRecord[];
    }
    const hasBounds = this.stationHasBounds(station);
    return platforms.filter((platform) => {
      const associated = normalizeId(platform.station_id);
      if (associated === normalizedStationId) {
        return true;
      }
      if (!hasBounds) {
        return false;
      }
      return this.platformInsideStationBounds(platform, station);
    });
  }

  private stationHasBounds(station: RailwayStationRecord | null | undefined) {
    if (!station) return false;
    return (
      station.x_min != null &&
      station.x_max != null &&
      station.z_min != null &&
      station.z_max != null
    );
  }

  private platformInsideStationBounds(
    platform: RailwayPlatformRecord,
    station: RailwayStationRecord,
  ) {
    const points: Array<{ x: number; z: number }> = [];
    const pos1 = this.extractBlockPosition(platform.pos_1);
    if (pos1) points.push({ x: pos1.x, z: pos1.z });
    const pos2 = this.extractBlockPosition(platform.pos_2);
    if (pos2) points.push({ x: pos2.x, z: pos2.z });
    const center = this.computePlatformCenter(platform);
    if (center) points.push(center);
    return points.some((point) => this.isPointInsideStation(point, station));
  }

  private isPointInsideStation(
    point: { x: number; z: number },
    station: RailwayStationRecord,
  ) {
    if (!this.stationHasBounds(station)) {
      return false;
    }
    const minX = Math.min(station.x_min!, station.x_max!);
    const maxX = Math.max(station.x_min!, station.x_max!);
    const minZ = Math.min(station.z_min!, station.z_max!);
    const maxZ = Math.max(station.z_min!, station.z_max!);
    return (
      point.x >= minX && point.x <= maxX && point.z >= minZ && point.z <= maxZ
    );
  }

  private extractRouteGroupKey(value: string | null | undefined) {
    if (!value) return null;
    const primary = value.split('||')[0] ?? '';
    const first = primary.split('|')[0] ?? '';
    const trimmed = first.trim();
    return trimmed || null;
  }

  private resolveMergeMaxDistanceBlocks() {
    return 1500;
  }

  private selectOrCreateBucket(input: {
    groupKey: string;
    buckets: Array<{
      key: string;
      displayName: string;
      color: number | null;
      routeIds: Set<string>;
      paths: Array<Array<{ x: number; z: number }>>;
      bounds: { xMin: number; xMax: number; zMin: number; zMax: number } | null;
      stops: RouteGeometrySnapshotValue['stops'];
    }>;
    routeColor: number | null;
    routeBounds: {
      xMin: number;
      xMax: number;
      zMin: number;
      zMax: number;
    } | null;
  }) {
    const maxDistance = this.resolveMergeMaxDistanceBlocks();
    const maxDistanceSq = maxDistance * maxDistance;

    const routeCenter = input.routeBounds
      ? {
          x: (input.routeBounds.xMin + input.routeBounds.xMax) / 2,
          z: (input.routeBounds.zMin + input.routeBounds.zMax) / 2,
        }
      : null;

    if (routeCenter) {
      for (const bucket of input.buckets) {
        const bucketCenter = bucket.bounds
          ? {
              x: (bucket.bounds.xMin + bucket.bounds.xMax) / 2,
              z: (bucket.bounds.zMin + bucket.bounds.zMax) / 2,
            }
          : null;
        if (!bucketCenter) continue;
        const dx = bucketCenter.x - routeCenter.x;
        const dz = bucketCenter.z - routeCenter.z;
        const distSq = dx * dx + dz * dz;
        if (distSq <= maxDistanceSq) {
          return bucket;
        }
      }
    }

    const suffix = input.buckets.length ? `#${input.buckets.length + 1}` : '';
    const bucket = {
      key: `${input.groupKey}${suffix}`,
      displayName: input.groupKey,
      color: input.routeColor,
      routeIds: new Set<string>(),
      paths: [] as Array<Array<{ x: number; z: number }>>,
      bounds: null as {
        xMin: number;
        xMax: number;
        zMin: number;
        zMax: number;
      } | null,
      stops: [] as RouteGeometrySnapshotValue['stops'],
    };
    input.buckets.push(bucket);
    return bucket;
  }

  private mergeStopMarkers(
    bucket: { stops: RouteGeometrySnapshotValue['stops'] },
    incoming: RouteGeometrySnapshotValue['stops'],
  ) {
    const seen = new Set<string>();
    for (const item of bucket.stops) {
      const key = item.stationId
        ? `id:${item.stationId}`
        : `p:${item.x},${item.z}:${item.label}`;
      seen.add(key);
    }
    for (const item of incoming) {
      const key = item.stationId
        ? `id:${item.stationId}`
        : `p:${item.x},${item.z}:${item.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bucket.stops.push(item);
    }
  }

  private mergeBounds(
    a: { xMin: number; xMax: number; zMin: number; zMax: number } | null,
    b: { xMin: number; xMax: number; zMin: number; zMax: number } | null,
  ) {
    if (!a) return b;
    if (!b) return a;
    return {
      xMin: Math.min(a.xMin, b.xMin),
      xMax: Math.max(a.xMax, b.xMax),
      zMin: Math.min(a.zMin, b.zMin),
      zMax: Math.max(a.zMax, b.zMax),
    };
  }

  private computeBoundsFromPaths(
    paths: Array<Array<{ x: number; z: number }>>,
  ) {
    let xMin = Number.POSITIVE_INFINITY;
    let xMax = Number.NEGATIVE_INFINITY;
    let zMin = Number.POSITIVE_INFINITY;
    let zMax = Number.NEGATIVE_INFINITY;
    let count = 0;
    for (const path of paths) {
      for (const point of path ?? []) {
        if (typeof point?.x !== 'number' || typeof point?.z !== 'number')
          continue;
        if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
        xMin = Math.min(xMin, point.x);
        xMax = Math.max(xMax, point.x);
        zMin = Math.min(zMin, point.z);
        zMax = Math.max(zMax, point.z);
        count += 1;
      }
    }
    if (!count) return null;
    return { xMin, xMax, zMin, zMax };
  }

  private extractDimensionFromContext(context: string | null | undefined) {
    if (!context) return null;
    const segments = context.split('/');
    if (segments.length < 3) {
      return null;
    }
    const dimension = segments.pop();
    const namespace = segments.pop();
    if (!namespace || !dimension) {
      return null;
    }
    return `${namespace}:${dimension}`;
  }

  private toJsonRecord(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private buildRouteRecordFromRow(row: RouteRow): RailwayRouteRecord | null {
    const payload = this.toJsonRecord(row.payload);
    if (!payload) {
      return null;
    }
    return {
      id: normalizeId(payload['id']) ?? row.entityId,
      name: readString(payload['name']) ?? row.name ?? null,
      color: toNumber(payload['color']) ?? row.color ?? null,
      transport_mode: readString(payload['transport_mode']) ?? null,
      platform_ids: Array.isArray(payload['platform_ids'])
        ? payload['platform_ids']
        : Array.isArray(payload['platformIds'])
          ? payload['platformIds']
          : null,
      custom_destinations: Array.isArray(payload['custom_destinations'])
        ? payload['custom_destinations']
        : null,
      route_type: readString(payload['route_type']),
      circular_state: readString(payload['circular_state']),
      light_rail_route_number: readString(payload['light_rail_route_number']),
    };
  }

  private buildPlatformRecordFromEntity(
    row: {
      entityId: string;
      name: string | null;
      transportMode: string | null;
    },
    payload: Record<string, unknown>,
  ): RailwayPlatformRecord | null {
    return {
      id: normalizeId(payload['id']) ?? row.entityId,
      name: readString(payload['name']) ?? row.name ?? null,
      color: toNumber(payload['color']) ?? null,
      transport_mode:
        readString(payload['transport_mode']) ?? row.transportMode ?? null,
      station_id: payload['station_id'] ?? payload['stationId'],
      pos_1: payload['pos_1'] ?? payload['pos1'] ?? null,
      pos_2: payload['pos_2'] ?? payload['pos2'] ?? null,
      dwell_time: toNumber(payload['dwell_time']),
      route_ids: Array.isArray(payload['route_ids'])
        ? payload['route_ids']
        : Array.isArray(payload['routeIds'])
          ? payload['routeIds']
          : null,
    };
  }

  private buildStationRecordFromEntity(
    entityId: string,
    payload: Record<string, unknown>,
  ): RailwayStationRecord | null {
    const xMin = toNumber(payload['x_min']);
    const xMax = toNumber(payload['x_max']);
    const zMin = toNumber(payload['z_min']);
    const zMax = toNumber(payload['z_max']);
    return {
      id: normalizeId(payload['id']) ?? entityId,
      name: readString(payload['name']) ?? null,
      color: toNumber(payload['color']),
      transport_mode: readString(payload['transport_mode']),
      x_min: xMin,
      x_max: xMax,
      z_min: zMin,
      z_max: zMax,
      zone: toNumber(payload['zone']),
    };
  }

  private resolvePlatformsForRoute(
    route: RailwayRouteRecord,
    platformMap: Map<string | null, RailwayPlatformRecord>,
  ) {
    const platformIds = normalizeIdList(route.platform_ids ?? []);
    return platformIds
      .map((platformId) => platformMap.get(platformId) ?? null)
      .filter((platform): platform is RailwayPlatformRecord =>
        Boolean(platform),
      );
  }

  private async buildRouteStopsForSnapshot(input: {
    route: RailwayRouteRecord;
    platformMap: Map<string | null, RailwayPlatformRecord>;
    stationMap: Map<string | null, RailwayStationRecord>;
  }): Promise<RouteGeometrySnapshotValue['stops']> {
    const platformIds = normalizeIdList(input.route.platform_ids ?? []);
    if (!platformIds.length) return [];

    const platforms = platformIds
      .map((id) => input.platformMap.get(id) ?? null)
      .filter((p): p is RailwayPlatformRecord => Boolean(p));
    if (!platforms.length) return [];

    const platformStations = this.resolvePlatformStations(
      input.stationMap,
      platforms,
    );

    const stops: RouteGeometrySnapshotValue['stops'] = [];
    for (const platformId of platformIds) {
      const platform = input.platformMap.get(platformId) ?? null;
      if (!platform) continue;
      const station = platformStations.get(platformId) ?? null;
      const platformCenter = this.computePlatformCenter(platform);
      const stationCenter = station ? this.computeStationCenter(station) : null;
      const position = platformCenter ?? stationCenter;
      if (!position) continue;
      const label = (
        station?.name ||
        readString(platform.name) ||
        platform.name ||
        platformId ||
        ''
      ).trim();
      if (!label) continue;
      stops.push({
        stationId: normalizeId(station?.id) ?? null,
        x: position.x,
        z: position.z,
        label: label.split('|')[0],
      });
    }
    return stops;
  }

  private resolvePlatformStations(
    stationMap: Map<string | null, RailwayStationRecord>,
    platforms: RailwayPlatformRecord[],
  ) {
    const stationList = Array.from(stationMap.values()).filter((station) =>
      this.stationHasBounds(station),
    );
    const platformStations = new Map<string, RailwayStationRecord | null>();
    for (const platform of platforms) {
      const platformId = normalizeId(platform.id);
      if (!platformId) continue;
      const directId = normalizeId(platform.station_id);
      const directStation =
        directId != null ? (stationMap.get(directId) ?? null) : null;
      const station =
        directStation ?? this.matchStationByBounds(platform, stationList);
      platformStations.set(platformId, station ?? null);
    }
    return platformStations;
  }

  private matchStationByBounds(
    platform: RailwayPlatformRecord,
    stations: RailwayStationRecord[],
  ) {
    const points: Array<{ x: number; z: number }> = [];
    const pos1 = this.extractBlockPosition(platform.pos_1);
    if (pos1) points.push({ x: pos1.x, z: pos1.z });
    const pos2 = this.extractBlockPosition(platform.pos_2);
    if (pos2) points.push({ x: pos2.x, z: pos2.z });
    const center = this.computePlatformCenter(platform);
    if (center) points.push(center);
    for (const station of stations) {
      if (!this.stationHasBounds(station)) {
        continue;
      }
      if (points.some((point) => this.isPointInsideStation(point, station))) {
        return station;
      }
    }
    return null;
  }

  private computePlatformCenter(platform: RailwayPlatformRecord) {
    const pos1 = decodeBlockPosition(platform.pos_1);
    const pos2 = decodeBlockPosition(platform.pos_2);
    if (!pos1 || !pos2) return null;
    return {
      x: Math.round((pos1.x + pos2.x) / 2),
      z: Math.round((pos1.z + pos2.z) / 2),
    };
  }

  private computeStationCenter(station: RailwayStationRecord) {
    if (
      station.x_min == null ||
      station.x_max == null ||
      station.z_min == null ||
      station.z_max == null
    ) {
      return null;
    }
    return {
      x: Math.round((station.x_min + station.x_max) / 2),
      z: Math.round((station.z_min + station.z_max) / 2),
    };
  }

  private extractBlockPosition(value: unknown): BlockPosition | null {
    if (!value) return null;
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'x' in (value as Record<string, unknown>) &&
      'y' in (value as Record<string, unknown>) &&
      'z' in (value as Record<string, unknown>)
    ) {
      const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
      const x = Number(candidate.x);
      const y = Number(candidate.y);
      const z = Number(candidate.z);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
      }
    }
    return decodeBlockPosition(value);
  }

  private isSameBlockPos(a: BlockPosition | null, b: BlockPosition | null) {
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.z === b.z;
  }

  private buildRailGraph(
    rows: Array<{ entityId: string; payload: Prisma.JsonValue }>,
  ): RailGraph | null {
    const graph: RailGraph = {
      positions: new Map(),
      adjacency: new Map(),
      connections: new Map(),
    };
    for (const row of rows) {
      const payload = this.toJsonRecord(row.payload);
      if (!payload) {
        continue;
      }
      const normalizedPayload = normalizePayloadRecord(payload);
      const nodePosition = this.extractRailNodePosition(
        normalizedPayload ?? payload,
      );
      const nodeId = nodePosition ? encodeBlockPosition(nodePosition) : null;
      if (!nodeId || !nodePosition) {
        continue;
      }
      this.appendRailNode(graph, nodeId, nodePosition);
      const connections = this.extractRailConnections(
        normalizedPayload ?? payload,
      );
      for (const connection of connections) {
        const connectionPosition = this.extractBlockPosition(
          connection?.['node_pos'] ??
            connection?.['nodePos'] ??
            (connection?.['node'] as Record<string, unknown> | undefined),
        );
        if (!connectionPosition) {
          continue;
        }
        const connectionId = encodeBlockPosition(connectionPosition);
        if (!connectionId) {
          continue;
        }
        this.appendRailEdge(
          graph,
          nodeId,
          nodePosition,
          connectionId,
          connectionPosition,
          this.normalizeRailConnectionMetadata(connection, connectionId),
        );
      }
    }
    return graph.positions.size ? graph : null;
  }

  private appendRailNode(
    graph: RailGraph,
    id: string,
    position: BlockPosition,
  ) {
    if (!graph.positions.has(id)) {
      graph.positions.set(id, position);
    }
    if (!graph.adjacency.has(id)) {
      graph.adjacency.set(id, new Set());
    }
  }

  private appendRailEdge(
    graph: RailGraph,
    fromId: string,
    fromPosition: BlockPosition,
    toId: string,
    toPosition: BlockPosition,
    metadata: RailConnectionMetadata | null,
  ) {
    this.appendRailNode(graph, fromId, fromPosition);
    this.appendRailNode(graph, toId, toPosition);
    graph.adjacency.get(fromId)!.add(toId);
    graph.adjacency.get(toId)!.add(fromId);
    if (metadata) {
      if (!graph.connections.has(fromId)) {
        graph.connections.set(fromId, new Map());
      }
      if (!graph.connections.has(toId)) {
        graph.connections.set(toId, new Map());
      }
      graph.connections.get(fromId)!.set(toId, metadata);
      const reversed = this.reverseConnectionMetadata(metadata, fromId);
      if (reversed) {
        graph.connections.get(toId)!.set(fromId, reversed);
      }
    }
  }

  private extractRailNodePosition(record: Record<string, unknown>) {
    const candidates = [
      record['node_pos'],
      record['nodePos'],
      (record['node'] as Record<string, unknown> | undefined)?.['node_pos'],
      (record['node'] as Record<string, unknown> | undefined)?.['nodePos'],
      record['node'],
    ];
    for (const candidate of candidates) {
      const position = this.extractBlockPosition(candidate);
      if (position) {
        return position;
      }
    }
    return null;
  }

  private extractRailConnections(record: Record<string, unknown>) {
    const candidates = [
      record['rail_connections'],
      record['railConnections'],
      record['connections'],
      record['connection_map'],
      record['connectionMap'],
    ];
    for (const candidate of candidates) {
      const normalized = this.normalizeConnectionEntries(candidate);
      if (normalized.length) {
        return normalized;
      }
    }
    return [];
  }

  private normalizeConnectionEntries(value: unknown) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object'),
      );
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === 'object'),
      );
    }
    return [];
  }

  private normalizeRailConnectionMetadata(
    value: Record<string, unknown>,
    targetNodeId: string,
  ): RailConnectionMetadata | null {
    const buildCurve = (suffix: '_1' | '_2'): RailCurveParameters | null => {
      const h = toNumber(value[`h${suffix}`]);
      const k = toNumber(value[`k${suffix}`]);
      const r = toNumber(value[`r${suffix}`]);
      const tStart = toNumber(value[`t_start${suffix}`]);
      const tEnd = toNumber(value[`t_end${suffix}`]);
      const reverse = toBoolean(value[`reverse_t${suffix}`]);
      const isStraight = toBoolean(value[`is_straight${suffix}`]);
      const hasValue = [h, k, r, tStart, tEnd].some((item) => item != null);
      if (!hasValue && reverse == null && isStraight == null) {
        return null;
      }
      return {
        h,
        k,
        r,
        tStart,
        tEnd,
        reverse,
        isStraight,
      };
    };

    const primary = buildCurve('_1');
    const secondary = buildCurve('_2');
    const preferredCurve = this.pickPreferredRailCurve(primary, secondary);

    return {
      targetNodeId,
      railType: readString(value['rail_type']) ?? null,
      transportMode: readString(value['transport_mode']) ?? null,
      modelKey: readString(value['model_key']) ?? null,
      isSecondaryDir: toBoolean(value['is_secondary_dir']),
      yStart: toNumber(value['y_start']),
      yEnd: toNumber(value['y_end']),
      verticalCurveRadius: toNumber(value['vertical_curve_radius']),
      primary,
      secondary,
      preferredCurve,
    };
  }

  private reverseConnectionMetadata(
    metadata: RailConnectionMetadata | null,
    targetNodeId: string,
  ): RailConnectionMetadata | null {
    if (!metadata) {
      return null;
    }
    const reverseCurve = (curve: RailCurveParameters | null) => {
      if (!curve) return null;
      const reversedFlag = !(curve.reverse ?? false);
      return {
        ...curve,
        reverse: reversedFlag,
      };
    };
    return {
      targetNodeId,
      railType: metadata.railType,
      transportMode: metadata.transportMode,
      modelKey: metadata.modelKey,
      isSecondaryDir: metadata.isSecondaryDir,
      yStart: metadata.yEnd,
      yEnd: metadata.yStart,
      verticalCurveRadius: metadata.verticalCurveRadius,
      primary: reverseCurve(metadata.primary),
      secondary: reverseCurve(metadata.secondary),
      preferredCurve: metadata.preferredCurve,
    };
  }

  private pickPreferredRailCurve(
    primary: RailCurveParameters | null,
    secondary: RailCurveParameters | null,
  ): PreferredRailCurve {
    const primaryExists = Boolean(primary);
    const secondaryExists = Boolean(secondary);
    const primaryForward = primaryExists && !this.isReverseCurve(primary);
    const secondaryForward = secondaryExists && !this.isReverseCurve(secondary);
    if (primaryForward && !secondaryForward) {
      return 'primary';
    }
    if (secondaryForward && !primaryForward) {
      return 'secondary';
    }
    if (primaryForward) {
      return 'primary';
    }
    if (secondaryForward) {
      return 'secondary';
    }
    if (primaryExists) {
      return 'primary';
    }
    if (secondaryExists) {
      return 'secondary';
    }
    return null;
  }

  private isReverseCurve(curve: RailCurveParameters | null): boolean {
    return Boolean(curve?.reverse);
  }

  private extractPlatformNodes(platforms: RailwayPlatformRecord[]): Array<{
    platformId: string | null;
    nodes: RailGraphNode[];
  }> {
    return platforms
      .map((platform) => {
        const nodes: RailGraphNode[] = [];
        const pos1 = this.extractBlockPosition(platform.pos_1);
        if (pos1) {
          const id = encodeBlockPosition(pos1);
          if (id) {
            nodes.push({ id, position: pos1 });
          }
        }
        const pos2 = this.extractBlockPosition(platform.pos_2);
        if (pos2) {
          const id = encodeBlockPosition(pos2);
          if (id) {
            const duplicate = nodes.find((node) =>
              this.isSameBlockPos(node.position, pos2),
            );
            if (!duplicate) {
              nodes.push({ id, position: pos2 });
            }
          }
        }
        return {
          platformId: normalizeId(platform.id),
          nodes,
        };
      })
      .filter((item) => item.nodes.length > 0);
  }

  private snapPlatformNodesToRailGraph(platformNodes: any[], graph: RailGraph) {
    const indexByXZ = new Map<string, Array<{ id: string; y: number }>>();
    for (const [id, pos] of graph.positions.entries()) {
      const key = `${pos.x},${pos.z}`;
      let list = indexByXZ.get(key);
      if (!list) {
        list = [];
        indexByXZ.set(key, list);
      }
      list.push({ id, y: pos.y });
    }

    const maxRadius = 8;
    let missingNodes = 0;
    let snappedNodes = 0;
    const result: any[] = [];

    for (const platform of platformNodes) {
      const snappedPlatformNodes: RailGraphNode[] = [];
      const used = new Set<string>();
      for (const node of platform.nodes) {
        if (graph.positions.has(node.id)) {
          if (!used.has(node.id)) {
            used.add(node.id);
            snappedPlatformNodes.push(node);
          }
          continue;
        }
        missingNodes += 1;

        const x = node.position.x;
        const z = node.position.z;
        const targetY = node.position.y;

        const pickBest = (
          candidates: Array<{ id: string; y: number }> | undefined,
        ) => {
          if (!candidates?.length) return null;
          let best = candidates[0];
          let bestDy = Math.abs(candidates[0].y - targetY);
          for (let i = 1; i < candidates.length; i += 1) {
            const dy = Math.abs(candidates[i].y - targetY);
            if (dy < bestDy) {
              best = candidates[i];
              bestDy = dy;
            }
          }
          return best;
        };

        let best = pickBest(indexByXZ.get(`${x},${z}`));
        if (!best) {
          for (let r = 1; r <= maxRadius && !best; r += 1) {
            for (let dx = -r; dx <= r && !best; dx += 1) {
              for (let dz = -r; dz <= r && !best; dz += 1) {
                if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
                best = pickBest(indexByXZ.get(`${x + dx},${z + dz}`));
              }
            }
          }
        }

        if (best && !used.has(best.id)) {
          const pos = graph.positions.get(best.id);
          if (pos) {
            snappedNodes += 1;
            used.add(best.id);
            snappedPlatformNodes.push({
              id: best.id,
              position: pos,
            });
          }
        }
      }
      if (snappedPlatformNodes.length) {
        result.push({
          platformId: platform.platformId,
          nodes: snappedPlatformNodes,
        });
      }
    }

    return {
      nodes: result,
      missingNodes,
      snappedNodes,
    };
  }

  private includePlatformSegments(
    segments: RailGeometrySegment[] | undefined,
    platforms: RailwayPlatformRecord[],
  ) {
    const registry = new Map<string, RailGeometrySegment>();
    for (const segment of segments ?? []) {
      if (!segment?.start || !segment?.end) continue;
      registry.set(this.buildSegmentKey(segment.start, segment.end), segment);
    }
    for (const platform of platforms) {
      const pos1 = this.extractBlockPosition(platform.pos_1);
      const pos2 = this.extractBlockPosition(platform.pos_2);
      if (!pos1 || !pos2) continue;
      const key = this.buildSegmentKey(pos1, pos2);
      if (registry.has(key)) {
        continue;
      }
      const targetNodeId =
        encodeBlockPosition(pos2) ??
        encodeBlockPosition(pos1) ??
        `${pos2.x},${pos2.y},${pos2.z}`;
      registry.set(key, {
        start: pos1,
        end: pos2,
        connection: {
          targetNodeId,
          railType: 'PLATFORM',
          transportMode: platform.transport_mode ?? null,
          modelKey: null,
          isSecondaryDir: false,
          yStart: pos1.y,
          yEnd: pos2.y,
          verticalCurveRadius: 0,
          primary: {
            h: 0,
            k: 0,
            r: 0,
            tStart: 0,
            tEnd: 0,
            reverse: false,
            isStraight: true,
          },
          secondary: null,
          preferredCurve: 'primary',
        },
      });
    }
    return Array.from(registry.values());
  }

  private buildSegmentKey(start: BlockPosition, end: BlockPosition) {
    return `${start.x},${start.y},${start.z}->${end.x},${end.y},${end.z}`;
  }

  private async buildRouteGeometryForSnapshot(input: {
    railwayMod: TransportationRailwayMod;
    dimensionContext: string | null;
    platforms: RailwayPlatformRecord[];
    graph: RailGraph | null;
    stations: RailwayStationRecord[];
    stationMap: Map<string | null, RailwayStationRecord>;
  }): Promise<{
    geometry: {
      source: string;
      points: Array<{ x: number; z: number }>;
      segments?: RailGeometrySegment[];
    };
    pathNodes3d: BlockPosition[] | null;
    pathEdges: RailGeometrySegment[] | null;
  }> {
    if (input.dimensionContext && input.graph) {
      const fromRails = this.buildGeometryFromGraph(
        input.graph,
        input.platforms,
      );
      if (fromRails) {
        return fromRails;
      }
    }
    const fallback = this.buildFallbackGeometry(
      input.platforms,
      input.stations,
      input.stationMap,
    );
    return { geometry: fallback, pathNodes3d: null, pathEdges: null };
  }

  private buildGeometryFromGraph(
    graph: RailGraph,
    platforms: RailwayPlatformRecord[],
  ) {
    const rawPlatformNodes = this.extractPlatformNodes(platforms);
    if (!rawPlatformNodes.length) {
      return null;
    }
    if (!graph?.positions.size) {
      return null;
    }
    const snapped = this.snapPlatformNodesToRailGraph(rawPlatformNodes, graph);
    const platformNodes = snapped.nodes;
    if (!platformNodes.length) {
      return null;
    }
    const finder = new MtrRouteFinder(graph);
    const pathResult = finder.findRoute(platformNodes);
    const path = pathResult?.points ?? null;
    if (!path?.length) {
      return null;
    }
    const segments = this.includePlatformSegments(
      pathResult?.segments,
      platforms,
    );
    return {
      geometry: {
        source: 'rails',
        points: path.map((position) => ({ x: position.x, z: position.z })),
        segments: segments.length ? segments : undefined,
      },
      pathNodes3d: path,
      pathEdges: segments.length ? segments : null,
    };
  }

  private buildFallbackGeometry(
    platforms: RailwayPlatformRecord[],
    stations: RailwayStationRecord[],
    stationMap: Map<string | null, RailwayStationRecord>,
  ) {
    const points: Array<{ x: number; z: number }> = [];
    let source = 'platform-centers';

    for (const platform of platforms) {
      const center = this.computePlatformCenter(platform);
      if (center) {
        points.push(center);
        continue;
      }
      const stationId = normalizeId(platform.station_id);
      const station = stationMap.get(stationId);
      if (station) {
        const stationCenter = this.computeStationCenter(station);
        if (stationCenter) {
          points.push(stationCenter);
          source = 'station-bounds';
        }
      }
    }

    if (!points.length) {
      for (const station of stations) {
        const center = this.computeStationCenter(station);
        if (center) {
          points.push(center);
        }
      }
      source = 'station-bounds';
    }

    return { source, points };
  }

  private buildRouteDirectionKey(route: RailwayRouteRecord | null) {
    if (!route) return null;
    const normalizeValue = (value?: string | null) => {
      if (!value) return null;
      const normalized = value
        .split('||')[0]
        .split('|')[0]
        .trim()
        .toLowerCase();
      return normalized || null;
    };
    return (
      normalizeValue(route.light_rail_route_number) ??
      normalizeValue(route.name ?? null)
    );
  }

  private buildRouteLabel(route: RailwayRouteRecord | null) {
    if (!route) return null;
    return (
      readString(route.light_rail_route_number) ??
      readString(route.name) ??
      null
    );
  }

  private findRelatedRoutes(
    currentRoute: RailwayRouteRecord,
    allRoutes: RailwayRouteRecord[],
    excludeRouteId: string,
  ) {
    const referenceKey = this.buildRouteDirectionKey(currentRoute);
    if (!referenceKey) return [];
    return allRoutes.filter((route) => {
      const routeId = normalizeId(route.id);
      if (!routeId || routeId === excludeRouteId) {
        return false;
      }
      const candidateKey = this.buildRouteDirectionKey(route);
      return Boolean(candidateKey && candidateKey === referenceKey);
    });
  }

  private buildGeometryPathEntry(
    routeId: string,
    route: RailwayRouteRecord | null,
    geometry: {
      source: string;
      points: Array<{ x: number; z: number }>;
      segments?: RailGeometrySegment[];
    },
    isPrimary: boolean,
  ) {
    return {
      id: routeId,
      label: this.buildRouteLabel(route),
      isPrimary,
      source: geometry.source,
      points: geometry.points,
      segments: geometry.segments,
    };
  }

  private async buildRouteGeometryPathsForSnapshot(input: {
    railwayMod: TransportationRailwayMod;
    dimensionContext: string | null;
    normalizedRouteId: string;
    mainRoute: RailwayRouteRecord;
    allRoutes: RailwayRouteRecord[];
    platformMap: Map<string | null, RailwayPlatformRecord>;
    mainGeometry: {
      source: string;
      points: Array<{ x: number; z: number }>;
      segments?: RailGeometrySegment[];
    };
    graph: RailGraph | null;
    stationRecords: RailwayStationRecord[];
    stationMap: Map<string | null, RailwayStationRecord>;
  }) {
    const paths: Array<ReturnType<typeof this.buildGeometryPathEntry>> = [];
    paths.push(
      this.buildGeometryPathEntry(
        input.normalizedRouteId,
        input.mainRoute,
        input.mainGeometry,
        true,
      ),
    );
    const mainPlatformIds = normalizeIdList(input.mainRoute.platform_ids ?? []);
    const mainPlatformIdSet = new Set(mainPlatformIds);
    const mainStationIdSet = new Set(
      mainPlatformIds
        .map((platformId) => {
          const platform = input.platformMap.get(platformId) ?? null;
          return platform ? normalizeId(platform.station_id) : null;
        })
        .filter((stationId): stationId is string => Boolean(stationId)),
    );
    const candidates = this.findRelatedRoutes(
      input.mainRoute,
      input.allRoutes,
      input.normalizedRouteId,
    ).filter((route) => {
      const candidateIds = normalizeIdList(route.platform_ids ?? []);
      if (!candidateIds.length) {
        return false;
      }

      if (mainPlatformIdSet.size) {
        const candidateSet = new Set(candidateIds);
        if (candidateSet.size === mainPlatformIdSet.size) {
          let equal = true;
          for (const platformId of candidateSet) {
            if (!mainPlatformIdSet.has(platformId)) {
              equal = false;
              break;
            }
          }
          if (equal) {
            return true;
          }
        }
      }

      if (!mainStationIdSet.size) {
        return false;
      }
      const candidateStationIds = candidateIds
        .map((platformId) => {
          const platform = input.platformMap.get(platformId) ?? null;
          return platform ? normalizeId(platform.station_id) : null;
        })
        .filter((stationId): stationId is string => Boolean(stationId));
      if (!candidateStationIds.length) {
        return false;
      }
      const candidateStationIdSet = new Set(candidateStationIds);
      if (candidateStationIdSet.size < 2 || mainStationIdSet.size < 2) {
        return false;
      }
      if (candidateStationIdSet.size !== mainStationIdSet.size) {
        return false;
      }
      for (const stationId of candidateStationIdSet) {
        if (!mainStationIdSet.has(stationId)) {
          return false;
        }
      }
      return true;
    });
    let altIndex = 0;
    for (const candidate of candidates) {
      const candidatePlatforms = this.resolvePlatformsForRoute(
        candidate,
        input.platformMap,
      );
      if (!candidatePlatforms.length) {
        continue;
      }
      const { geometry } = await this.buildRouteGeometryForSnapshot({
        railwayMod: input.railwayMod,
        dimensionContext: input.dimensionContext,
        platforms: candidatePlatforms,
        graph: input.graph,
        stations: input.stationRecords,
        stationMap: input.stationMap,
      });
      const pointCount = geometry.points?.length ?? 0;
      if (pointCount < 2) {
        continue;
      }
      const candidateId =
        normalizeId(candidate.id) ??
        `${input.normalizedRouteId}-alt-${altIndex}`;
      altIndex += 1;
      paths.push(
        this.buildGeometryPathEntry(candidateId, candidate, geometry, false),
      );
    }
    return paths;
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    handler: (item: T) => Promise<void>,
  ) {
    const queue = items.slice();
    const workers: Array<Promise<void>> = [];
    const runWorker = async () => {
      while (queue.length) {
        const item = queue.shift()!;
        await handler(item);
        await new Promise((resolve) => setImmediate(resolve));
      }
    };
    for (let i = 0; i < concurrency; i += 1) {
      workers.push(runWorker());
    }
    await Promise.all(workers);
  }
}
