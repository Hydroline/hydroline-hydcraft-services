import { TransportationRailwayMod } from '@prisma/client';
import { BeaconServerRecord } from './railway-common';
import type {
  NormalizedEntity,
  NormalizedRoute,
  QueryMtrEntityRow,
  RailwayRouteRecord,
} from './railway-types';
import { getRailwayModConfig } from './railway-beacon.util';
import { decodeBlockPosition } from '../utils/block-pos.util';

export function normalizePayloadRecord(value: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...value };
  for (const key in normalized) {
    if (!key) continue;
    if (key === 'id' || key === 'entity_id' || key === 'entity') {
      normalized[key] = ensureStringId(normalized[key]);
    }
  }
  const arrayKeys = [
    'platform_ids',
    'platformIds',
    'route_ids',
    'routeIds',
    'station_ids',
    'stationIds',
    'depot_ids',
    'depotIds',
  ];
  for (const key of arrayKeys) {
    const entry = normalized[key];
    if (Array.isArray(entry)) {
      normalized[key] = entry.map((value) => ensureStringId(value));
    }
  }
  Object.keys(normalized).forEach((key) => {
    if (isBlockPositionField(key)) {
      normalized[key] = normalizeBlockPositionValue(normalized[key]);
    }
  });
  return normalized;
}

export function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return null;
}

export function normalizeIdList(values: unknown[]) {
  return values
    .map((value) => normalizeId(value))
    .filter((value): value is string => Boolean(value));
}

function ensureStringId(value: unknown) {
  const normalized = normalizeId(value);
  if (normalized !== null) {
    return normalized;
  }
  if (value == null) {
    return value;
  }
  return String(value);
}

function normalizeBlockPositionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeBlockPositionValue(entry));
  }
  if (value && typeof value === 'object') {
    const maybe = value as { x?: unknown; z?: unknown };
    if (typeof maybe.x === 'number' && typeof maybe.z === 'number') {
      return value;
    }
  }
  const decoded = decodeBlockPosition(value);
  return decoded ?? value;
}

function isBlockPositionField(key: string) {
  if (!key) return false;
  const directMatches = [
    'pos_1',
    'pos_2',
    'node_pos',
    'nodePos',
    'start_pos',
    'end_pos',
  ];
  if (directMatches.includes(key)) {
    return true;
  }
  const lower = key.toLowerCase();
  return lower.endsWith('_pos') || lower.endsWith('position');
}

export function readString(value: unknown) {
  if (typeof value === 'string' && value.trim().length) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return null;
}

export function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return value > 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

export function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readPayloadString(
  payload: Record<string, unknown> | null,
  key: string,
) {
  if (!payload) return null;
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

export function readPayloadNumber(
  payload: Record<string, unknown> | null,
  key: string,
) {
  if (!payload) return null;
  const value = payload[key];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function extractDimensionFromPath(
  path: string | null,
  type?: TransportationRailwayMod,
) {
  if (!path) return null;
  const config = getRailwayModConfig(type);
  const segments = path.split('/');
  const idx = segments.findIndex(
    (segment) => segment === config.dimensionPrefix,
  );
  if (idx < 0 || idx + 2 >= segments.length) return null;
  const namespace = segments[idx + 1];
  const dimension = segments[idx + 2];
  if (!namespace || !dimension) return null;
  return `${namespace}:${dimension}`;
}

export function buildDimensionContextFromPath(
  path: string | null,
  type?: TransportationRailwayMod,
) {
  if (!path) return null;
  const config = getRailwayModConfig(type);
  const segments = path.split('/');
  const idx = segments.findIndex(
    (segment) => segment === config.dimensionPrefix,
  );
  if (idx < 0 || idx + 2 >= segments.length) return null;
  return `${config.dimensionPrefix}/${segments[idx + 1]}/${segments[idx + 2]}`;
}

export function buildDimensionContextFromDimension(
  dimension?: string | null,
  type?: TransportationRailwayMod,
) {
  if (!dimension) return null;
  const [namespace, value] = dimension.split(':');
  if (!namespace || !value) return null;
  const prefix = getRailwayModConfig(type).dimensionPrefix;
  return `${prefix}/${namespace}/${value}`;
}

export function toCleanPayload(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizePayloadRecord(parsed as Record<string, unknown>);
      }
      return null;
    } catch (error) {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return normalizePayloadRecord(value as Record<string, unknown>);
  }
  return null;
}

export function buildFallbackEntity(
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
    railwayType: server.railwayMod,
  };
}

export function normalizeEntity(
  row: QueryMtrEntityRow,
  server: BeaconServerRecord,
): NormalizedEntity | null {
  if (!row?.entity_id) return null;
  const payload = toCleanPayload(row.payload);
  const dimension = extractDimensionFromPath(
    row.file_path ?? null,
    server.railwayMod,
  );
  const payloadName = readPayloadString(payload, 'name');
  const payloadColor = readPayloadNumber(payload, 'color');
  const payloadMode = readPayloadString(payload, 'transport_mode');
  const color = toNumber(row.color) ?? payloadColor;
  const transportMode = row.transport_mode ?? payloadMode;

  return {
    id: row.entity_id,
    name: row.name ?? payloadName,
    color,
    transportMode,
    lastUpdated: toNumber(row.last_updated),
    dimension,
    dimensionContext: buildDimensionContextFromPath(
      row.file_path ?? null,
      server.railwayMod,
    ),
    filePath: row.file_path ?? null,
    payload,
    server: { id: server.id, name: server.displayName },
    railwayType: server.railwayMod,
  };
}

export function normalizeRouteRow(
  row: QueryMtrEntityRow,
  server: BeaconServerRecord,
): NormalizedRoute | null {
  if (!row?.entity_id) return null;
  const entity = normalizeEntity(row, server);
  if (!entity) return null;
  const payload = toCleanPayload(row.payload);
  const payloadPlatformIds = (
    payload as {
      platform_ids?: unknown[];
      platformIds?: unknown[];
    } | null
  )?.platform_ids;
  const payloadPlatformIdsCamel = (
    payload as {
      platform_ids?: unknown[];
      platformIds?: unknown[];
    } | null
  )?.platformIds;
  const platformList = Array.isArray(payloadPlatformIds)
    ? payloadPlatformIds
    : Array.isArray(payloadPlatformIdsCamel)
      ? payloadPlatformIdsCamel
      : null;
  return {
    ...entity,
    platformCount: platformList ? platformList.length : null,
    payload,
  };
}

export function normalizeSnapshotRoute(
  route: RailwayRouteRecord,
  server: BeaconServerRecord,
): NormalizedRoute {
  const sanitizedPayload =
    toCleanPayload(route) ?? (route as Record<string, unknown>);
  const entity =
    normalizeEntity(
      {
        entity_id: normalizeId(route.id) ?? undefined,
        name: route.name,
        color: route.color,
        transport_mode: route.transport_mode,
        payload: sanitizedPayload,
      },
      server,
    ) ??
    buildFallbackEntity(
      normalizeId(route.id),
      server,
      route.name ?? null,
      toNumber(route.color),
      route.transport_mode ?? null,
      route as Record<string, unknown>,
    );
  return {
    ...entity,
    platformCount: route.platform_ids?.length ?? null,
    payload: sanitizedPayload,
  };
}
