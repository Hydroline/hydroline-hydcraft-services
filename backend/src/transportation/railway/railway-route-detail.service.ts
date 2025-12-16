import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TransportationRailwayEntityCategory,
  TransportationRailwayMod,
} from '@prisma/client';
import { HydrolineBeaconPoolService } from '../../lib/hydroline-beacon';
import { PrismaService } from '../../prisma/prisma.service';
import { RailwayRouteDetailQueryDto } from '../dto/railway.dto';
import {
  fetchRailwaySnapshot,
  queryRailwayEntities,
} from './railway-beacon.util';
import { BeaconServerRecord } from './railway-common';
import type {
  NormalizedEntity,
  NormalizedRoute,
  RailwayPlatformRecord,
  RailwaySnapshotEntry,
  RailwayStationRecord,
  RouteDetailResult,
} from './railway-types';
import {
  buildDimensionContextFromDimension,
  buildFallbackEntity,
  normalizeEntity,
  normalizeId,
  normalizeIdList,
  normalizePayloadRecord,
  normalizeRouteRow,
  normalizeSnapshotRoute,
  readString,
  toBoolean,
  toCleanPayload,
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

    const routeMetaRow = await this.fetchSingleRouteRow(
      server,
      normalizedRouteId,
      query.dimension ?? null,
    );

    const snapshot = await this.fetchRouteSnapshot(
      server,
      normalizedRouteId,
      query.dimension ?? null,
    );

    if (!snapshot) {
      throw new NotFoundException('未在快照中找到对应线路');
    }

    const stations = this.buildStationsMap(snapshot.payload?.stations ?? []);
    const platforms = this.buildPlatformsMap(snapshot.payload?.platforms ?? []);

    const orderedPlatformIds = normalizeIdList(
      snapshot.route.platform_ids ?? [],
    );
    const selectedPlatforms = orderedPlatformIds
      .map((platformId) => platforms.get(platformId))
      .filter((item): item is RailwayPlatformRecord => Boolean(item));

    const depots = (snapshot.payload?.depots ?? []).filter((depot) =>
      (depot.route_ids ?? [])
        .map((id) => normalizeId(id))
        .includes(normalizedRouteId),
    );

    const normalizedRouteMeta = routeMetaRow
      ? normalizeRouteRow(routeMetaRow, server)
      : null;
    const normalizedRoutePayload = toCleanPayload(routeMetaRow?.payload);

    const normalizedRoute: NormalizedRoute & {
      payload: Record<string, unknown> | null;
    } = {
      ...(normalizedRouteMeta ??
        normalizeSnapshotRoute(snapshot.route, server)),
      payload: normalizedRoutePayload ?? toCleanPayload(snapshot.route),
      lastUpdated: normalizedRouteMeta?.lastUpdated ?? null,
      filePath: normalizedRouteMeta?.filePath ?? null,
      dimension: normalizedRouteMeta?.dimension ?? snapshot.dimension ?? null,
      dimensionContext:
        normalizedRouteMeta?.dimensionContext ??
        buildDimensionContextFromDimension(
          snapshot.dimension,
          server.railwayMod,
        ),
      platformCount: orderedPlatformIds.length,
    };

    const dimensionContextForGeometry =
      normalizedRoute.dimensionContext ??
      buildDimensionContextFromDimension(
        normalizedRoute.dimension,
        server.railwayMod,
      ) ??
      buildDimensionContextFromDimension(snapshot.dimension, server.railwayMod);

    const geometry = await this.buildRouteGeometry(
      server,
      dimensionContextForGeometry,
      selectedPlatforms,
      [],
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
    const normalizedDepots = depots
      .map((depot) =>
        normalizeEntity(
          {
            ...depot,
            entity_id: normalizeId(depot.id) ?? undefined,
            transport_mode: depot.transport_mode,
            name: depot.name,
            color: depot.color,
          },
          server,
        ),
      )
      .filter((item): item is NormalizedEntity => Boolean(item));

    const detail: RouteDetailResult = {
      server: { id: server.id, name: server.displayName },
      railwayType: server.railwayMod,
      dimension: normalizedRoute.dimension,
      route: normalizedRoute,
      metadata: {
        lastDeployed: snapshot.payload?.last_deployed ?? null,
        lastUpdated: normalizedRoute.lastUpdated ?? null,
        snapshotLength: snapshot.length ?? null,
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

  private async fetchRouteSnapshot(
    server: BeaconServerRecord,
    routeId: string,
    dimension?: string | null,
  ) {
    const response = await fetchRailwaySnapshot(this.beaconPool, server);
    const normalizedId = routeId;
    const candidateIds = this.buildIdCandidates(normalizedId);
    const snapshots = response.snapshots ?? [];
    if (dimension) {
      const entry = snapshots.find((snap) => snap.dimension === dimension);
      if (entry) {
        const route = this.findRouteInSnapshot(entry, candidateIds);
        if (route) {
          return { ...entry, route };
        }
      }
    }
    for (const entry of snapshots) {
      const route = this.findRouteInSnapshot(entry, candidateIds);
      if (route) {
        return { ...entry, route };
      }
    }
    return null;
  }

  private buildIdCandidates(routeId: string) {
    const candidates = new Set<string>();
    const trimmed = routeId?.trim();
    if (trimmed) {
      candidates.add(trimmed);
      const truncated = normalizeId(toNumber(trimmed));
      if (truncated && truncated !== trimmed) {
        candidates.add(truncated);
      }
    }
    return candidates;
  }

  private findRouteInSnapshot(
    entry: RailwaySnapshotEntry,
    candidateIds: Set<string>,
  ) {
    return (entry.payload?.routes ?? []).find((item) => {
      const currentId = normalizeId(item.id);
      return currentId ? candidateIds.has(currentId) : false;
    });
  }

  private async fetchSingleRouteRow(
    server: BeaconServerRecord,
    routeId: string,
    dimension?: string | null,
  ) {
    const filters: Record<string, unknown> = { entity_id: routeId };
    const dimensionContext = buildDimensionContextFromDimension(
      dimension,
      server.railwayMod,
    );
    const response = await queryRailwayEntities(
      this.beaconPool,
      server,
      server.railwayMod,
      'routes',
      {
        limit: 1,
        filters,
        dimensionContext,
      },
    );
    return response.rows?.[0] ?? null;
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
    const railRows = await this.prisma.transportationRailwayEntity.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        category: TransportationRailwayEntityCategory.RAIL,
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
    let graph = this.buildRailGraph(railRows);
    if (!graph?.positions.size) {
      const fallbackRails = await this.fetchRailsFromBeacon(
        server,
        dimensionContext,
      );
      if (fallbackRails.length) {
        graph = this.buildRailGraph(fallbackRails);
      }
    }
    if (!graph) {
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

  private async fetchRailsFromBeacon(
    server: BeaconServerRecord,
    dimensionContext: string,
  ) {
    const rows: Array<{ entityId: string; payload: Prisma.JsonValue }> = [];
    let offset = 0;
    let truncated = false;
    do {
      const response = await queryRailwayEntities(
        this.beaconPool,
        server,
        server.railwayMod,
        'rails',
        {
          limit: 200,
          offset,
          dimensionContext,
        },
      );
      const batch =
        response.rows?.map((row) => ({
          entityId:
            normalizeId(row.entity_id ?? row.node_pos) ??
            `${dimensionContext}:${offset}`,
          payload:
            (row.payload as Prisma.JsonValue | null) ??
            ({} as Prisma.JsonObject),
        })) ?? [];
      rows.push(...batch);
      truncated = Boolean(response?.truncated);
      offset += response.rows?.length ?? 0;
    } while (truncated && offset < 2000);
    return rows;
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
    if (!dimensionContext) {
      return [] as RailwayStationRecord[];
    }
    const rows = await this.prisma.transportationRailwayEntity.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        category: TransportationRailwayEntityCategory.STATION,
        dimensionContext,
      },
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
    };
  }
}
