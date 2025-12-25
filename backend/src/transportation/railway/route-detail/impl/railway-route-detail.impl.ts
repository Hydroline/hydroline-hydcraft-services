import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TransportationRailwayDepot,
  TransportationRailwayBindingEntityType,
  TransportationRailwayCompanyBindingType,
  TransportationRailwayMod,
  TransportationRailwayPlatform,
  TransportationRailwayRoute,
  TransportationRailwayStation,
} from '@prisma/client';
import { HydrolineBeaconPoolService } from '../../../../lib/hydroline-beacon';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  RailwayRouteDetailQueryDto,
  RailwayRouteLogQueryDto,
} from '../../../dto/railway.dto';
import { BeaconServerRecord } from '../../utils/railway-common';
import { emitBeacon } from '../../utils/railway-beacon.util';
import type {
  NormalizedEntity,
  NormalizedRoute,
  QueryMtrEntityRow,
  RailwayDepotDetailResult,
  RailwayPlatformRecord,
  RailwayRouteRecord,
  RailwayRouteLogEntry,
  RailwayRouteLogResult,
  RailwayStationDetailResult,
  RailwayStationRecord,
  RouteDetailResult,
} from '../../types/railway-types';

const BLOCKS_PER_KM = 1000;
const NEAREST_STATION_MAX_DISTANCE_BLOCKS = 256;

type StoredRailwayEntity =
  | TransportationRailwayRoute
  | TransportationRailwayStation
  | TransportationRailwayDepot;

type StoredEntityCategory = 'ROUTE' | 'STATION' | 'DEPOT';

type BeaconMtrLogsResponse = {
  success?: boolean;
  error?: string;
  total?: number;
  page?: number;
  page_size?: number;
  records?: Array<Record<string, unknown>>;
};

type BeaconExecuteSqlResponse = {
  success?: boolean;
  error?: string;
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  truncated?: boolean;
};

export type RailwayRouteVariantItem = {
  routeId: string;
  variantLabel: string;
  detail: RouteDetailResult;
};

export type RailwayRouteVariantsResult = {
  baseKey: string | null;
  baseName: string | null;
  routes: RailwayRouteVariantItem[];
};

function estimateGeometryLengthKm(geometry: RouteDetailResult['geometry']) {
  const segments = geometry.segments ?? [];
  if (segments.length) {
    let blocks = 0;
    for (const segment of segments) {
      const sx = segment.start?.x;
      const sz = segment.start?.z;
      const ex = segment.end?.x;
      const ez = segment.end?.z;
      if (
        typeof sx !== 'number' ||
        typeof sz !== 'number' ||
        typeof ex !== 'number' ||
        typeof ez !== 'number'
      ) {
        continue;
      }
      const dx = ex - sx;
      const dz = ez - sz;
      blocks += Math.hypot(dx, dz);
    }
    if (!Number.isFinite(blocks) || blocks <= 0) return null;
    return Number((blocks / BLOCKS_PER_KM).toFixed(2));
  }

  const points = geometry.points ?? [];
  if (points.length < 2) return null;
  let blocks = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dz = curr.z - prev.z;
    blocks += Math.hypot(dx, dz);
  }
  if (!Number.isFinite(blocks) || blocks <= 0) return null;
  return Number((blocks / BLOCKS_PER_KM).toFixed(2));
}
import {
  buildDimensionContextFromDimension,
  buildFallbackEntity,
  normalizeEntity,
  normalizeId,
  normalizeIdList,
  normalizePayloadRecord,
  normalizeRouteRow,
  readString,
  toBoolean,
  toNumber,
} from '../../utils/railway-normalizer';
import {
  extractRouteBaseKey,
  extractRouteDisplayName,
  extractRouteVariantLabel,
} from '../../utils/route-name';
import {
  buildPreviewSvg,
  computeBoundsFromPoints,
  mergeBounds,
  parseSnapshotBounds,
  type RoutePreviewBounds,
  type RoutePreviewPath,
} from '../../utils/route-preview';
import { DEFAULT_RAILWAY_TYPE } from '../../config/railway-type.config';
import {
  BlockPosition,
  decodeBlockPosition,
  encodeBlockPosition,
} from '../../../utils/block-pos.util';
import type {
  PlatformNode,
  RailConnectionMetadata,
  RailCurveParameters,
  RailGeometrySegment,
  RailGraph,
  RailGraphNode,
  PreferredRailCurve,
} from '../../types/railway-graph.types';
import { MtrRouteFinder } from '../../../../lib/mtr/mtr-route-finder';
import { buildPublicUrl } from '../../../../lib/shared/url';

@Injectable()
export class TransportationRailwayRouteDetailService {
  private readonly logger = new Logger(
    TransportationRailwayRouteDetailService.name,
  );

  private readonly stationBoundsCache = new Map<
    string,
    { expiresAt: number; stations: RailwayStationRecord[] }
  >();
  private readonly stationBoundsCacheInflight = new Map<
    string,
    Promise<RailwayStationRecord[]>
  >();
  private readonly stationBoundsCacheTtlMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly beaconPool: HydrolineBeaconPoolService,
  ) {}

  private buildStationBoundsCacheKey(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    return `${server.id}:${server.railwayMod}:${dimensionContext ?? ''}`;
  }

  private async fetchStationsWithBoundsCached(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ): Promise<RailwayStationRecord[]> {
    const cacheKey = this.buildStationBoundsCacheKey(server, dimensionContext);
    const now = Date.now();
    const cached = this.stationBoundsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.stations;
    }

    const inflight = this.stationBoundsCacheInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const promise = (async () => {
      const storedStations = await this.fetchStationsFromStorage(
        server,
        dimensionContext,
      );
      let stations = storedStations.filter((station) =>
        this.stationHasBounds(station),
      );

      // Some datasets may not persist dimensionContext on stations.
      // Fall back to scanning all stations for the server when the scoped query yields nothing.
      if (dimensionContext && !stations.length) {
        const storedStationsAll = await this.fetchStationsFromStorage(
          server,
          null,
        );
        stations = storedStationsAll.filter((station) =>
          this.stationHasBounds(station),
        );
      }
      this.stationBoundsCache.set(cacheKey, {
        expiresAt: now + this.stationBoundsCacheTtlMs,
        stations,
      });
      return stations;
    })().finally(() => {
      this.stationBoundsCacheInflight.delete(cacheKey);
    });

    this.stationBoundsCacheInflight.set(cacheKey, promise);
    return promise;
  }

  async getRouteDetail(
    routeId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RouteDetailResult> {
    if (!routeId || !query?.serverId) {
      throw new BadRequestException('Route ID and serverId are required');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }
    const normalizedRouteId = routeId.trim();

    const routeEntity = await this.fetchStoredEntityRow(
      server,
      'ROUTE',
      normalizedRouteId,
      query.dimension ?? null,
    );
    if (!routeEntity) {
      throw new NotFoundException('Route not found');
    }
    const routeRecord = this.buildRouteRecordFromEntity(routeEntity);
    if (!routeRecord) {
      throw new NotFoundException('Route data missing');
    }

    const normalizedRoute = this.normalizeStoredRoute(routeEntity, server);
    if (!normalizedRoute) {
      throw new NotFoundException('Unable to parse route data');
    }

    const orderedPlatformIds = normalizeIdList(routeRecord.platform_ids ?? []);

    const selectedPlatforms = await this.fetchPlatformsByIds(
      server,
      orderedPlatformIds,
    );
    const platforms = this.buildPlatformsMap(selectedPlatforms);

    let dimensionContextForGeometry = this.resolveRouteDimensionContext(
      normalizedRoute,
      routeEntity.dimensionContext ?? null,
      query.dimension ?? null,
      server.railwayMod,
    );

    if (!dimensionContextForGeometry) {
      dimensionContextForGeometry =
        selectedPlatforms.find((p) => Boolean(p.dimension_context))
          ?.dimension_context ?? null;
    }

    normalizedRoute.previewSvg = await this.buildRoutePreviewSvg({
      server,
      dimensionContext: dimensionContextForGeometry,
      baseKey: this.buildRouteBaseKey(routeRecord),
      primaryRouteId: normalizeId(routeRecord.id) ?? normalizedRouteId,
    });

    normalizedRoute.platformCount = orderedPlatformIds.length;
    if (!normalizedRoute.dimension) {
      normalizedRoute.dimension = this.extractDimensionFromContext(
        normalizedRoute.dimensionContext ??
          routeEntity.dimensionContext ??
          dimensionContextForGeometry,
      );
    }
    if (!normalizedRoute.dimensionContext) {
      normalizedRoute.dimensionContext =
        routeEntity.dimensionContext ?? dimensionContextForGeometry;
    }

    const mainGeometry = await this.buildRouteGeometryPreferSnapshot(
      server,
      dimensionContextForGeometry,
      normalizeId(routeRecord.id) ?? normalizedRouteId,
      selectedPlatforms,
      [],
    );

    const geometry: RouteDetailResult['geometry'] = {
      ...mainGeometry,
      // IMPORTANT: route detail should only return geometry for this route.
      // Other variants (e.g. opposite direction / express / local) are served via /variants.
      paths: [
        this.buildGeometryPathEntry(
          normalizedRouteId,
          routeRecord,
          mainGeometry,
          true,
        ),
      ],
    };

    const estimatedLengthKm = estimateGeometryLengthKm(geometry);

    // Collect station IDs from platforms
    const stationIds = Array.from(
      new Set(
        selectedPlatforms
          .map((p) => normalizeId(p.station_id))
          .filter((id): id is string => !!id),
      ),
    );
    const stationsList = await this.fetchStationsByIds(server, stationIds);
    const stations = this.buildStationsMap(stationsList);

    const stationAssociations = await this.resolvePlatformStations(
      server,
      dimensionContextForGeometry,
      stations,
      selectedPlatforms,
    );

    const normalizedStations = stationAssociations.stations.map((station) =>
      this.normalizeStationRecord(station, server),
    );
    const normalizedPlatforms = selectedPlatforms.map((platform) =>
      this.normalizePlatformRecord(platform, server),
    );

    const normalizedDepots = await this.fetchDepotsForRoute(
      server,
      dimensionContextForGeometry,
      normalizedRouteId,
    );

    const detail: RouteDetailResult = {
      server: { id: server.id, name: server.displayName },
      railwayType: server.railwayMod,
      dimension:
        normalizedRoute.dimension ??
        this.extractDimensionFromContext(dimensionContextForGeometry),
      route: normalizedRoute,
      metadata: {
        lastUpdated:
          normalizedRoute.lastUpdated ??
          routeEntity.lastBeaconUpdatedAt?.getTime() ??
          routeEntity.updatedAt.getTime(),
        snapshotLength: null,
        lengthKm: estimatedLengthKm,
      },
      stations: normalizedStations,
      platforms: normalizedPlatforms,
      depots: normalizedDepots,
      operatorCompanyIds: [],
      builderCompanyIds: [],
      geometry,
      stops: this.buildStopSequence(
        orderedPlatformIds,
        platforms,
        stationAssociations.platformStations,
      ),
    };

    const bindingDimensionContext =
      normalizedRoute.dimensionContext ?? routeEntity.dimensionContext ?? null;
    const bindings = await this.fetchCompanyBindingsForEntity({
      entityType: TransportationRailwayBindingEntityType.ROUTE,
      entityId: normalizedRouteId,
      serverId: server.id,
      railwayMod: server.railwayMod,
      dimensionContext: bindingDimensionContext,
    });
    detail.operatorCompanyIds = bindings.operatorCompanyIds;
    detail.builderCompanyIds = bindings.builderCompanyIds;
    detail.systems = await this.fetchRouteSystems(routeEntity.id);

    return detail;
  }

  async getRouteVariants(
    routeId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RailwayRouteVariantsResult> {
    if (!routeId || !query?.serverId) {
      throw new BadRequestException('Route ID and serverId are required');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }

    const normalizedRouteId = routeId.trim();
    const routeEntity = await this.fetchStoredEntityRow(
      server,
      'ROUTE',
      normalizedRouteId,
      query.dimension ?? null,
    );
    if (!routeEntity) {
      throw new NotFoundException('Route not found');
    }
    const routeRecord = this.buildRouteRecordFromEntity(routeEntity);
    if (!routeRecord) {
      throw new NotFoundException('Route data missing');
    }
    const normalizedRoute = this.normalizeStoredRoute(routeEntity, server);
    if (!normalizedRoute) {
      throw new NotFoundException('Unable to parse route data');
    }

    const dimensionContextForGeometry = this.resolveRouteDimensionContext(
      normalizedRoute,
      routeEntity.dimensionContext ?? null,
      query.dimension ?? null,
      server.railwayMod,
    );

    const baseKey = this.buildRouteBaseKey(routeRecord);
    const baseName = this.buildRouteBaseName(routeRecord);
    if (!baseKey) {
      return { baseKey: null, baseName: baseName ?? null, routes: [] };
    }

    const [allPlatforms, allStations, routeRows] = await Promise.all([
      this.fetchPlatformsFromStorage(server, dimensionContextForGeometry),
      this.fetchStationsFromStorage(server, dimensionContextForGeometry),
      this.fetchStoredRoutesForDimensionRows(
        server,
        dimensionContextForGeometry,
      ),
    ]);
    const platformMap = this.buildPlatformsMap(allPlatforms);
    const stationsMap = this.buildStationsMap(allStations);

    const candidates = routeRows
      .map((row) => {
        const record = this.buildRouteRecordFromEntity(row);
        if (!record) return null;
        const key = this.buildRouteBaseKey(record);
        if (!key || key !== baseKey) return null;
        const rid = row.entityId?.trim();
        if (!rid) return null;
        return { row, record, routeId: rid };
      })
      .filter(
        (
          item,
        ): item is {
          row: TransportationRailwayRoute;
          record: RailwayRouteRecord;
          routeId: string;
        } => Boolean(item),
      );

    const uniqueById = new Map<string, (typeof candidates)[number]>();
    for (const item of candidates) {
      uniqueById.set(item.routeId, item);
    }
    const uniqueCandidates = Array.from(uniqueById.values());

    const primaryRouteId = routeEntity.entityId ?? normalizedRouteId;

    uniqueCandidates.sort((a, b) => {
      if (a.routeId === primaryRouteId && b.routeId !== primaryRouteId) {
        return -1;
      }
      if (b.routeId === primaryRouteId && a.routeId !== primaryRouteId) {
        return 1;
      }
      const la = this.buildRouteVariantLabel(a.record) ?? '主线';
      const lb = this.buildRouteVariantLabel(b.record) ?? '主线';
      return la.localeCompare(lb, 'zh-Hans-CN');
    });

    const results: RailwayRouteVariantItem[] = [];
    for (const item of uniqueCandidates) {
      const detail = await this.buildRouteDetailFromStoredRow(
        server,
        item.row,
        item.routeId,
        dimensionContextForGeometry,
        platformMap,
        stationsMap,
      );
      if (!detail) continue;
      results.push({
        routeId: item.routeId,
        variantLabel: this.buildRouteVariantLabel(item.record) ?? '主线',
        detail,
      });
    }

    return {
      baseKey,
      baseName: baseName ?? null,
      routes: results,
    };
  }

  async getStationDetail(
    stationId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RailwayStationDetailResult> {
    if (!stationId || !query?.serverId) {
      throw new BadRequestException('Station ID and serverId are required');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }
    const normalizedStationId = stationId.trim();
    const stationRow = await this.fetchStoredEntityRow(
      server,
      'STATION',
      normalizedStationId,
      query.dimension ?? null,
    );
    if (!stationRow) {
      throw new NotFoundException('Station not found');
    }
    const stationPayload = this.toJsonRecord(stationRow.payload);
    if (!stationPayload) {
      throw new NotFoundException('Station data missing');
    }
    const stationRecord = this.buildStationRecordFromEntity(
      stationRow.entityId,
      stationPayload,
    );
    if (!stationRecord) {
      throw new NotFoundException('Station data missing');
    }
    const normalizedStation = this.normalizeStationRecord(
      stationRecord,
      server,
    );
    const dimensionContext =
      stationRow.dimensionContext ??
      normalizedStation.dimensionContext ??
      buildDimensionContextFromDimension(
        normalizedStation.dimension,
        server.railwayMod,
      ) ??
      null;
    const platformRecords = await this.fetchPlatformsForStationByBounds(
      server,
      dimensionContext,
      normalizedStationId,
      stationRecord,
    );
    const normalizedPlatforms = platformRecords.map((platform) =>
      this.normalizePlatformRecord(platform, server),
    );
    const platformDetails = normalizedPlatforms;
    const platformIdSet = new Set<string>();
    const routeIdSet = new Set<string>();
    for (const platform of platformDetails) {
      const platformId = normalizeId(platform.id);
      if (platformId) {
        platformIdSet.add(platformId);
      }
      for (const routeId of platform.routeIds ?? []) {
        if (routeId) {
          routeIdSet.add(routeId);
        }
      }
    }
    let routes = await this.fetchNormalizedRoutesByIds(
      server,
      Array.from(routeIdSet),
      dimensionContext,
    );
    if ((!routes.length || routeIdSet.size === 0) && platformIdSet.size) {
      const fallback = await this.fetchNormalizedRoutesByPlatformIds(
        server,
        Array.from(platformIdSet),
        dimensionContext,
      );
      if (!routes.length) {
        routes = fallback.routes;
      }
      if (fallback.platformRouteIds.size) {
        for (const platform of platformDetails) {
          if (platform.routeIds?.length) continue;
          const platformId = normalizeId(platform.id);
          if (!platformId) continue;
          platform.routeIds = fallback.platformRouteIds.get(platformId) ?? [];
        }
      }
    }
    const mergedRoutes = this.mergeRoutesForDisplay(routes);

    // Fetch related stations for the map (routes context)
    const relatedPlatformIds = new Set<string>();
    for (const route of routes) {
      const payload = route.payload || {};
      const pIds = payload['platform_ids'] || payload['platformIds'];
      if (Array.isArray(pIds)) {
        for (const pid of pIds) {
          const normalized = normalizeId(pid);
          if (normalized) relatedPlatformIds.add(normalized);
        }
      }
    }

    const relatedPlatforms = await this.fetchPlatformsByIds(
      server,
      Array.from(relatedPlatformIds),
    );

    // Resolve stations for related platforms (Spatial Lookup)
    // We fetch all stations for the server to perform bounds checking
    const allStations = await this.fetchStationsWithBoundsCached(server, null);
    const relatedStationsMap = new Map<string, RailwayStationRecord>();

    for (const platform of relatedPlatforms) {
      // 1. Try direct station_id if available
      const sid = normalizeId(platform.station_id);
      if (sid) {
        const match = allStations.find((s) => s.id === sid);
        if (match) {
          relatedStationsMap.set(match.id as string, match);
          continue;
        }
      }

      // 2. Spatial lookup
      const match = allStations.find((s) =>
        this.platformInsideStationBounds(platform, s),
      );
      if (match) {
        relatedStationsMap.set(match.id as string, match);
      }
    }

    const normalizedRelatedStations = Array.from(
      relatedStationsMap.values(),
    ).map((s) => this.normalizeStationRecord(s, server));

    const bindings = await this.fetchCompanyBindingsForEntity({
      entityType: TransportationRailwayBindingEntityType.STATION,
      entityId: normalizedStationId,
      serverId: server.id,
      railwayMod: server.railwayMod,
      dimensionContext,
    });

    return {
      server: { id: server.id, name: server.displayName },
      railwayType: server.railwayMod,
      station: normalizedStation,
      platforms: platformDetails,
      routes,
      mergedRoutes,
      stations: normalizedRelatedStations,
      operatorCompanyIds: bindings.operatorCompanyIds,
      builderCompanyIds: bindings.builderCompanyIds,
      metadata: {
        lastUpdated:
          stationRow.lastBeaconUpdatedAt?.getTime() ??
          stationRow.updatedAt.getTime(),
      },
    };
  }

  private mergeRoutesForDisplay(routes: NormalizedRoute[]) {
    if (!routes.length) return [];
    const grouped = new Map<string, NormalizedRoute[]>();
    for (const route of routes) {
      const baseKey = extractRouteBaseKey(route.name) ?? route.id;
      const key = [
        route.server.id,
        route.railwayType,
        route.dimensionContext ?? '',
        baseKey,
      ].join('::');
      const list = grouped.get(key) ?? [];
      list.push(route);
      grouped.set(key, list);
    }
    const merged: NormalizedRoute[] = [];
    for (const list of grouped.values()) {
      if (list.length <= 1) {
        merged.push(list[0]);
        continue;
      }
      const primary = this.selectPrimaryRoute(list) ?? list[0];
      const displayName =
        extractRouteDisplayName(primary.name) ??
        extractRouteDisplayName(list[0]?.name) ??
        primary.name;
      const lastUpdated = list.reduce((max, route) => {
        return Math.max(max ?? 0, route.lastUpdated ?? 0);
      }, primary.lastUpdated ?? 0);
      merged.push({
        ...primary,
        name: displayName ?? primary.name ?? null,
        lastUpdated: lastUpdated || null,
      });
    }
    merged.sort(
      (a, b) =>
        (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0) ||
        a.name?.localeCompare(b.name ?? '') ||
        0,
    );
    return merged;
  }

  private selectPrimaryRoute(routes: NormalizedRoute[]) {
    if (routes.length <= 1) return routes[0] ?? null;
    const candidates = routes.filter(
      (route) => !extractRouteVariantLabel(route.name),
    );
    const list = candidates.length ? candidates : routes;
    return [...list].sort(
      (a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0),
    )[0];
  }

  private async buildRoutePreviewSvg(input: {
    server: BeaconServerRecord;
    dimensionContext: string | null;
    baseKey: string | null;
    primaryRouteId: string;
  }) {
    if (!input.dimensionContext) return null;
    const routeRows = await this.fetchStoredRoutesForDimensionRows(
      input.server,
      input.dimensionContext,
    );
    const candidates = routeRows
      .map((row) => {
        if (!row.entityId) return null;
        const record = this.buildRouteRecordFromEntity(row);
        if (!record) return null;
        const key = this.buildRouteBaseKey(record);
        if (input.baseKey) {
          if (!key || key !== input.baseKey) return null;
        } else if (normalizeId(record.id) !== input.primaryRouteId) {
          return null;
        }
        const normalized = this.normalizeStoredRoute(row, input.server);
        if (!normalized) return null;
        return {
          routeId: normalized.id,
          color: normalized.color ?? null,
        };
      })
      .filter(
        (
          item,
        ): item is {
          routeId: string;
          color: number | null;
        } => Boolean(item),
      );

    const unique = new Map<string, { routeId: string; color: number | null }>();
    for (const item of candidates) {
      unique.set(item.routeId, item);
    }
    if (!unique.size) {
      unique.set(input.primaryRouteId, {
        routeId: input.primaryRouteId,
        color: null,
      });
    }

    const snapshotRows =
      await this.prisma.transportationRailwayRouteGeometrySnapshot.findMany({
        where: {
          status: 'READY',
          OR: Array.from(unique.values()).map((item) => ({
            serverId: input.server.id,
            railwayMod: input.server.railwayMod,
            dimensionContext: input.dimensionContext!,
            routeEntityId: item.routeId,
          })),
        },
        select: {
          serverId: true,
          railwayMod: true,
          dimensionContext: true,
          routeEntityId: true,
          geometry2d: true,
          pathNodes3d: true,
          bounds: true,
        },
      });

    const snapshotMap = new Map<
      string,
      {
        geometry2d: Prisma.JsonValue;
        pathNodes3d: Prisma.JsonValue;
        bounds: Prisma.JsonValue | null;
      }
    >(
      snapshotRows.map((row) => [
        [
          row.serverId,
          row.railwayMod,
          row.dimensionContext,
          row.routeEntityId,
        ].join('::'),
        {
          geometry2d: row.geometry2d,
          pathNodes3d: row.pathNodes3d,
          bounds: row.bounds,
        },
      ]),
    );

    let mergedBounds: RoutePreviewBounds | null = null;
    const paths: RoutePreviewPath[] = [];
    for (const item of unique.values()) {
      const key = [
        input.server.id,
        input.server.railwayMod,
        input.dimensionContext,
        item.routeId,
      ].join('::');
      const snapshot = snapshotMap.get(key);
      if (!snapshot) continue;

      const nodes = Array.isArray(snapshot.pathNodes3d)
        ? (snapshot.pathNodes3d as Array<{ x?: unknown; z?: unknown }>)
        : [];
      const pointsFromNodes = nodes
        .map((node) => ({
          x: Number(node.x),
          z: Number(node.z),
        }))
        .filter(
          (point): point is { x: number; z: number } =>
            Number.isFinite(point.x) && Number.isFinite(point.z),
        );
      if (pointsFromNodes.length >= 2) {
        paths.push({ points: pointsFromNodes, color: item.color ?? null });
        mergedBounds = mergeBounds(
          mergedBounds,
          computeBoundsFromPoints([pointsFromNodes]),
        );
        continue;
      }

      const rawPaths = (snapshot.geometry2d as Record<string, unknown>)?.paths;
      if (Array.isArray(rawPaths)) {
        for (const raw of rawPaths) {
          if (!Array.isArray(raw)) continue;
          const points = raw
            .map((entry) => ({
              x: Number((entry as any)?.x),
              z: Number((entry as any)?.z),
            }))
            .filter(
              (point): point is { x: number; z: number } =>
                Number.isFinite(point.x) && Number.isFinite(point.z),
            );
          if (points.length < 2) continue;
          paths.push({ points, color: item.color ?? null });
          mergedBounds = mergeBounds(
            mergedBounds,
            computeBoundsFromPoints([points]),
          );
        }
      }

      const snapshotBounds = parseSnapshotBounds(snapshot.bounds);
      mergedBounds = mergeBounds(mergedBounds, snapshotBounds);
    }

    return buildPreviewSvg({ paths, bounds: mergedBounds });
  }

  private async fetchPlatformsForStationByBounds(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    stationId: string,
    station: RailwayStationRecord,
  ) {
    const normalizedStationId = normalizeId(stationId);
    if (!normalizedStationId) {
      return [] as RailwayPlatformRecord[];
    }
    const platforms = await this.fetchPlatformsFromStorage(
      server,
      dimensionContext,
    );
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

  async getDepotDetail(
    depotId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RailwayDepotDetailResult> {
    if (!depotId || !query?.serverId) {
      throw new BadRequestException('Depot ID and serverId are required');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }
    const normalizedDepotId = depotId.trim();
    const depotRow = await this.fetchStoredEntityRow(
      server,
      'DEPOT',
      normalizedDepotId,
      query.dimension ?? null,
    );
    if (!depotRow) {
      throw new NotFoundException('Depot not found');
    }
    const depotPayload = this.toJsonRecord(depotRow.payload);
    const normalizedDepot =
      this.normalizeStoredEntity(depotRow, server) ??
      buildFallbackEntity(normalizedDepotId, server);
    const dimensionContext =
      depotRow.dimensionContext ??
      normalizedDepot.dimensionContext ??
      buildDimensionContextFromDimension(
        normalizedDepot.dimension,
        server.railwayMod,
      ) ??
      null;
    const routeIds = depotPayload ? this.extractRouteIds(depotPayload) : [];
    const routes = await this.fetchNormalizedRoutesByIds(
      server,
      routeIds,
      dimensionContext,
    );
    const bounds = this.extractBounds(depotPayload ?? null);
    const rawFrequencies = depotPayload?.['frequencies'];
    const frequencies = Array.isArray(rawFrequencies)
      ? rawFrequencies
          .map((value) => toNumber(value))
          .filter((value): value is number => value != null)
      : null;
    const depotDetail = {
      ...normalizedDepot,
      bounds,
      routeIds,
      useRealTime: toBoolean(depotPayload?.['use_real_time']),
      repeatInfinitely: toBoolean(depotPayload?.['repeat_infinitely']),
      cruisingAltitude: toNumber(depotPayload?.['cruising_altitude']),
      frequencies,
    };
    const bindings = await this.fetchCompanyBindingsForEntity({
      entityType: TransportationRailwayBindingEntityType.DEPOT,
      entityId: normalizedDepotId,
      serverId: server.id,
      railwayMod: server.railwayMod,
      dimensionContext,
    });

    return {
      server: { id: server.id, name: server.displayName },
      railwayType: server.railwayMod,
      depot: depotDetail,
      routes,
      operatorCompanyIds: bindings.operatorCompanyIds,
      builderCompanyIds: bindings.builderCompanyIds,
      metadata: {
        lastUpdated:
          depotRow.lastBeaconUpdatedAt?.getTime() ??
          depotRow.updatedAt.getTime(),
      },
    };
  }

  private async getBeaconServerById(id: string) {
    const server = await this.prisma.minecraftServer.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        beaconEnabled: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        beaconMaxRetry: true,
        transportationRailwayMod: true,
      },
    });
    if (!server || !server.beaconEnabled) {
      throw new NotFoundException('Beacon not enabled on server');
    }
    if (!server.beaconEndpoint || !server.beaconKey) {
      throw new BadRequestException('Beacon configuration incomplete');
    }
    return {
      id: server.id,
      displayName: server.displayName,
      beaconEndpoint: server.beaconEndpoint,
      beaconKey: server.beaconKey,
      beaconRequestTimeoutMs: server.beaconRequestTimeoutMs,
      beaconMaxRetry: server.beaconMaxRetry,
      railwayMod: server.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
    };
  }

  private async fetchStoredEntityRow(
    server: BeaconServerRecord,
    category: StoredEntityCategory,
    entityId: string,
    dimension?: string | null,
  ) {
    const candidates = Array.from(this.buildIdCandidates(entityId));
    const entityFilter =
      candidates.length > 1 ? { in: candidates } : candidates[0];
    const dimensionContext = buildDimensionContextFromDimension(
      dimension,
      server.railwayMod,
    );
    const orderBy = { updatedAt: 'desc' } as const;
    switch (category) {
      case 'ROUTE': {
        const primaryWhere: Prisma.TransportationRailwayRouteWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
          ...(dimensionContext ? { dimensionContext } : {}),
        };
        const fallbackWhere: Prisma.TransportationRailwayRouteWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
        };
        const primary = await this.prisma.transportationRailwayRoute.findFirst({
          where: primaryWhere,
          orderBy,
        });
        if (primary) return primary;
        return (
          (await this.prisma.transportationRailwayRoute.findFirst({
            where: fallbackWhere,
            orderBy,
          })) ?? null
        );
      }
      case 'STATION': {
        const primaryWhere: Prisma.TransportationRailwayStationWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
          ...(dimensionContext ? { dimensionContext } : {}),
        };
        const fallbackWhere: Prisma.TransportationRailwayStationWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
        };
        const primary =
          await this.prisma.transportationRailwayStation.findFirst({
            where: primaryWhere,
            orderBy,
          });
        if (primary) return primary;
        return (
          (await this.prisma.transportationRailwayStation.findFirst({
            where: fallbackWhere,
            orderBy,
          })) ?? null
        );
      }
      case 'DEPOT': {
        const primaryWhere: Prisma.TransportationRailwayDepotWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
          ...(dimensionContext ? { dimensionContext } : {}),
        };
        const fallbackWhere: Prisma.TransportationRailwayDepotWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
        };
        const primary = await this.prisma.transportationRailwayDepot.findFirst({
          where: primaryWhere,
          orderBy,
        });
        if (primary) return primary;
        return (
          (await this.prisma.transportationRailwayDepot.findFirst({
            where: fallbackWhere,
            orderBy,
          })) ?? null
        );
      }
      default:
        return null;
    }
  }

  private async fetchStoredRoutesForDimensionRows(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    const where: Prisma.TransportationRailwayRouteWhereInput = {
      serverId: server.id,
      railwayMod: server.railwayMod,
    };
    if (dimensionContext) {
      where.dimensionContext = dimensionContext;
    }
    return await this.prisma.transportationRailwayRoute.findMany({ where });
  }

  private buildRouteBaseKey(route: RailwayRouteRecord | null) {
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
    // IMPORTANT: grouping must always be based on the current route name
    // (name.split('||')[0].split('|')[0]).
    return normalizeValue(route.name ?? null);
  }

  private buildRouteBaseName(route: RailwayRouteRecord | null) {
    if (!route) return null;
    // IMPORTANT: base name must always be derived from route.name.
    const raw = readString(route.name) ?? null;
    if (!raw) return null;
    const base = raw.split('||')[0]?.split('|')[0]?.trim();
    return base || null;
  }

  private buildRouteVariantLabel(route: RailwayRouteRecord | null) {
    if (!route) return null;
    // IMPORTANT: variant label must always be derived from route.name.
    const raw = readString(route.name) ?? null;
    if (!raw) return null;

    const doubleParts = raw.split('||');
    if (doubleParts.length >= 2) {
      const candidate = doubleParts[1]?.split('|')[0]?.trim();
      return candidate || null;
    }

    const singleParts = doubleParts[0]?.split('|') ?? [];
    if (singleParts.length >= 2) {
      const candidate = singleParts[1]?.trim();
      return candidate || null;
    }

    return null;
  }

  private async buildRouteDetailFromStoredRow(
    server: BeaconServerRecord,
    routeEntity: TransportationRailwayRoute,
    normalizedRouteId: string,
    dimensionContextForGeometry: string | null,
    platformMap: Map<string | null, RailwayPlatformRecord>,
    stationsMap: Map<string | null, RailwayStationRecord>,
  ): Promise<RouteDetailResult | null> {
    const routeRecord = this.buildRouteRecordFromEntity(routeEntity);
    if (!routeRecord) return null;
    const normalizedRoute = this.normalizeStoredRoute(routeEntity, server);
    if (!normalizedRoute) return null;

    const orderedPlatformIds = normalizeIdList(routeRecord.platform_ids ?? []);
    const selectedPlatforms = orderedPlatformIds
      .map((platformId) => platformMap.get(platformId) ?? null)
      .filter((item): item is RailwayPlatformRecord => Boolean(item));

    const mainGeometry = await this.buildRouteGeometryPreferSnapshot(
      server,
      dimensionContextForGeometry,
      normalizeId(routeRecord.id) ?? normalizedRouteId,
      selectedPlatforms,
      [],
    );

    const geometry: RouteDetailResult['geometry'] = {
      ...mainGeometry,
      paths: [
        this.buildGeometryPathEntry(
          normalizedRouteId,
          routeRecord,
          mainGeometry,
          true,
        ),
      ],
    };

    const estimatedLengthKm = estimateGeometryLengthKm(geometry);
    const stationAssociations = await this.resolvePlatformStations(
      server,
      dimensionContextForGeometry,
      stationsMap,
      selectedPlatforms,
    );

    const normalizedStations = stationAssociations.stations.map((station) =>
      this.normalizeStationRecord(station, server),
    );
    const normalizedPlatforms = selectedPlatforms.map((platform) =>
      this.normalizePlatformRecord(platform, server),
    );
    const normalizedDepots = await this.fetchDepotsForRoute(
      server,
      dimensionContextForGeometry,
      normalizedRouteId,
    );

    normalizedRoute.platformCount = orderedPlatformIds.length;
    if (!normalizedRoute.dimension) {
      normalizedRoute.dimension = this.extractDimensionFromContext(
        normalizedRoute.dimensionContext ??
          routeEntity.dimensionContext ??
          dimensionContextForGeometry,
      );
    }
    if (!normalizedRoute.dimensionContext) {
      normalizedRoute.dimensionContext =
        routeEntity.dimensionContext ?? dimensionContextForGeometry;
    }

    return {
      server: { id: server.id, name: server.displayName },
      railwayType: server.railwayMod,
      dimension:
        normalizedRoute.dimension ??
        this.extractDimensionFromContext(dimensionContextForGeometry),
      route: normalizedRoute,
      metadata: {
        lastUpdated:
          normalizedRoute.lastUpdated ??
          routeEntity.lastBeaconUpdatedAt?.getTime() ??
          routeEntity.updatedAt.getTime(),
        snapshotLength: null,
        lengthKm: estimatedLengthKm,
      },
      stations: normalizedStations,
      platforms: normalizedPlatforms,
      depots: normalizedDepots,
      operatorCompanyIds: [],
      builderCompanyIds: [],
      geometry,
      stops: this.buildStopSequence(
        orderedPlatformIds,
        platformMap,
        stationAssociations.platformStations,
      ),
    };
  }

  private buildQueryRowFromEntity(row: StoredRailwayEntity): QueryMtrEntityRow {
    return {
      entity_id: row.entityId,
      transport_mode: row.transportMode,
      name: row.name,
      color: row.color,
      file_path: row.filePath,
      last_updated:
        row.lastBeaconUpdatedAt?.getTime() ?? row.updatedAt.getTime(),
      payload: row.payload,
    };
  }

  private normalizeStoredRoute(
    row: TransportationRailwayRoute,
    server: BeaconServerRecord,
  ) {
    const queryRow = this.buildQueryRowFromEntity(row);
    return normalizeRouteRow(queryRow, server);
  }

  private normalizeStoredEntity(
    row: StoredRailwayEntity,
    server: BeaconServerRecord,
  ) {
    const queryRow = this.buildQueryRowFromEntity(row);
    return (
      normalizeEntity(queryRow, server) ??
      buildFallbackEntity(
        row.entityId,
        server,
        row.name,
        toNumber(row.color),
        row.transportMode ?? null,
        this.toJsonRecord(row.payload),
      )
    );
  }

  private buildRouteRecordFromEntity(
    row: TransportationRailwayRoute,
  ): RailwayRouteRecord | null {
    const payload = this.toJsonRecord(row.payload);
    if (!payload) {
      return null;
    }
    return {
      id: normalizeId(payload['id']) ?? row.entityId,
      name: readString(payload['name']) ?? row.name ?? null,
      color: toNumber(payload['color']) ?? row.color ?? null,
      transport_mode:
        readString(payload['transport_mode']) ?? row.transportMode ?? null,
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

  private resolveRouteDimensionContext(
    normalizedRoute: NormalizedRoute,
    entityDimensionContext: string | null,
    requestedDimension: string | null,
    mod: TransportationRailwayMod,
  ) {
    return (
      normalizedRoute.dimensionContext ??
      entityDimensionContext ??
      (normalizedRoute.dimension
        ? buildDimensionContextFromDimension(normalizedRoute.dimension, mod)
        : null) ??
      (requestedDimension
        ? buildDimensionContextFromDimension(requestedDimension, mod)
        : null)
    );
  }

  private extractDimensionFromContext(
    context: string | null | undefined,
  ): string | null {
    if (!context) {
      return null;
    }
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

  private async fetchPlatformsFromStorage(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    const where: Prisma.TransportationRailwayPlatformWhereInput = {
      serverId: server.id,
      railwayMod: server.railwayMod,
    };
    if (dimensionContext) {
      where.dimensionContext = dimensionContext;
    }
    const rows = await this.prisma.transportationRailwayPlatform.findMany({
      where,
    });
    const records: RailwayPlatformRecord[] = [];
    for (const row of rows) {
      const payload = this.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.buildPlatformRecordFromEntity(row, payload);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  private async fetchPlatformsByIds(
    server: BeaconServerRecord,
    platformIds: string[],
  ) {
    if (!platformIds.length) return [];
    const rows = await this.prisma.transportationRailwayPlatform.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        entityId: { in: platformIds },
      },
    });
    const records: RailwayPlatformRecord[] = [];
    for (const row of rows) {
      const payload = this.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.buildPlatformRecordFromEntity(row, payload);
      if (record) {
        records.push(record);
      }
    }
    // Sort by input order
    const map = new Map(records.map((r) => [r.id, r]));
    return platformIds
      .map((id) => map.get(id))
      .filter((r): r is RailwayPlatformRecord => !!r);
  }

  private async fetchStationsByIds(
    server: BeaconServerRecord,
    stationIds: string[],
  ) {
    if (!stationIds.length) return [];
    const rows = await this.prisma.transportationRailwayStation.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        entityId: { in: stationIds },
      },
    });
    const records: RailwayStationRecord[] = [];
    for (const row of rows) {
      const payload = this.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.buildStationRecordFromEntity(row.entityId, payload);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  private async fetchPlatformsForStation(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    stationId: string,
  ) {
    const normalizedStationId = normalizeId(stationId);
    if (!normalizedStationId) {
      return [] as RailwayPlatformRecord[];
    }
    const platforms = await this.fetchPlatformsFromStorage(
      server,
      dimensionContext,
    );
    return platforms.filter((platform) => {
      const associated = normalizeId(platform.station_id);
      return associated === normalizedStationId;
    });
  }

  private buildPlatformRecordFromEntity(
    row: TransportationRailwayPlatform,
    payload: Record<string, unknown>,
  ): RailwayPlatformRecord | null {
    return {
      id: normalizeId(payload['id']) ?? row.entityId,
      dimension_context:
        readString(payload['dimension_context']) ??
        readString(payload['dimensionContext']) ??
        row.dimensionContext ??
        null,
      name: readString(payload['name']) ?? row.name ?? null,
      color: toNumber(payload['color']) ?? row.color ?? null,
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

  private async fetchNormalizedRoutesByPlatformIds(
    server: BeaconServerRecord,
    platformIds: string[],
    dimensionContext?: string | null,
  ) {
    if (!platformIds.length) {
      return {
        routes: [] as NormalizedRoute[],
        platformRouteIds: new Map<string, string[]>(),
      };
    }
    const ids = new Set(
      platformIds.map((id) => normalizeId(id)).filter(Boolean),
    );
    if (!ids.size) {
      return {
        routes: [] as NormalizedRoute[],
        platformRouteIds: new Map<string, string[]>(),
      };
    }
    const fetch = async (ctx?: string | null) => {
      const rows = await this.prisma.transportationRailwayRoute.findMany({
        where: {
          serverId: server.id,
          railwayMod: server.railwayMod,
          ...(ctx ? { dimensionContext: ctx } : {}),
        },
      });
      const matched: TransportationRailwayRoute[] = [];
      const platformRouteIds = new Map<string, Set<string>>();
      for (const row of rows) {
        const record = this.buildRouteRecordFromEntity(row);
        const platformList = record?.platform_ids ?? [];
        if (!platformList?.length) continue;
        const normalizedPlatformIds = normalizeIdList(platformList);
        const hits = normalizedPlatformIds.filter((pid) => ids.has(pid));
        if (!hits.length) continue;
        matched.push(row);
        const routeId = normalizeId(record?.id) ?? row.entityId;
        if (!routeId) continue;
        for (const pid of hits) {
          const bucket = platformRouteIds.get(pid) ?? new Set<string>();
          bucket.add(routeId);
          platformRouteIds.set(pid, bucket);
        }
      }
      const routes = matched
        .map((row) => this.normalizeStoredRoute(row, server))
        .filter((route): route is NormalizedRoute => Boolean(route));
      return {
        routes,
        platformRouteIds: new Map(
          Array.from(platformRouteIds.entries()).map(([key, set]) => [
            key,
            Array.from(set.values()),
          ]),
        ),
      };
    };
    const scoped = await fetch(dimensionContext ?? null);
    if (scoped.routes.length) {
      return scoped;
    }
    if (dimensionContext) {
      return fetch(null);
    }
    return scoped;
  }

  private async fetchRoutesForDimension(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    const where: Prisma.TransportationRailwayRouteWhereInput = {
      serverId: server.id,
      railwayMod: server.railwayMod,
    };
    if (dimensionContext) {
      where.dimensionContext = dimensionContext;
    }
    const rows = await this.prisma.transportationRailwayRoute.findMany({
      where,
    });
    return rows
      .map((row) => this.buildRouteRecordFromEntity(row))
      .filter((record): record is RailwayRouteRecord => Boolean(record));
  }

  private async fetchNormalizedRoutesByIds(
    server: BeaconServerRecord,
    routeIds: string[],
    dimensionContext?: string | null,
  ) {
    if (!routeIds.length) {
      return [] as NormalizedRoute[];
    }
    const rows = await this.prisma.transportationRailwayRoute.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        entityId: { in: routeIds },
        ...(dimensionContext ? { dimensionContext } : {}),
      },
    });
    return rows
      .map((row) => this.normalizeStoredRoute(row, server))
      .filter((route): route is NormalizedRoute => Boolean(route));
  }

  private extractBounds(payload: Record<string, unknown> | null) {
    if (!payload) {
      return { xMin: null, xMax: null, zMin: null, zMax: null };
    }
    return {
      xMin: toNumber(payload['x_min']),
      xMax: toNumber(payload['x_max']),
      zMin: toNumber(payload['z_min']),
      zMax: toNumber(payload['z_max']),
    };
  }

  private transformLogRecord(
    record: Record<string, unknown>,
  ): RailwayRouteLogEntry {
    const newData = this.parseLogData(record['new_data']);
    const oldData = this.parseLogData(record['old_data']);
    return {
      id: toNumber(record['id']) ?? 0,
      timestamp: readString(record['timestamp']) ?? '',
      playerName: readString(record['player_name']),
      playerUuid: readString(record['player_uuid']),
      changeType: readString(record['change_type']),
      className: readString(record['class_name']),
      entryId: readString(record['entry_id']),
      entryName: readString(record['entry_name']),
      dimensionContext: readString(record['dimension_context']),
      sourceFilePath: readString(record['source_file_path']),
      sourceLine: toNumber(record['source_line']),
      newData,
      oldData,
    };
  }

  private parseLogData(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private async searchRouteLogsByKeyword(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    keyword: string,
    page: number,
    limit: number,
  ): Promise<RailwayRouteLogResult> {
    const sanitized = this.sanitizeLogSearchKeyword(keyword);
    if (!sanitized) {
      throw new BadRequestException('Invalid log keyword');
    }
    const likePattern = `%${sanitized}%`;
    const searchColumns = [
      'CAST(id AS TEXT)',
      "COALESCE(timestamp, '')",
      "COALESCE(player_name, '')",
      "COALESCE(player_uuid, '')",
      "COALESCE(class_name, '')",
      "COALESCE(entry_id, '')",
      "COALESCE(entry_name, '')",
      "COALESCE(position, '')",
      "COALESCE(change_type, '')",
      "COALESCE(old_data, '')",
      "COALESCE(new_data, '')",
      "COALESCE(source_file_path, '')",
      'CAST(source_line AS TEXT)',
      "COALESCE(dimension_context, '')",
    ];
    const searchClause = searchColumns
      .map((column) => `${column} LIKE '${likePattern}'`)
      .join(' OR ');
    const conditions: string[] = [];
    if (dimensionContext) {
      const escaped = this.escapeSqlLiteral(dimensionContext);
      conditions.push(
        `(dimension_context = '${escaped}' OR dimension_context LIKE '${escaped}/%')`,
      );
    }
    conditions.push(`(${searchClause})`);
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    const columnList = [
      'id',
      'timestamp',
      'player_name',
      'player_uuid',
      'class_name',
      'entry_id',
      'entry_name',
      'change_type',
      'dimension_context',
      'source_file_path',
      'source_line',
      'new_data',
      'old_data',
    ];
    const baseSql = `
      SELECT ${columnList.join(', ')}
      FROM mtr_logs
      ${whereClause}
    `;
    const dataSql = `
      ${baseSql}
      ORDER BY timestamp DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const countSql = `
      SELECT COUNT(*) AS total
      FROM mtr_logs
      ${whereClause}
    `;
    const countResponse = await emitBeacon<BeaconExecuteSqlResponse>(
      this.beaconPool,
      server,
      'execute_sql',
      {
        sql: countSql,
        maxRows: 1,
      },
    );
    if (!countResponse?.success) {
      const message =
        typeof countResponse?.error === 'string'
          ? countResponse.error
          : 'Failed to fetch route logs';
      throw new BadRequestException(message);
    }
    const total =
      toNumber(countResponse.rows?.[0]?.['total']) ??
      toNumber(countResponse.rows?.[0]?.total) ??
      0;
    const dataResponse = await emitBeacon<BeaconExecuteSqlResponse>(
      this.beaconPool,
      server,
      'execute_sql',
      {
        sql: dataSql,
        maxRows: limit,
      },
    );
    if (!dataResponse?.success) {
      const message =
        typeof dataResponse?.error === 'string'
          ? dataResponse.error
          : 'Failed to fetch route logs';
      throw new BadRequestException(message);
    }
    const entries = (dataResponse.rows ?? []).map((record) =>
      this.transformLogRecord(record),
    );
    return {
      server: { id: server.id, name: server.displayName },
      railwayType: server.railwayMod,
      total,
      page,
      pageSize: limit,
      entries,
    };
  }

  private sanitizeLogSearchKeyword(value: string) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return '';
    }
    const normalized = trimmed
      .replace(/--/g, ' ')
      .replace(/;/g, ' ')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 64);
    const escaped = normalized
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/[%_]/g, ' ');
    return escaped.trim();
  }

  private escapeSqlLiteral(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 256)
      .trim();
  }

  private buildIdCandidates(value: string | null | undefined) {
    const candidates = new Set<string>();
    const trimmed = value?.trim();
    if (trimmed) {
      candidates.add(trimmed);
      const numeric = normalizeId(toNumber(trimmed));
      if (numeric && numeric !== trimmed) {
        candidates.add(numeric);
      }
    }
    return candidates;
  }

  private async buildRouteGeometry(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    platforms: RailwayPlatformRecord[],
    stations: RailwayStationRecord[],
  ) {
    if (dimensionContext) {
      try {
        const geometry = await this.buildGeometryFromRails(
          server,
          dimensionContext,
          platforms,
        );
        if (geometry) {
          return geometry;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to build rail geometry for ${server.displayName} (${dimensionContext}): ${message}`,
        );
      }
    }
    return this.buildFallbackGeometry(platforms, stations);
  }

  private async buildRouteGeometryPreferSnapshot(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    routeId: string,
    platforms: RailwayPlatformRecord[],
    stations: RailwayStationRecord[],
  ) {
    const normalizedRouteId = routeId?.trim();
    if (dimensionContext && normalizedRouteId) {
      const snapshot =
        await this.prisma.transportationRailwayRouteGeometrySnapshot.findUnique(
          {
            where: {
              serverId_railwayMod_dimensionContext_routeEntityId: {
                serverId: server.id,
                railwayMod: server.railwayMod,
                dimensionContext,
                routeEntityId: normalizedRouteId,
              },
            },
            select: {
              status: true,
              geometry2d: true,
              pathNodes3d: true,
              pathEdges: true,
            },
          },
        );
      if (snapshot?.status === 'READY') {
        const nodes = Array.isArray(snapshot.pathNodes3d)
          ? (snapshot.pathNodes3d as Array<{
              x?: unknown;
              y?: unknown;
              z?: unknown;
            }>)
          : [];
        if (nodes.length >= 2) {
          const points = nodes
            .map((node) => ({
              x: Number(node.x),
              z: Number(node.z),
            }))
            .filter(
              (point): point is { x: number; z: number } =>
                Number.isFinite(point.x) && Number.isFinite(point.z),
            );
          const segments = Array.isArray(snapshot.pathEdges)
            ? (snapshot.pathEdges as RouteDetailResult['geometry']['segments'])
            : undefined;
          return {
            source: 'rails' as const,
            points,
            ...(segments?.length ? { segments } : {}),
          };
        }

        const rawPaths = (snapshot.geometry2d as Record<string, unknown>)?.[
          'paths'
        ];
        if (Array.isArray(rawPaths) && rawPaths.length) {
          const first = rawPaths[0];
          if (Array.isArray(first)) {
            const points = first
              .map((entry) => ({
                x: Number((entry as any)?.x),
                z: Number((entry as any)?.z),
              }))
              .filter(
                (point): point is { x: number; z: number } =>
                  Number.isFinite(point.x) && Number.isFinite(point.z),
              );
            if (points.length >= 2) {
              return {
                source: 'rails' as const,
                points,
              };
            }
          }
        }

        return this.buildFallbackGeometry(platforms, stations);
      }
    }
    return await this.buildRouteGeometry(
      server,
      dimensionContext,
      platforms,
      stations,
    );
  }

  private async buildGeometryFromRails(
    server: BeaconServerRecord,
    dimensionContext: string,
    platforms: RailwayPlatformRecord[],
  ) {
    const rawPlatformNodes = this.extractPlatformNodes(platforms);
    if (!rawPlatformNodes.length) {
      return null;
    }
    const railRows = await this.prisma.transportationRailwayRail.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        dimensionContext,
      },
      select: {
        entityId: true,
        payload: true,
      },
    });
    if (!railRows.length) {
      return null;
    }
    const graph = this.buildRailGraph(railRows);
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
      const failure = finder.getLastFailure();
      this.logger.warn(
        `Rail path not found for ${server.displayName} (${dimensionContext}). ` +
          `platforms=${platforms.length}, platformNodes=${rawPlatformNodes.length}, ` +
          `missingNodes=${snapped.missingNodes}, snappedNodes=${snapped.snappedNodes}, ` +
          `reason=${failure?.reason ?? 'unknown'}, segment=${failure?.segmentIndex ?? -1}, visits=${failure?.visits ?? 0}`,
      );
      return null;
    }
    const segments = this.includePlatformSegments(
      pathResult?.segments,
      platforms,
    );
    return {
      source: 'rails' as const,
      points: path.map((position) => ({ x: position.x, z: position.z })),
      segments: segments.length ? segments : undefined,
    };
  }

  private snapPlatformNodesToRailGraph(
    platformNodes: PlatformNode[],
    graph: RailGraph,
  ) {
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
    const result: PlatformNode[] = [];

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
            used.add(best.id);
            snappedPlatformNodes.push({ id: best.id, position: pos });
            snappedNodes += 1;
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

    return { nodes: result, missingNodes, snappedNodes };
  }

  private buildFallbackGeometry(
    platforms: RailwayPlatformRecord[],
    stations: RailwayStationRecord[],
  ) {
    const stationMap = new Map(
      stations.map((station) => [normalizeId(station.id), station]),
    );
    const points: Array<{ x: number; z: number }> = [];
    let source: 'platform-centers' | 'station-bounds' = 'platform-centers';

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

  private extractPlatformNodes(
    platforms: RailwayPlatformRecord[],
  ): PlatformNode[] {
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

  private buildStopSequence(
    orderedPlatformIds: string[],
    platformMap: Map<string | null, RailwayPlatformRecord>,
    platformStations: Map<string, RailwayStationRecord | null>,
  ): RouteDetailResult['stops'] {
    return orderedPlatformIds
      .map((platformId, index) => {
        const platform = platformMap.get(platformId);
        if (!platform) return null;
        const station = platformStations.get(platformId) ?? null;
        const platformCenter = this.computePlatformCenter(platform);
        const stationCenter = station
          ? this.computeStationCenter(station)
          : null;
        const bounds = station
          ? {
              xMin: station.x_min ?? null,
              xMax: station.x_max ?? null,
              zMin: station.z_min ?? null,
              zMax: station.z_max ?? null,
            }
          : null;
        const stationId = normalizeId(station?.id);
        return {
          order: index,
          platformId,
          platformName: readString(platform.name) ?? platform.name ?? null,
          stationId: stationId ?? null,
          stationName: station?.name ?? null,
          dwellTime: toNumber(platform.dwell_time),
          position: platformCenter ?? stationCenter,
          bounds,
        };
      })
      .filter((stop): stop is RouteDetailResult['stops'][number] =>
        Boolean(stop),
      );
  }

  private async resolvePlatformStations(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    stationMap: Map<string | null, RailwayStationRecord>,
    platforms: RailwayPlatformRecord[],
  ): Promise<{
    platformStations: Map<string, RailwayStationRecord | null>;
    stations: RailwayStationRecord[];
  }> {
    const resolvedMap = new Map(stationMap);

    const needsBoundsMatching = platforms.some(
      (platform) => !normalizeId(platform.station_id),
    );
    const cachedStations = needsBoundsMatching
      ? await this.fetchStationsWithBoundsCached(server, dimensionContext)
      : [];
    const cachedStationMap = new Map(
      cachedStations
        .map((station) => {
          const key = normalizeId(station.id);
          return key ? ([key, station] as const) : null;
        })
        .filter((entry): entry is readonly [string, RailwayStationRecord] =>
          Boolean(entry),
        ),
    );

    const stationList = (
      cachedStations.length
        ? [...Array.from(resolvedMap.values()), ...cachedStations]
        : Array.from(resolvedMap.values())
    ).filter((station) => this.stationHasBounds(station));

    const platformStations = new Map<string, RailwayStationRecord | null>();
    for (const platform of platforms) {
      const platformId = normalizeId(platform.id);
      if (!platformId) continue;
      const directId = normalizeId(platform.station_id);
      const directStation =
        directId != null
          ? (resolvedMap.get(directId) ??
            cachedStationMap.get(directId) ??
            null)
          : null;
      const station =
        directStation ?? this.matchStationByBounds(platform, stationList);
      if (station) {
        const key = normalizeId(station.id);
        if (key) {
          resolvedMap.set(key, station);
        }
      }
      platformStations.set(platformId, station ?? null);
    }
    const uniqueStations = Array.from(
      new Map(
        Array.from(platformStations.values())
          .filter((station): station is RailwayStationRecord =>
            Boolean(station),
          )
          .map((station) => [normalizeId(station.id), station]),
      ).values(),
    );
    return { platformStations, stations: uniqueStations };
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

    const reference = center ?? (pos1 ? { x: pos1.x, z: pos1.z } : null);
    let nearest: { station: RailwayStationRecord; distSq: number } | null =
      null;

    for (const station of stations) {
      if (!this.stationHasBounds(station)) {
        continue;
      }
      if (points.some((point) => this.isPointInsideStation(point, station))) {
        return station;
      }

      if (reference) {
        const stationCenter = this.computeStationCenter(station);
        if (stationCenter) {
          const dx = stationCenter.x - reference.x;
          const dz = stationCenter.z - reference.z;
          const distSq = dx * dx + dz * dz;
          if (!nearest || distSq < nearest.distSq) {
            nearest = { station, distSq };
          }
        }
      }
    }

    if (
      nearest &&
      nearest.distSq <=
        NEAREST_STATION_MAX_DISTANCE_BLOCKS *
          NEAREST_STATION_MAX_DISTANCE_BLOCKS
    ) {
      return nearest.station;
    }
    return null;
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

  private async fetchStationsFromStorage(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    const where: Prisma.TransportationRailwayStationWhereInput = {
      serverId: server.id,
      railwayMod: server.railwayMod,
    };
    if (dimensionContext) {
      where.dimensionContext = dimensionContext;
    }
    const rows = await this.prisma.transportationRailwayStation.findMany({
      where,
      select: {
        entityId: true,
        payload: true,
        name: true,
        color: true,
      },
    });
    const records: RailwayStationRecord[] = [];
    for (const row of rows) {
      const payload = this.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.buildStationRecordFromEntity(row.entityId, payload);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  private async fetchDepotsForRoute(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    routeId: string,
  ) {
    if (!dimensionContext) {
      return [] as NormalizedEntity[];
    }
    const rows = await this.prisma.transportationRailwayDepot.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        dimensionContext,
      },
      select: {
        entityId: true,
        payload: true,
        name: true,
        color: true,
        transportMode: true,
      },
    });
    const matches: NormalizedEntity[] = [];
    for (const row of rows) {
      const payload = this.toJsonRecord(row.payload);
      if (!payload) {
        continue;
      }
      const routeIds = this.extractRouteIds(payload);
      if (!routeIds.includes(routeId)) {
        continue;
      }
      const normalized =
        normalizeEntity(
          {
            entity_id: row.entityId,
            name: row.name ?? readString(payload['name']) ?? null,
            color: row.color ?? toNumber(payload['color']),
            transport_mode:
              row.transportMode ?? readString(payload['transport_mode']),
            payload,
          },
          server,
        ) ??
        buildFallbackEntity(
          row.entityId,
          server,
          row.name ?? readString(payload['name']) ?? null,
          row.color ?? toNumber(payload['color']),
          row.transportMode ?? readString(payload['transport_mode']),
          payload,
        );
      matches.push(normalized);
    }
    return matches;
  }

  private extractRouteIds(payload: Record<string, unknown>) {
    const raw = payload['route_ids'] ?? payload['routeIds'];
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw)) {
      return normalizeIdList(raw);
    }
    const single = normalizeId(raw);
    return single ? [single] : [];
  }

  private extractStationIds(payload: Record<string, unknown> | null) {
    if (!payload) {
      return [];
    }
    const raw = payload['station_ids'] ?? payload['stationIds'];
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw)) {
      return normalizeIdList(raw);
    }
    const single = normalizeId(raw);
    return single ? [single] : [];
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

  private toJsonRecord(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private buildStationsMap(records: RailwayStationRecord[]) {
    return new Map(records.map((record) => [normalizeId(record.id), record]));
  }

  private buildPlatformsMap(records: RailwayPlatformRecord[]) {
    return new Map(records.map((record) => [normalizeId(record.id), record]));
  }

  private async buildRouteGeometryPaths(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    normalizedRouteId: string,
    mainRoute: RailwayRouteRecord,
    allRoutes: RailwayRouteRecord[],
    platformMap: Map<string | null, RailwayPlatformRecord>,
    mainGeometry: RouteDetailResult['geometry'],
  ) {
    const paths: RouteDetailResult['geometry']['paths'] = [];
    paths.push(
      this.buildGeometryPathEntry(
        normalizedRouteId,
        mainRoute,
        mainGeometry,
        true,
      ),
    );
    const mainPlatformIds = normalizeIdList(mainRoute.platform_ids ?? []);
    const mainPlatformIdSet = new Set(mainPlatformIds);
    const mainStationIdSet = new Set(
      mainPlatformIds
        .map((platformId) => {
          const platform = platformMap.get(platformId) ?? null;
          return platform ? normalizeId(platform.station_id) : null;
        })
        .filter((stationId): stationId is string => Boolean(stationId)),
    );
    const candidates = this.findRelatedRoutes(
      mainRoute,
      allRoutes,
      normalizedRouteId,
    ).filter((route) => {
      const candidateIds = normalizeIdList(route.platform_ids ?? []);
      if (!candidateIds.length) {
        return false;
      }

      // Primary matching: identical platform ID set.
      // Rationale: some players model up/down as separate routes (possibly different stops/platforms).
      // In that case, merging them causes the UI to reuse the primary stop sequence, producing
      // missing/incorrect stops for the other direction. Only merge when the stop/platform set is
      // effectively the same and can be safely reversed.
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

      // Fallback matching: same station set (common for MTR where up/down use different platform IDs).
      if (!mainStationIdSet.size) {
        return false;
      }
      const candidateStationIds = candidateIds
        .map((platformId) => {
          const platform = platformMap.get(platformId) ?? null;
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
        platformMap,
      );
      if (!candidatePlatforms.length) {
        continue;
      }
      const candidateId =
        normalizeId(candidate.id) ?? `${normalizedRouteId}-alt-${altIndex}`;
      const geometry = await this.buildRouteGeometryPreferSnapshot(
        server,
        dimensionContext,
        candidateId,
        candidatePlatforms,
        [],
      );
      const pointCount = geometry.points?.length ?? 0;
      if (pointCount < 2) {
        continue;
      }
      altIndex += 1;
      paths.push(
        this.buildGeometryPathEntry(candidateId, candidate, geometry, false),
      );
    }
    return paths;
  }

  private buildGeometryPathEntry(
    routeId: string,
    route: RailwayRouteRecord | null,
    geometry: RouteDetailResult['geometry'],
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

  private normalizeStationRecord(
    record: RailwayStationRecord,
    server: BeaconServerRecord,
  ) {
    const entity =
      normalizeEntity(
        {
          entity_id: normalizeId(record.id) ?? undefined,
          name: record.name,
          color: record.color,
          transport_mode: record.transport_mode,
          payload: record as Record<string, unknown>,
        },
        server,
      ) ??
      buildFallbackEntity(
        normalizeId(record.id),
        server,
        record.name,
        toNumber(record.color),
        record.transport_mode ?? null,
        record as Record<string, unknown>,
      );
    return {
      ...entity,
      bounds: {
        xMin: record.x_min ?? null,
        xMax: record.x_max ?? null,
        zMin: record.z_min ?? null,
        zMax: record.z_max ?? null,
      },
      zone: record.zone ?? null,
    };
  }

  private normalizePlatformRecord(
    record: RailwayPlatformRecord,
    server: BeaconServerRecord,
  ) {
    const entity =
      normalizeEntity(
        {
          entity_id: normalizeId(record.id) ?? undefined,
          name: record.name,
          color: record.color,
          transport_mode: record.transport_mode,
          payload: record as Record<string, unknown>,
        },
        server,
      ) ??
      buildFallbackEntity(
        normalizeId(record.id),
        server,
        record.name,
        toNumber(record.color),
        record.transport_mode ?? null,
        record as Record<string, unknown>,
      );
    return {
      ...entity,
      stationId: normalizeId(record.station_id),
      dwellTime: record.dwell_time ?? null,
      pos1: decodeBlockPosition(record.pos_1),
      pos2: decodeBlockPosition(record.pos_2),
      routeIds: normalizeIdList(record.route_ids ?? []),
    };
  }

  async getRouteLogs(
    routeId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteLogQueryDto,
  ): Promise<RailwayRouteLogResult> {
    if (!routeId || !query?.serverId) {
      throw new BadRequestException('Route ID and serverId are required');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }
    const normalizedRouteId = routeId.trim();
    const routeRow = await this.fetchStoredEntityRow(
      server,
      'ROUTE',
      normalizedRouteId,
      query.dimension ?? null,
    );
    if (!routeRow) {
      throw new NotFoundException('Route not found');
    }
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
    const page = Math.max(Number(query.page) || 1, 1);
    const explicitContext = query.dimension
      ? buildDimensionContextFromDimension(query.dimension, server.railwayMod)
      : null;
    const dimensionContext =
      explicitContext ?? routeRow.dimensionContext ?? null;
    const rawSearch = query.search;
    const searchKeyword =
      typeof rawSearch === 'string' && rawSearch.trim().length > 0
        ? rawSearch.trim()
        : undefined;
    const effectiveSearch = searchKeyword ?? routeId;
    if (effectiveSearch) {
      return this.searchRouteLogsByKeyword(
        server,
        dimensionContext,
        effectiveSearch,
        page,
        limit,
      );
    }
    const payload: Record<string, unknown> = {
      entryId: normalizedRouteId,
      page,
      pageSize: limit,
      order: 'desc',
      orderColumn: 'timestamp',
    };
    if (dimensionContext) {
      payload.dimensionContext = dimensionContext;
    }
    const response = await emitBeacon<BeaconMtrLogsResponse>(
      this.beaconPool,
      server,
      'get_player_mtr_logs',
      payload,
    );
    if (!response?.success) {
      const message =
        typeof response?.['error'] === 'string'
          ? response['error']
          : 'Failed to fetch route logs';
      throw new BadRequestException(message);
    }
    const entries = (response.records ?? []).map((record) =>
      this.transformLogRecord(record ?? {}),
    );
    return {
      server: { id: server.id, name: server.displayName },
      railwayType: server.railwayMod,
      total: response.total ?? entries.length,
      page: response.page ?? page,
      pageSize: response.page_size ?? limit,
      entries,
    };
  }

  async getStationLogs(
    stationId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteLogQueryDto,
  ): Promise<RailwayRouteLogResult> {
    if (!stationId || !query?.serverId) {
      throw new BadRequestException('Station ID and serverId are required');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }
    const normalizedStationId = stationId.trim();
    const stationRow = await this.fetchStoredEntityRow(
      server,
      'STATION',
      normalizedStationId,
      query.dimension ?? null,
    );
    if (!stationRow) {
      throw new NotFoundException('Station not found');
    }
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
    const page = Math.max(Number(query.page) || 1, 1);
    const explicitContext = query.dimension
      ? buildDimensionContextFromDimension(query.dimension, server.railwayMod)
      : null;
    const dimensionContext =
      explicitContext ?? stationRow.dimensionContext ?? null;
    const rawSearch = query.search;
    const searchKeyword =
      typeof rawSearch === 'string' && rawSearch.trim().length > 0
        ? rawSearch.trim()
        : undefined;
    const effectiveSearch = searchKeyword ?? stationId;
    return this.searchRouteLogsByKeyword(
      server,
      dimensionContext,
      effectiveSearch,
      page,
      limit,
    );
  }

  async getDepotLogs(
    depotId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteLogQueryDto,
  ): Promise<RailwayRouteLogResult> {
    if (!depotId || !query?.serverId) {
      throw new BadRequestException('Depot ID and serverId are required');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }
    const normalizedDepotId = depotId.trim();
    const depotRow = await this.fetchStoredEntityRow(
      server,
      'DEPOT',
      normalizedDepotId,
      query.dimension ?? null,
    );
    if (!depotRow) {
      throw new NotFoundException('Depot not found');
    }
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
    const page = Math.max(Number(query.page) || 1, 1);
    const explicitContext = query.dimension
      ? buildDimensionContextFromDimension(query.dimension, server.railwayMod)
      : null;
    const dimensionContext =
      explicitContext ?? depotRow.dimensionContext ?? null;
    const rawSearch = query.search;
    const searchKeyword =
      typeof rawSearch === 'string' && rawSearch.trim().length > 0
        ? rawSearch.trim()
        : undefined;
    const effectiveSearch = searchKeyword ?? depotId;
    return this.searchRouteLogsByKeyword(
      server,
      dimensionContext,
      effectiveSearch,
      page,
      limit,
    );
  }

  private async fetchCompanyBindingsForEntity(params: {
    entityType: TransportationRailwayBindingEntityType;
    entityId: string;
    serverId: string;
    railwayMod: TransportationRailwayMod;
    dimensionContext: string | null;
  }) {
    const bindings =
      await this.prisma.transportationRailwayCompanyBinding.findMany({
        where: {
          entityType: params.entityType,
          entityId: params.entityId,
          serverId: params.serverId,
          railwayMod: params.railwayMod,
          dimensionContext: params.dimensionContext ?? null,
        },
        select: {
          companyId: true,
          bindingType: true,
        },
      });

    const operatorCompanyIds: string[] = [];
    const builderCompanyIds: string[] = [];

    for (const binding of bindings) {
      if (
        binding.bindingType === TransportationRailwayCompanyBindingType.OPERATOR
      ) {
        operatorCompanyIds.push(binding.companyId);
      } else if (
        binding.bindingType === TransportationRailwayCompanyBindingType.BUILDER
      ) {
        builderCompanyIds.push(binding.companyId);
      }
    }

    return {
      operatorCompanyIds,
      builderCompanyIds,
    };
  }

  private async fetchRouteSystems(routeRecordId: string) {
    const systemRoutes =
      await this.prisma.transportationRailwaySystemRoute.findMany({
        where: { routeId: routeRecordId },
        include: { system: true },
      });

    return systemRoutes.map((item) => ({
      id: item.system.id,
      name: item.system.name,
      englishName: item.system.englishName ?? null,
      logoAttachmentId: item.system.logoAttachmentId ?? null,
      logoUrl: item.system.logoAttachmentId
        ? buildPublicUrl(`/attachments/public/${item.system.logoAttachmentId}`)
        : null,
    }));
  }
}
