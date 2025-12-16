import L from 'leaflet'
import {
  createHydcraftDynmapMap,
  DynmapMapController,
  type DynmapMapInitOptions,
} from '@/utils/map'
import type { RailwayGeometryPoint } from '@/types/transportation'

type DrawOptions = {
  color?: number | null
  weight?: number
  opacity?: number
  focusZoom?: number
}

const defaultColor = '#0ea5e9'

function toHexColor(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return defaultColor
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`
}

export class RailwayMap {
  private controller: DynmapMapController
  private polylines: L.Polyline[] = []

  constructor() {
    this.controller = createHydcraftDynmapMap()
  }

  mount(options: DynmapMapInitOptions) {
    this.controller.mount(options)
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
    this.controller.destroy()
  }

  private clearPolylines() {
    this.polylines.forEach((polyline) => polyline.remove())
    this.polylines = []
  }
}
