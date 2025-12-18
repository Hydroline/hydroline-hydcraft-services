import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TransportationRailwayDepot,
  TransportationRailwayMod,
  TransportationRailwayPlatform,
  TransportationRailwayRoute,
  TransportationRailwayStation,
} from '@prisma/client';
import { HydrolineBeaconPoolService } from '../../lib/hydroline-beacon';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RailwayRouteDetailQueryDto,
  RailwayRouteLogQueryDto,
} from '../dto/railway.dto';
import { BeaconServerRecord } from './railway-common';
import { emitBeacon } from './railway-beacon.util';
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
} from './railway-types';

const BLOCKS_PER_KM = 1000;

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
} from './railway-normalizer';
import { DEFAULT_RAILWAY_TYPE } from './railway-type.config';
import {
  BlockPosition,
  decodeBlockPosition,
  encodeBlockPosition,
} from '../utils/block-pos.util';
import type {
  PlatformNode,
  RailConnectionMetadata,
  RailCurveParameters,
  RailGeometrySegment,
  RailGraph,
  RailGraphNode,
  PreferredRailCurve,
} from './railway-graph.types';
import { MtrRouteFinder } from '../../lib/mtr/mtr-route-finder';

@Injectable()
export class TransportationRailwayRouteDetailService {
  private readonly logger = new Logger(
    TransportationRailwayRouteDetailService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly beaconPool: HydrolineBeaconPoolService,
  ) {}

  async getRouteDetail(
    routeId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RouteDetailResult> {
    if (!routeId || !query?.serverId) {
      throw new BadRequestException('路线 ID 与 serverId 必填');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException('指定的铁路类型与服务器配置不匹配');
    }
    const normalizedRouteId = routeId.trim();

    const routeEntity = await this.fetchStoredEntityRow(
      server,
      'ROUTE',
      normalizedRouteId,
      query.dimension ?? null,
    );
    if (!routeEntity) {
      throw new NotFoundException('未找到对应线路');
    }
    const routeRecord = this.buildRouteRecordFromEntity(routeEntity);
    if (!routeRecord) {
      throw new NotFoundException('路线数据缺失');
    }

    const normalizedRoute = this.normalizeStoredRoute(routeEntity, server);
    if (!normalizedRoute) {
      throw new NotFoundException('无法解析路线数据');
    }

    const orderedPlatformIds = normalizeIdList(routeRecord.platform_ids ?? []);

    const dimensionContextForGeometry = this.resolveRouteDimensionContext(
      normalizedRoute,
      routeEntity.dimensionContext ?? null,
      query.dimension ?? null,
      server.railwayMod,
    );

    const allPlatforms = await this.fetchPlatformsFromStorage(
      server,
      dimensionContextForGeometry,
    );
    const platforms = this.buildPlatformsMap(allPlatforms);
    const selectedPlatforms = orderedPlatformIds
      .map((platformId) => platforms.get(platformId) ?? null)
      .filter((item): item is RailwayPlatformRecord => Boolean(item));

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

    const siblingRoutes = await this.fetchRoutesForDimension(
      server,
      dimensionContextForGeometry,
    );

    const mainGeometry = await this.buildRouteGeometry(
      server,
      dimensionContextForGeometry,
      selectedPlatforms,
      [],
    );

    const geometryPaths = await this.buildRouteGeometryPaths(
      server,
      dimensionContextForGeometry,
      normalizedRouteId,
      routeRecord,
      siblingRoutes,
      platforms,
      mainGeometry,
    );

    const geometry: RouteDetailResult['geometry'] = {
      ...mainGeometry,
      paths: geometryPaths,
    };

    const estimatedLengthKm = estimateGeometryLengthKm(geometry);

    const stations = this.buildStationsMap(
      await this.fetchStationsFromStorage(server, dimensionContextForGeometry),
    );
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
      geometry,
      stops: this.buildStopSequence(
        orderedPlatformIds,
        platforms,
        stationAssociations.platformStations,
      ),
    };

    return detail;
  }

  async getStationDetail(
    stationId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RailwayStationDetailResult> {
    if (!stationId || !query?.serverId) {
      throw new BadRequestException('车站 ID 与 serverId 必填');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException('指定的铁路类型与服务器配置不匹配');
    }
    const normalizedStationId = stationId.trim();
    const stationRow = await this.fetchStoredEntityRow(
      server,
      'STATION',
      normalizedStationId,
      query.dimension ?? null,
    );
    if (!stationRow) {
      throw new NotFoundException('未找到对应车站');
    }
    const stationPayload = this.toJsonRecord(stationRow.payload);
    if (!stationPayload) {
      throw new NotFoundException('车站数据缺失');
    }
    const stationRecord = this.buildStationRecordFromEntity(
      stationRow.entityId,
      stationPayload,
    );
    if (!stationRecord) {
      throw new NotFoundException('车站数据缺失');
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
    const platformRecords = await this.fetchPlatformsForStation(
      server,
      dimensionContext,
      normalizedStationId,
    );
    const normalizedPlatforms = platformRecords.map((platform) =>
      this.normalizePlatformRecord(platform, server),
    );
    const routeIds = new Set<string>();
    const platformDetails = normalizedPlatforms.map((platform) => {
      (platform.routeIds ?? []).forEach((routeId) => {
        if (routeId) routeIds.add(routeId);
      });
      return platform;
    });
    const routes = await this.fetchNormalizedRoutesByIds(
      server,
      Array.from(routeIds),
      dimensionContext,
    );
    return {
      server: { id: server.id, name: server.displayName },
      railwayType: server.railwayMod,
      station: normalizedStation,
      platforms: platformDetails,
      routes,
      metadata: {
        lastUpdated:
          stationRow.lastBeaconUpdatedAt?.getTime() ??
          stationRow.updatedAt.getTime(),
      },
    };
  }

  async getDepotDetail(
    depotId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RailwayDepotDetailResult> {
    if (!depotId || !query?.serverId) {
      throw new BadRequestException('车厂 ID 与 serverId 必填');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException('指定的铁路类型与服务器配置不匹配');
    }
    const normalizedDepotId = depotId.trim();
    const depotRow = await this.fetchStoredEntityRow(
      server,
      'DEPOT',
      normalizedDepotId,
      query.dimension ?? null,
    );
    if (!depotRow) {
      throw new NotFoundException('未找到对应车厂');
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
    const frequencies = Array.isArray(depotPayload?.['frequencies'])
      ? (depotPayload!['frequencies'] as unknown[])
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
    return {
      server: { id: server.id, name: server.displayName },
      railwayType: server.railwayMod,
      depot: depotDetail,
      routes,
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
      throw new NotFoundException('服务器未启用 Beacon');
    }
    if (!server.beaconEndpoint || !server.beaconKey) {
      throw new BadRequestException('Beacon 配置不完整');
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
      name: readString(payload['name']) ?? row.name ?? null,
      color: toNumber(payload['color']) ?? row.color ?? null,
      transport_mode:
        readString(payload['transport_mode']) ?? row.transportMode ?? null,
      station_id: payload['station_id'],
      pos_1: payload['pos_1'] ?? payload['pos1'] ?? null,
      pos_2: payload['pos_2'] ?? payload['pos2'] ?? null,
      dwell_time: toNumber(payload['dwell_time']),
      route_ids: Array.isArray(payload['route_ids'])
        ? payload['route_ids']
        : null,
    };
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
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch (error) {
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
      throw new BadRequestException('日志关键词无效');
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
          : '无法获取线路日志';
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
          : '无法获取线路日志';
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

  private async buildGeometryFromRails(
    server: BeaconServerRecord,
    dimensionContext: string,
    platforms: RailwayPlatformRecord[],
  ) {
    const platformNodes = this.extractPlatformNodes(platforms);
    if (!platformNodes.length) {
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
      source: 'rails' as const,
      points: path.map((position) => ({ x: position.x, z: position.z })),
      segments: segments.length ? segments : undefined,
    };
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
      return value.filter((item): item is Record<string, unknown> => {
        return Boolean(item && typeof item === 'object');
      }) as Array<Record<string, unknown>>;
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
    if (dimensionContext) {
      const storedStations = await this.fetchStationsFromStorage(
        server,
        dimensionContext,
      );
      for (const station of storedStations) {
        const key = normalizeId(station.id);
        if (key && !resolvedMap.has(key)) {
          resolvedMap.set(key, station);
        }
      }
    }
    const stationList = Array.from(resolvedMap.values()).filter((station) =>
      this.stationHasBounds(station),
    );
    const platformStations = new Map<string, RailwayStationRecord | null>();
    for (const platform of platforms) {
      const platformId = normalizeId(platform.id);
      if (!platformId) continue;
      const directId = normalizeId(platform.station_id);
      const directStation =
        directId != null ? (resolvedMap.get(directId) ?? null) : null;
      let station =
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
    const mainPlatformIdSet = new Set(
      normalizeIdList(mainRoute.platform_ids ?? []),
    );
    const candidates = this.findRelatedRoutes(
      mainRoute,
      allRoutes,
      normalizedRouteId,
    ).filter((route) => {
      const candidateIds = normalizeIdList(route.platform_ids ?? []);
      if (!candidateIds.length || !mainPlatformIdSet.size) {
        return false;
      }
      return candidateIds.some((platformId) =>
        mainPlatformIdSet.has(platformId),
      );
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
      const geometry = await this.buildRouteGeometry(
        server,
        dimensionContext,
        candidatePlatforms,
        [],
      );
      const pointCount = geometry.points?.length ?? 0;
      if (pointCount < 2) {
        continue;
      }
      const candidateId =
        normalizeId(candidate.id) ?? `${normalizedRouteId}-alt-${altIndex}`;
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
      throw new BadRequestException('路线 ID 与 serverId 必填');
    }
    const server = await this.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException('指定的铁路类型与服务器配置不匹配');
    }
    const normalizedRouteId = routeId.trim();
    const routeRow = await this.fetchStoredEntityRow(
      server,
      'ROUTE',
      normalizedRouteId,
      query.dimension ?? null,
    );
    if (!routeRow) {
      throw new NotFoundException('未找到对应线路');
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
          : '无法获取线路日志';
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
}
