import { Injectable } from '@nestjs/common';
import { Prisma, TransportationRailwayMod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildDimensionContextFromDimension,
  normalizeEntity,
  normalizeRouteRow,
} from './railway-normalizer';
import type {
  NormalizedEntity,
  NormalizedRoute,
  QueryMtrEntityRow,
} from './railway-types';

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
  const raw = (payload as Record<string, unknown>)['platform_ids'];
  if (!Array.isArray(raw)) return null;
  return raw.length;
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

    const [total, rows] = await Promise.all([
      this.prisma.transportationRailwayRoute.count({ where }),
      this.prisma.transportationRailwayRoute.findMany({
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
