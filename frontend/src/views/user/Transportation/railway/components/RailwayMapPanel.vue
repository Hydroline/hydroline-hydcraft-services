<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import { RailwayMap } from '@/views/user/Transportation/railway/map'
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
    color?: number | null
    zoom?: number
    showZoomControl?: boolean
    height?: string | number
    loading?: boolean
  }>(),
  {
    zoom: 3,
    showZoomControl: true,
    height: '360px',
    loading: false,
    stops: () => [] as RailwayRouteDetail['stops'],
  },
)

const containerRef = ref<HTMLElement | null>(null)
const railwayMap = ref<RailwayMap | null>(null)
const containerHeight = computed(() => {
  const height = props.height
  if (typeof height === 'number') return `${height}px`
  if (typeof height === 'string') return height
  return '360px'
})
const resolvedPolylines = computed<RailwayGeometryPoint[][]>(() => {
  const geometry = props.geometry
  if (!geometry) return []
  const segments = geometry.segments ?? []
  const fallback = dedupePoints(geometry.points ?? [])
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
})

function destroyMap() {
  railwayMap.value?.destroy()
  railwayMap.value = null
}

function drawGeometry() {
  if (!railwayMap.value) return
  railwayMap.value.drawGeometry(resolvedPolylines.value, {
    color: props.color ?? null,
    weight: 4,
    opacity: 0.9,
    focusZoom: props.zoom,
  })
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
  drawGeometry()
  syncStops()
}

function syncStops() {
  if (!railwayMap.value) return
  railwayMap.value.setStops(props.stops ?? [])
}

watch(
  resolvedPolylines,
  () => {
    drawGeometry()
  },
  { deep: true },
)

watch(
  () => props.color,
  () => {
    drawGeometry()
  },
)

watch(
  () => props.stops,
  () => {
    syncStops()
  },
  { deep: true },
)

onMounted(() => {
  initMap()
  drawGeometry()
})

onBeforeUnmount(() => {
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
</script>

<template>
  <div class="relative">
    <div
      ref="containerRef"
      class="w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 dark:bg-slate-900/20 dark:border-slate-800"
      :style="{
        minHeight: containerHeight,
        height: containerHeight,
      }"
    ></div>
    <div
      v-if="props.loading"
      class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/30 text-xs text-slate-200 backdrop-blur"
    >
      加载地图…
    </div>
  </div>
</template>
