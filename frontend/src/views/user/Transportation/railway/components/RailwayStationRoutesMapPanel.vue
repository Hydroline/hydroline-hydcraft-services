<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import type { LeafletMouseEvent } from 'leaflet'
import { RailwayStationRoutesMap } from '@/views/user/Transportation/railway/maps/stationRoutesMap'
import type {
  RailwayRouteDetail,
  RailwayStationDetail,
  RailwayStationRouteMapPayload,
} from '@/types/transportation'

const props = withDefaults(
  defineProps<{
    bounds: RailwayStationDetail['station']['bounds'] | null
    platforms?: Array<
      RailwayStationDetail['platforms'][number] & {
        pos1: { x: number; y: number; z: number } | null
        pos2: { x: number; y: number; z: number } | null
      }
    >
    stationFillColor?: number | null
    routeMap?: RailwayStationRouteMapPayload | null
    height?: string | number
    loading?: boolean
    mapLoading?: boolean
    autoFocus?: boolean
    rounded?: boolean
  }>(),
  {
    platforms: () => [],
    stationFillColor: null,
    routeMap: null,
    height: '360px',
    loading: false,
    mapLoading: false,
    autoFocus: true,
    rounded: true,
  },
)

const containerRef = ref<HTMLElement | null>(null)
const railwayMap = ref<RailwayStationRoutesMap | null>(null)
const pointerBlockCoord = ref<{ x: number; z: number } | null>(null)
const mapCursorCleanup = ref<(() => void) | null>(null)
const isMounted = ref(false)
const lastStationFocusKey = ref<string | null>(null)

const containerHeight = computed(() => {
  const height = props.height
  if (typeof height === 'number') return `${height}px`
  if (typeof height === 'string') return height
  return '360px'
})

const stationPolygon = computed(() => {
  const bounds = props.bounds
  if (!bounds) return null
  const { xMin, xMax, zMin, zMax } = bounds
  if (
    xMin == null ||
    xMax == null ||
    zMin == null ||
    zMax == null ||
    xMin === xMax ||
    zMin === zMax
  ) {
    return null
  }
  return [
    { x: xMin, z: zMin },
    { x: xMax, z: zMin },
    { x: xMax, z: zMax },
    { x: xMin, z: zMax },
    { x: xMin, z: zMin },
  ]
})

const stops = computed<RailwayRouteDetail['stops']>(() => {
  const result: RailwayRouteDetail['stops'] = []
  props.platforms.forEach((platform, index) => {
    const position = computePlatformCenter(platform)
    if (!position) return

    result.push({
      order: index,
      platformId: platform.id,
      platformName: platform.name ?? platform.id,
      stationId: platform.stationId ?? null,
      stationName: null,
      dwellTime: platform.dwellTime ?? null,
      position,
      bounds: null,
    })
  })
  return result
})

const platformSegments = computed(() => {
  return props.platforms
    .map((platform) => {
      const pos1 = platform.pos1
      const pos2 = platform.pos2
      if (!pos1 || !pos2) return null
      return [
        { x: pos1.x, z: pos1.z },
        { x: pos2.x, z: pos2.z },
      ]
    })
    .filter((path): path is Array<{ x: number; z: number }> => Boolean(path))
})

const routeGroups = computed(() => {
  const groups = props.routeMap?.groups ?? []
  return groups.map((group) => ({
    color: group.color ?? null,
    paths: group.paths ?? [],
    label: (group.displayName || group.key || '').trim() || null,
  }))
})

const routeStops = computed<RailwayRouteDetail['stops']>(() => {
  const groups = props.routeMap?.groups ?? []
  const seen = new Set<string>()
  const stops: RailwayRouteDetail['stops'] = []
  let order = 0
  for (const group of groups) {
    for (const item of group.stops ?? []) {
      const key = item.stationId
        ? `id:${item.stationId}`
        : `p:${item.x},${item.z}:${item.label}`
      if (seen.has(key)) continue
      seen.add(key)
      stops.push({
        order: order++,
        platformId: item.stationId ?? item.label,
        platformName: item.label,
        stationId: item.stationId ?? null,
        stationName: item.stationName ?? null,
        dwellTime: null,
        position: { x: item.x, z: item.z },
        bounds: null,
      })
    }
  }
  return stops
})

const drawSignature = computed(() => {
  const groupCount = routeGroups.value.length
  const pathCount = routeGroups.value.reduce(
    (acc, group) => acc + (group.paths?.length ?? 0),
    0,
  )
  const stationSig = props.bounds
    ? `${props.bounds.xMin}-${props.bounds.xMax}-${props.bounds.zMin}-${props.bounds.zMax}`
    : 'null'
  return `${stationSig}:${props.platforms.length}:${groupCount}:${pathCount}:${Boolean(props.autoFocus)}`
})

let resizeObserver: ResizeObserver | null = null
let scheduledResizeRaf: number | null = null
let scheduledDrawFrame: number | null = null

function invalidateMapSize() {
  const map = railwayMap.value?.getController()?.getLeafletInstance()
  if (!map) return
  map.invalidateSize({ pan: false })
}

function scheduleDraw() {
  if (scheduledDrawFrame != null) return
  scheduledDrawFrame = requestAnimationFrame(() => {
    scheduledDrawFrame = null
    void draw()
  })
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

  mapContainer.addEventListener('pointerleave', handleDomLeave, {
    passive: true,
  })
  mapContainer.addEventListener('mouseleave', handleDomLeave, {
    passive: true,
  })
  window.addEventListener('blur', handleWindowBlur)

  mapCursorCleanup.value = () => {
    map.off('mousemove', handleMove)
    map.off('mouseout', handleLeave)
    map.off('dragstart', handleLeave)
    map.off('zoomstart', handleLeave)

    mapContainer.removeEventListener('pointerleave', handleDomLeave)
    mapContainer.removeEventListener('mouseleave', handleDomLeave)
    window.removeEventListener('blur', handleWindowBlur)
  }
}

const formatBlockCoordinate = (value: number) => Math.round(value)

function computePlatformCenter(
  platform: RailwayStationDetail['platforms'][number],
) {
  const pos1 = platform.pos1
  const pos2 = platform.pos2
  if (!pos1 || !pos2) return null
  return {
    x: Math.round((pos1.x + pos2.x) / 2),
    z: Math.round((pos1.z + pos2.z) / 2),
  }
}

async function draw() {
  await nextTick()
  if (!isMounted.value) return
  const map = railwayMap.value
  if (!map) return

  map.draw({
    stationFillColor: props.stationFillColor ?? null,
    stationPolygon: stationPolygon.value,
    stationFillOpacity: 0.7,
    routeGroups: routeGroups.value,
    platformSegments: platformSegments.value,
    stops: routeStops.value.length ? routeStops.value : stops.value,
    platformStops: stops.value,
    focusZoom: 4,
    autoFocus: props.autoFocus,
  })
}

async function focusToStation() {
  await nextTick()
  if (!isMounted.value) return
  const map = railwayMap.value
  if (!map) return
  const leaflet = map.getController().getLeafletInstance()
  if (!leaflet) return
  const loaded =
    '_loaded' in leaflet
      ? Boolean((leaflet as unknown as { _loaded?: boolean })._loaded)
      : true
  if (!loaded) return

  const polygon = stationPolygon.value
  if (!polygon?.length) return
  const latlngs = polygon
    .map((p) => {
      if (typeof p?.x !== 'number' || typeof p?.z !== 'number') return null
      return map.getController().toLatLng(p)
    })
    .filter((v): v is L.LatLng => Boolean(v))
  if (!latlngs.length) return

  const bounds = L.latLngBounds(latlngs)
  const padding = L.point(32, 32)
  leaflet.flyToBounds(bounds, {
    padding: [padding.x, padding.y],
    maxZoom: 4,
  })
}

const stationFocusKey = computed(() => {
  const map = props.routeMap
  if (!map) return null
  return `${map.stationId}:${map.serverId}:${map.railwayType}:${map.dimension ?? ''}:${map.generatedAt}`
})

onMounted(async () => {
  isMounted.value = true
  await nextTick()
  if (!containerRef.value) return

  const map = new RailwayStationRoutesMap()
  railwayMap.value = map
  map.mount({
    container: containerRef.value,
    showZoomControl: false,
  })

  attachMapCursorTracking()

  // 容器首次布局/切换时尺寸可能为 0，Leaflet 会出现右下角空白或裁切。
  // 监听容器尺寸，变为非零后强制 invalidateSize + 重绘。
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

  await draw()
})

onBeforeUnmount(() => {
  isMounted.value = false

  if (scheduledResizeRaf != null) {
    cancelAnimationFrame(scheduledResizeRaf)
    scheduledResizeRaf = null
  }
  if (scheduledDrawFrame != null) {
    cancelAnimationFrame(scheduledDrawFrame)
    scheduledDrawFrame = null
  }

  resizeObserver?.disconnect()
  resizeObserver = null

  mapCursorCleanup.value?.()
  mapCursorCleanup.value = null

  railwayMap.value?.destroy()
  railwayMap.value = null
})

watch(drawSignature, () => {
  void draw()
})

watch(
  () => [props.loading, props.mapLoading, stationFocusKey.value] as const,
  ([loading, mapLoading, key]) => {
    if (loading || mapLoading) return
    if (!key) return
    if (lastStationFocusKey.value === key) return
    lastStationFocusKey.value = key
    void focusToStation()
  },
  { immediate: true },
)
</script>

<template>
  <div class="relative railway-map-container">
    <div
      ref="containerRef"
      class="w-full overflow-hidden border border-slate-200/70 bg-white/80 dark:bg-slate-900/20 dark:border-slate-800 transition duration-250"
      :class="props.rounded ? 'rounded-3xl' : 'rounded-none'"
      :style="{
        minHeight: containerHeight,
        height: containerHeight,
      }"
    ></div>

    <div class="absolute inset-0 z-998 p-3 pointer-events-none flex items-end">
      <div
        class="absolute inset-0 bg-[linear-gradient(180deg,transparent_75%,var(--background-dark-2)_125%)]"
        :class="props.rounded ? 'rounded-3xl' : 'rounded-none'"
      ></div>

      <div
        class="relative w-full rounded-lg text-xs text-white flex items-end justify-between"
        style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)"
      >
        <div></div>

        <Transition
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
        </Transition>
      </div>
    </div>

    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="props.loading || props.mapLoading"
        class="absolute inset-0 bg-white/60 dark:bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center"
        :class="props.rounded ? 'rounded-3xl' : 'rounded-none'"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="h-5 w-5 animate-spin text-slate-400"
        />
      </div>
    </Transition>
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

.railway-platform-arrow.leaflet-div-icon {
  background: transparent;
  border: none;
  box-shadow: none;
}

.railway-platform-arrow-icon {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 12px solid #ffffff;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55));
  transform-origin: 50% 65%;
}

.dark .railway-platform-arrow-icon {
  border-bottom-color: #f1f5f9;
  filter: drop-shadow(0 2px 4px rgba(2, 6, 23, 0.8));
}

.railway-map-container .leaflet-tile-pane {
  filter: brightness(0.85) saturate(0.85);
}

.dark .railway-map-container .leaflet-tile-pane {
  filter: brightness(0.7) saturate(0.85);
}
</style>
