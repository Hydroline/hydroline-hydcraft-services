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
  fill?: boolean
  fillOpacity?: number
  focusZoom?: number
  pathLabels?: Array<string | null | undefined>
  secondaryPaths?: RailwayGeometryPoint[][]
  secondaryPathLabels?: Array<string | null | undefined>
  secondaryZoomThreshold?: number
  forceShowSecondary?: boolean
  autoFocus?: boolean
  stopMarkerMode?: 'circle' | 'label-only' | 'none'
  stopLabelZoomThreshold?: number
  stopLabelClassName?: string
  secondaryColor?: number | null
  secondaryWeight?: number
  secondaryOpacity?: number
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

function bindRouteHoverLabel(polyline: L.Polyline, label: string) {
  const text = label.trim()
  if (!text) return
  polyline.bindTooltip(text, {
    permanent: false,
    sticky: true,
    direction: 'top',
    offset: L.point(0, -8),
    className: 'railway-route-hover-label',
  })
}

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
  private routeColor = defaultColor
  private polylineEndpoints: RailwayGeometryPoint[] = []
  private secondaryPaths: RailwayGeometryPoint[][] = []
  private secondaryPathLabels: Array<string | null> = []
  private secondaryPolylines: L.Polyline[] = []
  private secondaryConfig: {
    color: string
    weight: number
    opacity: number
    zoomThreshold: number
    force: boolean
  } | null = null
  private stopRenderConfig: {
    markerMode: 'circle' | 'label-only' | 'none'
    labelZoomThreshold: number | null
    labelClassName: string
  } = {
    markerMode: 'circle',
    labelZoomThreshold: null,
    labelClassName: 'railway-station-label',
  }
  private oversizeFallback: {
    center: L.LatLng
    zoom: number
  } | null = null
  private oversizeRaf: number | null = null
  private pendingDraw: {
    paths: RailwayGeometryPoint[][]
    options?: DrawOptions
  } | null = null

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

  drawGeometry(paths: RailwayGeometryPoint[][] = [], options?: DrawOptions) {
    this.clearPolylines()
    this.clearSecondaryPolylines()
    this.secondaryPaths = options?.secondaryPaths ?? []
    this.secondaryPathLabels = (options?.secondaryPathLabels ?? []).map((v) =>
      typeof v === 'string' ? v : null,
    )
    const pathLabels = (options?.pathLabels ?? []).map((v) =>
      typeof v === 'string' ? v : null,
    )
    const map = this.controller.getLeafletInstance()
    if (!map || !map['_loaded']) {
      this.pendingDraw = { paths, options }
      return
    }
    if (!map) return
    const color = toHexColor(options?.color ?? null)
    this.routeColor = color
    this.stopRenderConfig = {
      markerMode: options?.stopMarkerMode ?? 'circle',
      labelZoomThreshold:
        typeof options?.stopLabelZoomThreshold === 'number'
          ? options.stopLabelZoomThreshold
          : null,
      labelClassName:
        options?.stopLabelClassName?.trim() || 'railway-station-label',
    }
    // When rendering filled polygons (e.g. station/depot bounds), the "path" is a closed shape.
    // The terminal-stop endpoint adjustment (designed for route polylines) would incorrectly
    // snap the first/last stop to the polygon's first vertex (often top-left corner).
    // For fill geometry, keep stops at their own positions.
    const endpointCandidatePaths = options?.fill
      ? []
      : [...paths, ...(options?.secondaryPaths ?? [])]
    this.polylineEndpoints = options?.fill
      ? []
      : this.getPolylineEndpoints(endpointCandidatePaths)
    const focusZoom = options?.focusZoom ?? 4
    if (!paths.length && !this.secondaryPaths.length) {
      this.syncSecondaryPolylines()
      return
    }
    const focusPoint = paths[0]?.[0] ?? this.secondaryPaths[0]?.[0]
    const secondaryColorHex = toHexColor(
      options?.secondaryColor ?? options?.color ?? null,
    )
    const secondaryWeight =
      options?.secondaryWeight ?? Math.max(2, (options?.weight ?? 4) - 1)
    const secondaryOpacity =
      options?.secondaryOpacity ?? Math.min(1, (options?.opacity ?? 0.9) * 0.85)
    const secondaryZoomThreshold =
      options?.secondaryZoomThreshold ?? STATION_AREA_ZOOM
    const forceSecondary = Boolean(options?.forceShowSecondary)
    this.secondaryConfig = {
      color: secondaryColorHex,
      weight: secondaryWeight,
      opacity: secondaryOpacity,
      zoomThreshold: secondaryZoomThreshold,
      force: forceSecondary,
    }
    let bounds: L.LatLngBounds | null = null
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index]
      if (!path?.length) continue
      const latlngs = this.toLatLngPath(path)
      if (!latlngs.length) continue
      const label = pathLabels[index]
      const polyline = options?.fill
        ? L.polygon(latlngs, {
            stroke: false,
            fill: true,
            fillColor: color,
            fillOpacity: options?.fillOpacity ?? 0.7,
            className: ROUTE_POLYLINE_CLASS,
            interactive: false,
          }).addTo(map)
        : L.polyline(latlngs, {
            color,
            weight: options?.weight ?? 4,
            opacity: options?.opacity ?? 0.85,
            className: ROUTE_POLYLINE_CLASS,
            interactive: true,
          }).addTo(map)
      this.polylines.push(polyline)
      if (!options?.fill && label) {
        bindRouteHoverLabel(polyline, label)
      }
      const polyBounds = polyline.getBounds()
      bounds = bounds ? bounds.extend(polyBounds) : polyBounds
    }
    const allPaths = [...paths, ...this.secondaryPaths]
    for (const path of allPaths) {
      if (!path?.length) continue
      const latlngs = this.toLatLngPath(path)
      if (!latlngs.length) continue
      const pathBounds = L.latLngBounds(latlngs)
      bounds = bounds ? bounds.extend(pathBounds) : pathBounds
    }
    const shouldAutoFocus = options?.autoFocus ?? true
    if (!shouldAutoFocus) {
      this.syncSecondaryPolylines()
      this.renderStops()
      return
    }

    if (bounds && bounds.isValid()) {
      const padding = L.point(32, 32)
      const targetZoom = map.getBoundsZoom(bounds, false, padding)
      const minZoom = map.getMinZoom()

      // 线路跨度过大：若需要缩小到 minZoom 以下才看全，则改为“中心定位 + 首站可见偏移”。
      if (targetZoom < minZoom) {
        const center = bounds.getCenter()
        this.oversizeFallback = { center, zoom: minZoom }
        this.scheduleOversizeFocus(map)
        this.renderStops()
        return
      }

      this.oversizeFallback = null
      map.flyToBounds(bounds, {
        padding: [padding.x, padding.y],
        maxZoom: focusZoom,
      })
    } else if (focusPoint) {
      this.controller.flyToBlock(focusPoint, focusZoom)
    }
    this.syncSecondaryPolylines()
    this.renderStops()
  }

  destroy() {
    this.clearPolylines()
    this.clearSecondaryPolylines()
    const map = this.controller.getLeafletInstance()
    if (map && this.zoomHandler) {
      map.off('zoomend', this.zoomHandler)
    }
    this.zoomHandler = null
    if (this.oversizeRaf != null) {
      cancelAnimationFrame(this.oversizeRaf)
      this.oversizeRaf = null
    }
    this.clearStopLayer()
    this.controller.destroy()
  }

  setStops(stops: RailwayRouteDetail['stops'] = []) {
    this.stops = stops ?? []
    this.renderStops()

    // 若 drawGeometry 触发过 oversize fallback，此时 stops 可能刚刚才加载，补一次首站可见偏移。
    const map = this.controller.getLeafletInstance()
    if (map && this.oversizeFallback) {
      this.scheduleOversizeFocus(map)
    }
  }

  private renderStops() {
    const map = this.controller.getLeafletInstance()
    if (!map) return
    this.clearStopLayer()
    if (!this.stops.length) return
    const zoom = map.getZoom()
    const showArea = zoom >= STATION_AREA_ZOOM
    const layer = L.layerGroup()
    const terminalIndices = this.getTerminalStopIndicesWithPosition()
    for (let index = 0; index < this.stops.length; index += 1) {
      const stop = this.stops[index]
      if (showArea && stop.bounds) {
        const bounds = this.toBounds(stop.bounds)
        if (!bounds) continue
        const rectangle = L.rectangle(bounds, {
          stroke: false,
          fill: true,
          fillColor: this.routeColor,
          fillOpacity: 0.7,
        })
        const stopLabel = this.getStopLabel(stop)
        if (stopLabel) {
          rectangle.bindTooltip(stopLabel, {
            permanent: true,
            direction: 'center',
            className: this.stopRenderConfig.labelClassName,
          })
        }
        rectangle.addTo(layer)
        continue
      }

      const markerMode = this.stopRenderConfig.markerMode
      if (markerMode === 'none') {
        continue
      }
      const position = this.getStopMarkerPosition(index, stop)
      if (!position) continue
      const latlng = this.controller.toLatLng({ x: position.x, z: position.z })
      if (!latlng) continue
      const stopLabel = this.getStopLabel(stop)
      const shouldShowLabel =
        Boolean(stopLabel) &&
        (this.stopRenderConfig.labelZoomThreshold == null ||
          zoom >= this.stopRenderConfig.labelZoomThreshold)

      if (markerMode === 'label-only') {
        if (!shouldShowLabel) continue
        const anchor = L.marker(latlng, {
          icon: L.divIcon({
            className: 'railway-stop-anchor',
            html: '',
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          interactive: false,
          keyboard: false,
        })
        const labelPosition = this.pickLabelPosition(index)
        anchor.bindTooltip(stopLabel!, {
          permanent: true,
          direction: labelPosition.direction,
          className: this.stopRenderConfig.labelClassName,
          offset: labelPosition.offset,
        })
        anchor.addTo(layer)
        continue
      }

      // Default: circle marker (routes/depots) + optional label.
      const isTerminal =
        terminalIndices != null &&
        (index === terminalIndices.first || index === terminalIndices.last)
      const marker = L.circleMarker(latlng, {
        radius: 7,
        color: this.routeColor,
        weight: 3,
        fillOpacity: 1,
        fillColor: '#ffffff',
      })
      if (shouldShowLabel) {
        const labelPosition = this.pickLabelPosition(index)
        marker.bindTooltip(stopLabel!, {
          permanent: true,
          direction: labelPosition.direction,
          className: this.stopRenderConfig.labelClassName,
          offset: labelPosition.offset,
        })
      }
      marker.addTo(layer)
    }
    if (layer.getLayers().length) {
      layer.addTo(map)
      this.stopLayer = layer
    }
  }

  private getTerminalStopIndicesWithPosition(): {
    first: number
    last: number
  } | null {
    if (!this.stops.length) return null
    let first = -1
    let last = -1
    for (let i = 0; i < this.stops.length; i += 1) {
      if (this.stops[i]?.position) {
        first = i
        break
      }
    }
    for (let i = this.stops.length - 1; i >= 0; i -= 1) {
      if (this.stops[i]?.position) {
        last = i
        break
      }
    }
    if (first < 0 || last < 0) return null
    return { first, last }
  }

  private clearPolylines() {
    this.polylines.forEach((polyline) => polyline.remove())
    this.polylines = []
  }

  private syncSecondaryPolylines() {
    const map = this.controller.getLeafletInstance()
    if (!map) return
    const config = this.secondaryConfig
    if (!config || !this.secondaryPaths.length) {
      this.clearSecondaryPolylines()
      return
    }
    const zoom = map.getZoom()
    const shouldShow = config.force || zoom >= config.zoomThreshold
    if (!shouldShow) {
      this.clearSecondaryPolylines()
      return
    }
    if (this.secondaryPolylines.length) {
      return
    }

    const secondaryPolylines: L.Polyline[] = []
    for (let index = 0; index < this.secondaryPaths.length; index += 1) {
      const path = this.secondaryPaths[index]
      if (!path?.length) continue
      const latlngs = this.toLatLngPath(path)
      if (!latlngs.length) continue
      const label = this.secondaryPathLabels[index]
      const polyline = L.polyline(latlngs, {
        color: config.color,
        weight: config.weight,
        opacity: config.opacity,
        className: `${ROUTE_POLYLINE_CLASS} ${SECONDARY_POLYLINE_CLASS}`,
        interactive: true,
      }).addTo(map)
      if (label) {
        bindRouteHoverLabel(polyline, label)
      }
      secondaryPolylines.push(polyline)
    }
    this.secondaryPolylines = secondaryPolylines
  }

  private clearStopLayer() {
    this.stopLayer?.remove()
    this.stopLayer = null
  }

  private clearSecondaryPolylines() {
    this.secondaryPolylines.forEach((polyline) => polyline.remove())
    this.secondaryPolylines = []
  }

  private toLatLngPath(path: RailwayGeometryPoint[]) {
    return path
      .map((point) =>
        this.controller.toLatLng({
          x: point.x,
          z: point.z,
        }),
      )
      .filter(Boolean) as L.LatLngExpression[]
  }

  private commitPendingDraw() {
    if (!this.pendingDraw) return
    const { paths, options } = this.pendingDraw
    this.pendingDraw = null
    this.drawGeometry(paths, options)
  }

  private getStopLabel(stop: RailwayRouteDetail['stops'][number]) {
    const raw = stop.stationName ?? stop.platformName ?? stop.stationId
    if (!raw) return ''
    return raw.split('|')[0]?.trim() ?? ''
  }

  private pickLabelPosition(index: number) {
    if (!LABEL_POSITIONS.length) {
      return { direction: 'top' as L.Direction, offset: L.point(0, -12) }
    }
    return LABEL_POSITIONS[index % LABEL_POSITIONS.length]
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
    // Allow some bending: terminal endpoints are often not perfectly collinear
    // with the station-center direction.
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

  private pickDirectionalEndpoint(
    target: RailwayGeometryPoint,
    direction: RailwayGeometryPoint,
    endpoints: RailwayGeometryPoint[],
  ) {
    if (!endpoints.length) return null
    const len = Math.hypot(direction.x, direction.z)
    if (!Number.isFinite(len) || len < 1e-6) {
      return this.pickNearestEndpoint(target, endpoints)
    }
    const vx = direction.x / len
    const vz = direction.z / len

    let best: RailwayGeometryPoint | null = null
    let bestForward = -Infinity
    let bestAlignment = -Infinity
    let bestDist2 = Number.POSITIVE_INFINITY

    // Key rule: only snap to *nearby* endpoints in the intended direction.
    // Otherwise a terminal stop could incorrectly snap to the far end of the route
    // if the overall polyline bends back into the same general direction.
    const MIN_ALIGNMENT = 0.35
    const MAX_SNAP_DISTANCE = 800
    const maxDist2 = MAX_SNAP_DISTANCE * MAX_SNAP_DISTANCE

    for (const point of endpoints) {
      const dx = point.x - target.x
      const dz = point.z - target.z
      const dist2 = dx * dx + dz * dz
      if (dist2 > maxDist2) continue
      const dist = Math.sqrt(dist2)
      const forward = dx * vx + dz * vz
      if (forward <= 0) continue

      const alignment = forward / (dist + 1e-6)
      if (alignment < MIN_ALIGNMENT) continue

      if (
        forward > bestForward ||
        (forward === bestForward && alignment > bestAlignment) ||
        (forward === bestForward &&
          alignment === bestAlignment &&
          dist2 < bestDist2)
      ) {
        best = point
        bestForward = forward
        bestAlignment = alignment
        bestDist2 = dist2
      }
    }

    return best ?? this.pickNearestEndpoint(target, endpoints)
  }

  private getNearestNeighborPosition(index: number, step: 1 | -1) {
    for (let i = index + step; i >= 0 && i < this.stops.length; i += step) {
      const pos = this.stops[i]?.position
      if (pos) return pos
    }
    return null
  }

  private getStopMarkerPosition(
    index: number,
    stop: RailwayRouteDetail['stops'][number],
  ): RailwayGeometryPoint | null {
    const terminals = this.getTerminalStopIndicesWithPosition()
    const isFirst = terminals != null && index === terminals.first
    const isLast = terminals != null && index === terminals.last
    const endpoints = this.polylineEndpoints
    if (isFirst) {
      if (stop.position) {
        if (endpoints.length) {
          const neighbor = this.getNearestNeighborPosition(index, 1)
          const direction = neighbor
            ? {
                x: stop.position.x - neighbor.x,
                z: stop.position.z - neighbor.z,
              }
            : { x: 0, z: 0 }

          const directional = this.pickNearestDirectionalEndpoint(
            stop.position,
            direction,
            endpoints,
          )
          if (directional) return directional

          const nearest = this.pickNearestEndpoint(stop.position, endpoints)
          if (nearest) {
            const dx = nearest.x - stop.position.x
            const dz = nearest.z - stop.position.z
            const dist2 = dx * dx + dz * dz
            const MAX_TERMINAL_SNAP_DISTANCE = 2000
            if (
              dist2 <=
              MAX_TERMINAL_SNAP_DISTANCE * MAX_TERMINAL_SNAP_DISTANCE
            ) {
              return nearest
            }
          }
        }
        return stop.position
      }
      return null
    }
    if (isLast) {
      if (stop.position) {
        if (endpoints.length) {
          const neighbor = this.getNearestNeighborPosition(index, -1)
          const direction = neighbor
            ? {
                x: stop.position.x - neighbor.x,
                z: stop.position.z - neighbor.z,
              }
            : { x: 0, z: 0 }

          const directional = this.pickNearestDirectionalEndpoint(
            stop.position,
            direction,
            endpoints,
          )
          if (directional) return directional

          const nearest = this.pickNearestEndpoint(stop.position, endpoints)
          if (nearest) {
            const dx = nearest.x - stop.position.x
            const dz = nearest.z - stop.position.z
            const dist2 = dx * dx + dz * dz
            const MAX_TERMINAL_SNAP_DISTANCE = 2000
            if (
              dist2 <=
              MAX_TERMINAL_SNAP_DISTANCE * MAX_TERMINAL_SNAP_DISTANCE
            ) {
              return nearest
            }
          }
        }
        return stop.position
      }
      return null
    }
    return stop.position ?? null
  }

  private getFirstStopWithPosition() {
    let first: RailwayRouteDetail['stops'][number] | null = null
    for (const stop of this.stops) {
      if (!stop.position) continue
      if (!first || stop.order < first.order) {
        first = stop
      }
    }
    return first
  }

  private toLatLngBoundsAround(
    point: RailwayGeometryPoint,
    radiusBlocks: number,
  ) {
    const sw = this.controller.toLatLng({
      x: point.x - radiusBlocks,
      z: point.z - radiusBlocks,
    })
    const ne = this.controller.toLatLng({
      x: point.x + radiusBlocks,
      z: point.z + radiusBlocks,
    })
    if (!sw || !ne) return null
    return L.latLngBounds(sw, ne)
  }

  private panToFirstStopArea(map: L.Map) {
    const firstStop = this.getFirstStopWithPosition()
    if (!firstStop?.position) return

    const radius = 100
    const bounds = this.toLatLngBoundsAround(firstStop.position, radius)
    if (!bounds || !bounds.isValid()) return

    // 把首站周边 100 方块区域尽量挪到视野内。
    map.panInsideBounds(bounds, {
      paddingTopLeft: [24, 24],
      paddingBottomRight: [24, 24],
      animate: false,
    })
  }

  private focusOnFirstStop(map: L.Map) {
    const firstStop = this.getFirstStopWithPosition()
    if (!firstStop?.position) return false
    const latlng = this.controller.toLatLng({
      x: firstStop.position.x,
      z: firstStop.position.z,
    })
    if (!latlng) return false
    const zoom = this.oversizeFallback?.zoom ?? map.getMinZoom()
    map.setView(latlng, zoom, { animate: false })
    // 再补一次“首站周围 100 方块”尽量可见（可选偏移）
    this.panToFirstStopArea(map)
    return true
  }

  private scheduleOversizeFocus(map: L.Map) {
    if (!this.oversizeFallback) return
    if (this.oversizeRaf != null) {
      cancelAnimationFrame(this.oversizeRaf)
      this.oversizeRaf = null
    }

    // 两帧后执行：等待 Leaflet 容器尺寸/viewport 计算稳定。
    this.oversizeRaf = requestAnimationFrame(() => {
      this.oversizeRaf = requestAnimationFrame(() => {
        this.oversizeRaf = null

        // 目标：至少确保首站可见；若首站数据尚未加载，则退回线路中心。
        if (this.focusOnFirstStop(map)) return
        map.setView(
          this.oversizeFallback!.center,
          this.oversizeFallback!.zoom,
          {
            animate: false,
          },
        )
      })
    })
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
