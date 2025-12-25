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

export type StopWithColor = RailwayRouteDetail['stops'][number] & {
  color?: number | null
  groupKey?: string | null
}

type RouteGroup = {
  color?: number | null
  paths: RailwayGeometryPoint[][]
  label?: string | null
  key?: string | null
}

type DrawOptions = {
  stationFillColor?: number | null
  stationPolygon?: RailwayGeometryPoint[] | null
  stationFillOpacity?: number
  routeGroups?: RouteGroup[]
  platformSegments?: RailwayGeometryPoint[][]
  stops?: StopWithColor[]
  platformStops?: RailwayRouteDetail['stops']
  focusZoom?: number
  autoFocus?: boolean
  currentStationId?: string | null
}

const defaultColor = '#0ea5e9'
const STOP_ZOOM_SWITCH = 2
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
  private routePolylineEndpointsByGroupKey = new Map<string, RailwayGeometryPoint[]>()
  private routePolylineEndpointsAll: RailwayGeometryPoint[] = []
  private stationPolygonLayer: L.Layer | null = null
  private secondaryPolylines: L.Polyline[] = []
  private stopLayer: L.LayerGroup | null = null
  private stops: StopWithColor[] = []
  private platformStops: RailwayRouteDetail['stops'] = []
  private platformStopVersion = 0
  private currentStationId: string | null = null
  private platformSegmentByPlatformId = new Map<
    string,
    { a: RailwayGeometryPoint; b: RailwayGeometryPoint }
  >()
  private stopVersion = 0
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
      map.on('moveend', this.zoomHandler)
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
    const loaded = map
      ? '_loaded' in map
        ? Boolean((map as unknown as { _loaded?: boolean })._loaded)
        : true
      : false
    if (!map || !loaded) {
      this.pendingDraw = options
      return
    }

    this.pendingDraw = null

    this.clearRoutePolylines()
    this.clearStationPolygon()
    this.clearSecondaryPolylines()

    this.currentStationId = options.currentStationId ?? null
    this.stops = options.stops ?? []
    this.stopVersion += 1

    this.platformStops = options.platformStops ?? []
    this.platformStopVersion += 1
    this.platformSegmentByPlatformId.clear()
    for (let index = 0; index < this.platformStops.length; index += 1) {
      const stop = this.platformStops[index]
      const platformId = stop?.platformId
      const segment = options.platformSegments?.[index]
      if (!platformId || !segment?.length) continue
      const first = segment[0]
      const last = segment[segment.length - 1]
      if (!first || !last) continue
      this.platformSegmentByPlatformId.set(platformId, { a: first, b: last })
    }

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
    this.routePolylineEndpointsByGroupKey.clear()
    this.routePolylineEndpointsAll = []

    for (const group of routeGroups) {
      const color = toHexColor(group.color ?? null)
      const groupLabel = group.label?.trim()
      const groupKey = group.key ?? null

      const groupEndpoints = this.getPolylineEndpoints(group.paths ?? [])
      if (groupKey) {
        this.routePolylineEndpointsByGroupKey.set(groupKey, groupEndpoints)
      }
      this.routePolylineEndpointsAll = this.dedupeEndpoints([
        ...this.routePolylineEndpointsAll,
        ...groupEndpoints,
      ])

      for (const path of group.paths ?? []) {
        if (!path?.length) continue
        const latlngs = this.toLatLngPath(path)
        if (!latlngs.length) continue

        const polyline = L.polyline(latlngs, {
          color,
          weight: 4,
          opacity: 0.85,
          className: ROUTE_POLYLINE_CLASS,
          interactive: true,
        }).addTo(map)

        if (groupLabel) {
          polyline.bindTooltip(groupLabel, {
            permanent: false,
            sticky: true,
            direction: 'top',
            offset: L.point(0, -8),
            className: 'railway-route-hover-label',
          })
        }

        this.routePolylines.push(polyline)
      }
    }

    const platformSegments = options.platformSegments ?? []
    this.secondaryConfig = {
      color: '#ffffff',
      weight: 4,
      opacity: 0.98,
      zoomThreshold: STOP_ZOOM_SWITCH,
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

  setStops(stops: StopWithColor[] = []) {
    this.stops = stops ?? []
    this.stopVersion += 1
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
  }): L.LatLngBounds | null {
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

    const zoom = map.getZoom()
    const showPlatforms = zoom >= STOP_ZOOM_SWITCH

    const labelZoomThreshold = this.stopRenderConfig.labelZoomThreshold
    const shouldRender =
      labelZoomThreshold == null ? true : zoom >= labelZoomThreshold

    if (!shouldRender) {
      this.clearStopLayer()
      return
    }

    this.clearStopLayer()
    const layer = L.layerGroup()

    if (this.stops.length) {
      // Always render route stops with terminal snapping, even when zoomed out.
      this.renderRouteStopGroups(layer)
    } else {
      // Fallback: no route-map stops, render whatever we have.
      this.renderStopList(layer, this.platformStops, false, map)
    }

    if (showPlatforms) {

      const platformSources = this.platformStops.length
        ? this.platformStops
        : this.stops.filter(
            (stop) =>
              stop.stationId && this.currentStationId
                ? stop.stationId === this.currentStationId
                : false,
          )

      if (platformSources.length) {
        this.renderStopList(layer, platformSources, true, map)
      }
    }

    layer.addTo(map)
    this.stopLayer = layer
  }

  private renderStopList(
    layer: L.LayerGroup,
    stops: StopWithColor[],
    isPlatformStyle: boolean,
    map: L.Map,
  ) {
    const markerMode = this.stopRenderConfig.markerMode
    if (!isPlatformStyle && markerMode === 'none') return

    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index]
      const position = stop?.position
      if (!position) continue

      const rawLabel = isPlatformStyle
        ? stop.platformName || stop.platformId
        : stop.stationName ||
          stop.stationId ||
          stop.platformName ||
          stop.platformId
      const labelText = (rawLabel || '').split('|')[0]
      if (!labelText) continue

      const center = this.toLatLng(position)

      let marker: L.Layer

      if (isPlatformStyle) {
        marker = this.createPlatformArrowMarker({ map, stop, center })
      } else {
        if (markerMode === 'circle') {
          const colorHex = toHexColor(stop.color)
          marker = L.circleMarker(center, {
            radius: 7,
            color: colorHex,
            weight: 3,
            fill: true,
            fillColor: '#ffffff',
            fillOpacity: 1,
            interactive: false,
          })
        } else {
          marker = L.marker(center, {
            interactive: false,
            opacity: 0,
          })
        }
      }

      marker.bindTooltip(labelText, {
        permanent: true,
        className: isPlatformStyle
          ? 'railway-station-label-small'
          : 'railway-station-label',
        direction: LABEL_POSITIONS[index % LABEL_POSITIONS.length].direction,
        offset: LABEL_POSITIONS[index % LABEL_POSITIONS.length].offset,
      })

      marker.addTo(layer)
    }
  }

  private renderRouteStopGroups(layer: L.LayerGroup) {
    const markerMode = this.stopRenderConfig.markerMode
    if (markerMode === 'none') return

    const groups = new Map<string, StopWithColor[]>()
    for (const stop of this.stops) {
      const key = (stop.groupKey ?? '__default') as string
      const list = groups.get(key)
      if (list) list.push(stop)
      else groups.set(key, [stop])
    }

    let globalIndex = 0
    for (const [key, groupStops] of groups) {
      const endpoints =
        key !== '__default'
          ? this.routePolylineEndpointsByGroupKey.get(key) ??
            this.routePolylineEndpointsAll
          : this.routePolylineEndpointsAll

      const terminals = this.getTerminalStopIndicesWithPosition(groupStops)

      for (let index = 0; index < groupStops.length; index += 1) {
        const stop = groupStops[index]

        const rawLabel =
          stop.stationName ||
          stop.stationId ||
          stop.platformName ||
          stop.platformId
        const labelText = (rawLabel || '').split('|')[0]
        if (!labelText) continue

        const position = this.getStopMarkerPosition(
          index,
          stop,
          groupStops,
          terminals,
          endpoints ?? [],
        )
        if (!position) continue

        const center = this.toLatLng(position)
        if (!center) continue

        let marker: L.Layer
        if (markerMode === 'circle') {
          const colorHex = toHexColor(stop.color)
          marker = L.circleMarker(center, {
            radius: 7,
            color: colorHex,
            weight: 3,
            fill: true,
            fillColor: '#ffffff',
            fillOpacity: 1,
            interactive: false,
          })
        } else {
          marker = L.marker(center, {
            interactive: false,
            opacity: 0,
          })
        }

        marker.bindTooltip(labelText, {
          permanent: true,
          className: 'railway-station-label',
          direction: LABEL_POSITIONS[globalIndex % LABEL_POSITIONS.length]
            .direction,
          offset: LABEL_POSITIONS[globalIndex % LABEL_POSITIONS.length].offset,
        })

        marker.addTo(layer)
        globalIndex += 1
      }
    }
  }

  private getPolylineEndpoints(paths: RailwayGeometryPoint[][]) {
    const endpoints: RailwayGeometryPoint[] = []
    for (const path of paths) {
      if (!path?.length) continue
      endpoints.push(path[0])
      endpoints.push(path[path.length - 1])
    }
    return this.dedupeEndpoints(endpoints)
  }

  private dedupeEndpoints(points: RailwayGeometryPoint[]) {
    if (!points.length) return []
    const result: RailwayGeometryPoint[] = []
    for (const point of points) {
      const exists = result.some(
        (p) => Math.abs(p.x - point.x) < 1e-3 && Math.abs(p.z - point.z) < 1e-3,
      )
      if (!exists) {
        result.push(point)
      }
    }
    return result
  }

  private pickNearestEndpoint(
    target: RailwayGeometryPoint,
    endpoints: RailwayGeometryPoint[],
  ) {
    if (!endpoints.length) return null
    let best = endpoints[0]
    let bestDist = Number.POSITIVE_INFINITY
    for (const point of endpoints) {
      const dx = point.x - target.x
      const dz = point.z - target.z
      const dist = dx * dx + dz * dz
      if (dist < bestDist) {
        bestDist = dist
        best = point
      }
    }
    return best
  }

  private pickNearestDirectionalEndpoint(
    target: RailwayGeometryPoint,
    direction: RailwayGeometryPoint,
    endpoints: RailwayGeometryPoint[],
    options?: {
      maxSnapDistance?: number
      minAlignment?: number
    },
  ) {
    if (!endpoints.length) return null
    const len = Math.hypot(direction.x, direction.z)
    if (!Number.isFinite(len) || len < 1e-6) {
      return this.pickNearestEndpoint(target, endpoints)
    }

    const vx = direction.x / len
    const vz = direction.z / len
    const maxSnapDistance = options?.maxSnapDistance ?? 2000
    const maxDist2 = maxSnapDistance * maxSnapDistance
    const minAlignment = options?.minAlignment ?? 0.2

    let best: RailwayGeometryPoint | null = null
    let bestDist2 = Number.POSITIVE_INFINITY

    for (const point of endpoints) {
      const dx = point.x - target.x
      const dz = point.z - target.z
      const dist2 = dx * dx + dz * dz
      if (dist2 > maxDist2) continue

      const dist = Math.sqrt(dist2)
      const forward = dx * vx + dz * vz
      if (forward <= 0) continue

      const alignment = forward / (dist + 1e-6)
      if (alignment < minAlignment) continue

      if (dist2 < bestDist2) {
        best = point
        bestDist2 = dist2
      }
    }

    return best
  }

  private getNearestNeighborPosition(
    stops: StopWithColor[],
    index: number,
    step: 1 | -1,
  ) {
    for (let i = index + step; i >= 0 && i < stops.length; i += step) {
      const pos = stops[i]?.position
      if (pos) return pos
    }
    return null
  }

  private getTerminalStopIndicesWithPosition(stops: StopWithColor[]): {
    first: number
    last: number
  } | null {
    if (!stops.length) return null
    let first: number | null = null
    let last: number | null = null
    for (let index = 0; index < stops.length; index += 1) {
      if (stops[index]?.position) {
        first = index
        break
      }
    }
    for (let index = stops.length - 1; index >= 0; index -= 1) {
      if (stops[index]?.position) {
        last = index
        break
      }
    }
    if (first == null || last == null) return null
    return { first, last }
  }

  private getStopMarkerPosition(
    index: number,
    stop: StopWithColor,
    stops: StopWithColor[],
    terminals: { first: number; last: number } | null,
    endpoints: RailwayGeometryPoint[],
  ): RailwayGeometryPoint | null {
    if (!stop.position) return null

    const isFirst = terminals != null && index === terminals.first
    const isLast = terminals != null && index === terminals.last
    if (!isFirst && !isLast) return stop.position
    if (!endpoints.length) return stop.position

    const neighbor = this.getNearestNeighborPosition(
      stops,
      index,
      isFirst ? 1 : -1,
    )
    const direction = neighbor
      ? {
          x: stop.position.x - neighbor.x,
          z: stop.position.z - neighbor.z,
        }
      : { x: 0, z: 0 }

    const MAX_TERMINAL_SNAP_DISTANCE = 10000

    const directional = this.pickNearestDirectionalEndpoint(
      stop.position,
      direction,
      endpoints,
      { maxSnapDistance: MAX_TERMINAL_SNAP_DISTANCE },
    )
    if (directional) return directional

    const nearest = this.pickNearestEndpoint(stop.position, endpoints)
    if (!nearest) return stop.position

    const dx = nearest.x - stop.position.x
    const dz = nearest.z - stop.position.z
    const dist2 = dx * dx + dz * dz
    if (dist2 <= MAX_TERMINAL_SNAP_DISTANCE * MAX_TERMINAL_SNAP_DISTANCE) {
      return nearest
    }

    return stop.position
  }

  private createPlatformArrowMarker(input: {
    map: L.Map
    stop: RailwayRouteDetail['stops'][number]
    center: L.LatLng
  }) {
    return L.marker(input.center, {
      icon: L.divIcon({
        className: 'railway-platform-arrow',
        html: `<div class="railway-platform-arrow-icon"><span class="railway-platform-arrow-dot"></span></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
      interactive: false,
      keyboard: false,
    })
  }
}
