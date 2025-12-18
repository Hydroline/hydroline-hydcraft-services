import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { TransportationRailwayMod } from '@prisma/client';
import { RedisService } from '../../lib/redis/redis.service';
import { RailwayRouteDetailQueryDto } from '../dto/railway.dto';
import { TransportationRailwayRouteDetailService } from './railway-route-detail.service';

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

type RouteGeometryCacheValue = {
  paths: Array<Array<{ x: number; z: number }>>;
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number } | null;
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

export type StationRouteMapResponse =
  | { status: 'pending' }
  | { status: 'ready'; data: StationRouteMapPayload };

const DEFAULT_READY_TTL_MS = 60 * 60 * 1000;
const DEFAULT_INFLIGHT_TTL_MS = 60 * 1000;
const DEFAULT_ERROR_TTL_MS = 30 * 1000;

@Injectable()
export class TransportationRailwayStationMapService {
  constructor(
    private readonly routeDetailService: TransportationRailwayRouteDetailService,
    private readonly redis: RedisService,
  ) {}

  async getStationRouteMap(
    stationId: string,
    railwayType: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<StationRouteMapResponse> {
    const normalizedStationId = stationId?.trim();
    const serverId = query?.serverId?.trim();
    if (!normalizedStationId || !serverId) {
      throw new BadRequestException('stationId and serverId are required');
    }

    const dimension = query.dimension?.trim() || null;

    const keyBase = this.buildKeyBase({
      stationId: normalizedStationId,
      serverId,
      railwayType,
      dimension,
    });

    const readyKey = `${keyBase}:ready`;
    const inflightKey = `${keyBase}:inflight`;
    const errorKey = `${keyBase}:error`;

    const cached = await this.redis.get<StationRouteMapPayload>(readyKey);
    if (cached) {
      return { status: 'ready', data: cached };
    }

    const cachedError = await this.redis.get<{ message: string }>(errorKey);
    if (cachedError?.message) {
      throw new InternalServerErrorException(cachedError.message);
    }

    const inflight = await this.redis.get<boolean>(inflightKey);
    if (inflight) {
      return { status: 'pending' };
    }

    await this.redis.set(inflightKey, true, DEFAULT_INFLIGHT_TTL_MS);
    void this.buildAndCacheStationRouteMap({
      stationId: normalizedStationId,
      serverId,
      railwayType,
      dimension,
      readyKey,
      inflightKey,
      errorKey,
    });

    return { status: 'pending' };
  }

  private buildKeyBase(input: {
    stationId: string;
    serverId: string;
    railwayType: TransportationRailwayMod;
    dimension: string | null;
  }) {
    const dim = input.dimension ?? '';
    return `railway:station-map:${input.serverId}:${input.railwayType}:${dim}:${input.stationId}`;
  }

  private async buildAndCacheStationRouteMap(input: {
    stationId: string;
    serverId: string;
    railwayType: TransportationRailwayMod;
    dimension: string | null;
    readyKey: string;
    inflightKey: string;
    errorKey: string;
  }) {
    try {
      const detail = await this.safeGetStationDetail({
        stationId: input.stationId,
        serverId: input.serverId,
        railwayType: input.railwayType,
        dimension: input.dimension,
      });

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
        stops: Array<{
          stationId: string | null;
          x: number;
          z: number;
          label: string;
        }>;
      };

      const groupMap = new Map<string, GroupBucket[]>();

      for (const route of detail.routes ?? []) {
        const routeId = route.id?.trim();
        if (!routeId) continue;
        const groupKey = this.extractRouteGroupKey(route.name);
        if (!groupKey) continue;

        const routeGeometry = await this.getOrComputeRouteGeometry({
          routeId,
          serverId: input.serverId,
          railwayType: input.railwayType,
          dimension: input.dimension,
        });

        const buckets = groupMap.get(groupKey) ?? [];
        const selected = this.selectOrCreateBucket({
          groupKey,
          buckets,
          routeColor: route.color ?? null,
          routeBounds: routeGeometry?.bounds ?? null,
        });

        if (selected.color == null && route.color != null) {
          selected.color = route.color;
        }
        selected.routeIds.add(routeId);

        if (routeGeometry?.paths?.length) {
          selected.paths.push(...routeGeometry.paths);
        }
        if (routeGeometry?.stops?.length) {
          this.mergeStopMarkers(selected, routeGeometry.stops);
        }
        selected.bounds = this.mergeBounds(
          selected.bounds,
          routeGeometry?.bounds ?? null,
        );

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
        }));

      groups.sort((a, b) => a.displayName.localeCompare(b.displayName));

      const payload: StationRouteMapPayload = {
        stationId: input.stationId,
        serverId: input.serverId,
        railwayType: input.railwayType,
        dimension: detail.station?.dimension ?? input.dimension,
        generatedAt: Date.now(),
        groups,
      };

      const ttl = this.resolveReadyTtl();
      await this.redis.set(input.readyKey, payload, ttl);
    } catch (error) {
      const message = this.toEnglishErrorMessage(error);
      await this.redis.set(input.errorKey, { message }, this.resolveErrorTtl());
    } finally {
      await this.redis.del(input.inflightKey);
    }
  }

  private extractRouteGroupKey(value: string | null | undefined) {
    if (!value) return null;
    const primary = value.split('||')[0] ?? '';
    const first = primary.split('|')[0] ?? '';
    const trimmed = first.trim();
    return trimmed || null;
  }

  private resolveReadyTtl() {
    const raw = process.env.RAILWAY_STATION_MAP_TTL_MS?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return DEFAULT_READY_TTL_MS;
  }

  private resolveErrorTtl() {
    const raw = process.env.RAILWAY_STATION_MAP_ERROR_TTL_MS?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return DEFAULT_ERROR_TTL_MS;
  }

  private buildRouteGeometryCacheKey(input: {
    routeId: string;
    serverId: string;
    railwayType: TransportationRailwayMod;
    dimension: string | null;
  }) {
    const dim = input.dimension ?? '';
    return `railway:route-geometry:${input.serverId}:${input.railwayType}:${dim}:${input.routeId}`;
  }

  private async getOrComputeRouteGeometry(input: {
    routeId: string;
    serverId: string;
    railwayType: TransportationRailwayMod;
    dimension: string | null;
  }): Promise<RouteGeometryCacheValue | null> {
    const cacheKey = this.buildRouteGeometryCacheKey(input);
    const cached = await this.redis.get<RouteGeometryCacheValue>(cacheKey);
    if (cached?.paths?.length) {
      return cached;
    }

    const detail = await this.safeGetRouteDetail(input);
    const geometry = detail.geometry;
    const paths: Array<Array<{ x: number; z: number }>> = [];
    const stops: RouteGeometryCacheValue['stops'] = [];

    const geoPaths = geometry?.paths?.length
      ? geometry.paths
      : geometry?.points?.length
        ? [
            {
              points: geometry.points,
            },
          ]
        : [];

    for (const entry of geoPaths) {
      const points = entry?.points ?? [];
      if (!points.length) continue;
      paths.push(points.map((point) => ({ x: point.x, z: point.z })));
    }

    for (const stop of detail.stops ?? []) {
      const position = stop?.position;
      if (!position) continue;
      const label = (
        stop.stationName ||
        stop.platformName ||
        stop.platformId ||
        ''
      ).trim();
      if (!label) continue;
      stops.push({
        stationId: stop.stationId ?? null,
        x: position.x,
        z: position.z,
        label: label.split('|')[0],
      });
    }

    const bounds = this.computeBoundsFromPaths(paths);

    const ttl = this.resolveReadyTtl();
    const value: RouteGeometryCacheValue = { paths, bounds, stops };
    await this.redis.set(cacheKey, value, ttl);
    return value;
  }

  private resolveMergeMaxDistanceBlocks() {
    const raw =
      process.env.RAILWAY_STATION_MAP_GROUP_MERGE_MAX_DISTANCE?.trim();
    const parsed = raw ? Number.parseFloat(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    // Default: 1500 blocks. Big enough for typical branches, small enough to avoid merging unrelated copies.
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
      stops: Array<{
        stationId: string | null;
        x: number;
        z: number;
        label: string;
      }>;
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
      stops: [] as Array<{
        stationId: string | null;
        x: number;
        z: number;
        label: string;
      }>,
    };
    input.buckets.push(bucket);
    return bucket;
  }

  private mergeStopMarkers(
    bucket: {
      stops: Array<{
        stationId: string | null;
        x: number;
        z: number;
        label: string;
      }>;
    },
    incoming: Array<{
      stationId: string | null;
      x: number;
      z: number;
      label: string;
    }>,
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

  private async safeGetStationDetail(input: {
    stationId: string;
    serverId: string;
    railwayType: TransportationRailwayMod;
    dimension: string | null;
  }) {
    try {
      return await this.routeDetailService.getStationDetail(
        input.stationId,
        input.railwayType,
        {
          serverId: input.serverId,
          dimension: input.dimension ?? undefined,
        },
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Station not found');
      }
      if (error instanceof BadRequestException) {
        throw new BadRequestException('Invalid request');
      }
      throw new InternalServerErrorException('Failed to load station detail');
    }
  }

  private async safeGetRouteDetail(input: {
    routeId: string;
    serverId: string;
    railwayType: TransportationRailwayMod;
    dimension: string | null;
  }) {
    try {
      return await this.routeDetailService.getRouteDetail(
        input.routeId,
        input.railwayType,
        {
          serverId: input.serverId,
          dimension: input.dimension ?? undefined,
        },
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Route not found');
      }
      if (error instanceof BadRequestException) {
        throw new BadRequestException('Invalid request');
      }
      throw new InternalServerErrorException('Failed to load route detail');
    }
  }

  private toEnglishErrorMessage(error: unknown) {
    if (error instanceof NotFoundException) {
      return error.message || 'Not found';
    }
    if (error instanceof BadRequestException) {
      return error.message || 'Bad Request';
    }
    if (error instanceof InternalServerErrorException) {
      return error.message || 'Internal Server Error';
    }
    return error instanceof Error
      ? error.message || 'Station map generation failed'
      : 'Station map generation failed';
  }
}
