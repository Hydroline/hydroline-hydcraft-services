import L from 'leaflet'
import {
  createHydcraftDynmapMap,
  DynmapMapController,
  type DynmapMapInitOptions,
} from '@/utils/map'
import type {
  RailwayGeometryPoint,
  RailwayRouteDetail,
} from '@/types/transportation'

type DrawOptions = {
  color?: number | null
  weight?: number
  opacity?: number
  focusZoom?: number
}

const defaultColor = '#0ea5e9'
const STATION_AREA_ZOOM = 5

function toHexColor(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return defaultColor
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`
}

export class RailwayMap {
  private controller: DynmapMapController
  private polylines: L.Polyline[] = []
  private stopLayer: L.LayerGroup | null = null
  private stops: RailwayRouteDetail['stops'] = []
  private zoomHandler: (() => void) | null = null

  constructor() {
    this.controller = createHydcraftDynmapMap()
  }

  mount(options: DynmapMapInitOptions) {
    this.controller.mount(options)
    const map = this.controller.getLeafletInstance()
    if (map) {
      this.zoomHandler = () => this.renderStops()
      map.on('zoomend', this.zoomHandler)
    }
  }

  getController() {
    return this.controller
  }

  drawGeometry(paths: RailwayGeometryPoint[][] = [], options?: DrawOptions) {
    this.clearPolylines()
    const map = this.controller.getLeafletInstance()
    if (!map) return
    const color = toHexColor(options?.color ?? null)
    const focusZoom = options?.focusZoom ?? 4
    if (!paths.length) return
    const focusPoint = paths[0]?.[0]
    let bounds: L.LatLngBounds | null = null
    for (const path of paths) {
      if (!path?.length) continue
      const latlngs = path
        .map((point) =>
          this.controller.toLatLng({
            x: point.x,
            z: point.z,
          }),
        )
        .filter(Boolean) as L.LatLngExpression[]
      if (!latlngs.length) continue
      const polyline = L.polyline(latlngs, {
        color,
        weight: options?.weight ?? 4,
        opacity: options?.opacity ?? 0.85,
      }).addTo(map)
      this.polylines.push(polyline)
      const polyBounds = polyline.getBounds()
      bounds = bounds ? bounds.extend(polyBounds) : polyBounds
    }
    if (bounds && bounds.isValid()) {
      const padding = L.point(32, 32)
      const targetZoom = map.getBoundsZoom(bounds, false, padding)
      if (targetZoom < map.getMinZoom()) {
        map.setMinZoom(targetZoom)
      }
      map.flyToBounds(bounds, {
        padding: [padding.x, padding.y],
        maxZoom: focusZoom,
      })
    } else if (focusPoint) {
      this.controller.flyToBlock(focusPoint, focusZoom)
    }
  }

  destroy() {
    this.clearPolylines()
    const map = this.controller.getLeafletInstance()
    if (map && this.zoomHandler) {
      map.off('zoomend', this.zoomHandler)
    }
    this.zoomHandler = null
    this.clearStopLayer()
    this.controller.destroy()
  }

  setStops(stops: RailwayRouteDetail['stops'] = []) {
    this.stops = stops ?? []
    this.renderStops()
  }

  private renderStops() {
    const map = this.controller.getLeafletInstance()
    if (!map) return
    this.clearStopLayer()
    if (!this.stops.length) return
    const showArea = map.getZoom() >= STATION_AREA_ZOOM
    const layer = L.layerGroup()
    for (const stop of this.stops) {
      if (showArea && stop.bounds) {
        const bounds = this.toBounds(stop.bounds)
        if (!bounds) continue
        const rectangle = L.rectangle(bounds, {
          color: '#14b8a6',
          weight: 1,
          fillOpacity: 0.15,
        })
        if (stop.stationName || stop.platformName) {
          rectangle.bindTooltip(stop.stationName ?? stop.platformName ?? '', {
            permanent: true,
            direction: 'center',
            className: 'railway-station-label',
          })
        }
        rectangle.addTo(layer)
        continue
      }
      if (!stop.position) continue
      const latlng = this.controller.toLatLng({
        x: stop.position.x,
        z: stop.position.z,
      })
      if (!latlng) continue
      const marker = L.circleMarker(latlng, {
        radius: 4,
        color: '#0ea5e9',
        weight: 2,
        fillOpacity: 0.85,
        fillColor: '#bae6fd',
      })
      if (stop.stationName || stop.platformName) {
        marker.bindTooltip(stop.stationName ?? stop.platformName ?? '', {
          permanent: true,
          direction: 'top',
          className: 'railway-station-label',
          offset: L.point(0, -4),
        })
      }
      marker.addTo(layer)
    }
    if (layer.getLayers().length) {
      layer.addTo(map)
      this.stopLayer = layer
    }
  }

  private clearPolylines() {
    this.polylines.forEach((polyline) => polyline.remove())
    this.polylines = []
  }

  private clearStopLayer() {
    this.stopLayer?.remove()
    this.stopLayer = null
  }

  private toBounds(bounds: {
    xMin: number | null
    xMax: number | null
    zMin: number | null
    zMax: number | null
  }) {
    if (
      bounds.xMin == null ||
      bounds.xMax == null ||
      bounds.zMin == null ||
      bounds.zMax == null
    ) {
      return null
    }
    const sw = this.controller.toLatLng({
      x: Math.min(bounds.xMin, bounds.xMax),
      z: Math.min(bounds.zMin, bounds.zMax),
    })
    const ne = this.controller.toLatLng({
      x: Math.max(bounds.xMin, bounds.xMax),
      z: Math.max(bounds.zMin, bounds.zMax),
    })
    if (!sw || !ne) return null
    return L.latLngBounds(sw, ne)
  }
}
