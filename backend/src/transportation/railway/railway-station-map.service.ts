import { BadRequestException, Injectable } from '@nestjs/common';
import { TransportationRailwayMod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RailwayRouteDetailQueryDto } from '../dto/railway.dto';
import {
  buildDimensionContextFromDimension,
  normalizeId,
} from './railway-normalizer';

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

    return {
      status: 'ready',
      data: snapshot.payload as unknown as StationRouteMapPayload,
    };
  }
}
