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
import {
  buildPreviewSvg,
  computeBoundsFromPoints,
  mergeBounds,
  parseSnapshotBounds,
  type RoutePreviewBounds,
  type RoutePreviewPath,
} from '../utils/route-preview';
import type {
  NormalizedEntity,
  NormalizedRoute,
  QueryMtrEntityRow,
} from '../types/railway-types';

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

function clampInt(
  value: number | string | undefined | null,
  min: number,
  max: number,
) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.trunc(num)));
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

  async searchRoutes(params: {
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

    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.transportationRailwayRoute.count({ where }),
      this.prisma.transportationRailwayRoute.findMany({
        where,
        orderBy: [{ lastBeaconUpdatedAt: 'desc' }, { updatedAt: 'desc' }],
        skip,
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

    items.sort((a, b) => {
      const updatedDelta = (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0);
      if (updatedDelta !== 0) return updatedDelta;
      const aName = a.name ?? '';
      const bName = b.name ?? '';
      if (aName === bName) return 0;
      return aName.localeCompare(bName);
    });

    const previewRoutes = items.filter(
      (route) =>
        route.railwayType === TransportationRailwayMod.MTR &&
        Boolean(route.dimensionContext),
    );

    if (previewRoutes.length) {
      const snapshotKeys = previewRoutes.flatMap((route) => {
        const context = route.dimensionContext ?? '';
        if (!context) return [];
        return [
          {
            serverId: route.server.id,
            railwayMod: route.railwayType as TransportationRailwayMod,
            dimensionContext: context,
            routeEntityId: route.id,
          },
        ];
      });

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

        for (const route of previewRoutes) {
          const context = route.dimensionContext;
          if (!context) continue;
          const key = [
            route.server.id,
            route.railwayType,
            context,
            route.id,
          ].join('::');
          const snapshot = snapshotMap.get(key);
          if (!snapshot) continue;

          let mergedBounds: RoutePreviewBounds | null = null;
          const paths: RoutePreviewPath[] = [];
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
          route.previewSvg = buildPreviewSvg({
            paths,
            bounds: mergedBounds,
          });
        }
      }
    }

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
