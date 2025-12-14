import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  HydrolineBeaconEvent,
  HydrolineBeaconPoolService,
} from '../../lib/hydroline-beacon';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPublicUrl } from '../../lib/shared/url';
import {
  CreateRailwayBannerDto,
  RailwayRouteDetailQueryDto,
  UpdateRailwayBannerDto,
} from '../dto/railway.dto';

const BEACON_TIMEOUT_MS = 10000;
const DEFAULT_RECOMMENDATION_COUNT = 4;

const bannerInclude =
  Prisma.validator<Prisma.TransportationRailwayBannerInclude>()({
    attachment: { select: { id: true, isPublic: true } },
  });

type BeaconServerRecord = {
  id: string;
  displayName: string;
  beaconEndpoint: string;
  beaconKey: string;
  beaconRequestTimeoutMs?: number | null;
  beaconMaxRetry?: number | null;
};

type QueryMtrEntityRow = {
  entity_id?: string;
  transport_mode?: string | null;
  name?: string | null;
  color?: number | null;
  file_path?: string | null;
  last_updated?: number | null;
  payload?: unknown;
};

type QueryMtrEntitiesResponse = {
  success?: boolean;
  category?: string;
  rows?: QueryMtrEntityRow[];
  limit?: number;
  offset?: number;
  truncated?: boolean;
};

type RailwayStationRecord = {
  id?: unknown;
  name?: string | null;
  color?: number | null;
  transport_mode?: string | null;
  x_min?: number | null;
  x_max?: number | null;
  z_min?: number | null;
  z_max?: number | null;
  zone?: number | null;
};

type RailwayPlatformRecord = {
  id?: unknown;
  name?: string | null;
  color?: number | null;
  transport_mode?: string | null;
  station_id?: unknown;
  pos_1?: unknown;
  pos_2?: unknown;
  dwell_time?: number | null;
  route_ids?: unknown[] | null;
};

type RailwayRouteRecord = {
  id?: unknown;
  name?: string | null;
  color?: number | null;
  transport_mode?: string | null;
  platform_ids?: unknown[] | null;
  custom_destinations?: unknown[] | null;
  route_type?: string | null;
  circular_state?: string | null;
  light_rail_route_number?: string | null;
};

type RailwayDepotRecord = {
  id?: unknown;
  name?: string | null;
  color?: number | null;
  transport_mode?: string | null;
  route_ids?: unknown[] | null;
};

type RailwaySnapshotEntry = {
  dimension?: string | null;
  length?: number | null;
  payload?: {
    routes?: RailwayRouteRecord[];
    stations?: RailwayStationRecord[];
    platforms?: RailwayPlatformRecord[];
    depots?: RailwayDepotRecord[];
    last_deployed?: number | null;
  };
};

type RailwaySnapshotResponse = {
  success?: boolean;
  snapshots?: RailwaySnapshotEntry[];
};

type NormalizedEntity = {
  id: string;
  name: string | null;
  color: number | null;
  transportMode: string | null;
  lastUpdated: number | null;
  dimension: string | null;
  dimensionContext: string | null;
  filePath: string | null;
  payload: Record<string, unknown> | null;
  server: {
    id: string;
    name: string;
  };
};

type NormalizedRoute = NormalizedEntity & {
  platformCount: number | null;
};

type OverviewStats = {
  serverCount: number;
  routes: number;
  stations: number;
  depots: number;
};

type OverviewLatest = {
  depots: NormalizedEntity[];
  stations: NormalizedEntity[];
  routes: NormalizedRoute[];
};

type BannerWithAttachment = Prisma.TransportationRailwayBannerGetPayload<{
  include: typeof bannerInclude;
}>;

type SerializedBanner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  attachmentId: string | null;
  ctaLabel: string | null;
  ctaLink: string | null;
  isPublished: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  imageUrl: string | null;
};

type RouteDetailResult = {
  server: { id: string; name: string };
  dimension: string | null;
  route: NormalizedRoute & { payload: Record<string, unknown> | null };
  metadata: {
    lastDeployed: number | null;
    lastUpdated: number | null;
    snapshotLength: number | null;
  };
  stations: Array<
    NormalizedEntity & {
      bounds: {
        xMin: number | null;
        xMax: number | null;
        zMin: number | null;
        zMax: number | null;
      };
      zone: number | null;
    }
  >;
  platforms: Array<
    NormalizedEntity & {
      stationId: string | null;
      dwellTime: number | null;
      pos1: { x: number; y: number; z: number } | null;
      pos2: { x: number; y: number; z: number } | null;
    }
  >;
  depots: NormalizedEntity[];
  geometry: {
    source: 'platform-centers' | 'station-bounds';
    points: Array<{ x: number; z: number }>;
  };
};

@Injectable()
export class TransportationRailwayService {
  private readonly logger = new Logger(TransportationRailwayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beaconPool: HydrolineBeaconPoolService,
  ) {}

  async getOverview() {
    const [banners, servers] = await Promise.all([
      this.getPublishedBanners(),
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
    const recommendations: NormalizedRoute[] = [];

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
          recommendations.push(...summary.recommendationCandidates);
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

    const pickedRecommendations = this.pickRecommendations(recommendations);

    return {
      banners,
      stats,
      latest,
      recommendations: pickedRecommendations,
      warnings,
    };
  }

  async getRouteDetail(routeId: string, query: RailwayRouteDetailQueryDto) {
    if (!routeId || !query?.serverId) {
      throw new BadRequestException('路线 ID 与 serverId 必填');
    }
    const server = await this.getBeaconServerById(query.serverId);
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

    const orderedPlatformIds = this.normalizeIdList(
      snapshot.route.platform_ids ?? [],
    );
    const selectedPlatforms = orderedPlatformIds
      .map((platformId) => platforms.get(platformId))
      .filter((item): item is RailwayPlatformRecord => Boolean(item));

    const usedStationIds = new Set(
      selectedPlatforms
        .map((platform) => this.normalizeId(platform.station_id))
        .filter((id): id is string => Boolean(id)),
    );
    const selectedStations = Array.from(usedStationIds)
      .map((id) => stations.get(id))
      .filter((station): station is RailwayStationRecord => Boolean(station));

    const depots = (snapshot.payload?.depots ?? []).filter((depot) =>
      (depot.route_ids ?? [])
        .map((id) => this.normalizeId(id))
        .includes(normalizedRouteId),
    );

    const geometry = this.buildRouteGeometry(
      selectedPlatforms,
      selectedStations,
    );

    const normalizedRouteMeta = this.normalizeRouteRow(routeMetaRow, server);
    const normalizedRoutePayload = this.toCleanPayload(routeMetaRow?.payload);

    const normalizedRoute: NormalizedRoute & {
      payload: Record<string, unknown> | null;
    } = {
      ...(normalizedRouteMeta ??
        this.normalizeSnapshotRoute(snapshot.route, server)),
      payload: normalizedRoutePayload ?? this.toCleanPayload(snapshot.route),
      lastUpdated: normalizedRouteMeta?.lastUpdated ?? null,
      filePath: normalizedRouteMeta?.filePath ?? null,
      dimension: normalizedRouteMeta?.dimension ?? snapshot.dimension ?? null,
      dimensionContext:
        normalizedRouteMeta?.dimensionContext ??
        this.buildDimensionContextFromDimension(snapshot.dimension),
      platformCount: orderedPlatformIds.length,
    };

    const normalizedStations = selectedStations.map((station) =>
      this.normalizeStationRecord(station, server),
    );
    const normalizedPlatforms = selectedPlatforms.map((platform) =>
      this.normalizePlatformRecord(platform, server),
    );
    const normalizedDepots = depots.map((depot) =>
      this.normalizeEntity(
        {
          ...depot,
          entity_id: this.normalizeId(depot.id) ?? undefined,
          transport_mode: depot.transport_mode,
          name: depot.name,
          color: depot.color,
        },
        server,
      ),
    );

    const detail: RouteDetailResult = {
      server: { id: server.id, name: server.displayName },
      dimension: normalizedRoute.dimension,
      route: normalizedRoute,
      metadata: {
        lastDeployed: snapshot.payload?.last_deployed ?? null,
        lastUpdated: normalizedRoute.lastUpdated ?? null,
        snapshotLength: snapshot.length ?? null,
      },
      stations: normalizedStations,
      platforms: normalizedPlatforms,
      depots: normalizedDepots.filter(Boolean) as NormalizedEntity[],
      geometry,
    };

    return detail;
  }

  async adminListBanners() {
    const banners = await this.prisma.transportationRailwayBanner.findMany({
      include: bannerInclude,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return banners.map((banner) => this.serializeBanner(banner));
  }

  async createBanner(userId: string, dto: CreateRailwayBannerDto) {
    await this.ensureAttachmentPublic(dto.attachmentId);
    const created = await this.prisma.transportationRailwayBanner.create({
      data: {
        title: dto.title?.trim() || null,
        subtitle: dto.subtitle?.trim() || null,
        description: dto.description?.trim() || null,
        attachmentId: dto.attachmentId,
        ctaLabel: dto.ctaLabel?.trim() || null,
        ctaLink: dto.ctaLink?.trim() || null,
        isPublished: dto.isPublished ?? true,
        displayOrder: dto.displayOrder ?? 0,
        createdById: userId,
        updatedById: userId,
      },
      include: bannerInclude,
    });
    return this.serializeBanner(created);
  }

  async updateBanner(id: string, userId: string, dto: UpdateRailwayBannerDto) {
    const existing = await this.prisma.transportationRailwayBanner.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Banner 不存在');
    }
    if (dto.attachmentId) {
      await this.ensureAttachmentPublic(dto.attachmentId);
    }
    const updated = await this.prisma.transportationRailwayBanner.update({
      where: { id },
      data: {
        title:
          dto.title !== undefined ? dto.title?.trim() || null : existing.title,
        subtitle:
          dto.subtitle !== undefined
            ? dto.subtitle?.trim() || null
            : existing.subtitle,
        description:
          dto.description !== undefined
            ? dto.description?.trim() || null
            : existing.description,
        attachmentId:
          dto.attachmentId !== undefined
            ? dto.attachmentId || null
            : existing.attachmentId,
        ctaLabel:
          dto.ctaLabel !== undefined
            ? dto.ctaLabel?.trim() || null
            : existing.ctaLabel,
        ctaLink:
          dto.ctaLink !== undefined
            ? dto.ctaLink?.trim() || null
            : existing.ctaLink,
        isPublished:
          dto.isPublished !== undefined
            ? dto.isPublished
            : existing.isPublished,
        displayOrder:
          dto.displayOrder !== undefined
            ? dto.displayOrder
            : existing.displayOrder,
        updatedById: userId,
      },
      include: bannerInclude,
    });
    return this.serializeBanner(updated);
  }

  async deleteBanner(id: string) {
    await this.prisma.transportationRailwayBanner.delete({ where: { id } });
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
    recommendationCandidates: NormalizedRoute[];
  }> {
    const [snapshotRes, depotRows, stationRows, routeRows] = await Promise.all([
      this.fetchRailwaySnapshot(server),
      this.queryMtrEntities(server, 'depots', { limit: 6 }),
      this.queryMtrEntities(server, 'stations', { limit: 6 }),
      this.queryMtrEntities(server, 'routes', { limit: 8 }),
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
      .map((row) => this.normalizeRouteRow(row, server))
      .filter((row): row is NormalizedRoute => Boolean(row));
    return {
      server,
      routeCount: counts.routes,
      stationCount: counts.stations,
      depotCount: counts.depots,
      latestDepots: (depotRows.rows ?? [])
        .map((row) => this.normalizeEntity(row, server))
        .filter((row): row is NormalizedEntity => Boolean(row)),
      latestStations: (stationRows.rows ?? [])
        .map((row) => this.normalizeEntity(row, server))
        .filter((row): row is NormalizedEntity => Boolean(row)),
      latestRoutes: normalizedRoutes,
      recommendationCandidates: normalizedRoutes,
    };
  }

  private pickRecommendations(routes: NormalizedRoute[]) {
    if (!routes.length) return [];
    const deduped = new Map<string, NormalizedRoute>();
    for (const route of routes) {
      const key = `${route.server.id}:${route.id}`;
      if (!deduped.has(key)) {
        deduped.set(key, route);
      }
    }
    return Array.from(deduped.values())
      .sort((a, b) => {
        const left = a.lastUpdated ?? 0;
        const right = b.lastUpdated ?? 0;
        if (left === right) {
          return (b.platformCount ?? 0) - (a.platformCount ?? 0);
        }
        return right - left;
      })
      .slice(0, DEFAULT_RECOMMENDATION_COUNT);
  }

  private async fetchRailwaySnapshot(server: BeaconServerRecord) {
    const response = await this.emitBeacon<RailwaySnapshotResponse>(
      server,
      'get_mtr_railway_snapshot',
      {},
    );
    if (!response?.snapshots) {
      return { snapshots: [] };
    }
    return response;
  }

  private async fetchRouteSnapshot(
    server: BeaconServerRecord,
    routeId: string,
    dimension?: string | null,
  ) {
    const response = await this.fetchRailwaySnapshot(server);
    const normalizedId = routeId;
    const snapshots = response.snapshots ?? [];
    if (dimension) {
      const entry = snapshots.find((snap) => snap.dimension === dimension);
      if (entry) {
        const route = (entry.payload?.routes ?? []).find(
          (item) => this.normalizeId(item.id) === normalizedId,
        );
        if (route) {
          return { ...entry, route };
        }
      }
    }
    for (const entry of snapshots) {
      const route = (entry.payload?.routes ?? []).find(
        (item) => this.normalizeId(item.id) === normalizedId,
      );
      if (route) {
        return { ...entry, route };
      }
    }
    return null;
  }

  private async fetchSingleRouteRow(
    server: BeaconServerRecord,
    routeId: string,
    dimension?: string | null,
  ) {
    const filters: Record<string, unknown> = { entity_id: routeId };
    const dimensionContext = this.buildDimensionContextFromDimension(dimension);
    const response = await this.queryMtrEntities(server, 'routes', {
      limit: 1,
      filters,
      dimensionContext,
    });
    return response.rows?.[0] ?? null;
  }

  private buildRouteGeometry(
    platforms: RailwayPlatformRecord[],
    stations: RailwayStationRecord[],
  ) {
    const stationMap = new Map(
      stations.map((station) => [this.normalizeId(station.id), station]),
    );
    const points: Array<{ x: number; z: number }> = [];
    let source: 'platform-centers' | 'station-bounds' = 'platform-centers';

    for (const platform of platforms) {
      const center = this.computePlatformCenter(platform);
      if (center) {
        points.push(center);
        continue;
      }
      const stationId = this.normalizeId(platform.station_id);
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

  private computePlatformCenter(platform: RailwayPlatformRecord) {
    const pos1 = this.decodeBlockPosition(platform.pos_1);
    const pos2 = this.decodeBlockPosition(platform.pos_2);
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

  private decodeBlockPosition(
    value: unknown,
  ): { x: number; y: number; z: number } | null {
    if (value == null) return null;
    try {
      const parsed = this.toBigInt(value);
      if (parsed == null) return null;
      const x = Number(parsed >> 38n);
      const y = Number((parsed << 52n) >> 52n);
      const z = Number((parsed << 26n) >> 38n);
      return { x, y, z };
    } catch (error) {
      return null;
    }
  }

  private toBigInt(value: unknown): bigint | null {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return BigInt(Math.trunc(value));
    }
    if (typeof value === 'string' && value.trim().length) {
      return BigInt(value);
    }
    return null;
  }

  private buildStationsMap(records: RailwayStationRecord[]) {
    return new Map(
      records.map((record) => [this.normalizeId(record.id), record]),
    );
  }

  private buildPlatformsMap(records: RailwayPlatformRecord[]) {
    return new Map(
      records.map((record) => [this.normalizeId(record.id), record]),
    );
  }

  private normalizeStationRecord(
    record: RailwayStationRecord,
    server: BeaconServerRecord,
  ) {
    const entity =
      this.normalizeEntity(
        {
          entity_id: this.normalizeId(record.id) ?? undefined,
          name: record.name,
          color: record.color,
          transport_mode: record.transport_mode,
          payload: record as Record<string, unknown>,
        },
        server,
      ) ??
      this.buildFallbackEntity(
        this.normalizeId(record.id),
        server,
        record.name,
        this.toNumber(record.color),
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
      this.normalizeEntity(
        {
          entity_id: this.normalizeId(record.id) ?? undefined,
          name: record.name,
          color: record.color,
          transport_mode: record.transport_mode,
          payload: record as Record<string, unknown>,
        },
        server,
      ) ??
      this.buildFallbackEntity(
        this.normalizeId(record.id),
        server,
        record.name,
        this.toNumber(record.color),
        record.transport_mode ?? null,
        record as Record<string, unknown>,
      );
    return {
      ...entity,
      stationId: this.normalizeId(record.station_id),
      dwellTime: record.dwell_time ?? null,
      pos1: this.decodeBlockPosition(record.pos_1),
      pos2: this.decodeBlockPosition(record.pos_2),
    };
  }

  private normalizeRouteRow(
    row: QueryMtrEntityRow | null,
    server: BeaconServerRecord,
  ) {
    if (!row?.entity_id) return null;
    const entity = this.normalizeEntity(row, server);
    if (!entity) return null;
    const payload = this.toCleanPayload(row.payload);
    const payloadPlatformIds = (payload as { platform_ids?: unknown[] } | null)
      ?.platform_ids;
    return {
      ...entity,
      platformCount: Array.isArray(payloadPlatformIds)
        ? payloadPlatformIds.length
        : null,
      payload,
    };
  }

  private normalizeSnapshotRoute(
    route: RailwayRouteRecord,
    server: BeaconServerRecord,
  ): NormalizedRoute {
    const entity =
      this.normalizeEntity(
        {
          entity_id: this.normalizeId(route.id) ?? undefined,
          name: route.name,
          color: route.color,
          transport_mode: route.transport_mode,
          payload: route as Record<string, unknown>,
        },
        server,
      ) ??
      this.buildFallbackEntity(
        this.normalizeId(route.id),
        server,
        route.name ?? null,
        this.toNumber(route.color),
        route.transport_mode ?? null,
        route as Record<string, unknown>,
      );
    return {
      ...entity,
      platformCount: route.platform_ids?.length ?? null,
      payload: route as Record<string, unknown>,
    };
  }

  private normalizeEntity(
    row: QueryMtrEntityRow,
    server: BeaconServerRecord,
  ): NormalizedEntity | null {
    if (!row?.entity_id) return null;
    const payload = this.toCleanPayload(row.payload);
    const dimension = this.extractDimensionFromPath(row.file_path ?? null);
    const payloadName = this.readPayloadString(payload, 'name');
    const payloadColor = this.readPayloadNumber(payload, 'color');
    const payloadMode = this.readPayloadString(payload, 'transport_mode');
    const color = this.toNumber(row.color) ?? payloadColor;
    const transportMode = row.transport_mode ?? payloadMode;

    return {
      id: row.entity_id,
      name: row.name ?? payloadName,
      color,
      transportMode,
      lastUpdated: this.toNumber(row.last_updated),
      dimension,
      dimensionContext: this.buildDimensionContextFromPath(
        row.file_path ?? null,
      ),
      filePath: row.file_path ?? null,
      payload,
      server: { id: server.id, name: server.displayName },
    };
  }

  private buildFallbackEntity(
    id: string | null,
    server: BeaconServerRecord,
    name?: string | null,
    color?: number | null,
    transportMode?: string | null,
    payload?: Record<string, unknown> | null,
  ): NormalizedEntity {
    const fallbackId =
      id ??
      `${server.id}:${(name || 'entity').toString().replace(/\s+/g, '').slice(0, 24)}`;
    return {
      id: fallbackId,
      name: name ?? null,
      color: color ?? null,
      transportMode: transportMode ?? null,
      lastUpdated: null,
      dimension: null,
      dimensionContext: null,
      filePath: null,
      payload: payload ?? null,
      server: { id: server.id, name: server.displayName },
    };
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toCleanPayload(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        return parsed;
      } catch (error) {
        return null;
      }
    }
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return null;
  }

  private normalizeIdList(values: unknown[]) {
    return values
      .map((value) => this.normalizeId(value))
      .filter((value): value is string => Boolean(value));
  }

  private extractDimensionFromPath(path: string | null) {
    if (!path) return null;
    const segments = path.split('/');
    const idx = segments.findIndex((segment) => segment === 'mtr');
    if (idx < 0 || idx + 2 >= segments.length) return null;
    const namespace = segments[idx + 1];
    const dimension = segments[idx + 2];
    if (!namespace || !dimension) return null;
    return `${namespace}:${dimension}`;
  }

  private buildDimensionContextFromPath(path: string | null) {
    if (!path) return null;
    const segments = path.split('/');
    const idx = segments.findIndex((segment) => segment === 'mtr');
    if (idx < 0 || idx + 2 >= segments.length) return null;
    return `mtr/${segments[idx + 1]}/${segments[idx + 2]}`;
  }

  private buildDimensionContextFromDimension(dimension?: string | null) {
    if (!dimension) return null;
    const [namespace, value] = dimension.split(':');
    if (!namespace || !value) return null;
    return `mtr/${namespace}/${value}`;
  }

  private readPayloadString(
    payload: Record<string, unknown> | null,
    key: string,
  ): string | null {
    if (!payload) return null;
    const value = payload[key];
    return typeof value === 'string' ? value : null;
  }

  private readPayloadNumber(
    payload: Record<string, unknown> | null,
    key: string,
  ): number | null {
    if (!payload) return null;
    const value = payload[key];
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
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
      }));
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
    };
  }

  private async getPublishedBanners() {
    const rows = await this.prisma.transportationRailwayBanner.findMany({
      where: { isPublished: true },
      include: bannerInclude,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.serializeBanner(row));
  }

  private serializeBanner(row: BannerWithAttachment): SerializedBanner {
    return {
      id: row.id,
      title: row.title ?? null,
      subtitle: row.subtitle ?? null,
      description: row.description ?? null,
      attachmentId: row.attachmentId ?? null,
      ctaLabel: row.ctaLabel ?? null,
      ctaLink: row.ctaLink ?? null,
      isPublished: row.isPublished,
      displayOrder: row.displayOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      imageUrl:
        row.attachment && row.attachment.isPublic
          ? buildPublicUrl(`/attachments/public/${row.attachment.id}`)
          : null,
    };
  }

  private async ensureAttachmentPublic(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, isPublic: true },
    });
    if (!attachment) {
      throw new NotFoundException('附件不存在');
    }
    if (!attachment.isPublic) {
      throw new BadRequestException('请先将附件设置为公开可访问');
    }
  }

  private async queryMtrEntities(
    server: BeaconServerRecord,
    category: string,
    options: {
      limit?: number;
      filters?: Record<string, unknown>;
      dimensionContext?: string | null;
    },
  ) {
    const payload: Record<string, unknown> = {
      category,
      limit: options.limit ?? 20,
      offset: 0,
      orderBy: 'last_updated',
      orderDir: 'DESC',
      includePayload: true,
    };
    if (options.filters) {
      payload.filters = options.filters;
    }
    if (options.dimensionContext) {
      payload.dimensionContext = options.dimensionContext;
    }
    const response = await this.emitBeacon<QueryMtrEntitiesResponse>(
      server,
      'query_mtr_entities',
      payload,
    );
    response.rows = response.rows ?? [];
    return response;
  }

  private async emitBeacon<T>(
    server: BeaconServerRecord,
    event: HydrolineBeaconEvent,
    payload: Record<string, unknown>,
  ) {
    const client =
      this.beaconPool.getClientOrNull(server.id) ??
      this.beaconPool.getOrCreate({
        serverId: server.id,
        endpoint: server.beaconEndpoint,
        key: server.beaconKey,
        timeoutMs: server.beaconRequestTimeoutMs ?? undefined,
        maxRetry: server.beaconMaxRetry ?? undefined,
      });
    return client.emit<T>(event, payload, {
      timeoutMs: server.beaconRequestTimeoutMs ?? BEACON_TIMEOUT_MS,
    });
  }
}
