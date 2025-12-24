<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LeafletMouseEvent } from 'leaflet'
import type {
  RailwayGeometryPoint,
  RailwayGeometrySegment,
  RailwayRouteDetail,
} from '@/types/transportation'
import {
  RailwaySystemMap,
  type SystemRoutePath,
  type SystemStop,
} from '@/views/user/Transportation/railway/maps/systemMap'

const props = withDefaults(
  defineProps<{
    routes: RailwayRouteDetail[]
    height?: string | number
    loading?: boolean
    autoFocus?: boolean
    rounded?: boolean
    showZoomControl?: boolean
  }>(),
  {
    height: '360px',
    loading: false,
    autoFocus: true,
    rounded: true,
    showZoomControl: false,
  },
)

const containerRef = ref<HTMLElement | null>(null)
const systemMap = ref<RailwaySystemMap | null>(null)
const pointerBlockCoord = ref<{ x: number; z: number } | null>(null)
const mapCursorCleanup = ref<(() => void) | null>(null)

const containerHeight = computed(() => {
  if (typeof props.height === 'number') return `${props.height}px`
  return props.height
})

const routePaths = computed<SystemRoutePath[]>(() => {
  return props.routes
    .map((detail) => {
      const geometry = detail.geometry
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
      const paths = sources.flatMap((path) => resolvePolylinesForPath(path))
      if (!paths.length) return null
      return {
        id: detail.route.id,
        color: detail.route.color ?? null,
        paths,
        label: detail.route.name ?? detail.route.id,
      }
    })
    .filter((entry): entry is SystemRoutePath => Boolean(entry))
})

const systemStops = computed<SystemStop[]>(() => {
  const stopMap = new Map<
    string,
    {
      stop: RailwayRouteDetail['stops'][number]
      count: number
      color: number | null
    }
  >()

  for (const detail of props.routes) {
    const routeColor = detail.route.color ?? null
    for (const stop of detail.stops ?? []) {
      const stationId = stop.stationId ?? stop.platformId
      if (!stationId || !stop.position) continue
      const existing = stopMap.get(stationId)
      if (existing) {
        existing.count += 1
      } else {
        stopMap.set(stationId, { stop, count: 1, color: routeColor })
      }
    }
  }

  const result: SystemStop[] = []
  for (const [stationId, entry] of stopMap.entries()) {
    const rawName =
      entry.stop.stationName || entry.stop.platformName || stationId
    const stopName = rawName.split('||')[0].split('|')[0]

    if (!entry.stop.position) continue
    result.push({
      id: stationId,
      name: stopName,
      position: entry.stop.position,
      isTransfer: entry.count > 1,
      color: entry.color,
    })
  }

  return result
})

watch(
  () => [routePaths.value, systemStops.value] as const,
  () => {
    if (!systemMap.value) return
    systemMap.value.drawRoutes(
      routePaths.value,
      systemStops.value,
      props.autoFocus,
    )
  },
  { deep: true },
)

onMounted(() => {
  if (!containerRef.value) return
  const map = new RailwaySystemMap()
  systemMap.value = map
  map.mount({
    container: containerRef.value,
    showZoomControl: props.showZoomControl,
  })
  attachMapCursorTracking()
  map.drawRoutes(routePaths.value, systemStops.value, props.autoFocus)
})

onBeforeUnmount(() => {
  mapCursorCleanup.value?.()
  systemMap.value?.destroy()
  systemMap.value = null
})

function attachMapCursorTracking() {
  mapCursorCleanup.value?.()
  mapCursorCleanup.value = null
  pointerBlockCoord.value = null

  const controller = systemMap.value?.getController()
  const map = controller?.getLeafletInstance()
  if (!controller || !map) return

  const handleMove = (event: LeafletMouseEvent) => {
    pointerBlockCoord.value = controller.fromLatLng(event.latlng)
  }
  const handleLeave = () => {
    pointerBlockCoord.value = null
  }

  map.on('mousemove', handleMove)
  map.on('mouseout', handleLeave)

  mapCursorCleanup.value = () => {
    map.off('mousemove', handleMove)
    map.off('mouseout', handleLeave)
  }
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

function isSamePoint(a: RailwayGeometryPoint, b: RailwayGeometryPoint) {
  return a.x === b.x && a.z === b.z
}

function to2DPoint(
  value: { x: number; y: number; z: number } | null | undefined,
) {
  if (!value) return null
  if (typeof value.x !== 'number' || typeof value.z !== 'number') return null
  return { x: value.x, z: value.z }
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
    if (!startPoint || !endPoint) return
    const sampled = [startPoint, endPoint]
    if (sampled.length >= 2) {
      polylines.push(sampled)
    }
  })
  if (polylines.length) return polylines
  return fallback.length ? [fallback] : []
}

function formatBlockCoordinate(value: number) {
  return Math.round(value)
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
.railway-map-container .leaflet-control-container {
  display: none;
}

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

.railway-station-label::before {
  display: none;
}

.dark .railway-station-label {
  color: #f1f5f9;
  text-shadow: 0 1px 2px rgba(2, 6, 23, 0.85);
}
</style>
