import { BadRequestException, Injectable } from '@nestjs/common';
import { TransportationRailwayMod } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RailwayRouteDetailQueryDto } from '../../dto/railway.dto';
import {
  buildDimensionContextFromDimension,
  normalizeId,
} from '../utils/railway-normalizer';

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
    stationName?: string;
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

@Injectable()
export class TransportationRailwayStationMapService {
  constructor(private readonly prisma: PrismaService) {}

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

    const requestedDimension = query.dimension?.trim() || null;
    const requestedContext = requestedDimension
      ? buildDimensionContextFromDimension(requestedDimension, railwayType)
      : null;

    const stationRow = await this.prisma.transportationRailwayStation.findFirst(
      {
        where: {
          serverId,
          railwayMod: railwayType,
          entityId: normalizeId(normalizedStationId) ?? normalizedStationId,
          ...(requestedContext ? { dimensionContext: requestedContext } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        select: { entityId: true, dimensionContext: true },
      },
    );

    const dimensionContext =
      stationRow?.dimensionContext ?? requestedContext ?? null;
    if (!dimensionContext) {
      return { status: 'pending' };
    }

    const stationEntityId = stationRow?.entityId ?? normalizedStationId;

    const snapshot =
      await this.prisma.transportationRailwayStationMapSnapshot.findUnique({
        where: {
          serverId_railwayMod_dimensionContext_stationEntityId: {
            serverId,
            railwayMod: railwayType,
            dimensionContext,
            stationEntityId,
          },
        },
        select: { payload: true },
      });

    if (!snapshot?.payload) {
      return { status: 'pending' };
    }

    const data = snapshot.payload as unknown as StationRouteMapPayload;

    // Patch station names from DB (Spatial Lookup)
    // Fetch all stations for this server to ensure we don't miss any due to dimension context mismatches
    const allStations = await this.prisma.transportationRailwayStation.findMany(
      {
        where: {
          serverId,
          railwayMod: railwayType,
        },
        select: {
          entityId: true,
          name: true,
          payload: true,
          dimensionContext: true,
        },
      },
    );

    const stationLookup = allStations
      .filter(
        (s) =>
          !dimensionContext ||
          !s.dimensionContext ||
          s.dimensionContext === dimensionContext,
      )
      .map((s) => {
        const payload = s.payload as any;
        const rawX1 = Number(payload?.x_min);
        const rawX2 = Number(payload?.x_max);
        const rawZ1 = Number(payload?.z_min);
        const rawZ2 = Number(payload?.z_max);
        const xMin = Math.min(rawX1, rawX2);
        const xMax = Math.max(rawX1, rawX2);
        const zMin = Math.min(rawZ1, rawZ2);
        const zMax = Math.max(rawZ1, rawZ2);
        return {
          id: s.entityId,
          name: s.name || payload?.name,
          xMin,
          xMax,
          zMin,
          zMax,
          centerX: (xMin + xMax) / 2,
          centerZ: (zMin + zMax) / 2,
        };
      })
      .filter(
        (s) =>
          !isNaN(s.xMin) && !isNaN(s.xMax) && !isNaN(s.zMin) && !isNaN(s.zMax),
      );

    const NEAREST_STATION_MAX_DISTANCE_BLOCKS = 256;

    if (data.groups) {
      for (const group of data.groups) {
        if (group.stops) {
          for (const stop of group.stops) {
            // If stationId is missing, try to find it spatially
            if (!stop.stationId) {
              const match = stationLookup.find(
                (s) =>
                  stop.x >= s.xMin &&
                  stop.x <= s.xMax &&
                  stop.z >= s.zMin &&
                  stop.z <= s.zMax,
              );
              if (match) {
                stop.stationId = match.id;
                if (match.name) {
                  stop.stationName = match.name;
                }
              } else {
                // Fallback: pick nearest station center within a reasonable threshold.
                let nearest: {
                  id: string;
                  name: string | null;
                  distSq: number;
                } | null = null;

                for (const s of stationLookup) {
                  const dx = s.centerX - stop.x;
                  const dz = s.centerZ - stop.z;
                  const distSq = dx * dx + dz * dz;
                  if (!nearest || distSq < nearest.distSq) {
                    nearest = {
                      id: s.id,
                      name: (s.name as string | null) ?? null,
                      distSq,
                    };
                  }
                }

                if (
                  nearest &&
                  nearest.distSq <=
                    NEAREST_STATION_MAX_DISTANCE_BLOCKS *
                      NEAREST_STATION_MAX_DISTANCE_BLOCKS
                ) {
                  stop.stationId = nearest.id;
                  if (nearest.name) {
                    stop.stationName = nearest.name;
                  }
                }
              }
            } else {
              // If stationId exists, just update name
              const match = stationLookup.find((s) => s.id === stop.stationId);
              if (match && match.name) {
                stop.stationName = match.name;
              }
            }
          }
        }
      }
    }

    return {
      status: 'ready',
      data,
    };
  }
}
