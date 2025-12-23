import { Injectable } from '@nestjs/common';
import { Prisma, TransportationRailwayMod } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildDimensionContextFromDimension,
  normalizeEntity,
  normalizeRouteRow,
} from '../utils/railway-normalizer';
import {
  extractRouteBaseKey,
  extractRouteDisplayName,
  extractRouteVariantLabel,
} from '../utils/route-name';
import type {
  NormalizedEntity,
  NormalizedRoute,
  QueryMtrEntityRow,
} from '../types/railway-types';

type RoutePreviewBounds = {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
};

type RoutePreviewPath = {
  points: Array<{ x: number; z: number }>;
  color: number | null;
};

type RoutePreviewGroup = {
  key: string;
  item: NormalizedRoute;
  routes: NormalizedRoute[];
  serverId: string;
  railwayMod: TransportationRailwayMod;
  dimensionContext: string | null;
};

type RailwayListPagination = {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type RailwayListResponse<TItem> = {
  items: TItem[];
  pagination: RailwayListPagination;
};

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function buildQueryRowFromStoredEntity(row: {
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
    last_updated: row.lastBeaconUpdatedAt?.getTime() ?? row.updatedAt.getTime(),
    payload:
      row.payload &&
      typeof row.payload === 'object' &&
      !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : null,
  };
}

function extractPlatformCount(payload: Prisma.JsonValue): number | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return null;
  const record = payload as Record<string, unknown>;
  const raw = record['platform_ids'];
  const rawCamel = record['platformIds'];
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(rawCamel)
      ? rawCamel
      : null;
  if (!list) return null;
  return list.length;
}

function parseSnapshotBounds(
  value: Prisma.JsonValue | null | undefined,
): RoutePreviewBounds | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const xMin = Number(record.xMin);
  const xMax = Number(record.xMax);
  const zMin = Number(record.zMin);
  const zMax = Number(record.zMax);
  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(zMin) ||
    !Number.isFinite(zMax)
  ) {
    return null;
  }
  return { xMin, xMax, zMin, zMax };
}

function computeBoundsFromPoints(
  paths: Array<Array<{ x: number; z: number }>>,
): RoutePreviewBounds | null {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const path of paths) {
    for (const point of path) {
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

function mergeBounds(
  a: RoutePreviewBounds | null,
  b: RoutePreviewBounds | null,
): RoutePreviewBounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    xMin: Math.min(a.xMin, b.xMin),
    xMax: Math.max(a.xMax, b.xMax),
    zMin: Math.min(a.zMin, b.zMin),
    zMax: Math.max(a.zMax, b.zMax),
  };
}

function colorToHex(value: number | null) {
  if (value == null || Number.isNaN(value)) return '#94a3b8';
  const sanitized = Math.max(0, Math.floor(value));
  return `#${sanitized.toString(16).padStart(6, '0').slice(-6)}`;
}

function buildSvgPath(points: Array<{ x: number; z: number }>) {
  if (points.length < 2) return null;
  const [first, ...rest] = points;
  const commands = [`M ${first.x} ${first.z}`];
  for (const point of rest) {
    commands.push(`L ${point.x} ${point.z}`);
  }
  return commands.join(' ');
}

function computePathLength(points: Array<{ x: number; z: number }>) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    length += Math.hypot(curr.x - prev.x, curr.z - prev.z);
  }
  return length;
}

function resamplePath(points: Array<{ x: number; z: number }>, count = 32) {
  if (points.length <= 1) return points;
  if (count <= 2) return [points[0], points[points.length - 1]];
  const total = computePathLength(points);
  if (!Number.isFinite(total) || total <= 0) return points;

  const step = total / (count - 1);
  const samples: Array<{ x: number; z: number }> = [];
  let target = 0;
  let acc = 0;
  samples.push(points[0]);

  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const seg = Math.hypot(end.x - start.x, end.z - start.z);
    if (seg <= 0) continue;
    while (acc + seg >= target + step) {
      const t = (target + step - acc) / seg;
      samples.push({
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      });
      target += step;
      if (samples.length >= count) {
        return samples;
      }
    }
    acc += seg;
  }

  if (samples.length < count) {
    samples.push(points[points.length - 1]);
  }
  return samples;
}

function computePathDistance(
  a: Array<{ x: number; z: number }>,
  b: Array<{ x: number; z: number }>,
) {
  const len = Math.min(a.length, b.length);
  if (!len) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let i = 0; i < len; i += 1) {
    total += Math.hypot(a[i].x - b[i].x, a[i].z - b[i].z);
  }
  return total / len;
}

function buildPreviewSvg(input: {
  paths: RoutePreviewPath[];
  bounds: RoutePreviewBounds | null;
}) {
  const rawPaths = input.paths.filter((path) => path.points.length >= 2);
  if (!rawPaths.length) return null;

  const bounds =
    input.bounds ?? computeBoundsFromPoints(rawPaths.map((p) => p.points));
  if (!bounds) return null;

  const width = Math.max(1, bounds.xMax - bounds.xMin);
  const height = Math.max(1, bounds.zMax - bounds.zMin);
  const baseSize = Math.max(width, height);
  const padding = baseSize * 0.08;
  const centerX = (bounds.xMin + bounds.xMax) / 2;
  const centerZ = (bounds.zMin + bounds.zMax) / 2;
  const viewBox = [
    centerX - baseSize / 2 - padding,
    centerZ - baseSize / 2 - padding,
    baseSize + padding * 2,
    baseSize + padding * 2,
  ]
    .map((value) => Number(value.toFixed(2)))
    .join(' ');
  const strokeWidth = 4;

  const similarityThreshold = baseSize * 0.08;
  const sampleCount = 32;
  const clusters: Array<{
    sum: Array<{ x: number; z: number }>;
    count: number;
    colorCounts: Map<string, number>;
  }> = [];

  for (const path of rawPaths) {
    const samples = resamplePath(path.points, sampleCount);
    let picked: (typeof clusters)[number] | null = null;
    for (const cluster of clusters) {
      const avg = cluster.sum.map((point) => ({
        x: point.x / cluster.count,
        z: point.z / cluster.count,
      }));
      const distance = computePathDistance(avg, samples);
      if (distance <= similarityThreshold) {
        picked = cluster;
        break;
      }
    }
    if (!picked) {
      const sum = samples.map((point) => ({ ...point }));
      const colorCounts = new Map<string, number>();
      colorCounts.set(colorToHex(path.color), 1);
      clusters.push({ sum, count: 1, colorCounts });
      continue;
    }
    for (let i = 0; i < picked.sum.length; i += 1) {
      picked.sum[i].x += samples[i]?.x ?? 0;
      picked.sum[i].z += samples[i]?.z ?? 0;
    }
    picked.count += 1;
    const colorKey = colorToHex(path.color);
    picked.colorCounts.set(
      colorKey,
      (picked.colorCounts.get(colorKey) ?? 0) + 1,
    );
  }

  const mergedPaths = clusters.map((cluster) => {
    const avgPoints = cluster.sum.map((point) => ({
      x: point.x / cluster.count,
      z: point.z / cluster.count,
    }));
    let color = '#94a3b8';
    let best = 0;
    for (const [key, count] of cluster.colorCounts.entries()) {
      if (count > best) {
        best = count;
        color = key;
      }
    }
    return { points: avgPoints, color };
  });

  const segments = mergedPaths
    .map((path) => {
      const d = buildSvgPath(path.points);
      if (!d) return null;
      return `<path d="${d}" stroke="${path.color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`;
    })
    .filter(Boolean)
    .join('');

  if (!segments) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" fill="none" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${segments}</svg>`;
}

function selectPrimaryRoute(routes: NormalizedRoute[]) {
  if (routes.length <= 1) return routes[0] ?? null;
  const candidates = routes.filter(
    (route) => !extractRouteVariantLabel(route.name),
  );
  const list = candidates.length ? candidates : routes;
  return [...list].sort(
    (a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0),
  )[0];
}

@Injectable()
export class TransportationRailwayListService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveServerNameMap(serverIds: string[]) {
    if (!serverIds.length) return new Map<string, string>();
    const rows = await this.prisma.minecraftServer.findMany({
      where: { id: { in: serverIds } },
      select: { id: true, displayName: true },
    });
    return new Map(rows.map((row) => [row.id, row.displayName] as const));
  }

  async listServers() {
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
        transportationRailwayMod: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.displayName,
      railwayType: row.transportationRailwayMod ?? TransportationRailwayMod.MTR,
    }));
  }

  async listRoutes(params: {
    serverId?: string | null;
    railwayType?: TransportationRailwayMod | null;
    dimension?: string | null;
    transportMode?: string | null;
    search?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<RailwayListResponse<NormalizedRoute>> {
    const page = clampInt(params.page ?? 1, 1, 10_000);
    const pageSize = clampInt(params.pageSize ?? 20, 5, 100);

    const where: Prisma.TransportationRailwayRouteWhereInput = {
      ...(params.serverId ? { serverId: params.serverId } : {}),
      ...(params.railwayType ? { railwayMod: params.railwayType } : {}),
      ...(params.transportMode
        ? {
            transportMode: {
              contains: params.transportMode,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(params.dimension
        ? {
            dimensionContext: buildDimensionContextFromDimension(
              params.dimension,
              params.railwayType ?? TransportationRailwayMod.MTR,
            ),
          }
        : {}),
    };

    if (params.search?.trim()) {
      const keyword = params.search.trim();
      where.OR = [
        { entityId: { contains: keyword, mode: 'insensitive' } },
        { name: { contains: keyword, mode: 'insensitive' } },
        { transportMode: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.transportationRailwayRoute.findMany({
      where,
      orderBy: [{ lastBeaconUpdatedAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        serverId: true,
        railwayMod: true,
        entityId: true,
        dimensionContext: true,
        transportMode: true,
        name: true,
        color: true,
        filePath: true,
        payload: true,
        lastBeaconUpdatedAt: true,
        updatedAt: true,
      },
    });

    const serverNameMap = await this.resolveServerNameMap(
      Array.from(new Set(rows.map((row) => row.serverId))),
    );

    const rawItems = rows
      .map((row) => {
        const queryRow = buildQueryRowFromStoredEntity(row);
        const normalized = normalizeRouteRow(queryRow, {
          id: row.serverId,
          displayName: serverNameMap.get(row.serverId) ?? row.serverId,
          beaconEndpoint: '',
          beaconKey: '',
          railwayMod: row.railwayMod,
        });
        if (!normalized) return null;
        normalized.platformCount = extractPlatformCount(row.payload);
        return normalized;
      })
      .filter((item): item is NormalizedRoute => Boolean(item));

    const grouped = new Map<string, RoutePreviewGroup>();
    for (const item of rawItems) {
      const baseKey = extractRouteBaseKey(item.name);
      const groupKey = [
        item.server.id,
        item.railwayType,
        item.dimensionContext ?? '',
        baseKey ?? item.id,
      ].join('::');
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          key: groupKey,
          item,
          routes: [item],
          serverId: item.server.id,
          railwayMod: item.railwayType as TransportationRailwayMod,
          dimensionContext: item.dimensionContext ?? null,
        });
      } else {
        existing.routes.push(item);
      }
    }

    const mergedGroups = Array.from(grouped.values()).map((group) => {
      if (group.routes.length <= 1) {
        return group;
      }
      const primary = selectPrimaryRoute(group.routes) ?? group.routes[0];
      const displayName =
        extractRouteDisplayName(primary.name) ??
        extractRouteDisplayName(group.routes[0]?.name) ??
        primary.name;
      const platformCount = group.routes.reduce((max, route) => {
        if (route.platformCount == null) return max;
        return Math.max(max ?? 0, route.platformCount);
      }, primary.platformCount ?? null);
      const lastUpdated = group.routes.reduce((max, route) => {
        return Math.max(max ?? 0, route.lastUpdated ?? 0);
      }, primary.lastUpdated ?? 0);
      group.item = {
        ...primary,
        name: displayName ?? primary.name ?? null,
        platformCount,
        lastUpdated: lastUpdated || null,
      };
      return group;
    });

    mergedGroups.sort(
      (a, b) =>
        (b.item.lastUpdated ?? 0) - (a.item.lastUpdated ?? 0) ||
        a.item.name?.localeCompare(b.item.name ?? '') ||
        0,
    );

    const total = mergedGroups.length;
    const start = (page - 1) * pageSize;
    const pageGroups = mergedGroups.slice(start, start + pageSize);

    if (pageGroups.length) {
      const previewGroups = pageGroups.filter(
        (group) => group.item.railwayType === TransportationRailwayMod.MTR,
      );
      if (previewGroups.length) {
        const snapshotKeys = previewGroups
          .filter((group) => Boolean(group.dimensionContext))
          .flatMap((group) =>
            group.routes.map((route) => ({
              serverId: group.serverId,
              railwayMod: group.railwayMod,
              dimensionContext: group.dimensionContext ?? '',
              routeEntityId: route.id,
            })),
          );

        if (snapshotKeys.length) {
          const snapshots =
            await this.prisma.transportationRailwayRouteGeometrySnapshot.findMany(
              {
                where: {
                  status: 'READY',
                  OR: snapshotKeys.map((key) => ({
                    serverId: key.serverId,
                    railwayMod: key.railwayMod,
                    dimensionContext: key.dimensionContext,
                    routeEntityId: key.routeEntityId,
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
              },
            );

          const snapshotMap = new Map<
            string,
            {
              geometry2d: Prisma.JsonValue;
              pathNodes3d: Prisma.JsonValue;
              bounds: Prisma.JsonValue | null;
            }
          >(
            snapshots.map((row) => [
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

          for (const group of previewGroups) {
            if (!group.dimensionContext) continue;
            let mergedBounds: RoutePreviewBounds | null = null;
            const paths: RoutePreviewPath[] = [];
            for (const route of group.routes) {
              const key = [
                group.serverId,
                group.railwayMod,
                group.dimensionContext,
                route.id,
              ].join('::');
              const snapshot = snapshotMap.get(key);
              if (!snapshot) continue;

              const nodes = Array.isArray(snapshot.pathNodes3d)
                ? (snapshot.pathNodes3d as Array<{
                    x?: unknown;
                    z?: unknown;
                  }>)
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
                paths.push({
                  points: pointsFromNodes,
                  color: route.color ?? null,
                });
                mergedBounds = mergeBounds(
                  mergedBounds,
                  computeBoundsFromPoints([pointsFromNodes]),
                );
                continue;
              }

              const rawPaths = (snapshot.geometry2d as Record<string, unknown>)
                ?.paths;
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
                  paths.push({ points, color: route.color ?? null });
                  mergedBounds = mergeBounds(
                    mergedBounds,
                    computeBoundsFromPoints([points]),
                  );
                }
              }

              const snapshotBounds = parseSnapshotBounds(snapshot.bounds);
              mergedBounds = mergeBounds(mergedBounds, snapshotBounds);
            }
            group.item.previewSvg = buildPreviewSvg({
              paths,
              bounds: mergedBounds,
            });
          }
        }
      }
    }

    const items = pageGroups.map((group) => group.item);

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async listStations(params: {
    serverId?: string | null;
    railwayType?: TransportationRailwayMod | null;
    dimension?: string | null;
    transportMode?: string | null;
    search?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<RailwayListResponse<NormalizedEntity>> {
    const page = clampInt(params.page ?? 1, 1, 10_000);
    const pageSize = clampInt(params.pageSize ?? 20, 5, 100);

    const where: Prisma.TransportationRailwayStationWhereInput = {
      ...(params.serverId ? { serverId: params.serverId } : {}),
      ...(params.railwayType ? { railwayMod: params.railwayType } : {}),
      ...(params.transportMode
        ? {
            transportMode: {
              contains: params.transportMode,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(params.dimension
        ? {
            dimensionContext: buildDimensionContextFromDimension(
              params.dimension,
              params.railwayType ?? TransportationRailwayMod.MTR,
            ),
          }
        : {}),
    };

    if (params.search?.trim()) {
      const keyword = params.search.trim();
      where.OR = [
        { entityId: { contains: keyword, mode: 'insensitive' } },
        { name: { contains: keyword, mode: 'insensitive' } },
        { transportMode: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.transportationRailwayStation.count({ where }),
      this.prisma.transportationRailwayStation.findMany({
        where,
        orderBy: [{ lastBeaconUpdatedAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          serverId: true,
          railwayMod: true,
          entityId: true,
          dimensionContext: true,
          transportMode: true,
          name: true,
          color: true,
          filePath: true,
          payload: true,
          lastBeaconUpdatedAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const serverNameMap = await this.resolveServerNameMap(
      Array.from(new Set(rows.map((row) => row.serverId))),
    );

    const items = rows
      .map((row) => {
        const queryRow = buildQueryRowFromStoredEntity(row);
        return normalizeEntity(queryRow, {
          id: row.serverId,
          displayName: serverNameMap.get(row.serverId) ?? row.serverId,
          beaconEndpoint: '',
          beaconKey: '',
          railwayMod: row.railwayMod,
        });
      })
      .filter((item): item is NormalizedEntity => Boolean(item));

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async listDepots(params: {
    serverId?: string | null;
    railwayType?: TransportationRailwayMod | null;
    dimension?: string | null;
    transportMode?: string | null;
    search?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<RailwayListResponse<NormalizedEntity>> {
    const page = clampInt(params.page ?? 1, 1, 10_000);
    const pageSize = clampInt(params.pageSize ?? 20, 5, 100);

    const where: Prisma.TransportationRailwayDepotWhereInput = {
      ...(params.serverId ? { serverId: params.serverId } : {}),
      ...(params.railwayType ? { railwayMod: params.railwayType } : {}),
      ...(params.transportMode
        ? {
            transportMode: {
              contains: params.transportMode,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(params.dimension
        ? {
            dimensionContext: buildDimensionContextFromDimension(
              params.dimension,
              params.railwayType ?? TransportationRailwayMod.MTR,
            ),
          }
        : {}),
    };

    if (params.search?.trim()) {
      const keyword = params.search.trim();
      where.OR = [
        { entityId: { contains: keyword, mode: 'insensitive' } },
        { name: { contains: keyword, mode: 'insensitive' } },
        { transportMode: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.transportationRailwayDepot.count({ where }),
      this.prisma.transportationRailwayDepot.findMany({
        where,
        orderBy: [{ lastBeaconUpdatedAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          serverId: true,
          railwayMod: true,
          entityId: true,
          dimensionContext: true,
          transportMode: true,
          name: true,
          color: true,
          filePath: true,
          payload: true,
          lastBeaconUpdatedAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const serverNameMap = await this.resolveServerNameMap(
      Array.from(new Set(rows.map((row) => row.serverId))),
    );

    const items = rows
      .map((row) => {
        const queryRow = buildQueryRowFromStoredEntity(row);
        return normalizeEntity(queryRow, {
          id: row.serverId,
          displayName: serverNameMap.get(row.serverId) ?? row.serverId,
          beaconEndpoint: '',
          beaconKey: '',
          railwayMod: row.railwayMod,
        });
      })
      .filter((item): item is NormalizedEntity => Boolean(item));

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
