export interface RailwayBanner {
  id: string
  title: string | null
  subtitle: string | null
  description: string | null
  attachmentId: string | null
  ctaLabel: string | null
  ctaLink: string | null
  ctaIsInternal: boolean
  isPublished: boolean
  displayOrder: number
  createdAt: string
  updatedAt: string
  imageUrl: string | null
}

export interface RailwayEntity {
  id: string
  name: string | null
  color: number | null
  transportMode: string | null
  lastUpdated: number | null
  dimension: string | null
  dimensionContext: string | null
  filePath: string | null
  payload: Record<string, unknown> | null
  server: {
    id: string
    name: string
  }
  railwayType: string
}

export interface RailwayRoute extends RailwayEntity {
  platformCount?: number | null
  previewSvg?: string | null
}

export interface RailwayOverviewStats {
  serverCount: number
  routes: number
  stations: number
  depots: number
}

export interface RailwayOverview {
  banners: RailwayBanner[]
  stats: RailwayOverviewStats
  latest: {
    depots: RailwayEntity[]
    stations: RailwayEntity[]
    routes: RailwayRoute[]
  }
  recommendations: RailwayRoute[]
  warnings: Array<{ serverId: string; message: string }>
}

export interface RailwayGeometryPoint {
  x: number
  z: number
}

export interface RailwayCurveParameters {
  h: number | null
  k: number | null
  r: number | null
  tStart: number | null
  tEnd: number | null
  reverse: boolean | null
  isStraight: boolean | null
}

export type PreferredRailCurve = 'primary' | 'secondary' | null

export interface RailwayGeometrySegmentConnection {
  targetNodeId: string
  railType: string | null
  transportMode: string | null
  modelKey: string | null
  isSecondaryDir: boolean | null
  yStart: number | null
  yEnd: number | null
  verticalCurveRadius: number | null
  primary: RailwayCurveParameters | null
  secondary: RailwayCurveParameters | null
  preferredCurve?: PreferredRailCurve
}

export interface RailwayGeometrySegment {
  start: { x: number; y: number; z: number }
  end: { x: number; y: number; z: number }
  connection: RailwayGeometrySegmentConnection | null
}

export interface RailwayRouteGeometryPath {
  id: string
  label: string | null
  isPrimary: boolean
  source: 'rails' | 'platform-centers' | 'station-bounds'
  points: RailwayGeometryPoint[]
  segments?: RailwayGeometrySegment[]
}

export interface RailwayRouteDetail {
  server: { id: string; name: string }
  dimension: string | null
  railwayType: string
  route: RailwayRoute
  metadata: {
    lastUpdated: number | null
    snapshotLength: number | null
    lengthKm: number | null
  }
  stations: Array<
    RailwayEntity & {
      bounds: {
        xMin: number | null
        xMax: number | null
        zMin: number | null
        zMax: number | null
      }
      zone: number | null
    }
  >
  platforms: Array<
    RailwayEntity & {
      stationId: string | null
      dwellTime: number | null
      pos1: { x: number; y: number; z: number } | null
      pos2: { x: number; y: number; z: number } | null
      routeIds: string[]
    }
  >
  depots: RailwayEntity[]
  geometry: {
    source: 'rails' | 'platform-centers' | 'station-bounds'
    points: RailwayGeometryPoint[]
    segments?: RailwayGeometrySegment[]
    paths?: RailwayRouteGeometryPath[]
  }
  stops: Array<{
    order: number
    platformId: string
    platformName: string | null
    stationId: string | null
    stationName: string | null
    dwellTime: number | null
    position: RailwayGeometryPoint | null
    bounds: {
      xMin: number | null
      xMax: number | null
      zMin: number | null
      zMax: number | null
    } | null
  }>
}

export type RailwayBannerPayload = {
  attachmentId: string
  title?: string | null
  subtitle?: string | null
  description?: string | null
  ctaLabel?: string | null
  ctaLink?: string | null
  ctaIsInternal?: boolean
  isPublished?: boolean
  displayOrder?: number
}

export type RailwayBannerUpdatePayload = Partial<RailwayBannerPayload>

export interface RailwayStationDetail {
  server: { id: string; name: string }
  railwayType: string
  station: RailwayRouteDetail['stations'][number]
  platforms: Array<
    RailwayRouteDetail['platforms'][number] & {
      routeIds: string[]
    }
  >
  routes: RailwayRoute[]
  mergedRoutes?: RailwayRoute[]
  metadata: {
    lastUpdated: number | null
  }
}

export interface RailwayStationRouteMapGroup {
  key: string
  displayName: string
  color: number | null
  routeIds: string[]
  paths: RailwayGeometryPoint[][]
  stops: Array<{
    stationId: string | null
    x: number
    z: number
    label: string
  }>
}

export interface RailwayStationRouteMapPayload {
  stationId: string
  serverId: string
  railwayType: string
  dimension: string | null
  generatedAt: number
  groups: RailwayStationRouteMapGroup[]
}

export type RailwayStationRouteMapResponse =
  | { status: 'pending' }
  | { status: 'ready'; data: RailwayStationRouteMapPayload }

export interface RailwayDepotDetail {
  server: { id: string; name: string }
  railwayType: string
  depot: RailwayEntity & {
    bounds: {
      xMin: number | null
      xMax: number | null
      zMin: number | null
      zMax: number | null
    }
    routeIds: string[]
    useRealTime: boolean | null
    repeatInfinitely: boolean | null
    cruisingAltitude: number | null
    frequencies: number[] | null
  }
  routes: RailwayRoute[]
  metadata: {
    lastUpdated: number | null
  }
}

export interface RailwayRouteLogEntry {
  id: number
  timestamp: string
  playerName: string | null
  playerUuid: string | null
  changeType: string | null
  className: string | null
  entryId: string | null
  entryName: string | null
  dimensionContext: string | null
  sourceFilePath: string | null
  sourceLine: number | null
  newData: Record<string, unknown> | null
  oldData: Record<string, unknown> | null
}

export interface RailwayRouteLogResult {
  server: { id: string; name: string }
  railwayType: string
  total: number
  page: number
  pageSize: number
  entries: RailwayRouteLogEntry[]
}

export interface RailwayRouteVariantItem {
  routeId: string
  variantLabel: string
  detail: RailwayRouteDetail
}

export interface RailwayRouteVariantsResult {
  baseKey: string | null
  baseName: string | null
  routes: RailwayRouteVariantItem[]
}

export interface RailwayListPagination {
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface RailwayRouteListResponse {
  items: RailwayRoute[]
  pagination: RailwayListPagination
}

export interface RailwayEntityListResponse {
  items: RailwayEntity[]
  pagination: RailwayListPagination
}

export interface RailwayServerOption {
  id: string
  name: string
  railwayType: string
}
