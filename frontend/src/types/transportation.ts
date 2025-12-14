export interface RailwayBanner {
  id: string
  title: string | null
  subtitle: string | null
  description: string | null
  attachmentId: string | null
  ctaLabel: string | null
  ctaLink: string | null
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
}

export interface RailwayRoute extends RailwayEntity {
  platformCount?: number | null
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

export interface RailwayRouteDetail {
  server: { id: string; name: string }
  dimension: string | null
  route: RailwayRoute
  metadata: {
    lastDeployed: number | null
    lastUpdated: number | null
    snapshotLength: number | null
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
    }
  >
  depots: RailwayEntity[]
  geometry: {
    source: 'platform-centers' | 'station-bounds'
    points: RailwayGeometryPoint[]
  }
}

export type RailwayBannerPayload = {
  attachmentId: string
  title?: string | null
  subtitle?: string | null
  description?: string | null
  ctaLabel?: string | null
  ctaLink?: string | null
  isPublished?: boolean
  displayOrder?: number
}

export type RailwayBannerUpdatePayload = Partial<RailwayBannerPayload>
