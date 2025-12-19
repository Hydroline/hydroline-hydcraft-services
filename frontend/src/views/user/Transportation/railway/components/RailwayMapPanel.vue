<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import type { LeafletMouseEvent } from 'leaflet'
import { RailwayMap } from '@/views/user/Transportation/railway/maps/routeMap'
import type {
  RailwayCurveParameters,
  RailwayGeometryPoint,
  RailwayGeometrySegment,
  RailwayGeometrySegmentConnection,
  RailwayRouteDetail,
} from '@/types/transportation'

const props = withDefaults(
  defineProps<{
    geometry: RailwayRouteDetail['geometry'] | null
    stops?: RailwayRouteDetail['stops'] | null
    secondaryPaths?: RailwayGeometryPoint[][] | null
    secondaryZoomThreshold?: number
    forceShowSecondary?: boolean
    secondaryColor?: number | null
    secondaryWeight?: number
    secondaryOpacity?: number
    stopMarkerMode?: 'circle' | 'label-only' | 'none'
    stopLabelZoomThreshold?: number
    stopLabelClassName?: string
    color?: number | null
    zoom?: number
    showZoomControl?: boolean
    height?: string | number
    loading?: boolean
    autoFocus?: boolean
    combinePaths?: boolean
    rounded?: boolean
  }>(),
  {
    zoom: 3,
    showZoomControl: false,
    height: '360px',
    loading: false,
    stops: () => [] as RailwayRouteDetail['stops'],
    secondaryPaths: null,
    autoFocus: true,
    combinePaths: true,
    rounded: true,
  },
)

const containerRef = ref<HTMLElement | null>(null)
const railwayMap = ref<RailwayMap | null>(null)
const pointerBlockCoord = ref<{ x: number; z: number } | null>(null)
const mapCursorCleanup = ref<(() => void) | null>(null)
const containerHeight = computed(() => {
  const height = props.height
  if (typeof height === 'number') return `${height}px`
  if (typeof height === 'string') return height
  return '360px'
})
const SECONDARY_ZOOM_THRESHOLD = 4
const SECONDARY_SEPARATION_THRESHOLD = 12

function resolveSecondaryZoomThreshold(map: { getMaxZoom: () => number }) {
  const maxZoom = map.getMaxZoom()
  return Number.isFinite(maxZoom)
    ? Math.min(SECONDARY_ZOOM_THRESHOLD, maxZoom)
    : SECONDARY_ZOOM_THRESHOLD
}
type GeometryPathEntry = {
  id: string
  label: string | null
  isPrimary: boolean
  polylines: RailwayGeometryPoint[][]
}

const geometryPathEntries = computed<GeometryPathEntry[]>(() => {
  const geometry = props.geometry
  if (!geometry) return []
  const sources = geometry.paths?.length
    ? geometry.paths
    : [
        {
          id: 'legacy',
          label: null,
          isPrimary: true,
          source: geometry.source,
          points: geometry.points ?? [],
          segments: geometry.segments,
        },
      ]
  return sources
    .map((path, index) => {
      const polylines = resolvePolylinesForPath(path)
      if (!polylines.length) return null
      return {
        id: path.id || `${path.source}-${index}`,
        label: path.label ?? null,
        isPrimary:
          typeof path.isPrimary === 'boolean' ? path.isPrimary : index === 0,
        polylines,
      }
    })
    .filter((entry): entry is GeometryPathEntry => Boolean(entry))
})

const primaryEntry = computed(() => {
  if (!geometryPathEntries.value.length) return null
  const forced = geometryPathEntries.value.find((entry) => entry.isPrimary)
  return forced ?? geometryPathEntries.value[0]
})

const primaryPolylines = computed(() => primaryEntry.value?.polylines ?? [])

const secondaryEntryList = computed(() => {
  if (!props.combinePaths) return []
  const primary = primaryEntry.value
  if (!primary) return []
  return geometryPathEntries.value.filter((entry) => entry !== primary)
})

const secondaryPolylines = computed(() =>
  secondaryEntryList.value.flatMap((entry) => entry.polylines),
)

const SPLIT_VARIANT_OFFSET_STEP = 0.8

function computeNormalForPolyline(points: RailwayGeometryPoint[]) {
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  const dx = last.x - first.x
  const dz = last.z - first.z
  const len = Math.hypot(dx, dz)
  if (!Number.isFinite(len) || len < 1e-6) return null
  return { nx: -dz / len, nz: dx / len }
}

function offsetPolyline(points: RailwayGeometryPoint[], offset: number) {
  if (!offset) return points
  const normal = computeNormalForPolyline(points)
  if (!normal) return points
  return points.map((p) => ({
    x: p.x + normal.nx * offset,
    z: p.z + normal.nz * offset,
  }))
}

const secondaryPolylinesWithVariantOffsets = computed(() => {
  // Only apply offsets when we are actually showing split lines.
  if (!showSplitLines.value) return secondaryPolylines.value

  const entries = secondaryEntryList.value
  if (entries.length <= 1) return secondaryPolylines.value

  const polylines: RailwayGeometryPoint[][] = []
  entries.forEach((entry, index) => {
    // Alternate offsets: -1, +1, -2, +2 ... times step.
    const band = Math.floor(index / 2) + 1
    const sign = index % 2 === 0 ? -1 : 1
    const offset = sign * band * SPLIT_VARIANT_OFFSET_STEP
    entry.polylines.forEach((line) => {
      polylines.push(offsetPolyline(line, offset))
    })
  })
  return polylines
})

const directionalPolylines = computed(() =>
  geometryPathEntries.value.flatMap((entry) => entry.polylines),
)

const directionalPathLabels = computed(() =>
  geometryPathEntries.value.flatMap((entry) =>
    entry.polylines.map(() => entry.label ?? null),
  ),
)

const secondaryPathLabelsWithVariantOffsets = computed(() => {
  const labels: Array<string | null> = []
  for (const entry of secondaryEntryList.value) {
    for (const _polyline of entry.polylines) {
      labels.push(entry.label ?? null)
    }
  }
  return labels
})

const MERGE_DISTANCE_THRESHOLD = 50

const flatSecondaryPoints = computed(() => secondaryPolylines.value.flat())

type SecondaryPointGridIndex = {
  cellSize: number
  cells: Map<string, RailwayGeometryPoint[]>
}

function buildSecondaryPointGridIndex(
  points: RailwayGeometryPoint[],
  cellSize: number,
): SecondaryPointGridIndex {
  const cells = new Map<string, RailwayGeometryPoint[]>()
  if (!points.length) return { cellSize, cells }
  const size = cellSize > 0 ? cellSize : 1
  for (const point of points) {
    const cx = Math.floor(point.x / size)
    const cz = Math.floor(point.z / size)
    const key = `${cx},${cz}`
    const bucket = cells.get(key)
    if (bucket) {
      bucket.push(point)
    } else {
      cells.set(key, [point])
    }
  }
  return { cellSize: size, cells }
}

const secondaryPointIndex = computed<SecondaryPointGridIndex | null>(() => {
  if (!props.combinePaths) return null
  const points = flatSecondaryPoints.value
  if (!points.length) return null
  return buildSecondaryPointGridIndex(points, MERGE_DISTANCE_THRESHOLD)
})

const adjustPointWithSecondary = (point: RailwayGeometryPoint) => {
  if (!props.combinePaths) return point
  const index = secondaryPointIndex.value
  if (!index) return point
  const thresholdSq = MERGE_DISTANCE_THRESHOLD * MERGE_DISTANCE_THRESHOLD

  const cx = Math.floor(point.x / index.cellSize)
  const cz = Math.floor(point.z / index.cellSize)
  let closest: RailwayGeometryPoint | null = null
  let minDistanceSq = Infinity
  for (let dxCell = -1; dxCell <= 1; dxCell += 1) {
    for (let dzCell = -1; dzCell <= 1; dzCell += 1) {
      const key = `${cx + dxCell},${cz + dzCell}`
      const bucket = index.cells.get(key)
      if (!bucket?.length) continue
      for (const candidate of bucket) {
        const dx = candidate.x - point.x
        const dz = candidate.z - point.z
        const distanceSq = dx * dx + dz * dz
        if (distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq
          closest = candidate
        }
      }
    }
  }
  if (closest && minDistanceSq <= thresholdSq) {
    return {
      x: Math.round((point.x + closest.x) / 2),
      z: Math.round((point.z + closest.z) / 2),
    }
  }
  return point
}

const secondaryHash = computed(() => {
  const points = flatSecondaryPoints.value
  let hash = 0
  for (const point of points) {
    hash = Math.imul(point.x, 73856093) ^ Math.imul(point.z, 19349663) ^ hash
  }
  return hash
})

const geometrySignature = computed(() => {
  const geometry = props.geometry
  if (!geometry) {
    return `null:0:${secondaryHash.value}:${props.combinePaths}`
  }
  const paths = geometry.paths?.length
    ? geometry.paths
    : [
        {
          id: 'legacy',
          label: null,
          isPrimary: true,
          source: geometry.source,
          points: geometry.points ?? [],
          segments: geometry.segments,
        },
      ]
  const ids = paths.map((path) => path.id ?? path.source ?? '').join('|')
  const lengths = paths
    .map((path) => path.points?.length ?? path.segments?.length ?? 0)
    .join(',')
  const labels = paths.map((path) => path.label ?? '').join('|')
  return `${ids}:${lengths}:${labels}:${secondaryHash.value}:${props.combinePaths}`
})

const secondaryPathsSignature = computed(() => {
  const paths = props.secondaryPaths ?? []
  let hash = 0
  let count = 0
  for (const path of paths) {
    for (const point of path ?? []) {
      const x = Math.trunc(point.x)
      const z = Math.trunc(point.z)
      hash = Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ hash
      count += 1
    }
  }
  const threshold =
    typeof props.secondaryZoomThreshold === 'number'
      ? props.secondaryZoomThreshold
      : 'auto'
  const force =
    typeof props.forceShowSecondary === 'boolean'
      ? props.forceShowSecondary
      : 'auto'
  return `${paths.length}:${count}:${hash}:${threshold}:${force}`
})

const combinedCacheState = {
  signature: '',
  value: [] as RailwayGeometryPoint[][],
}

const combinedPrimaryPolylines = computed(() => {
  if (!props.combinePaths) return primaryPolylines.value
  const signature = geometrySignature.value
  if (combinedCacheState.signature !== signature) {
    combinedCacheState.signature = signature
    const primary = primaryEntry.value
    if (!primary) {
      combinedCacheState.value = []
    } else {
      combinedCacheState.value = primary.polylines.map((path) =>
        path.map((point) => adjustPointWithSecondary(point)),
      )
    }
  }
  return combinedCacheState.value
})

const primaryCentroid = computed(() =>
  computeCentroid(
    props.combinePaths
      ? combinedPrimaryPolylines.value
      : primaryPolylines.value,
  ),
)
const secondaryCentroid = computed(() =>
  computeCentroid(secondaryPolylines.value),
)

const shouldForceSeparate = computed(() => {
  if (!primaryCentroid.value || !secondaryCentroid.value) return false
  const dx = primaryCentroid.value.x - secondaryCentroid.value.x
  const dz = primaryCentroid.value.z - secondaryCentroid.value.z
  return Math.hypot(dx, dz) >= SECONDARY_SEPARATION_THRESHOLD
})

const showSplitLines = ref(false)
const skipAutoFocus = ref(false)
let lastDrawSignature = ''
let hasInvalidatedSize = false
let resizeObserver: ResizeObserver | null = null
let scheduledResizeRaf: number | null = null

const handleSplitZoom = () => {
  const controller = railwayMap.value?.getController()
  const map = controller?.getLeafletInstance()
  if (!map) return
  const threshold = resolveSecondaryZoomThreshold(map)
  const shouldShowSplit = !props.combinePaths
    ? true
    : map.getZoom() >= threshold
  if (showSplitLines.value !== shouldShowSplit) {
    showSplitLines.value = shouldShowSplit
    skipAutoFocus.value = true
    scheduleDraw()
  }
}

watch(
  () => geometrySignature.value,
  () => {
    lastDrawSignature = ''
  },
)

function destroyMap() {
  if (scheduledResizeRaf != null) {
    cancelAnimationFrame(scheduledResizeRaf)
    scheduledResizeRaf = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  mapCursorCleanup.value?.()
  mapCursorCleanup.value = null
  pointerBlockCoord.value = null
  railwayMap.value?.destroy()
  railwayMap.value = null
}

function drawGeometry() {
  if (!railwayMap.value) return
  const isBoundsGeometry =
    Boolean(props.geometry) &&
    !props.geometry?.paths?.length &&
    props.geometry?.source === 'station-bounds'
  const directionalMode = !props.combinePaths
  const useMidline = props.combinePaths && !showSplitLines.value
  const primaryPaths = directionalMode
    ? directionalPolylines.value
    : useMidline
      ? combinedPrimaryPolylines.value
      : primaryPolylines.value
  const computedSecondaryPaths = directionalMode
    ? []
    : useMidline
      ? secondaryPolylines.value
      : secondaryPolylinesWithVariantOffsets.value
  const secondaryPaths = props.secondaryPaths?.length
    ? props.secondaryPaths
    : computedSecondaryPaths

  const enableRouteHoverLabels = !useMidline
  const pathLabels = !enableRouteHoverLabels
    ? []
    : directionalMode
      ? directionalPathLabels.value
      : primaryPaths.map(() => primaryEntry.value?.label ?? null)
  const secondaryPathLabels =
    !enableRouteHoverLabels || props.secondaryPaths?.length
      ? []
      : directionalMode
        ? []
        : secondaryPathLabelsWithVariantOffsets.value

  const computedSecondaryZoomThreshold = directionalMode
    ? Number.POSITIVE_INFINITY
    : useMidline
      ? Number.POSITIVE_INFINITY
      : (() => {
          const map = railwayMap.value?.getController()?.getLeafletInstance()
          if (!map) return SECONDARY_ZOOM_THRESHOLD
          return resolveSecondaryZoomThreshold(map)
        })()
  const secondaryZoomThreshold =
    typeof props.secondaryZoomThreshold === 'number'
      ? props.secondaryZoomThreshold
      : computedSecondaryZoomThreshold
  const autoFocus = skipAutoFocus.value ? false : (props.autoFocus ?? true)
  const drawSignature = `${geometrySignature.value}:${showSplitLines.value}:${secondaryPathsSignature.value}`
  if (drawSignature === lastDrawSignature) {
    skipAutoFocus.value = false
    return
  }
  lastDrawSignature = drawSignature
  railwayMap.value.drawGeometry(primaryPaths, {
    color: props.color ?? null,
    weight: isBoundsGeometry ? 0 : 4,
    // For bounds fill polygon, opacity doesn't affect rendering (stroke is disabled),
    // but it DOES impact secondary line opacity calculation inside RailwayMap.
    // Keep it non-zero so platform segments remain visible.
    opacity: 0.9,
    fill: isBoundsGeometry,
    fillOpacity: 0.7,
    focusZoom: props.zoom,
    pathLabels,
    secondaryPaths,
    secondaryPathLabels,
    secondaryZoomThreshold,
    secondaryColor: props.secondaryColor ?? null,
    secondaryWeight:
      typeof props.secondaryWeight === 'number'
        ? props.secondaryWeight
        : undefined,
    secondaryOpacity:
      typeof props.secondaryOpacity === 'number'
        ? props.secondaryOpacity
        : undefined,
    stopMarkerMode: props.stopMarkerMode,
    stopLabelZoomThreshold:
      typeof props.stopLabelZoomThreshold === 'number'
        ? props.stopLabelZoomThreshold
        : undefined,
    stopLabelClassName: props.stopLabelClassName,
    forceShowSecondary:
      typeof props.forceShowSecondary === 'boolean'
        ? props.forceShowSecondary
        : !directionalMode && !useMidline && shouldForceSeparate.value,
    autoFocus,
  })
  skipAutoFocus.value = false
}

function initMap() {
  if (!containerRef.value || railwayMap.value) return
  const map = new RailwayMap()
  map.mount({
    container: containerRef.value,
    zoom: props.zoom,
    showZoomControl: props.showZoomControl,
  })
  railwayMap.value = map
  attachMapCursorTracking()

  // 刷新首屏时，路由/布局可能先渲染但容器尺寸仍为 0，Leaflet 会出现“空白直到热更新/重排”。
  // 用 ResizeObserver 监听容器尺寸，首次变为非零后强制 invalidateSize + 重绘。
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    const rect = entry?.contentRect
    if (!rect) return
    if (rect.width <= 0 || rect.height <= 0) return
    if (scheduledResizeRaf != null) return
    scheduledResizeRaf = requestAnimationFrame(() => {
      scheduledResizeRaf = null
      invalidateMapSize()
      scheduleDraw()
    })
  })
  resizeObserver.observe(containerRef.value)

  drawGeometry()
  syncStops()
}

function invalidateMapSize() {
  const map = railwayMap.value?.getController()?.getLeafletInstance()
  if (!map) return
  map.invalidateSize({ pan: false })
  hasInvalidatedSize = true
}

function attachMapCursorTracking() {
  mapCursorCleanup.value?.()
  mapCursorCleanup.value = null
  pointerBlockCoord.value = null

  const controller = railwayMap.value?.getController()
  const map = controller?.getLeafletInstance()
  if (!controller || !map) return

  const mapContainer = map.getContainer()

  const handleMove = (event: LeafletMouseEvent) => {
    pointerBlockCoord.value = controller.fromLatLng(event.latlng)
  }
  const handleLeave = () => {
    pointerBlockCoord.value = null
  }

  const handleDomLeave = () => {
    handleLeave()
  }

  const handleWindowBlur = () => {
    handleLeave()
  }

  map.on('mousemove', handleMove)
  map.on('mouseout', handleLeave)
  map.on('dragstart', handleLeave)
  map.on('zoomstart', handleLeave)
  map.on('zoomend', handleSplitZoom)

  mapContainer.addEventListener('pointerleave', handleDomLeave, {
    passive: true,
  })
  mapContainer.addEventListener('mouseleave', handleDomLeave, {
    passive: true,
  })
  window.addEventListener('blur', handleWindowBlur)

  handleSplitZoom()

  mapCursorCleanup.value = () => {
    map.off('mousemove', handleMove)
    map.off('mouseout', handleLeave)
    map.off('dragstart', handleLeave)
    map.off('zoomstart', handleLeave)
    map.off('zoomend', handleSplitZoom)

    mapContainer.removeEventListener('pointerleave', handleDomLeave)
    mapContainer.removeEventListener('mouseleave', handleDomLeave)
    window.removeEventListener('blur', handleWindowBlur)
  }
}

const formatBlockCoordinate = (value: number) => Math.round(value)
let scheduledDrawFrame: number | null = null

function scheduleDraw() {
  if (scheduledDrawFrame != null) {
    return
  }
  scheduledDrawFrame = requestAnimationFrame(() => {
    scheduledDrawFrame = null
    drawGeometry()
  })
}

function syncStops() {
  if (!railwayMap.value) return
  railwayMap.value.setStops(props.stops ?? [])
}

watch(
  () => props.geometry,
  async () => {
    await nextTick()
    // 刷新/首屏时 Leaflet 可能在容器尺寸未稳定就计算 bounds，导致不聚焦。
    invalidateMapSize()
    scheduleDraw()
  },
  { immediate: true },
)

watch(
  () => containerHeight.value,
  async () => {
    await nextTick()
    invalidateMapSize()
    scheduleDraw()
  },
)

watch(
  () => props.color,
  () => {
    scheduleDraw()
  },
)

watch(
  () =>
    [
      props.secondaryPaths,
      props.secondaryZoomThreshold,
      props.forceShowSecondary,
    ] as const,
  () => {
    scheduleDraw()
  },
  { deep: true },
)

watch(
  () => props.stops,
  () => {
    syncStops()
  },
  { deep: true },
)

watch(
  () => props.combinePaths,
  () => {
    showSplitLines.value = !props.combinePaths
    skipAutoFocus.value = true
    handleSplitZoom()
    scheduleDraw()
  },
)

onMounted(() => {
  initMap()
  void nextTick().then(() => {
    if (!hasInvalidatedSize) {
      invalidateMapSize()
    }
    drawGeometry()
  })
})

onBeforeUnmount(() => {
  if (scheduledDrawFrame != null) {
    cancelAnimationFrame(scheduledDrawFrame)
    scheduledDrawFrame = null
  }
  destroyMap()
})

const CURVE_SAMPLE_STEP = 2
const MIN_CURVE_SEGMENTS = 2

function sampleSegment(
  segment: RailwayGeometrySegment,
  startPoint: RailwayGeometryPoint,
  endPoint: RailwayGeometryPoint,
) {
  const connection = segment.connection
  if (!connection) {
    return [startPoint, endPoint]
  }
  const curve = pickCurveFromConnection(connection)
  if (!curve) {
    return [startPoint, endPoint]
  }
  return sampleCurve(curve, startPoint, endPoint)
}

function pickCurveFromConnection(connection: RailwayGeometrySegmentConnection) {
  if (connection.preferredCurve === 'primary' && connection.primary) {
    return connection.primary
  }
  if (connection.preferredCurve === 'secondary' && connection.secondary) {
    return connection.secondary
  }
  return connection.primary ?? connection.secondary
}

function sampleCurve(
  curve: RailwayCurveParameters,
  startOverride: RailwayGeometryPoint | null,
  endOverride: RailwayGeometryPoint | null,
) {
  const h = curve.h ?? 0
  const k = curve.k ?? 0
  const r = curve.r ?? 0
  const rawStart = curve.tStart ?? 0
  const rawEnd = curve.tEnd ?? 0
  const isStraight = Boolean(curve.isStraight)
  const reverse = Boolean(curve.reverse)
  const fromT = reverse ? rawEnd : rawStart
  const toT = reverse ? rawStart : rawEnd
  const delta = toT - fromT
  const span = Math.abs(delta)
  const direction = delta >= 0 ? 1 : -1
  const points: RailwayGeometryPoint[] = []
  if (span === 0 || !Number.isFinite(span)) {
    const point = startOverride ?? calculatePosition(h, k, r, fromT, isStraight)
    points.push(point)
    if (endOverride && !isSamePoint(point, endOverride)) {
      points.push(endOverride)
    }
    return points
  }
  const segments = Math.max(
    MIN_CURVE_SEGMENTS,
    Math.ceil(span / CURVE_SAMPLE_STEP),
  )
  const increment = span / segments
  for (let step = 0; step <= segments; step += 1) {
    const offset = Math.min(span, increment * step)
    if (step === 0 && startOverride) {
      if (
        !points.length ||
        !isSamePoint(points[points.length - 1], startOverride)
      ) {
        points.push(startOverride)
      }
      continue
    }
    if (step === segments && endOverride) {
      if (
        !points.length ||
        !isSamePoint(points[points.length - 1], endOverride)
      ) {
        points.push(endOverride)
      }
      continue
    }
    const t = fromT + direction * offset
    const point = calculatePosition(h, k, r, t, isStraight)
    if (!points.length || !isSamePoint(points[points.length - 1], point)) {
      points.push(point)
    }
  }
  return points
}

function calculatePosition(
  h: number,
  k: number,
  r: number,
  t: number,
  isStraight: boolean,
): RailwayGeometryPoint {
  if (isStraight) {
    return {
      x: h * t + k * (Math.abs(h) >= 0.5 && Math.abs(k) >= 0.5 ? 0 : r),
      z: k * t + h * r,
    }
  }
  if (Math.abs(r) < 1e-6) {
    return { x: h, z: k }
  }
  const radius = r
  return {
    x: h + radius * Math.cos(t / radius),
    z: k + radius * Math.sin(t / radius),
  }
}

function isSamePoint(a: RailwayGeometryPoint, b: RailwayGeometryPoint) {
  return Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.z - b.z) < 1e-3
}

function to2DPoint(position?: {
  x: number | null | undefined
  z: number | null | undefined
}) {
  if (!position) return null
  if (typeof position.x !== 'number' || typeof position.z !== 'number') {
    return null
  }
  return { x: position.x, z: position.z }
}

function dedupePoints(points: RailwayGeometryPoint[]) {
  if (!points.length) return []
  const result: RailwayGeometryPoint[] = []
  points.forEach((point, index) => {
    if (index === 0) {
      result.push(point)
      return
    }
    if (!isSamePoint(result[result.length - 1], point)) {
      result.push(point)
    }
  })
  return result
}

function resolvePolylinesForPath(path: {
  segments?: RailwayGeometrySegment[]
  points?: RailwayGeometryPoint[]
}) {
  const segments = path.segments ?? []
  const fallback = dedupePoints(path.points ?? [])
  if (!segments.length) {
    return fallback.length ? [fallback] : []
  }
  const polylines: RailwayGeometryPoint[][] = []
  segments.forEach((segment) => {
    const startPoint = to2DPoint(segment.start)
    const endPoint = to2DPoint(segment.end)
    if (!startPoint || !endPoint) {
      return
    }
    const sampled = sampleSegment(segment, startPoint, endPoint)
    if (sampled.length >= 2) {
      polylines.push(sampled)
    }
  })
  if (polylines.length) {
    return polylines
  }
  return fallback.length ? [fallback] : []
}

function computeCentroid(paths: RailwayGeometryPoint[][]) {
  let sumX = 0
  let sumZ = 0
  let total = 0
  for (const path of paths) {
    for (const point of path) {
      sumX += point.x
      sumZ += point.z
      total += 1
    }
  }
  if (!total) return null
  return { x: sumX / total, z: sumZ / total }
}
</script>

<template>
  <div class="relative railway-map-container">
    <div
      ref="containerRef"
      class="w-full overflow-hidden border border-slate-200/70 bg-white/80 dark:bg-slate-900/20 dark:border-slate-800 transition duration-250"
      :class="props.rounded ? 'rounded-2xl' : 'rounded-none'"
      :style="{
        minHeight: containerHeight,
        height: containerHeight,
      }"
    ></div>
    <div
      v-if="props.loading"
      class="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/30 text-xs text-slate-200 backdrop-blur transition duration-250"
      :class="props.rounded ? 'rounded-2xl' : 'rounded-none'"
    >
      加载地图…
    </div>

    <div class="absolute inset-0 z-998 p-3 pointer-events-none flex items-end">
      <div
        class="absolute inset-0 bg-[linear-gradient(180deg,transparent_75%,var(--background-dark-2)_125%)]"
        :class="props.rounded ? 'rounded-2xl' : 'rounded-none'"
      ></div>
      <div
        class="relative w-full rounded-lg text-xs text-white flex items-end justify-between"
        style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)"
      >
        <div></div>

        <transition
          enter-active-class="transition-opacity duration-200"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition-opacity duration-200"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div v-if="pointerBlockCoord">
            {{ formatBlockCoordinate(pointerBlockCoord.x) }},
            {{ formatBlockCoordinate(pointerBlockCoord.z) }}
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<style>
.railway-station-label {
  background: transparent;
  border: none;
  box-shadow: none;
  color: #fff;
  font-size: 24px;
  font-weight: 600;
  padding: 0;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
}

.railway-station-label-small {
  background: transparent;
  border: none;
  box-shadow: none;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  padding: 0;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
}

.railway-station-label::before {
  display: none;
}

.dark .railway-station-label {
  color: #f1f5f9;
  text-shadow: 0 1px 2px rgba(2, 6, 23, 0.85);
}

.dark .railway-station-label-small {
  color: #f1f5f9;
  text-shadow: 0 1px 2px rgba(2, 6, 23, 0.85);
}

.railway-route-hover-label {
  background: transparent;
  border: none;
  box-shadow: none;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 0;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
}

.railway-route-hover-label::before {
  display: none;
}

.dark .railway-route-hover-label {
  color: #f1f5f9;
  text-shadow: 0 1px 2px rgba(2, 6, 23, 0.85);
}

.railway-map-container .leaflet-tile-pane {
  filter: brightness(0.85) saturate(0.85);
}

.dark .railway-map-container .leaflet-tile-pane {
  filter: brightness(0.7) saturate(0.85);
}

.railway-map-container .railway-route-polyline {
  filter: drop-shadow(0 4px 8px rgba(15, 23, 42, 0.5));
}

.railway-map-container .railway-secondary-polyline {
  filter: drop-shadow(0 6px 12px rgba(2, 6, 23, 0.75));
}

.dark .railway-map-container .railway-route-polyline {
  filter: drop-shadow(0 4px 10px rgba(2, 6, 23, 0.7));
}

.dark .railway-map-container .railway-secondary-polyline {
  filter: drop-shadow(0 6px 14px rgba(2, 6, 23, 0.9));
}

.railway-map-container .leaflet-control-container {
  display: none;
}
</style>
