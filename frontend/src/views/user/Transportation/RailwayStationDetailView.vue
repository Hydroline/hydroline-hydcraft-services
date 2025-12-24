<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import RailwayStationMapFullscreenOverlay from '@/views/user/Transportation/railway/components/RailwayStationMapFullscreenOverlay.vue'
import RailwayStationRoutesMapPanel from '@/views/user/Transportation/railway/components/RailwayStationRoutesMapPanel.vue'
import RailwayCompanyBindingSection from '@/views/user/Transportation/railway/components/RailwayCompanyBindingSection.vue'
import RailwayStationScheduleCard from '@/views/user/Transportation/railway/components/RailwayStationScheduleCard.vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type { RailwayStationDetail } from '@/types/transportation'
import type {
  RailwayStationRouteMapPayload,
  RailwayStationRouteMapResponse,
} from '@/types/transportation'
import { getDimensionName } from '@/utils/minecraft/dimension-names'
import modpackCreateImg from '@/assets/resources/modpacks/Create.jpg'
import modpackMtrImg from '@/assets/resources/modpacks/MTR.png'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'

import type { RailwayRouteLogResult } from '@/types/transportation'

dayjs.locale('zh-cn')

const route = useRoute()
const router = useRouter()
const toast = useToast()
const transportationStore = useTransportationRailwayStore()

const detail = ref<RailwayStationDetail | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const logs = ref<RailwayRouteLogResult | null>(null)
const logLoading = ref(true)
const logError = ref<string | null>(null)

const logContentRef = ref<HTMLElement | null>(null)
let lastLogContentHeight: number | null = null

const fullscreenMapOpen = ref(false)

const stationRouteMap = ref<RailwayStationRouteMapPayload | null>(null)
const stationRouteMapLoading = ref(false)
const stationRouteMapError = ref<string | null>(null)
let stationRouteMapPollToken = 0

type RouteGroupSelectItem = {
  value: string
  displayLabel: string
  baseLabel: string
  suffixLabel: string
  colorHex: string | null
}

const selectedRouteGroupKeys = ref<string[]>([])

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

const params = computed(() => {
  return {
    stationId: route.params.stationId as string | undefined,
    railwayType: route.params.railwayType as string | undefined,
    serverId: route.query.serverId as string | undefined,
    dimension: (route.query.dimension as string | undefined) ?? undefined,
  }
})

const stationName = computed(
  () => detail.value?.station.name ?? detail.value?.station.id ?? '未知车站',
)
const serverBadge = computed(
  () => detail.value?.server.name ?? params.value.serverId ?? '—',
)
const dimensionName = computed(() =>
  getDimensionName(detail.value?.station.dimension || params.value.dimension),
)

const associatedRoutes = computed(
  () => detail.value?.mergedRoutes ?? detail.value?.routes ?? [],
)
const platforms = computed(() => detail.value?.platforms ?? [])

function extractRouteGroupName(value: string | null | undefined) {
  if (!value) return null
  const primary = value.split('||')[0] ?? ''
  const firstSegment = primary.split('|')[0] ?? ''
  const trimmed = firstSegment.trim()
  return trimmed || null
}

const transferCount = computed(() => {
  const set = new Set<string>()
  for (const route of associatedRoutes.value) {
    const key = extractRouteGroupName(route.name) ?? null
    if (key) set.add(key)
  }
  return set.size
})

const routeIndex = computed(() => {
  const map = new Map<string, RailwayStationDetail['routes'][number]>()
  for (const route of detail.value?.routes ?? []) {
    if (!route?.id) continue
    map.set(route.id, route)
  }
  return map
})

function extractRouteSuffixLabel(value: string | null | undefined) {
  if (!value) return ''
  const secondary = value.split('||')[1] ?? ''
  const first = secondary.split('|')[0] ?? ''
  return first.trim()
}

function getRouteLabel(routeId: string) {
  const route = routeIndex.value.get(routeId)
  const name = route?.name?.trim()
  if (name) {
    return {
      label: name,
      group: extractRouteGroupName(name),
      suffix: extractRouteSuffixLabel(name),
      tooltip: null as string | null,
    }
  }
  // Avoid showing raw IDs directly in UI; keep them in tooltip for debugging.
  return {
    label: '未知线路',
    group: '未知线路',
    suffix: '',
    tooltip: routeId,
  }
}

const routeGroupSelectItems = computed<RouteGroupSelectItem[]>(() => {
  const groups = stationRouteMap.value?.groups ?? []
  if (!groups.length) return []

  const items: RouteGroupSelectItem[] = []

  for (const group of groups) {
    const firstRouteId = group.routeIds?.[0] ?? null
    const match = firstRouteId ? routeIndex.value.get(firstRouteId) : null

    const baseLabel = group.displayName || group.key
    const suffixLabel = extractRouteSuffixLabel(match?.name ?? null)
    const displayLabel = suffixLabel ? `${baseLabel} ${suffixLabel}` : baseLabel

    const colorHex = colorToHex(group.color ?? match?.color ?? null)

    items.push({
      value: group.key,
      displayLabel,
      baseLabel,
      suffixLabel,
      colorHex,
    })
  }

  items.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel))
  return items
})

const filteredStationRouteMap = computed<RailwayStationRouteMapPayload | null>(
  () => {
    const map = stationRouteMap.value
    if (!map) return null
    const keys = selectedRouteGroupKeys.value
    if (!keys.length) {
      return {
        ...map,
        groups: [],
      }
    }
    const set = new Set(keys)
    return {
      ...map,
      groups: (map.groups ?? []).filter((g) => set.has(g.key)),
    }
  },
)

watch(
  () => stationRouteMap.value?.groups,
  (groups) => {
    if (!groups) return
    const nextKeys = (groups ?? []).map((g) => g.key)
    if (!nextKeys.length) {
      selectedRouteGroupKeys.value = []
      return
    }

    // 初次加载时默认全选，后续仅做“剔除不存在的 key”同步
    if (!selectedRouteGroupKeys.value.length) {
      selectedRouteGroupKeys.value = nextKeys
      return
    }

    const keySet = new Set(nextKeys)
    selectedRouteGroupKeys.value = selectedRouteGroupKeys.value.filter((k) =>
      keySet.has(k),
    )
  },
  { immediate: true },
)

const modpackInfo = computed(() => {
  const modRaw = detail.value?.railwayType ?? params.value.railwayType
  const mod = typeof modRaw === 'string' ? modRaw.toUpperCase() : null
  if (mod === 'MTR') {
    return { label: 'MTR', image: modpackMtrImg }
  }
  if (mod === 'CREATE') {
    return { label: '机械动力', image: modpackCreateImg }
  }
  return { label: modRaw || '—', image: null as string | null }
})

const routeColor = computed(
  () => detail.value?.station.color ?? detail.value?.routes?.[0]?.color ?? null,
)
const routeColorHex = computed(() => colorToHex(routeColor.value))

function colorToHex(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null
  const sanitized = Math.max(0, Math.floor(value))
  return `#${sanitized.toString(16).padStart(6, '0').slice(-6)}`
}

function formatSecondsFromTicks(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null
  const seconds = value / 2
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
  const { stationId, railwayType, serverId, dimension } = params.value
  if (!stationId || !railwayType || !serverId) {
    errorMessage.value = '缺少 stationId、serverId 或铁路类型参数'
    detail.value = null
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const result = await transportationStore.fetchStationDetail(
      {
        id: stationId,
        railwayType,
        serverId,
        dimension,
      },
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
  const { stationId, railwayType, serverId, dimension } = params.value
  if (!stationId || !serverId || !railwayType) {
    logs.value = null
    return
  }
  logLoading.value = true
  logError.value = null
  try {
    const result = await transportationStore.fetchStationLogs(
      {
        id: stationId,
        railwayType,
        serverId,
        dimension,
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

async function fetchStationRouteMap(forceStart = false) {
  const { stationId, railwayType, serverId, dimension } = params.value
  if (!stationId || !serverId || !railwayType) {
    stationRouteMap.value = null
    stationRouteMapError.value = null
    stationRouteMapLoading.value = false
    return
  }

  const token = ++stationRouteMapPollToken
  stationRouteMapLoading.value = true
  stationRouteMapError.value = null

  try {
    const res: RailwayStationRouteMapResponse =
      await transportationStore.fetchStationRouteMap(
        {
          id: stationId,
          railwayType,
          serverId,
          dimension,
        },
        forceStart,
      )

    if (token !== stationRouteMapPollToken) return

    if (res.status === 'ready') {
      stationRouteMap.value = res.data
      stationRouteMapLoading.value = false
      return
    }

    // pending
    stationRouteMap.value = null
    stationRouteMapLoading.value = true
    window.setTimeout(() => {
      if (token !== stationRouteMapPollToken) return
      void fetchStationRouteMap(false)
    }, 900)
  } catch (error) {
    if (token !== stationRouteMapPollToken) return
    const raw = error instanceof Error ? error.message : 'Request failed'
    const msg = translateAuthErrorMessage(raw) ?? raw
    stationRouteMapError.value = msg
    stationRouteMapLoading.value = false
    toast.add({ title: msg, color: 'error' })
  }
}

function goBack() {
  router.push({ name: 'transportation.railway' })
}

function goDetailedMap() {
  fullscreenMapOpen.value = true
}

function goRoute(routeId: string) {
  if (!detail.value) return
  router.push({
    name: 'transportation.railway.route',
    params: {
      railwayType: detail.value.railwayType.toLowerCase(),
      routeId,
    },
    query: {
      serverId: detail.value.server.id,
      dimension: detail.value.station.dimension,
    },
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

const routesExpanded = ref(false)
const MAX_VISIBLE_ROUTES = 10

const visibleRoutes = computed(() => {
  if (routesExpanded.value) return associatedRoutes.value
  return associatedRoutes.value.slice(0, MAX_VISIBLE_ROUTES)
})

const hasMoreRoutes = computed(
  () => associatedRoutes.value.length > MAX_VISIBLE_ROUTES,
)

const routesContentRef = ref<HTMLElement | null>(null)
let lastRoutesContentHeight: number | null = null

watch(
  () => [visibleRoutes.value.length, routesExpanded.value] as const,
  async () => {
    await nextTick()
    const el = routesContentRef.value
    if (!el) return

    const nextHeight = el.getBoundingClientRect().height
    if (lastRoutesContentHeight == null) {
      lastRoutesContentHeight = nextHeight
      return
    }
    if (Math.abs(nextHeight - lastRoutesContentHeight) < 1) return

    el.style.height = `${lastRoutesContentHeight}px`
    el.style.overflow = 'hidden'
    // force reflow
    void el.getBoundingClientRect()
    el.style.transition = 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)'
    el.style.height = `${nextHeight}px`

    window.setTimeout(() => {
      if (el !== routesContentRef.value) return
      el.style.transition = ''
      el.style.height = ''
      el.style.overflow = ''
    }, 320)

    lastRoutesContentHeight = nextHeight
  },
  { flush: 'post' },
)

watch(
  () => route.fullPath,
  () => {
    stationRouteMapPollToken += 1
    stationRouteMap.value = null
    stationRouteMapError.value = null
    stationRouteMapLoading.value = false

    logPage.value = 1
    void fetchDetail()
    void fetchLogs()
    void fetchStationRouteMap(true)
  },
)

onMounted(() => {
  void fetchDetail()
  void fetchLogs()
  void fetchStationRouteMap(true)
})

onUnmounted(() => {
  stationRouteMapPollToken += 1
})
</script>

<template>
  <RailwayStationMapFullscreenOverlay
    v-model="fullscreenMapOpen"
    :station-label="stationName.split('|')[0]"
    :transfer-count="transferCount"
    :platform-count="platforms.length"
    :bounds="detail?.station.bounds ?? null"
    :platforms="platforms"
    :color="detail?.station.color ?? detail?.routes[0]?.color ?? null"
    :loading="loading"
    :map-loading="stationRouteMapLoading"
    :route-map="filteredStationRouteMap"
    :route-group-items="routeGroupSelectItems"
    v-model:selected-route-group-keys="selectedRouteGroupKeys"
  />

  <div v-show="!fullscreenMapOpen" class="space-y-6">
    <UButton
      size="sm"
      class="absolute left-4 top-6 md:top-10"
      variant="ghost"
      icon="i-lucide-arrow-left"
      @click="goBack"
    >
      返回概览
    </UButton>

    <div>
      <div class="flex flex-col gap-1">
        <p class="text-sm uppercase text-slate-500">铁路车站信息</p>
        <div>
          <p class="text-4xl font-semibold text-slate-900 dark:text-white">
            {{ stationName.split('|')[0] }}

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
          </p>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <UTooltip :text="`线路色 ${routeColorHex}`">
              <span
                class="block h-3 w-3 rounded-full"
                :style="
                  routeColorHex ? { backgroundColor: routeColorHex } : undefined
                "
              ></span>
            </UTooltip>

            <span
              class="text-lg font-semibold text-slate-600 dark:text-slate-300"
              v-if="stationName.split('|')[1]"
            >
              {{ stationName.split('|')[1] }}
            </span>

            <UBadge variant="soft" size="sm">{{ serverBadge }}</UBadge>
            <UBadge variant="soft" size="sm">{{
              dimensionName || '未知维度'
            }}</UBadge>
          </div>
        </div>
      </div>
    </div>

    <div
      class="mt-3 relative rounded-3xl border border-slate-200/70 dark:border-slate-800"
    >
      <RailwayStationRoutesMapPanel
        :bounds="detail?.station.bounds ?? null"
        :platforms="platforms"
        :station-fill-color="
          detail?.station.color ?? detail?.routes[0]?.color ?? null
        "
        :route-map="filteredStationRouteMap"
        :loading="loading"
        :map-loading="stationRouteMapLoading"
        height="460px"
      />

      <div class="pointer-events-none absolute bottom-4 left-4 z-999">
        <div
          class="pointer-events-auto"
          style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)"
        >
          <USelect
            v-model="selectedRouteGroupKeys"
            :items="routeGroupSelectItems"
            multiple
            value-key="value"
            label-key="displayLabel"
            placeholder="选择显示线路"
            selected-icon="i-lucide-check"
            size="sm"
            class="w-48"
          >
            <template #default="{ modelValue }">
              <span class="truncate text-xs">
                已选 {{ Array.isArray(modelValue) ? modelValue.length : 0 }}
              </span>
            </template>

            <template #item-leading="{ item }">
              <span
                class="block h-3 w-3 rounded-full"
                :style="
                  item.colorHex ? { backgroundColor: item.colorHex } : undefined
                "
              ></span>
            </template>
            <template #item-label="{ item }">
              <span class="truncate text-xs">{{ item.baseLabel }}</span>
              <span
                v-if="item.suffixLabel"
                class="ml-1 truncate text-xs text-slate-400/80 dark:text-slate-200/80"
              >
                {{ item.suffixLabel }}
              </span>
            </template>
          </USelect>
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

    <div v-if="loading" class="text-sm text-slate-500">
      <UIcon
        name="i-lucide-loader-2"
        class="inline-block h-5 w-5 animate-spin text-slate-400"
      />
    </div>
    <div v-else-if="detail" class="space-y-6">
      <section class="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 class="text-lg text-slate-600 dark:text-slate-300">基本信息</h3>
          <div
            class="mt-3 space-y-3 rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:bg-slate-700/60 dark:text-slate-300"
          >
            <dl class="space-y-2">
              <RailwayCompanyBindingSection
                entity-type="STATION"
                :entity-id="detail.station.id"
                :server-id="detail.server.id"
                :railway-type="detail.railwayType"
                :dimension="
                  detail.station.dimension ?? params.dimension ?? null
                "
                :operator-company-ids="detail.operatorCompanyIds"
                :builder-company-ids="detail.builderCompanyIds"
              />

              <div class="flex justify-between gap-4">
                <dt>站点 ID</dt>
                <dd class="font-mono text-slate-900 dark:text-white">
                  {{ detail.station.id }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt>所属服务端</dt>
                <dd class="text-slate-900 dark:text-white">
                  {{ detail.server.name }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt>区域</dt>
                <dd class="text-slate-900 dark:text-white">
                  {{ detail.station.zone ?? '—' }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt>最后更新</dt>
                <dd class="text-slate-900 dark:text-white">
                  {{
                    detail.metadata.lastUpdated
                      ? new Date(detail.metadata.lastUpdated).toLocaleString()
                      : '—'
                  }}
                </dd>
              </div>
            </dl>
          </div>

          <div class="mt-6 space-y-3">
            <div
              class="flex flex-col lg:flex-row lg:items-center lg:justify-betweenx"
            >
              <h3 class="text-lg text-slate-600 dark:text-slate-300">
                站点修改日志
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
                  暂无日志记录
                </p>
                <div v-else>
                  <p
                    v-if="logs.entries.length === 0"
                    class="text-sm text-slate-500"
                  >
                    暂无日志记录
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
          </div>
        </div>

        <div class="space-y-6">
          <RailwayStationScheduleCard
            v-if="detail"
            :station-id="detail.station.id"
            :server-id="detail.server.id"
            :railway-type="detail.railwayType"
          />

          <div>
            <h3
              class="flex items-center justify-between text-lg text-slate-600 dark:text-slate-300"
            >
              途经线路

              <span class="ml-2 text-xs text-slate-400 dark:text-slate-500">
                共 {{ associatedRoutes.length }} 条
              </span>
            </h3>
            <div
              class="mt-3 space-y-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <p
                v-if="associatedRoutes.length === 0"
                class="text-sm text-slate-500"
              >
                暂无线路数据
              </p>
              <div v-else>
                <div ref="routesContentRef">
                  <div
                    class="divide-y divide-slate-100 dark:divide-slate-800/60"
                  >
                    <div
                      v-for="route in visibleRoutes"
                      :key="route.id"
                      class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p
                          class="flex items-baseline gap-1 font-medium text-slate-900 dark:text-white"
                        >
                          <span
                            class="block h-3 w-3 rounded-full"
                            :style="
                              colorToHex(route.color)
                                ? { backgroundColor: colorToHex(route.color) }
                                : undefined
                            "
                          ></span>
                          <span>
                            {{ route.name?.split('|')[0] || '未命名' }}
                          </span>

                          <span
                            class="text-xs text-slate-700 dark:text-slate-500"
                            v-if="route.name?.split('|')[1]"
                          >
                            {{ route.name?.split('|')[1] }}
                          </span>
                        </p>
                        <div class="flex items-center gap-1">
                          <UBadge
                            variant="soft"
                            size="sm"
                            v-if="route.name?.split('||').length > 1"
                          >
                            {{ route.name?.split('||')[1].split('|')[0] }}
                          </UBadge>

                          <UBadge variant="soft" color="neutral" size="sm">
                            {{ route.server.name }}
                          </UBadge>

                          <UBadge variant="soft" color="neutral" size="sm">
                            {{
                              getDimensionName(route.dimension) || '未知维度'
                            }}
                          </UBadge>
                        </div>
                      </div>
                      <UButton
                        size="xs"
                        variant="soft"
                        @click="goRoute(route.id)"
                      >
                        查看
                      </UButton>
                    </div>
                  </div>
                </div>

                <div
                  v-if="hasMoreRoutes && !routesExpanded"
                  class="pt-2 flex justify-center border-t border-slate-100 dark:border-slate-800/60"
                >
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    class="w-full flex justify-center"
                    @click="routesExpanded = true"
                  >
                    查看剩余
                    {{ associatedRoutes.length - MAX_VISIBLE_ROUTES }} 条线路
                    <UIcon name="i-lucide-chevron-down" class="ml-1 h-3 w-3" />
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3
              class="flex items-center justify-between text-lg text-slate-600 dark:text-slate-300"
            >
              站台详情

              <span class="ml-2 text-xs text-slate-400 dark:text-slate-500">
                共 {{ platforms.length }} 条
              </span>
            </h3>
            <div
              v-if="platforms.length > 0"
              class="mt-3 space-y-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="text-slate-500 text-xs">
                    <th class="pb-2 font-normal whitespace-nowrap pr-2">
                      站台
                    </th>
                    <th class="pb-2 font-normal whitespace-nowrap">停靠线路</th>
                    <th class="pb-2 font-normal whitespace-nowrap">停留时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="platform in platforms"
                    :key="platform.id"
                    class="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200"
                  >
                    <td class="py-2 font-medium">
                      {{ platform.name?.split('|')[0] || platform.id }}
                    </td>
                    <td class="py-2">
                      <div class="flex flex-wrap gap-1">
                        <template
                          v-for="routeId in platform.routeIds ?? []"
                          :key="routeId"
                        >
                          <UTooltip
                            v-if="getRouteLabel(routeId).tooltip"
                            :text="getRouteLabel(routeId).tooltip || ''"
                          >
                            <UButton
                              size="xs"
                              variant="soft"
                              @click="goRoute(routeId)"
                            >
                              {{ getRouteLabel(routeId).group }}
                            </UButton>
                          </UTooltip>
                          <UButton
                            v-else
                            size="xs"
                            variant="soft"
                            @click="goRoute(routeId)"
                          >
                            {{
                              `${getRouteLabel(routeId).group ?? ''} ${getRouteLabel(routeId).suffix}`.trim()
                            }}
                          </UButton>
                        </template>
                      </div>
                    </td>
                    <td class="py-2">
                      <span v-if="platform.dwellTime == null">—</span>
                      <UTooltip v-else :text="`${platform.dwellTime} tick`">
                        <span>
                          {{ formatSecondsFromTicks(platform.dwellTime) }}s
                        </span>
                      </UTooltip>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-else
              class="mt-3 space-y-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 text-sm text-slate-500"
            >
              暂无站台数据
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
