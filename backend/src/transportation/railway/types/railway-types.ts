import { Prisma, TransportationRailwayMod } from '@prisma/client';
import type {
  PreferredRailCurve,
  RailGeometrySegment,
} from './railway-graph.types';

export type QueryMtrEntityRow = {
  entity_id?: string;
  transport_mode?: string | null;
  name?: string | null;
  color?: number | null;
  file_path?: string | null;
  last_updated?: number | null;
  payload?: unknown;
  node_pos?: unknown;
};

export type QueryMtrEntitiesResponse = {
  success?: boolean;
  category?: string;
  rows?: QueryMtrEntityRow[];
  limit?: number;
  offset?: number;
  truncated?: boolean;
};

export type RailwayStationRecord = {
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

export type RailwayPlatformRecord = {
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

export type RailwayRouteRecord = {
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

export type RailwayRouteGeometryPath = {
  id: string;
  label: string | null;
  isPrimary: boolean;
  source: 'rails' | 'platform-centers' | 'station-bounds';
  points: Array<{ x: number; z: number }>;
  segments?: RailGeometrySegment[];
};

export type RailwayDepotRecord = {
  id?: unknown;
  name?: string | null;
  color?: number | null;
  transport_mode?: string | null;
  route_ids?: unknown[] | null;
};

export type RailwaySnapshotEntry = {
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

export type RailwaySnapshotResponse = {
  success?: boolean;
  snapshots?: RailwaySnapshotEntry[];
};

export type NormalizedEntity = {
  id: string;
  name: string | null;
  color: number | null;
  transportMode: string | null;
  lastUpdated: number | null;
  dimension: string | null;
  dimensionContext: string | null;
  filePath: string | null;
  payload: Record<string, unknown> | null;
  server: { id: string; name: string };
  railwayType: TransportationRailwayMod;
};

export type NormalizedRoute = NormalizedEntity & {
  platformCount: number | null;
  previewSvg?: string | null;
};

export type OverviewStats = {
  serverCount: number;
  routes: number;
  stations: number;
  depots: number;
};

export type OverviewLatest = {
  depots: NormalizedEntity[];
  stations: NormalizedEntity[];
  routes: NormalizedRoute[];
};

export type OverviewRecentItem = {
  id: string;
  type: 'route' | 'station' | 'depot';
  item: NormalizedRoute | NormalizedEntity;
  lastUpdated: number | null;
};

export type RouteDetailResult = {
  server: { id: string; name: string };
  railwayType: TransportationRailwayMod;
  dimension: string | null;
  route: NormalizedRoute & { payload: Record<string, unknown> | null };
  metadata: {
    lastUpdated: number | null;
    snapshotLength: number | null;
    lengthKm: number | null;
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
    source: 'rails' | 'platform-centers' | 'station-bounds';
    points: Array<{ x: number; z: number }>;
    segments?: RailGeometrySegment[];
    paths?: RailwayRouteGeometryPath[];
  };
  stops: Array<{
    order: number;
    platformId: string;
    platformName: string | null;
    stationId: string | null;
    stationName: string | null;
    dwellTime: number | null;
    position: { x: number; z: number } | null;
    bounds: {
      xMin: number | null;
      xMax: number | null;
      zMin: number | null;
      zMax: number | null;
    } | null;
  }>;
};

export type RailwayStationDetailResult = {
  server: { id: string; name: string };
  railwayType: TransportationRailwayMod;
  station: NormalizedEntity & {
    bounds: {
      xMin: number | null;
      xMax: number | null;
      zMin: number | null;
      zMax: number | null;
    };
    zone: number | null;
  };
  platforms: Array<
    NormalizedEntity & {
      stationId: string | null;
      dwellTime: number | null;
      pos1: { x: number; y: number; z: number } | null;
      pos2: { x: number; y: number; z: number } | null;
      routeIds: string[];
    }
  >;
  routes: NormalizedRoute[];
  mergedRoutes?: NormalizedRoute[];
  metadata: {
    lastUpdated: number | null;
  };
};

export type RailwayDepotDetailResult = {
  server: { id: string; name: string };
  railwayType: TransportationRailwayMod;
  depot: NormalizedEntity & {
    bounds: {
      xMin: number | null;
      xMax: number | null;
      zMin: number | null;
      zMax: number | null;
    };
    routeIds: string[];
    useRealTime: boolean | null;
    repeatInfinitely: boolean | null;
    cruisingAltitude: number | null;
    frequencies: number[] | null;
  };
  routes: NormalizedRoute[];
  metadata: {
    lastUpdated: number | null;
  };
};

export type RailwayRouteLogEntry = {
  id: number;
  timestamp: string;
  playerName: string | null;
  playerUuid: string | null;
  changeType: string | null;
  className: string | null;
  entryId: string | null;
  entryName: string | null;
  dimensionContext: string | null;
  sourceFilePath: string | null;
  sourceLine: number | null;
  newData: Record<string, unknown> | null;
  oldData: Record<string, unknown> | null;
};

export type RailwayRouteLogResult = {
  server: { id: string; name: string };
  railwayType: TransportationRailwayMod;
  total: number;
  page: number;
  pageSize: number;
  entries: RailwayRouteLogEntry[];
};
