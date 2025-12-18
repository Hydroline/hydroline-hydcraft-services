<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import RailwayMapPanel from '@/views/user/Transportation/railway/components/RailwayMapPanel.vue'
import RailwayMapFullscreenOverlay from '@/views/user/Transportation/railway/components/RailwayMapFullscreenOverlay.vue'
import RailwayRouteBasicInfoPanel from '@/views/user/Transportation/railway/components/RailwayRouteBasicInfoPanel.vue'
import RailwayRouteDataStatusPanel from '@/views/user/Transportation/railway/components/RailwayRouteDataStatusPanel.vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type {
  RailwayGeometryPoint,
  RailwayRouteDetail,
  RailwayRouteLogResult,
} from '@/types/transportation'
import { getDimensionName } from '@/utils/minecraft/dimension-names'
import { parseRouteName } from '@/utils/route/route-name'
import modpackCreateImg from '@/assets/resources/modpacks/Create.jpg'
import modpackMtrImg from '@/assets/resources/modpacks/MTR.png'

dayjs.extend(relativeTime)

const route = useRoute()
const router = useRouter()
const toast = useToast()
const transportationStore = useTransportationRailwayStore()

const detail = ref<RailwayRouteDetail | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const logs = ref<RailwayRouteLogResult | null>(null)
const logLoading = ref(true)
const logError = ref<string | null>(null)

const logContentRef = ref<HTMLElement | null>(null)
let lastLogContentHeight: number | null = null

const logPageSize = 8
const logPage = ref(1)
const logPageCount = computed(() => {
  const total = logs.value?.total ?? 0
  const pageSize = logs.value?.pageSize ?? logPageSize
  if (!total || !pageSize) return 1
  return Math.max(1, Math.ceil(total / pageSize))
})
const canGoLogPrev = computed(() => (logs.value?.page ?? logPage.value) > 1)
const canGoLogNext = computed(
  () => (logs.value?.page ?? logPage.value) < logPageCount.value,
)

type PathViewMode = 'default' | 'up' | 'down'

const pathViewMode = ref<PathViewMode>('default')
const pathViewModeOptions = [
  { label: '默认', value: 'default' },
  { label: '上行', value: 'up' },
  { label: '下行', value: 'down' },
]

const geometryPaths = computed(() => detail.value?.geometry.paths ?? [])
const hasDirectionalPaths = computed(
  () =>
    geometryPaths.value.filter((path) => path && path.isPrimary === false)
      .length > 0,
)

const params = computed(() => {
  const routeId = route.params.routeId as string | undefined
  const railwayType = route.params.railwayType as string | undefined
  const serverId = route.query.serverId as string | undefined
  const dimension = (route.query.dimension as string | undefined) ?? undefined
  return { routeId, serverId, dimension, railwayType }
})

const mapAutoFocus = ref(true)
const fullscreenMapOpen = ref(false)

const circularRegex = /circular|loop/i
const isCircularRoute = computed(() => {
  const payload = detail.value?.route.payload ?? {}
  const candidates = [payload.circular_state, payload.route_type]
  return candidates.some(
    (value) =>
      typeof value === 'string' &&
      circularRegex.test(value) &&
      value.toUpperCase() !== 'NONE',
  )
})
const pathViewModeItems = computed(() => {
  if (isCircularRoute.value || !hasDirectionalPaths.value) {
    return pathViewModeOptions.filter((item) => item.value === 'default')
  }
  return pathViewModeOptions
})

let skipAutoFocusForNextPathChange = false

watch(detail, () => {
  if (pathViewMode.value !== 'default') {
    skipAutoFocusForNextPathChange = true
    pathViewMode.value = 'default'
  }
  mapAutoFocus.value = true
})

watch(pathViewMode, (current, previous) => {
  if (previous === undefined) return
  if (skipAutoFocusForNextPathChange) {
    skipAutoFocusForNextPathChange = false
    return
  }
  if (current !== previous) {
    mapAutoFocus.value = false
  }
})

watch(isCircularRoute, (value) => {
  if (value && pathViewMode.value !== 'default') {
    skipAutoFocusForNextPathChange = true
    pathViewMode.value = 'default'
  }
})

watch(hasDirectionalPaths, (value) => {
  if (!value && pathViewMode.value !== 'default') {
    skipAutoFocusForNextPathChange = true
    pathViewMode.value = 'default'
  }
})

const routeName = computed(() => parseRouteName(detail.value?.route.name))

const stations = computed(() => detail.value?.stations ?? [])
const platforms = computed(() => detail.value?.platforms ?? [])
const depots = computed(() => detail.value?.depots ?? [])
const orderedStops = computed(() => {
  const stops = detail.value?.stops ?? []
  return [...stops].sort((a, b) => a.order - b.order)
})
const displayedStops = computed(() => {
  if (pathViewMode.value === 'down') {
    return [...orderedStops.value].reverse()
  }
  return orderedStops.value
})
const platformMap = computed(() => {
  const map = new Map<string, RailwayRouteDetail['platforms'][number]>()
  for (const platform of platforms.value) {
    if (platform.id) {
      map.set(platform.id, platform)
    }
  }
  return map
})
const routeAccentColor = computed(() => {
  const color = detail.value?.route.color
  if (color == null) return null
  const sanitized = Math.max(0, Math.floor(color))
  const hex = sanitized.toString(16).padStart(6, '0').slice(-6)
  return `#${hex}`
})

function getStopAnchor(
  stop: RailwayRouteDetail['stops'][number] | undefined,
): RailwayGeometryPoint | null {
  if (!stop) return null
  if (stop.position) {
    return stop.position
  }
  const bounds = stop.bounds
  if (
    bounds &&
    bounds.xMin != null &&
    bounds.xMax != null &&
    bounds.zMin != null &&
    bounds.zMax != null
  ) {
    return {
      x: (bounds.xMin + bounds.xMax) / 2,
      z: (bounds.zMin + bounds.zMax) / 2,
    }
  }
  return null
}

function getPathStartPoint(
  path: NonNullable<RailwayRouteDetail['geometry']['paths']>[number],
) {
  if (!path) return null
  if (path.points?.length) {
    return path.points[0]
  }
  const segment = path.segments?.[0]
  if (segment) {
    const start = segment.start
    if (
      typeof start.x === 'number' &&
      typeof start.z === 'number' &&
      Number.isFinite(start.x) &&
      Number.isFinite(start.z)
    ) {
      return { x: start.x, z: start.z }
    }
  }
  return null
}

function pickBestPathForStop(
  paths: NonNullable<RailwayRouteDetail['geometry']['paths']>,
  stop: RailwayRouteDetail['stops'][number] | null,
) {
  if (!paths.length) return null
  const anchor = getStopAnchor(stop ?? undefined)
  if (!anchor) {
    return paths[0]
  }
  let best = paths[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const path of paths) {
    const point = getPathStartPoint(path)
    if (!point) continue
    const dx = point.x - anchor.x
    const dz = point.z - anchor.z
    const distance = dx * dx + dz * dz
    if (distance < bestDistance) {
      bestDistance = distance
      best = path
    }
  }
  return best
}

type Direction = 'up' | 'down'

function resolveDirectionForMode(mode: PathViewMode): Direction {
  if (mode === 'up') {
    return 'up'
  }
  return 'down'
}

function getReferenceStopForDirection(
  direction: Direction,
): RailwayRouteDetail['stops'][number] | null {
  const stops = orderedStops.value
  if (!stops.length) return null
  return direction === 'up' ? stops[0] : stops[stops.length - 1]
}

const modpackInfo = computed(() => {
  const mod = detail.value?.railwayType
  if (mod === 'MTR') {
    return { label: 'MTR', image: modpackMtrImg }
  }
  if (mod === 'CREATE') {
    return { label: '机械动力', image: modpackCreateImg }
  }
  return { label: mod || '—', image: null as string | null }
})

const routeColorHex = computed(() => routeAccentColor.value)
const combinePaths = computed(() => pathViewMode.value === 'default')
const geometryForView = computed(() => {
  const geometry = detail.value?.geometry
  if (!geometry) {
    return null
  }
  const paths = geometry.paths
  if (!paths?.length) {
    return geometry
  }
  const modeDirection = resolveDirectionForMode(pathViewMode.value)
  const wantsUp = modeDirection === 'up'
  const directionalPaths = paths.filter((path, index) => {
    const isPrimary =
      typeof path.isPrimary === 'boolean' ? path.isPrimary : index === 0
    return wantsUp ? isPrimary : !isPrimary
  })
  const fallbackPaths = directionalPaths.length ? directionalPaths : paths
  const referenceStop = getReferenceStopForDirection(modeDirection)
  const chosenPath = pickBestPathForStop(fallbackPaths, referenceStop)
  if (!chosenPath) {
    return { ...geometry, paths: fallbackPaths }
  }
  const secondaryPaths = paths
    .filter((path) => path !== chosenPath)
    .map((path) => ({ ...path, isPrimary: false }))
  const primaryPath = { ...chosenPath, isPrimary: true }
  if (pathViewMode.value === 'default') {
    return { ...geometry, paths: [primaryPath, ...secondaryPaths] }
  }
  return { ...geometry, paths: [primaryPath] }
})
const stopDisplayItems = computed(() =>
  displayedStops.value.map((stop) => {
    const platformStationId = stop.platformId
      ? (platformMap.value.get(stop.platformId)?.stationId ?? null)
      : null
    const resolvedStationId = stop.stationId ?? platformStationId

    const displayName = resolveStopStationName({
      ...stop,
      stationId: resolvedStationId,
    })
    const nameParts = formatStationNameParts(displayName)
    const station = resolvedStationId
      ? stations.value.find((item) => item.id === resolvedStationId)
      : null
    return {
      stop,
      title: nameParts.title,
      subtitle: nameParts.subtitle,
      platformLabel: getStopPlatformLabel(stop),
      stationId: resolvedStationId,
      stationColorHex: colorToHex(station?.color ?? null),
      dwellTime: stop.dwellTime ?? null,
    }
  }),
)

const rightmostStopTitle = computed(() => {
  const items = stopDisplayItems.value
  if (!items.length) return null
  return items[items.length - 1].title
})

function formatStationNameParts(value: string | null | undefined) {
  if (!value) {
    return { title: '未知', subtitle: null }
  }
  const [title, subtitle] = value.split('|')
  return {
    title: (title || '未知').trim(),
    subtitle: subtitle?.trim() || null,
  }
}

function splitFirstSegment(value: string | null | undefined) {
  if (!value) return null
  const [primary] = value.split('|')
  return primary?.trim() || null
}

function resolveStopStationName(stop: RailwayRouteDetail['stops'][number]) {
  const stationId = stop.stationId
  if (stationId) {
    const station = stations.value.find((item) => item.id === stationId)
    if (station?.name) {
      return station.name
    }
  }
  if (stop.stationName) {
    return stop.stationName
  }
  return null
}

function getStopPlatformLabel(stop: RailwayRouteDetail['stops'][number]) {
  const platformId = stop.platformId
  if (!platformId) {
    return stop.platformName || '未知站台'
  }
  const platform = platformMap.value.get(platformId)
  if (!platform) {
    return stop.platformName || '未知站台'
  }

  const platformName =
    splitFirstSegment(platform.name) ??
    splitFirstSegment(stop.platformName) ??
    splitFirstSegment(platformId) ??
    '站台'
  return `${platformName}`
}

function colorToHex(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null
  const sanitized = Math.max(0, Math.floor(value))
  return `#${sanitized.toString(16).padStart(6, '0').slice(-6)}`
}

function formatSecondsFromTicks(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null
  const seconds = value / 20
  const rounded = Math.round(seconds * 100) / 100
  return rounded
    .toFixed(2)
    .replace(/\.0+$/, '')
    .replace(/\.(\d*[1-9])0+$/, '.$1')
}

function getPlayerAvatar(playerName: string | null | undefined) {
  if (!playerName) return null
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(playerName)}/80`
}

function formatLogTimestamp(value: string | null | undefined) {
  if (!value) return '—'
  const d = dayjs(value)
  if (!d.isValid()) return value
  return d.format('YYYY-MM-DD HH:mm')
}

async function fetchDetail() {
  const { routeId, serverId, dimension, railwayType } = params.value
  if (!routeId || !serverId || !railwayType) {
    errorMessage.value = '缺少 routeId、serverId 或铁路类型参数'
    detail.value = null
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const result = await transportationStore.fetchRouteDetail(
      { routeId, serverId, dimension, railwayType },
      true,
    )
    detail.value = result
  } catch (error) {
    console.error(error)
    errorMessage.value =
      error instanceof Error ? error.message : '加载失败，请稍后再试'
    toast.add({ title: errorMessage.value, color: 'error' })
    detail.value = null
  } finally {
    loading.value = false
  }
}

async function fetchLogs(force = true) {
  const { routeId, serverId, dimension, railwayType } = params.value
  if (!routeId || !serverId || !railwayType) {
    logs.value = null
    return
  }
  logLoading.value = true
  logError.value = null
  try {
    const result = await transportationStore.fetchRouteLogs(
      {
        routeId,
        serverId,
        dimension,
        railwayType,
        limit: logPageSize,
        page: Math.max(1, logPage.value),
      },
      force,
    )
    logs.value = result
    logPage.value = Math.max(1, result.page ?? logPage.value)
  } catch (error) {
    console.error(error)
    logError.value = error instanceof Error ? error.message : '日志加载失败'
    toast.add({ title: logError.value, color: 'error' })
  } finally {
    logLoading.value = false
  }
}

watch(
  () => [logs.value?.page, logs.value?.entries.length] as const,
  async () => {
    await nextTick()
    const el = logContentRef.value
    if (!el) return

    const nextHeight = el.getBoundingClientRect().height
    if (lastLogContentHeight == null) {
      lastLogContentHeight = nextHeight
      return
    }
    if (Math.abs(nextHeight - lastLogContentHeight) < 1) return

    el.style.height = `${lastLogContentHeight}px`
    el.style.overflow = 'hidden'
    // force reflow
    void el.getBoundingClientRect()
    el.style.transition = 'height 200ms ease'
    el.style.height = `${nextHeight}px`

    window.setTimeout(() => {
      if (el !== logContentRef.value) return
      el.style.transition = ''
      el.style.height = ''
      el.style.overflow = ''
    }, 220)

    lastLogContentHeight = nextHeight
  },
  { flush: 'post' },
)

function goLogPrev() {
  if (!canGoLogPrev.value) return
  logPage.value = Math.max(1, logPage.value - 1)
  void fetchLogs(false)
}

function goLogNext() {
  if (!canGoLogNext.value) return
  logPage.value = Math.min(logPageCount.value, logPage.value + 1)
  void fetchLogs(false)
}

function goDetailedMap() {
  fullscreenMapOpen.value = true
}

function goStationDetail(stationId: string | null | undefined) {
  if (!stationId || !params.value.railwayType) return
  router.push({
    name: 'transportation.railway.station',
    params: {
      railwayType: params.value.railwayType,
      stationId,
    },
    query: route.query,
  })
}

function goDepotDetail(depotId: string | null | undefined) {
  if (!depotId || !params.value.railwayType) return
  router.push({
    name: 'transportation.railway.depot',
    params: {
      railwayType: params.value.railwayType,
      depotId,
    },
    query: route.query,
  })
}

function goPlayerProfile(playerName: string | null | undefined) {
  if (!playerName) return
  router.push({
    name: 'player.name',
    params: { playerName },
  })
}

watch(
  () => route.fullPath,
  () => {
    logPage.value = 1
    void fetchDetail()
    void fetchLogs()
  },
)

onMounted(() => {
  void fetchDetail()
  void fetchLogs()
})
</script>

<template>
  <RailwayMapFullscreenOverlay
    v-model="fullscreenMapOpen"
    v-model:pathViewMode="pathViewMode"
    :path-view-mode-items="pathViewModeItems"
    :path-view-mode-disabled="isCircularRoute"
    :route-label="
      routeName.subtitle
        ? `${routeName.title} ${routeName.subtitle}`
        : routeName.title
    "
    :length-km="detail?.metadata.lengthKm ?? null"
    :stop-count="detail?.stops?.length ?? null"
    :geometry="geometryForView"
    :stops="detail?.stops ?? []"
    :color="detail?.route.color ?? null"
    :loading="!detail"
    :auto-focus="mapAutoFocus"
    :combine-paths="combinePaths"
  />

  <div v-show="!fullscreenMapOpen" class="space-y-6">
    <UButton
      size="sm"
      class="absolute left-4 top-6 md:top-10"
      variant="ghost"
      icon="i-lucide-arrow-left"
      @click="router.push({ name: 'transportation.railway' })"
    >
      返回概览
    </UButton>

    <div>
      <div class="flex flex-col gap-1">
        <p class="text-sm uppercase text-slate-500">铁路线路详情</p>

        <div>
          <div>
            <div class="text-4xl font-semibold text-slate-900 dark:text-white">
              {{ routeName.title }}

              <span class="inline-flex items-center gap-1.5">
                <UTooltip
                  v-if="modpackInfo.image && modpackInfo.label"
                  :text="`${modpackInfo.label} Mod`"
                >
                  <img
                    :src="modpackInfo.image"
                    :alt="modpackInfo.label"
                    class="h-5 w-6 object-cover"
                  />
                </UTooltip>
              </span>
            </div>
            <div
              class="flex items-center gap-1.5 text-lg font-semibold text-slate-600 dark:text-slate-300"
            >
              <UTooltip :text="`线路色 ${routeColorHex}`">
                <span
                  class="block h-3 w-3 rounded-full"
                  :style="
                    routeColorHex
                      ? { backgroundColor: routeColorHex }
                      : undefined
                  "
                ></span>
              </UTooltip>

              <span v-if="routeName.subtitle">
                {{ routeName.subtitle }}
              </span>

              <UBadge variant="solid" size="sm" v-if="routeName.badge">
                {{ routeName.badge.split('|').join(' ') }}
              </UBadge>

              <UBadge variant="soft" size="sm">
                {{ detail?.server.name || params.serverId }}
              </UBadge>

              <UBadge variant="soft" size="sm">
                {{ getDimensionName(detail?.dimension || params.dimension) }}
              </UBadge>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="mt-3 relative rounded-3xl border border-slate-200/70 dark:border-slate-800"
    >
      <RailwayMapPanel
        :geometry="geometryForView"
        :stops="detail?.stops ?? []"
        :color="detail?.route.color ?? null"
        :loading="!detail"
        :auto-focus="mapAutoFocus"
        :combine-paths="combinePaths"
        height="520px"
      />

      <div class="pointer-events-none absolute bottom-3 left-3 z-998">
        <div
          class="rounded-lg text-xl font-semibold text-white"
          style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)"
        >
          <span class="text-xs mr-1">线路全长</span>
          <span>
            {{
              detail?.metadata.lengthKm != null
                ? `${detail.metadata.lengthKm} km`
                : '—'
            }}
          </span>
        </div>
      </div>

      <div
        class="pointer-events-none absolute inset-x-4 top-4 flex justify-end z-999"
      >
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          class="flex items-center gap-1 pointer-events-auto backdrop-blur-2xl text-white bg-black/20 dark:bg-slate-900/10 hover:bg-white/10 dark:hover:bg-slate-900/20 shadow"
          @click="goDetailedMap"
        >
          <UIcon name="i-lucide-maximize" class="h-3.5 w-3.5" />
          全屏
        </UButton>
      </div>
    </div>

    <div>
      <div v-if="loading" class="text-sm text-slate-500">
        <UIcon
          name="i-lucide-loader-2"
          class="inline-block h-5 w-5 animate-spin text-slate-400"
        />
      </div>
      <div v-else-if="detail" class="space-y-6">
        <section class="flex flex-col">
          <div class="mb-2 flex gap-2 items-start justify-between">
            <h3
              class="flex items-center gap-3 text-lg text-slate-600 dark:text-slate-300"
            >
              <span>所经站点</span>

              <span
                v-if="!isCircularRoute && rightmostStopTitle"
                class="inline-flex items-center gap-1 text-sm font-medium text-slate-500 dark:text-slate-400"
              >
                <UIcon name="i-lucide-play" class="h-3" />
                <span>往 {{ rightmostStopTitle }}</span>
              </span>
            </h3>
            <USelect
              v-model="pathViewMode"
              :items="pathViewModeItems"
              value-key="value"
              label-key="label"
              class="w-36"
              :disabled="isCircularRoute"
            />
          </div>
          <div
            class="overflow-x-auto rounded-2xl mask-[linear-gradient(to_right,transparent,#fff_3%_97%,transparent)]"
            style="scrollbar-width: thin"
          >
            <div
              v-if="stopDisplayItems.length === 0"
              class="p-4 text-sm text-slate-500"
            >
              暂无站点数据
            </div>
            <div v-else class="h-22">
              <div
                class="relative inline-flex w-full min-w-max items-center justify-between"
              >
                <div
                  class="mask-[linear-gradient(to_right,transparent,#fff_3%_97%,transparent)] pointer-events-none absolute left-0 right-0 top-12 h-1.5 -translate-y-1/2 w-full"
                  :style="
                    routeAccentColor
                      ? { backgroundColor: routeAccentColor }
                      : undefined
                  "
                ></div>

                <div
                  v-for="item in stopDisplayItems"
                  :key="`stop-${item.stop.platformId ?? item.stop.stationId ?? item.stop.order}`"
                  class="flex flex-col items-center text-center min-w-50"
                >
                  <div
                    class="flex flex-col justify-end pb-3 h-12 w-full max-w-60"
                  >
                    <p
                      class="text-base font-semibold text-slate-900 dark:text-white line-clamp-1 truncate hover:underline underline-offset-2 cursor-pointer"
                      @click="goStationDetail(item.stationId)"
                    >
                      {{ item.title }}
                    </p>
                    <p
                      class="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 truncate h-4"
                    >
                      <span v-if="item.subtitle !== null">{{
                        item.subtitle
                      }}</span>
                    </p>
                  </div>

                  <div class="relative flex items-center justify-center">
                    <span
                      class="absolute flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <span
                        class="h-5 w-5 rounded-full border-4 bg-white"
                        :style="
                          routeAccentColor
                            ? { borderColor: routeAccentColor }
                            : undefined
                        "
                      ></span>
                    </span>
                  </div>

                  <div class="h-10 pt-4">
                    <div
                      class="text-[10px] text-slate-500 dark:text-slate-400 font-mono border border-slate-300 dark:border-slate-600 rounded px-1 bg-white dark:bg-slate-900"
                    >
                      {{ item.platformLabel }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="grid gap-6 lg:grid-cols-2">
          <div class="space-y-6">
            <section class="space-y-3">
              <RailwayRouteBasicInfoPanel
                :detail="detail"
                :route-color-hex="routeColorHex"
                :modpack-label="modpackInfo.label"
                :modpack-image="modpackInfo.image"
              />
            </section>

            <section class="space-y-3">
              <div
                class="flex flex-col lg:flex-row lg:items-center lg:justify-betweenx"
              >
                <h3 class="text-lg text-slate-600 dark:text-slate-300">
                  线路修改日志
                </h3>
                <div class="flex items-center gap-2 mx-auto lg:mx-0 lg:ml-auto">
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-chevron-left"
                    :disabled="logLoading || !canGoLogPrev"
                    @click="goLogPrev"
                  >
                    上一页
                  </UButton>
                  <span class="text-xs text-slate-500 dark:text-slate-400">
                    第 {{ logs?.page ?? logPage }} / {{ logPageCount }} 页
                  </span>
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-chevron-right"
                    :disabled="logLoading || !canGoLogNext"
                    @click="goLogNext"
                  >
                    下一页
                  </UButton>
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-refresh-cw"
                    :disabled="logLoading"
                    @click="fetchLogs(true)"
                  >
                    刷新
                  </UButton>
                </div>
              </div>
              <div>
                <div ref="logContentRef" class="relative">
                  <p v-if="!logs && logLoading" class="text-sm text-slate-500">
                    <UIcon
                      name="i-lucide-loader-2"
                      class="inline-block h-5 w-5 animate-spin text-slate-400"
                    />
                  </p>
                  <p v-else-if="!logs && logError" class="text-sm text-red-500">
                    {{ logError }}
                  </p>
                  <p v-else-if="!logs" class="text-sm text-slate-500">
                    暂无日志记录。
                  </p>
                  <div v-else>
                    <p
                      v-if="logs.entries.length === 0"
                      class="text-sm text-slate-500"
                    >
                      暂无日志记录。
                    </p>
                    <div v-else class="space-y-3">
                      <div
                        v-for="entry in logs.entries"
                        :key="entry.id"
                        class="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition duration-250 outline-2 outline-transparent hover:outline-primary"
                        @click="goPlayerProfile(entry.playerName)"
                      >
                        <div class="flex items-center gap-3">
                          <button
                            type="button"
                            class="shrink-0"
                            @click="goPlayerProfile(entry.playerName)"
                          >
                            <img
                              v-if="getPlayerAvatar(entry.playerName)"
                              :src="
                                getPlayerAvatar(entry.playerName) || undefined
                              "
                              class="h-10 w-10 rounded-full border border-slate-200 dark:border-slate-700"
                              alt="player avatar"
                            />
                            <div
                              v-else
                              class="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
                            >
                              无
                            </div>
                          </button>
                          <div>
                            <p
                              class="text-sm font-semibold text-slate-900 dark:text-white"
                            >
                              {{ entry.playerName || '未知玩家' }}
                            </p>
                            <p class="text-xs text-slate-500">
                              {{ entry.changeType || '—' }} ·
                              {{
                                entry.entryName ||
                                entry.className ||
                                entry.entryId
                              }}
                            </p>
                            <p class="text-xs text-slate-400">
                              {{ formatLogTimestamp(entry.timestamp) }}
                            </p>
                          </div>
                        </div>
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
                        v-if="logLoading"
                        class="absolute inset-0 rounded-xl bg-white/60 dark:bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center"
                      >
                        <UIcon
                          name="i-lucide-loader-2"
                          class="h-5 w-5 animate-spin text-slate-400"
                        />
                      </div>
                    </Transition>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div class="space-y-6">
            <section class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h3 class="text-lg text-slate-600 dark:text-slate-300">
                  途径站点
                </h3>
                <div
                  class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mr-2"
                >
                  <span>
                    列车由
                    <template v-if="depots.length">
                      <template
                        v-for="(depot, index) in depots"
                        :key="depot.id"
                      >
                        <span v-if="index !== 0" class="font-normal">、</span>
                        <button
                          type="button"
                          class="group inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                          @click="goDepotDetail(depot.id)"
                        >
                          <span
                            class="underline-offset-2 group-hover:underline"
                          >
                            {{ (depot.name || depot.id).split('|')[0] }}
                          </span>
                          <UBadge
                            v-if="(depot.name || depot.id).split('|')[1]"
                            size="xs"
                            class="text-xs py-0 border border-slate-300/70 dark:border-slate-700/70"
                            color="neutral"
                            variant="soft"
                          >
                            {{ (depot.name || depot.id).split('|')[1] }}
                          </UBadge>
                        </button>
                      </template>
                    </template>
                    <span v-else class="font-semibold">暂无车厂信息</span>
                    发出
                  </span>
                  <UIcon name="i-lucide-corner-down-left" class="h-4 w-4" />
                </div>
              </div>
              <div
                class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
              >
                <div class="divide-y divide-slate-100 dark:divide-slate-800/60">
                  <div
                    v-if="stopDisplayItems.length > 0"
                    v-for="item in stopDisplayItems"
                    :key="`station-card-${item.stop.platformId ?? item.stop.stationId ?? item.stop.order}`"
                    class="py-3 first:pt-0 last:pb-0"
                  >
                    <div
                      class="flex flex-wrap items-center justify-between gap-3"
                    >
                      <button type="button" class="flex items-center gap-3">
                        <div
                          class="rounded border border-slate-200 px-2 py-0.5 text-xl text-slate-600 dark:border-slate-700 dark:text-slate-300"
                        >
                          {{ item.platformLabel }}
                        </div>

                        <div class="flex flex-col items-start">
                          <div
                            class="flex items-center gap-1 text-base font-semibold text-slate-900 dark:text-white hover:underline underline-offset-2 cursor-pointer"
                            @click="goStationDetail(item.stationId)"
                          >
                            {{ item.title }}

                            <span
                              class="inline-flex h-2.5 w-2.5 rounded-full"
                              :style="
                                item.stationColorHex
                                  ? { backgroundColor: item.stationColorHex }
                                  : undefined
                              "
                            ></span>
                          </div>
                          <div class="text-xs text-slate-500">
                            {{ item.subtitle || '—' }}
                          </div>
                        </div>
                      </button>
                      <div
                        class="text-right text-lg font-semibold text-slate-600 dark:text-slate-300"
                      >
                        <div>
                          <span class="text-xs font-normal mr-1">停站时间</span>
                          <span v-if="item.dwellTime == null">—</span>
                          <UTooltip v-else :text="`${item.dwellTime} tick`">
                            <span
                              >{{
                                formatSecondsFromTicks(item.dwellTime)
                              }}s</span
                            >
                          </UTooltip>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-else class="text-sm">暂无站点数据</div>
                </div>
              </div>
            </section>

            <section class="space-y-3">
              <RailwayRouteDataStatusPanel :detail="detail" />
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
