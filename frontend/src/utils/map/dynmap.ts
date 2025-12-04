import L from 'leaflet'
import { createDynmapProjection } from './projection'
import type {
  DynmapBlockPoint,
  DynmapBlockProjection,
  DynmapMapInitOptions,
  DynmapTileSourceConfig,
} from './types'

interface DynmapTileLayerOptions
  extends L.TileLayerOptions,
    DynmapTileSourceConfig {}

interface DynmapTileInfo {
  chunkX: number
  chunkY: number
  tileX: number
  tileY: number
  zoomPrefix: string
}

class DynmapTileLayer extends L.TileLayer {
  declare options: DynmapTileLayerOptions

  constructor(options: DynmapTileLayerOptions) {
    const tileScale = options.tileScale ?? 0
    const mapZoomIn = options.mapZoomIn ?? 0
    const mapZoomOut = options.mapZoomOut ?? 0
    super('', {
      ...options,
      noWrap: true,
      zoomReverse: true,
      tileSize: 128 << tileScale,
      maxNativeZoom: mapZoomOut,
      maxZoom: mapZoomIn + mapZoomOut,
    })
  }

  override getTileUrl(coords: L.Coords): string {
    const info = this.getTileInfo(coords)
    const extension = this.options.tileExtension ?? 'jpg'
    const fileName = `${info.zoomPrefix}${info.tileX}_${info.tileY}.${extension}`
    const chunkPath = `${info.chunkX}_${info.chunkY}`

    return [
      this.options.tileBaseUrl,
      this.options.worldName,
      this.options.mapName,
      chunkPath,
      fileName,
    ]
      .filter(Boolean)
      .join('/')
  }

  private getTileInfo(coords: L.Coords): DynmapTileInfo {
    const zoom = this._getZoomForUrl()
    const mapZoomIn = this.options.mapZoomIn ?? 0
    const zoomOutLevel = Math.max(0, zoom - mapZoomIn)
    const scale = 1 << zoomOutLevel
    const scaledX = scale * coords.x
    const scaledY = scale * coords.y
    const invertedY = -scaledY

    return {
      chunkX: scaledX >> 5,
      chunkY: invertedY >> 5,
      tileX: scaledX,
      tileY: invertedY,
      zoomPrefix: zoomOutLevel === 0 ? '' : `${'z'.repeat(zoomOutLevel)}_`,
    }
  }
}

export class DynmapMapController {
  private map: L.Map | null = null
  private tileLayer: DynmapTileLayer | null = null
  private readonly source: DynmapTileSourceConfig
  private readonly projection: DynmapBlockProjection

  constructor(source: DynmapTileSourceConfig) {
    this.source = source
    this.projection = createDynmapProjection(source)
  }

  mount(options: DynmapMapInitOptions) {
    const target = this.resolveContainer(options.container)
    if (!target) {
      throw new Error('Dynmap 容器不存在或尚未挂载。')
    }

    const minZoom = this.source.minZoom ?? 0
    const maxZoom = this.source.mapZoomIn + this.source.mapZoomOut
    const initialCenter = options.center ??
      this.source.defaultCenter ?? { x: 0, z: 0 }
    const initialZoom = options.zoom ?? this.source.defaultZoom ?? 0

    const tileLayer = new DynmapTileLayer({
      ...this.source,
      minZoom,
      maxZoom,
    })

    const map = L.map(target, {
      crs: L.CRS.Simple,
      minZoom,
      maxZoom,
      zoom: initialZoom,
      center: this.toLatLng(initialCenter),
      preferCanvas: true,
      zoomControl: options.showZoomControl ?? true,
      attributionControl: false,
    })

    tileLayer.addTo(map)

    this.tileLayer = tileLayer
    this.map = map
    return map
  }

  destroy() {
    this.tileLayer = null
    if (this.map) {
      this.map.remove()
      this.map = null
    }
  }

  centerOnBlock(point: DynmapBlockPoint, zoom?: number) {
    if (!this.map) return
    const target = this.toLatLng(point)
    if (typeof zoom === 'number') {
      this.map.setView(target, zoom)
    } else {
      this.map.panTo(target)
    }
  }

  flyToBlock(point: DynmapBlockPoint, zoom?: number) {
    if (!this.map) return
    const target = this.toLatLng(point)
    if (typeof zoom === 'number') {
      this.map.flyTo(target, zoom)
    } else {
      this.map.flyTo(target)
    }
  }

  getLeafletInstance() {
    return this.map
  }

  toLatLng(point: DynmapBlockPoint) {
    return this.projection.toLatLng(point)
  }

  fromLatLng(latlng: L.LatLng): DynmapBlockPoint {
    return this.projection.fromLatLng(latlng)
  }

  private resolveContainer(
    target: DynmapMapInitOptions['container'],
  ): HTMLElement | null {
    if (typeof target === 'string') {
      return document.querySelector<HTMLElement>(target)
    }
    return target
  }
}
