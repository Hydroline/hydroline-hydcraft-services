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

type RouteGroup = {
  color?: number | null
  paths: RailwayGeometryPoint[][]
}

type DrawOptions = {
  stationFillColor?: number | null
  stationPolygon?: RailwayGeometryPoint[] | null
  stationFillOpacity?: number
  routeGroups?: RouteGroup[]
  platformSegments?: RailwayGeometryPoint[][]
  stops?: RailwayRouteDetail['stops']
  focusZoom?: number
  autoFocus?: boolean
}

const defaultColor = '#0ea5e9'
const STATION_AREA_ZOOM = 2
const ROUTE_POLYLINE_CLASS = 'railway-route-polyline'
const SECONDARY_POLYLINE_CLASS = 'railway-secondary-polyline'

const LABEL_POSITIONS: Array<{
  direction: L.Direction
  offset: L.PointExpression
}> = [
  { direction: 'top', offset: L.point(0, -10) },
  { direction: 'right', offset: L.point(10, 0) },
  { direction: 'bottom', offset: L.point(0, 10) },
  { direction: 'left', offset: L.point(-10, 0) },
]

function toHexColor(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return defaultColor
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`
}

export class RailwayStationRoutesMap {
  private controller: DynmapMapController
  private routePolylines: L.Polyline[] = []
  private stationPolygonLayer: L.Layer | null = null
  private secondaryPolylines: L.Polyline[] = []
  private stopLayer: L.LayerGroup | null = null
  private stops: RailwayRouteDetail['stops'] = []
  private stopVersion = 0
  private lastStopRenderKey: string | null = null
  private zoomHandler: (() => void) | null = null
  private pendingDraw: DrawOptions | null = null

  private secondaryConfig: {
    color: string
    weight: number
    opacity: number
    zoomThreshold: number
  } | null = null

  private stopRenderConfig: {
    markerMode: 'circle' | 'label-only' | 'none'
    labelZoomThreshold: number | null
    labelClassName: string
  } = {
    markerMode: 'circle',
    labelZoomThreshold: null,
    labelClassName: 'railway-station-label-small',
  }

  constructor() {
    this.controller = createHydcraftDynmapMap()
  }

  mount(options: DynmapMapInitOptions) {
    this.controller.mount(options)
    const map = this.controller.getLeafletInstance()
    if (map) {
      this.zoomHandler = () => {
        this.renderStops()
        this.syncSecondaryPolylines()
      }
      map.on('zoomend', this.zoomHandler)
      map.whenReady(() => {
        this.commitPendingDraw()
      })
    }
  }

  getController() {
    return this.controller
  }

  draw(options: DrawOptions) {
    const map = this.controller.getLeafletInstance()
    if (!map || !map['_loaded']) {
      this.pendingDraw = options
      return
    }

    this.pendingDraw = null

    this.clearRoutePolylines()
    this.clearStationPolygon()
    this.clearSecondaryPolylines()

    this.stops = options.stops ?? []
    this.stopVersion += 1
    this.lastStopRenderKey = null

    const stationFillColor = toHexColor(options.stationFillColor ?? null)
    const stationPolygon = options.stationPolygon ?? null
    if (stationPolygon?.length) {
      const latlngs = this.toLatLngPath(stationPolygon)
      if (latlngs.length) {
        this.stationPolygonLayer = L.polygon(latlngs, {
          stroke: false,
          fill: true,
          fillColor: stationFillColor,
          fillOpacity: options.stationFillOpacity ?? 0.7,
          className: ROUTE_POLYLINE_CLASS,
        }).addTo(map)
      }
    }

    const routeGroups = options.routeGroups ?? []
    for (const group of routeGroups) {
      const color = toHexColor(group.color ?? null)
      for (const path of group.paths ?? []) {
        if (!path?.length) continue
        const latlngs = this.toLatLngPath(path)
        if (!latlngs.length) continue
        const polyline = L.polyline(latlngs, {
          color,
          weight: 4,
          opacity: 0.85,
          className: ROUTE_POLYLINE_CLASS,
        }).addTo(map)
        this.routePolylines.push(polyline)
      }
    }

    const platformSegments = options.platformSegments ?? []
    this.secondaryConfig = {
      color: '#ffffff',
      weight: 4,
      opacity: 0.98,
      zoomThreshold: 3,
    }

    for (const seg of platformSegments) {
      if (!seg?.length) continue
      const latlngs = this.toLatLngPath(seg)
      if (!latlngs.length) continue
      const polyline = L.polyline(latlngs, {
        color: this.secondaryConfig.color,
        weight: this.secondaryConfig.weight,
        opacity: this.secondaryConfig.opacity,
        className: SECONDARY_POLYLINE_CLASS,
      }).addTo(map)
      this.secondaryPolylines.push(polyline)
    }

    // Keep platforms above station fill.
    for (const polyline of this.secondaryPolylines) {
      polyline.bringToFront()
    }

    this.renderStops()

    const shouldAutoFocus = options.autoFocus ?? true
    if (shouldAutoFocus) {
      const bounds = this.computeAllBounds({
        stationPolygon,
        routeGroups,
        platformSegments,
      })
      if (bounds && bounds.isValid()) {
        const padding = L.point(32, 32)
        map.flyToBounds(bounds, {
          padding: [padding.x, padding.y],
          maxZoom: options.focusZoom ?? 4,
        })
      }
    }

    this.syncSecondaryPolylines()
  }

  setStops(stops: RailwayRouteDetail['stops'] = []) {
    this.stops = stops ?? []
    this.stopVersion += 1
    this.lastStopRenderKey = null
    this.renderStops()
  }

  destroy() {
    this.clearRoutePolylines()
    this.clearStationPolygon()
    this.clearSecondaryPolylines()
    this.clearStopLayer()
    const map = this.controller.getLeafletInstance()
    if (map && this.zoomHandler) {
      map.off('zoomend', this.zoomHandler)
    }
    this.zoomHandler = null
    this.controller.destroy()
  }

  private commitPendingDraw() {
    if (!this.pendingDraw) return
    const next = this.pendingDraw
    this.pendingDraw = null
    this.draw(next)
  }

  private clearRoutePolylines() {
    const map = this.controller.getLeafletInstance()
    if (map) {
      for (const polyline of this.routePolylines) {
        polyline.removeFrom(map)
      }
    }
    this.routePolylines = []
  }

  private clearStationPolygon() {
    const map = this.controller.getLeafletInstance()
    if (map && this.stationPolygonLayer) {
      this.stationPolygonLayer.removeFrom(map)
    }
    this.stationPolygonLayer = null
  }

  private clearSecondaryPolylines() {
    const map = this.controller.getLeafletInstance()
    if (map) {
      for (const polyline of this.secondaryPolylines) {
        polyline.removeFrom(map)
      }
    }
    this.secondaryPolylines = []
  }

  private syncSecondaryPolylines() {
    const map = this.controller.getLeafletInstance()
    if (!map || !this.secondaryConfig) return
    const zoom = map.getZoom()
    const shouldShow = zoom >= this.secondaryConfig.zoomThreshold
    for (const polyline of this.secondaryPolylines) {
      polyline.setStyle({
        opacity: shouldShow ? this.secondaryConfig.opacity : 0,
      })
    }
  }

  private computeAllBounds(input: {
    stationPolygon: RailwayGeometryPoint[] | null
    routeGroups: RouteGroup[]
    platformSegments: RailwayGeometryPoint[][]
  }) {
    const map = this.controller.getLeafletInstance()
    if (!map) return null

    let bounds: L.LatLngBounds | null = null

    const extendWithPoints = (
      points: RailwayGeometryPoint[] | null | undefined,
    ) => {
      if (!points?.length) return
      const latlngs = this.toLatLngPath(points)
      if (!latlngs.length) return
      const next = L.latLngBounds(latlngs)
      bounds = bounds ? bounds.extend(next) : next
    }

    extendWithPoints(input.stationPolygon)

    for (const group of input.routeGroups) {
      for (const path of group.paths ?? []) {
        extendWithPoints(path)
      }
    }

    for (const seg of input.platformSegments) {
      extendWithPoints(seg)
    }

    return bounds
  }

  private toLatLng(point: RailwayGeometryPoint) {
    return this.controller.toLatLng(point)
  }

  private toLatLngPath(path: RailwayGeometryPoint[]) {
    return (path ?? [])
      .map((point) => {
        if (typeof point?.x !== 'number' || typeof point?.z !== 'number')
          return null
        return this.toLatLng(point)
      })
      .filter((value): value is L.LatLng => Boolean(value))
  }

  private clearStopLayer() {
    const map = this.controller.getLeafletInstance()
    if (map && this.stopLayer) {
      this.stopLayer.removeFrom(map)
    }
    this.stopLayer = null
  }

  private renderStops() {
    const map = this.controller.getLeafletInstance()
    if (!map) return
    if (!this.stops.length) {
      this.clearStopLayer()
      this.lastStopRenderKey = null
      return
    }

    const markerMode = this.stopRenderConfig.markerMode
    if (markerMode === 'none') return

    const zoom = map.getZoom()
    const labelZoomThreshold = this.stopRenderConfig.labelZoomThreshold
    const shouldRender =
      labelZoomThreshold == null ? true : zoom >= labelZoomThreshold

    const renderKey = `${shouldRender ? 'on' : 'off'}:${this.stopVersion}`
    if (this.lastStopRenderKey === renderKey) {
      return
    }
    this.lastStopRenderKey = renderKey

    if (!shouldRender) {
      this.clearStopLayer()
      return
    }

    this.clearStopLayer()

    const layer = L.layerGroup()
    for (let index = 0; index < this.stops.length; index += 1) {
      const stop = this.stops[index]
      const position = stop?.position
      if (!position) continue

      const labelText = (stop.platformName || stop.platformId || '').split(
        '|',
      )[0]
      if (!labelText) continue

      const center = this.toLatLng(position)

      const marker =
        markerMode === 'circle'
          ? L.circleMarker(center, {
              radius: 3,
              stroke: false,
              fill: true,
              fillColor: '#ffffff',
              fillOpacity: 0.95,
              interactive: false,
            })
          : L.marker(center, {
              interactive: false,
              opacity: 0,
            })

      marker.bindTooltip(labelText, {
        permanent: true,
        className: this.stopRenderConfig.labelClassName,
        direction: LABEL_POSITIONS[index % LABEL_POSITIONS.length].direction,
        offset: LABEL_POSITIONS[index % LABEL_POSITIONS.length].offset,
      })

      marker.addTo(layer)
    }

    layer.addTo(map)
    this.stopLayer = layer
  }
}
