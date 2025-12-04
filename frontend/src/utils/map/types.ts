import type { LatLng } from 'leaflet'

export interface DynmapBlockPoint {
  x: number
  z: number
}

export interface DynmapMapInitOptions {
  container: string | HTMLElement
  center?: DynmapBlockPoint
  zoom?: number
  showZoomControl?: boolean
}

export interface DynmapBlockProjection {
  toLatLng(point: DynmapBlockPoint): LatLng
  fromLatLng(latlng: LatLng): DynmapBlockPoint
}

export interface DynmapProjectionOptions {
  mapZoomIn: number
  mapZoomOut: number
  tileScale: number
  worldToMap: readonly number[]
  mapToWorld: readonly number[]
}

export interface DynmapTileSourceConfig extends DynmapProjectionOptions {
  /** 形如 https://map.example.com/tiles */
  tileBaseUrl: string
  /** Dynmap world 名称 */
  worldName: string
  /** Dynmap map/renderer 名称，例如 flat、surface */
  mapName: string
  /** 瓦片扩展名（jpg/png），默认 jpg */
  tileExtension?: 'png' | 'jpg'
  /** Leaflet 最小/最大缩放 */
  minZoom?: number
  maxZoom?: number
  /** 初始化缩放 */
  defaultZoom?: number
  /** 默认中心点 */
  defaultCenter?: DynmapBlockPoint
}
