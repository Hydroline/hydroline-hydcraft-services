<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import RailwayMapPanel from '@/views/user/Transportation/railway/components/RailwayMapPanel.vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type { RailwayRouteDetail } from '@/types/transportation'
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

type PathViewMode = 'default' | 'up' | 'down'

const pathViewMode = ref<PathViewMode>('default')
const pathViewModeOptions = [
  { label: '默认', value: 'default' },
  { label: '上行', value: 'up' },
  { label: '下行', value: 'down' },
]

const params = computed(() => {
  const routeId = route.params.routeId as string | undefined
  const railwayType = route.params.railwayType as string | undefined
  const serverId = route.query.serverId as string | undefined
  const dimension = (route.query.dimension as string | undefined) ?? undefined
  return { routeId, serverId, dimension, railwayType }
})

const mapAutoFocus = ref(true)

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
const pathViewModeItems = computed(() =>
  isCircularRoute.value
    ? pathViewModeOptions.filter((item) => item.value === 'default')
    : pathViewModeOptions,
)

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

const metadataList = computed(() => {
  const payload = detail.value?.route.payload ?? {}
  const lastDeployedOffset = detail.value?.metadata.lastDeployed ?? null
  const lastUpdated = detail.value?.metadata.lastUpdated ?? null
  const lastDeployed = formatLastDeployed(lastDeployedOffset, lastUpdated)
  return [
    { label: '运输模式', value: detail.value?.route.transportMode || '—' },
    { label: '线路类型', value: (payload.route_type as string) || '—' },
    { label: '环线属性', value: (payload.circular_state as string) || '—' },
    {
      label: '轻轨编号',
      value: (payload.light_rail_route_number as string) || '—',
    },
    {
      label: '最后部署',
      value: lastDeployed.display,
      tooltip: lastDeployed.tooltip,
    },
    {
      label: '数据更新',
      value: formatTimestamp(lastUpdated),
    },
  ]
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
const stopMapByPlatformId = computed(() => {
  const map = new Map<string, RailwayRouteDetail['stops'][number]>()
  for (const stop of detail.value?.stops ?? []) {
    if (stop.platformId) {
      map.set(stop.platformId, stop)
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
  if (pathViewMode.value === 'default') {
    return geometry
  }
  const wantsUp = pathViewMode.value === 'up'
  const filtered = paths.filter((path, index) => {
    const isPrimary =
      typeof path.isPrimary === 'boolean' ? path.isPrimary : index === 0
    return wantsUp ? isPrimary : !isPrimary
  })
  if (!filtered.length) {
    return { ...geometry, paths: [] }
  }
  return { ...geometry, paths: filtered }
})
const stopDisplayItems = computed(() =>
  displayedStops.value.map((stop) => {
    const displayName = resolveStopStationName(stop)
    const nameParts = formatStationNameParts(displayName)
    return {
      stop,
      title: nameParts.title,
      subtitle: nameParts.subtitle,
      platformLabel: getStopPlatformLabel(stop),
    }
  }),
)

function formatTimestamp(value: number | null | undefined) {
  if (!value) return '—'
  const d = dayjs(value)
  if (!d.isValid()) return '—'
  return `${d.format('YYYY-MM-DD HH:mm')} (${d.fromNow()})`
}

function formatLastDeployed(
  offset: number | null | undefined,
  reference: number | null | undefined,
) {
  if (offset == null || offset < 0) {
    return { display: '—', tooltip: null as string | null }
  }
  const secondsLabel = formatOffsetSeconds(offset)
  const baseTooltip = `距当日零点 ${secondsLabel} 秒`
  const reason = '当天 00:00 后的毫秒偏移'
  const display = dayjs()
    .startOf('day')
    .add(offset, 'millisecond')
    .format('HH:mm:ss')
  if (!reference) {
    return { display, tooltip: `${baseTooltip}（${reason}）` }
  }
  const base = dayjs(reference)
  if (!base.isValid()) {
    return { display, tooltip: `${baseTooltip}（${reason}）` }
  }
  const deployedMoment = base.startOf('day').add(offset, 'millisecond')
  return {
    display,
    tooltip: `${deployedMoment.format('YYYY-MM-DD HH:mm:ss')} ${baseTooltip}（${reason}）`,
  }
}

function formatOffsetSeconds(offset: number) {
  const seconds = offset / 1000
  const precision = seconds >= 10 ? 1 : seconds >= 1 ? 2 : 3
  return Number(seconds.toFixed(precision)).toString()
}

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

function getStationName(stationId: string | null | undefined) {
  if (!stationId) return '未知'
  const station = stations.value.find((item) => item.id === stationId)
  const nameParts = station?.name
    ? formatStationNameParts(station.name).title
    : null
  return nameParts || `站点 ${stationId}`
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

function getPlatformDisplayName(
  platform: RailwayRouteDetail['platforms'][number],
) {
  return (
    splitFirstSegment(platform.name) ??
    splitFirstSegment(platform.id) ??
    platform.name ??
    platform.id ??
    '站台'
  )
}

function getPlatformListingStation(
  platform: RailwayRouteDetail['platforms'][number],
) {
  const platformId = platform.id
  if (platformId) {
    const stop = stopMapByPlatformId.value.get(platformId)
    if (stop) {
      const stopName =
        splitFirstSegment(stop.stationName) ??
        splitFirstSegment(resolveStopStationName(stop))
      if (stopName) return stopName
    }
  }
  return getStationName(platform.stationId)
}

function goDetailedMap() {
  router.push({
    name: 'transportation.railway.route.map',
    params: route.params,
    query: route.query,
  })
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

watch(
  () => route.fullPath,
  () => {
    void fetchDetail()
  },
)

onMounted(() => {
  void fetchDetail()
})
</script>

<template>
  <div class="space-y-6">
    <UButton
      size="sm"
      class="absolute left-4 top-6 md:top-10"
      variant="ghost"
      icon="i-lucide-arrow-left"
      @click="router.push({ name: 'transportation.railway' })"
    >
      返回概览
    </UButton>

    <div class="mt-3">
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

                <UTooltip :text="`线路色 ${routeColorHex}`">
                  <span
                    class="block h-3.5 w-3.5 rounded-full border border-slate-100 dark:border-slate-800 shadow"
                    :style="
                      routeColorHex
                        ? { backgroundColor: routeColorHex }
                        : undefined
                    "
                  ></span>
                </UTooltip>
              </span>
            </div>
            <div
              class="flex items-center gap-1.5 text-lg font-semibold text-slate-600 dark:text-slate-300"
            >
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
      <div v-if="loading" class="text-sm text-slate-500">加载中…</div>
      <div v-else-if="detail" class="space-y-6">
        <section class="flex flex-col">
          <div
            class="mb-2 flex flex-col gap-2 items-start justify-between sm:flex-row"
          >
            <h3 class="text-lg text-slate-600 dark:text-slate-300">所经站点</h3>
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
            <div v-else class="h-32">
              <div
                class="relative inline-flex w-full min-w-max items-center justify-between"
              >
                <div
                  class="mask-[linear-gradient(to_right,transparent,#fff_3%_97%,transparent)] pointer-events-none absolute left-0 right-0 top-20 h-1.5 -translate-y-1/2 w-full"
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
                    class="flex flex-col justify-end pb-3 h-20 w-full max-w-60"
                  >
                    <p
                      class="text-base font-semibold text-slate-900 dark:text-white line-clamp-1 truncate"
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

                  <div class="h-12 pt-4">
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

        <section class="grid gap-4 lg:grid-cols-2">
          <div class="space-y-3">
            <h3 class="text-lg text-slate-600 dark:text-slate-300">基本信息</h3>
            <div
              class="grid gap-3 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <div
                class="grid gap-2 text-sm text-slate-600 dark:text-slate-300"
              >
                <div class="flex justify-between">
                  <span>线路 ID</span>
                  <span class="font-mono text-slate-900 dark:text-white">
                    {{ detail.route.id }}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>线路长度</span>
                  <span class="text-slate-900 dark:text-white">
                    {{
                      detail.metadata.lengthKm != null
                        ? `${detail.metadata.lengthKm} km`
                        : '—'
                    }}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>运输模式</span>
                  <span class="text-slate-900 dark:text-white">
                    {{ detail.route.transportMode || '—' }}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span>线路颜色</span>
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-slate-900 dark:text-white">
                      {{ routeColorHex }}
                    </span>
                    <span
                      class="h-3.5 w-3.5 rounded-full border border-slate-200 dark:border-slate-700"
                      :style="
                        routeColorHex
                          ? { backgroundColor: routeColorHex }
                          : undefined
                      "
                    ></span>
                  </div>
                </div>
                <div class="flex justify-between items-center">
                  <span>Mod 类型</span>
                  <div class="flex items-center gap-2">
                    <span class="text-slate-900 dark:text-white -mr-1">
                      {{ modpackInfo.label }}
                    </span>
                    <img
                      v-if="modpackInfo.image"
                      :src="modpackInfo.image"
                      :alt="modpackInfo.label"
                      class="h-5 w-6 object-cover"
                    />
                  </div>
                </div>
                <div class="flex justify-between">
                  <span>站点数量</span>
                  <span class="text-slate-900 dark:text-white">
                    {{ detail.platforms.length }} 站
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>几何点数</span>
                  <span class="text-slate-900 dark:text-white">
                    {{ detail.geometry.points.length }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <h3 class="text-lg text-slate-600 dark:text-slate-300">数据状态</h3>
            <div
              class="grid gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <div
                v-for="item in metadataList"
                :key="item.label"
                class="flex justify-between text-sm text-slate-600 dark:text-slate-300"
              >
                <span>{{ item.label }}</span>
                <span
                  v-if="!item.tooltip"
                  class="text-slate-900 dark:text-white"
                >
                  {{ item.value }}
                </span>
                <div
                  v-else
                  class="flex items-center gap-1 text-slate-900 dark:text-white"
                >
                  <span>{{ item.value }}</span>
                  <UTooltip :text="item.tooltip">
                    <UIcon
                      name="i-lucide-info"
                      class="h-4 w-4 text-slate-400"
                    />
                  </UTooltip>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="text-lg text-slate-600 dark:text-slate-300">
            平台 & 关联车厂
          </h3>
          <div class="grid gap-4 lg:grid-cols-2">
            <div
              class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <h4 class="mb-2 font-medium text-slate-700 dark:text-white">
                平台
              </h4>
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="text-slate-500">
                    <th class="py-1">名称</th>
                    <th class="py-1">所属站</th>
                    <th class="py-1">停靠</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="platform in platforms"
                    :key="platform.id"
                    class="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200"
                  >
                    <td class="py-1">{{ getPlatformDisplayName(platform) }}</td>
                    <td class="py-1">
                      {{ getPlatformListingStation(platform) }}
                    </td>
                    <td class="py-1">{{ platform.dwellTime ?? '—' }} tick</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <h4 class="mb-2 font-medium text-slate-700 dark:text-white">
                关联车厂/车段
              </h4>
              <div class="space-y-2">
                <p v-if="depots.length === 0" class="text-sm">暂无关联数据。</p>

                <div v-for="depot in depots" :key="depot.id">
                  <p class="font-medium text-sm text-slate-900 dark:text-white">
                    {{ depot.name || depot.id }}
                  </p>
                  <p class="text-sm text-slate-500">
                    颜色：{{ depot.color || '—' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
