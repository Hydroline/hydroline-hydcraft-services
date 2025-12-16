import {
  HydrolineBeaconEvent,
  HydrolineBeaconPoolService,
} from '../../lib/hydroline-beacon';
import { TransportationRailwayMod } from '@prisma/client';
import { BEACON_TIMEOUT_MS, BeaconServerRecord } from './railway-common';
import {
  DEFAULT_RAILWAY_TYPE,
  RailwayTypeConfig,
  RAILWAY_TYPE_CONFIG,
} from './railway-type.config';
import type {
  QueryMtrEntitiesResponse,
  RailwaySnapshotResponse,
} from './railway-types';

export function resolveRailwayMod(type?: TransportationRailwayMod) {
  if (type && RAILWAY_TYPE_CONFIG[type]) {
    return type;
  }
  return DEFAULT_RAILWAY_TYPE;
}

export function getRailwayModConfig(
  type?: TransportationRailwayMod,
): RailwayTypeConfig {
  const resolved = resolveRailwayMod(type);
  return RAILWAY_TYPE_CONFIG[resolved];
}

export async function emitBeacon<TResponse = unknown>(
  pool: HydrolineBeaconPoolService,
  server: BeaconServerRecord,
  event: HydrolineBeaconEvent,
  payload: Record<string, unknown>,
): Promise<TResponse> {
  const client =
    pool.getClientOrNull(server.id) ??
    pool.getOrCreate({
      serverId: server.id,
      endpoint: server.beaconEndpoint,
      key: server.beaconKey,
      timeoutMs: server.beaconRequestTimeoutMs ?? undefined,
      maxRetry: server.beaconMaxRetry ?? undefined,
    });
  return client.emit<TResponse>(event, payload, {
    timeoutMs: server.beaconRequestTimeoutMs ?? BEACON_TIMEOUT_MS,
  });
}

export async function queryRailwayEntities(
  pool: HydrolineBeaconPoolService,
  server: BeaconServerRecord,
  railwayMod: TransportationRailwayMod,
  category: string,
  options: {
    limit?: number;
    offset?: number;
    filters?: Record<string, unknown>;
    dimensionContext?: string | null;
  },
): Promise<QueryMtrEntitiesResponse> {
  const config = getRailwayModConfig(railwayMod);
  const payload: Record<string, unknown> = {
    category,
    limit: options.limit ?? 20,
    offset: options.offset ?? 0,
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
  const response = await emitBeacon<QueryMtrEntitiesResponse>(
    pool,
    server,
    config.queryEvent,
    payload,
  );
  response.rows = response.rows ?? [];
  return response;
}

export async function fetchRailwaySnapshot(
  pool: HydrolineBeaconPoolService,
  server: BeaconServerRecord,
): Promise<RailwaySnapshotResponse> {
  const config = getRailwayModConfig(server.railwayMod);
  const response = await emitBeacon<RailwaySnapshotResponse>(
    pool,
    server,
    config.snapshotEvent,
    {},
  );
  if (!response?.snapshots) {
    return { snapshots: [] };
  }
  return response;
}
