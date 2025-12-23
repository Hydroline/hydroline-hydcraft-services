<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import RailwayMapPanel from '@/views/user/Transportation/railway/components/RailwayMapPanel.vue'
import RailwayDepotMapPanel from '@/views/user/Transportation/railway/components/RailwayDepotMapPanel.vue'
import RailwayStationRoutesMapPanel from '@/views/user/Transportation/railway/components/RailwayStationRoutesMapPanel.vue'
import { getDimensionName } from '@/utils/minecraft/dimension-names'
import railwayHeroImage from '@/assets/images/image_home_background_240730.webp'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import { useAuthStore } from '@/stores/user/auth'
import { useUiStore } from '@/stores/shared/ui'
import type {
  RailwayDepotDetail,
  RailwayEntity,
  RailwayFeaturedItem,
  RailwayRecentUpdateItem,
  RailwayRoute,
  RailwayRouteDetail,
  RailwayStationDetail,
  RailwayStationRouteMapPayload,
  RailwayStationRouteMapResponse,
} from '@/types/transportation'

dayjs.extend(relativeTime)

const transportationStore = useTransportationRailwayStore()
const authStore = useAuthStore()
const uiStore = useUiStore()
const toast = useToast()

const overview = computed(() => transportationStore.overview)
const overviewLoading = computed(() => transportationStore.overviewLoading)
const stats = computed(
  () =>
    overview.value?.stats ?? {
      serverCount: 0,
      routes: 0,
      stations: 0,
      depots: 0,
    },
)
const recommendations = computed(() => overview.value?.recommendations ?? [])
const recentUpdates = computed(() => overview.value?.recentUpdates ?? [])
const warnings = computed(() => overview.value?.warnings ?? [])

const recommendationPage = ref(1)
const recommendationPageSize = 5
const recommendationPageCount = computed(() => {
  const count = Math.ceil(recommendations.value.length / recommendationPageSize)
  return Math.max(1, count)
})
const pagedRecommendations = computed(() => {
  const start = (recommendationPage.value - 1) * recommendationPageSize
  return recommendations.value.slice(start, start + recommendationPageSize)
})

const recentUpdatePage = ref(1)
const recentUpdatePageSize = 12
const recentUpdatePageCount = computed(() => {
  const count = Math.ceil(recentUpdates.value.length / recentUpdatePageSize)
  return Math.max(1, count)
})
const pagedRecentUpdates = computed(() => {
  const start = (recentUpdatePage.value - 1) * recentUpdatePageSize
  return recentUpdates.value.slice(start, start + recentUpdatePageSize)
})

const recommendationLoading = ref(false)
const recentUpdateLoading = ref(false)
const recommendationContentRef = ref<HTMLElement | null>(null)
const recentUpdateContentRef = ref<HTMLElement | null>(null)
let lastRecommendationHeight = 0
let lastRecentUpdateHeight = 0

const selectedRecommendationId = ref<string | null>(null)
const activeRecommendation = computed<RailwayFeaturedItem | null>(() => {
  if (overviewLoading.value) return null
  const selected = recommendations.value.find(
    (item) => item.id === selectedRecommendationId.value,
  )
  return selected ?? recommendations.value[0] ?? null
})
const activeRecommendationItem = computed(
  () => activeRecommendation.value?.item ?? null,
)
const activeRecommendationType = computed(
  () => activeRecommendation.value?.type ?? null,
)

const routeDetail = ref<RailwayRouteDetail | null>(null)
const stationDetail = ref<RailwayStationDetail | null>(null)
const depotDetail = ref<RailwayDepotDetail | null>(null)
const routeDetailLoading = ref(false)
const stationDetailLoading = ref(false)
const depotDetailLoading = ref(false)
const stationRouteMap = ref<RailwayStationRouteMapPayload | null>(null)
const stationRouteMapLoading = ref(false)
let stationRouteMapPollToken = 0
let stationRouteMapTimer: number | null = null

const canManageFeatured = computed(() =>
  authStore.permissionKeys.includes('transportation.railway.manage-featured'),
)

const settingsModalOpen = ref(false)
const activeFeaturedTab = ref<'route' | 'station' | 'depot'>('route')
const searchTerm = ref('')
const searchLoading = ref(false)
const searchResults = ref<Array<RailwayRoute | RailwayEntity>>([])

const adminFeatured = computed(() => transportationStore.adminFeatured)
const adminFeaturedLoading = computed(
  () => transportationStore.adminFeaturedLoading,
)
const featuredSubmitting = computed(
  () => transportationStore.featuredSubmitting,
)
const reorderLoading = ref(false)
const draggingFeaturedId = ref<string | null>(null)

const featuredTypeLabels: Record<RailwayFeaturedItem['type'], string> = {
  route: '线路',
  station: '车站',
  depot: '车厂',
}

function formatLastUpdated(timestamp: number | null) {
  if (!timestamp) return '未知'
  const date = dayjs(timestamp)
  if (!date.isValid()) return '未知'
  return `${date.format('YYYY-MM-DD HH:mm')}`
}

function ensureToken() {
  if (!authStore.token) {
    uiStore.openLoginDialog()
    throw new Error('需要登录后才能执行该操作')
  }
  return authStore.token
}

function selectRecommendation(id: string) {
  selectedRecommendationId.value = id
}

function buildRouteDetailLink(item: RailwayRoute) {
  return {
    name: 'transportation.railway.route',
    params: {
      routeId: item.id,
      railwayType: item.railwayType.toLowerCase(),
    },
    query: {
      serverId: item.server.id,
      dimension: item.dimension ?? undefined,
    },
  }
}

function buildStationDetailLink(item: RailwayEntity) {
  return {
    name: 'transportation.railway.station',
    params: {
      stationId: item.id,
      railwayType: item.railwayType.toLowerCase(),
    },
    query: {
      serverId: item.server.id,
      dimension: item.dimension ?? undefined,
    },
  }
}

function buildDepotDetailLink(item: RailwayEntity) {
  return {
    name: 'transportation.railway.depot',
    params: {
      depotId: item.id,
      railwayType: item.railwayType.toLowerCase(),
    },
    query: {
      serverId: item.server.id,
      dimension: item.dimension ?? undefined,
    },
  }
}

function buildDetailLink(item: RailwayFeaturedItem) {
  if (item.type === 'route') {
    return buildRouteDetailLink(item.item as RailwayRoute)
  }
  if (item.type === 'station') {
    return buildStationDetailLink(item.item as RailwayEntity)
  }
  return buildDepotDetailLink(item.item as RailwayEntity)
}

function buildRecentDetailLink(item: RailwayRecentUpdateItem) {
  if (item.type === 'route') {
    return buildRouteDetailLink(item.item as RailwayRoute)
  }
  if (item.type === 'station') {
    return buildStationDetailLink(item.item as RailwayEntity)
  }
  return buildDepotDetailLink(item.item as RailwayEntity)
}

function getRoutePlatformCount(item: RailwayFeaturedItem) {
  if (item.type !== 'route') return null
  const route = item.item as RailwayRoute
  return route.platformCount ?? null
}

function stopStationRouteMapPolling() {
  stationRouteMapPollToken += 1
  if (stationRouteMapTimer) {
    window.clearTimeout(stationRouteMapTimer)
    stationRouteMapTimer = null
  }
  stationRouteMapLoading.value = false
}

function handleDragStart(featuredId: string) {
  draggingFeaturedId.value = featuredId
}

function handleDragEnd() {
  draggingFeaturedId.value = null
}

async function handleDrop(targetId: string) {
  if (!draggingFeaturedId.value || draggingFeaturedId.value === targetId) {
    draggingFeaturedId.value = null
    return
  }
  const list = [...adminFeatured.value]
  const fromIndex = list.findIndex(
    (item) => item.id === draggingFeaturedId.value,
  )
  const toIndex = list.findIndex((item) => item.id === targetId)
  if (fromIndex === -1 || toIndex === -1) {
    draggingFeaturedId.value = null
    return
  }
  const [moved] = list.splice(fromIndex, 1)
  list.splice(toIndex, 0, moved)
  transportationStore.adminFeatured = list
  reorderLoading.value = true
  try {
    await transportationStore.reorderFeaturedItems(list.map((item) => item.id))
  } finally {
    reorderLoading.value = false
    draggingFeaturedId.value = null
  }
}
async function fetchStationRouteMap(params: {
  id: string
  serverId: string
  railwayType: string
  dimension?: string | null
}) {
  const token = ++stationRouteMapPollToken
  stationRouteMapLoading.value = true

  try {
    const res: RailwayStationRouteMapResponse =
      await transportationStore.fetchStationRouteMap(
        {
          id: params.id,
          serverId: params.serverId,
          railwayType: params.railwayType,
          dimension: params.dimension ?? null,
        },
        true,
      )

    if (token !== stationRouteMapPollToken) return

    if (res.status === 'ready') {
      stationRouteMap.value = res.data
      stationRouteMapLoading.value = false
      return
    }

    stationRouteMap.value = null
    stationRouteMapLoading.value = true
    stationRouteMapTimer = window.setTimeout(() => {
      if (token !== stationRouteMapPollToken) return
      void fetchStationRouteMap(params)
    }, 900)
  } catch (error) {
    if (token !== stationRouteMapPollToken) return
    stationRouteMapLoading.value = false
    const message = error instanceof Error ? error.message : '地图加载失败'
    toast.add({ title: message, color: 'error' })
  }
}

async function refreshRecommendationDetail(
  recommendation: RailwayFeaturedItem | null,
) {
  routeDetail.value = null
  stationDetail.value = null
  depotDetail.value = null
  routeDetailLoading.value = false
  stationDetailLoading.value = false
  depotDetailLoading.value = false
  stationRouteMap.value = null
  stopStationRouteMapPolling()

  if (!recommendation) return

  const target = recommendation.item
  if (recommendation.type === 'route') {
    routeDetailLoading.value = true
    try {
      routeDetail.value = await transportationStore.fetchRouteDetail({
        routeId: target.id,
        serverId: target.server.id,
        dimension: target.dimension ?? undefined,
        railwayType: target.railwayType,
      })
    } catch (error) {
      toast.add({
        title: '加载线路详情失败',
        description: error instanceof Error ? error.message : '请稍后再试',
        color: 'error',
      })
    } finally {
      routeDetailLoading.value = false
    }
    return
  }

  if (recommendation.type === 'station') {
    stationDetailLoading.value = true
    try {
      stationDetail.value = await transportationStore.fetchStationDetail({
        id: target.id,
        serverId: target.server.id,
        dimension: target.dimension ?? undefined,
        railwayType: target.railwayType,
      })
    } catch (error) {
      toast.add({
        title: '加载车站详情失败',
        description: error instanceof Error ? error.message : '请稍后再试',
        color: 'error',
      })
    } finally {
      stationDetailLoading.value = false
    }

    if (stationDetail.value) {
      await fetchStationRouteMap({
        id: target.id,
        serverId: target.server.id,
        railwayType: target.railwayType,
        dimension: target.dimension ?? null,
      })
    }
    return
  }

  depotDetailLoading.value = true
  try {
    depotDetail.value = await transportationStore.fetchDepotDetail({
      id: target.id,
      serverId: target.server.id,
      dimension: target.dimension ?? undefined,
      railwayType: target.railwayType,
    })
  } catch (error) {
    toast.add({
      title: '加载车厂详情失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    depotDetailLoading.value = false
  }
}

async function runSearch() {
  const keyword = searchTerm.value.trim()
  if (!keyword) {
    searchResults.value = []
    return
  }

  searchLoading.value = true
  try {
    if (activeFeaturedTab.value === 'route') {
      const result = await transportationStore.fetchRouteList({
        search: keyword,
        page: 1,
        pageSize: 8,
      })
      searchResults.value = result.items
    } else if (activeFeaturedTab.value === 'station') {
      const result = await transportationStore.fetchStationList({
        search: keyword,
        page: 1,
        pageSize: 8,
      })
      searchResults.value = result.items
    } else {
      const result = await transportationStore.fetchDepotList({
        search: keyword,
        page: 1,
        pageSize: 8,
      })
      searchResults.value = result.items
    }
  } catch (error) {
    toast.add({
      title: '搜索失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    searchLoading.value = false
  }
}

async function handleAddFeatured(item: RailwayRoute | RailwayEntity) {
  try {
    ensureToken()
    await transportationStore.createFeaturedItem({
      entityType: activeFeaturedTab.value,
      serverId: item.server.id,
      entityId: item.id,
      railwayType: item.railwayType,
    })
    toast.add({ title: '已置顶', color: 'success' })
  } catch (error) {
    toast.add({
      title: '置顶失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  }
}

const removeFeaturedConfirmOpen = ref(false)
const removeFeaturedTargetId = ref<string | null>(null)

async function handleRemoveFeatured(id: string) {
  removeFeaturedTargetId.value = id
  removeFeaturedConfirmOpen.value = true
}

async function confirmRemoveFeatured() {
  if (!removeFeaturedTargetId.value) return
  try {
    await transportationStore.deleteFeaturedItem(removeFeaturedTargetId.value)
    toast.add({ title: '已移除', color: 'warning' })
  } catch (error) {
    toast.add({
      title: '移除失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    removeFeaturedConfirmOpen.value = false
    removeFeaturedTargetId.value = null
  }
}

watch(
  () => recommendations.value,
  () => {
    recommendationPage.value = 1
    selectedRecommendationId.value = recommendations.value[0]?.id ?? null
  },
)

watch(
  () => recentUpdates.value,
  () => {
    recentUpdatePage.value = 1
  },
)

watch(
  () => recommendationPage.value,
  async () => {
    recommendationLoading.value = true
    selectedRecommendationId.value = pagedRecommendations.value[0]?.id ?? null

    const el = recommendationContentRef.value
    if (el) {
      const prevHeight = lastRecommendationHeight || el.offsetHeight
      el.style.height = 'auto'
      el.style.overflow = 'hidden'

      await nextTick()
      const nextHeight = el.offsetHeight

      el.style.height = `${prevHeight}px`
      void el.getBoundingClientRect()
      el.style.transition = 'height 200ms ease'
      el.style.height = `${nextHeight}px`

      window.setTimeout(() => {
        el.style.height = ''
        el.style.overflow = ''
      }, 220)

      lastRecommendationHeight = nextHeight
    }

    window.setTimeout(() => {
      recommendationLoading.value = false
    }, 200)
  },
  { flush: 'post' },
)

watch(
  () => recentUpdatePage.value,
  async () => {
    recentUpdateLoading.value = true

    const el = recentUpdateContentRef.value
    if (el) {
      const prevHeight = lastRecentUpdateHeight || el.offsetHeight
      el.style.height = 'auto'
      el.style.overflow = 'hidden'

      await nextTick()
      const nextHeight = el.offsetHeight

      el.style.height = `${prevHeight}px`
      void el.getBoundingClientRect()
      el.style.transition = 'height 200ms ease'
      el.style.height = `${nextHeight}px`

      window.setTimeout(() => {
        el.style.height = ''
        el.style.overflow = ''
      }, 220)

      lastRecentUpdateHeight = nextHeight
    }

    window.setTimeout(() => {
      recentUpdateLoading.value = false
    }, 200)
  },
  { flush: 'post' },
)

watch(
  () => activeRecommendation.value,
  (item) => {
    void refreshRecommendationDetail(item)
  },
)

watch(
  () => settingsModalOpen.value,
  (open) => {
    if (open) {
      void transportationStore.fetchAdminFeaturedItems()
      searchResults.value = []
      searchTerm.value = ''
    } else {
      transportationStore.clearFeaturedCache()
    }
  },
)

watch(
  () => activeFeaturedTab.value,
  () => {
    searchResults.value = []
    searchTerm.value = ''
  },
)

onMounted(async () => {
  await transportationStore.fetchOverview(true)
})

onBeforeUnmount(() => {
  stopStationRouteMapPolling()
})
</script>

<template>
  <div class="space-y-8">
    <UButton
      v-if="canManageFeatured"
      color="neutral"
      class="m-1.5 absolute right-4 top-6 md:top-10 hover:opacity-70 transition duration-200 cursor-pointer"
      variant="ghost"
      size="sm"
      @click="settingsModalOpen = true"
    >
      <UIcon name="i-lucide-settings" class="w-4.5 h-4.5" />
    </UButton>

    <section class="space-y-4">
      <section
        class="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-slate-950 shadow-lg dark:border-slate-800/60 dark:bg-slate-50"
      >
        <div
          class="relative flex flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:justify-between md:px-10 h-64"
        >
          <div class="max-w-2xl relative z-1 h-full flex flex-col">
            <p
              class="text-sm font-semibold uppercase tracking-widest text-white/70 dark:text-slate-950/70"
            >
              HYDROLINE 铁路系统
            </p>
            <h2
              class="mt-4 text-4xl font-semibold leading-tight text-white dark:text-slate-950"
            >
              铁路网络总览
            </h2>
            <p
              class="mt-auto text-base font-medium text-white dark:text-slate-950"
            >
              实时拉取各服务端的 MTR
              和机械动力铁路数据，展示最新上线的线路、车站与车厂。
            </p>
          </div>

          <div
            class="absolute inset-0 z-0 h-full w-full overflow-hidden pointer-events-none mask-[linear-gradient(to_bottom,#fff_50%,transparent_125%)] dark:mask-[linear-gradient(to_bottom,#fff_35%,transparent_125%)]"
          >
            <img
              :src="railwayHeroImage"
              alt="railway"
              class="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      <UAlert
        color="neutral"
        variant="subtle"
        title="机械动力铁路数据暂未接入"
        description="机械动力铁路数据的接入相比 MTR 更加复杂，目前仍在开发中，预计最迟将于 2026 年 1 月底至春节前上线。"
        icon="i-lucide-info"
      />

      <section class="grid grid-cols-1 sm:grid-cols-4 md:grid-cols-5 gap-4">
        <RouterLink :to="{ name: 'transportation.railway.routes' }">
          <div
            class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 shadow-[0_4px_16px_var(--color-neutral-50)] dark:shadow-[0_4px_16px_var(--color-neutral-900)] hover:bg-slate-50/60 dark:hover:bg-slate-800/60 cursor-pointer transition duration-250"
          >
            <div class="text-xs text-slate-500 dark:text-slate-500">
              全服线路数
            </div>
            <div
              class="text-2xl font-semibold text-slate-800 dark:text-slate-300"
            >
              {{ stats.routes }}
            </div>
          </div>
        </RouterLink>

        <RouterLink :to="{ name: 'transportation.railway.stations' }">
          <div
            class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 shadow-[0_4px_16px_var(--color-neutral-50)] dark:shadow-[0_4px_16px_var(--color-neutral-900)] hover:bg-slate-50/60 dark:hover:bg-slate-800/60 cursor-pointer transition duration-250"
          >
            <div class="text-xs text-slate-500 dark:text-slate-500">
              全服车站数
            </div>
            <div
              class="text-2xl font-semibold text-slate-800 dark:text-slate-300"
            >
              {{ stats.stations }}
            </div>
          </div>
        </RouterLink>

        <RouterLink :to="{ name: 'transportation.railway.depots' }">
          <div
            class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 shadow-[0_4px_16px_var(--color-neutral-50)] dark:shadow-[0_4px_16px_var(--color-neutral-900)] hover:bg-slate-50/60 dark:hover:bg-slate-800/60 cursor-pointer transition duration-250"
          >
            <div class="text-xs text-slate-500 dark:text-slate-500">
              全服车厂数
            </div>
            <div
              class="text-2xl font-semibold text-slate-800 dark:text-slate-300"
            >
              {{ stats.depots }}
            </div>
          </div>
        </RouterLink>

        <RouterLink :to="{ name: 'transportation.railway.depots' }">
          <div
            class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 shadow-[0_4px_16px_var(--color-neutral-50)] dark:shadow-[0_4px_16px_var(--color-neutral-900)] hover:bg-slate-50/60 dark:hover:bg-slate-800/60 cursor-pointer transition duration-250"
          >
            <div class="text-xs text-slate-500 dark:text-slate-500">
              全服铁路系统数
            </div>
            <div
              class="text-2xl font-semibold text-slate-800 dark:text-slate-300"
            >
              0
            </div>
          </div>
        </RouterLink>

        <RouterLink :to="{ name: 'transportation.railway.depots' }">
          <div
            class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 shadow-[0_4px_16px_var(--color-neutral-50)] dark:shadow-[0_4px_16px_var(--color-neutral-900)] hover:bg-slate-50/60 dark:hover:bg-slate-800/60 cursor-pointer transition duration-250"
          >
            <div class="text-xs text-slate-500 dark:text-slate-500">
              全服铁路运营单位数
            </div>
            <div
              class="text-2xl font-semibold text-slate-800 dark:text-slate-300"
            >
              0
            </div>
          </div>
        </RouterLink>
      </section>
    </section>

    <UAlert
      v-if="warnings.length"
      color="warning"
      variant="soft"
      title="部分服务端数据拉取失败"
      :description="
        warnings.map((warn) => `#${warn.serverId}: ${warn.message}`).join('\n')
      "
    />

    <section>
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">
            设施推荐
          </h3>
        </div>
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="recommendationPage <= 1"
            @click="recommendationPage = Math.max(1, recommendationPage - 1)"
          >
            上一页
          </UButton>
          <span>{{ recommendationPage }} / {{ recommendationPageCount }}</span>
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="recommendationPage >= recommendationPageCount"
            @click="
              recommendationPage = Math.min(
                recommendationPageCount,
                recommendationPage + 1,
              )
            "
          >
            下一页
          </UButton>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="h-full">
          <div class="h-full min-h-108">
            <div
              v-if="overviewLoading"
              class="flex h-[360px] items-center justify-center"
            >
              <UIcon
                name="i-lucide-loader-2"
                class="h-8 w-8 animate-spin text-slate-400"
              />
            </div>
            <template v-else>
              <RailwayMapPanel
                class="w-full h-full rounded-xl!"
                v-if="activeRecommendationType === 'route'"
                :geometry="routeDetail?.geometry ?? null"
                :stops="routeDetail?.stops ?? []"
                :color="routeDetail?.route.color ?? null"
                height="100%"
                :loading="routeDetailLoading || !routeDetail"
                :combine-paths="true"
              />
              <RailwayStationRoutesMapPanel
                class="w-full h-full rounded-xl!"
                v-else-if="activeRecommendationType === 'station'"
                :bounds="stationDetail?.station.bounds ?? null"
                :platforms="stationDetail?.platforms ?? []"
                :station-fill-color="
                  stationDetail?.station.color ??
                  stationDetail?.routes[0]?.color ??
                  null
                "
                :route-map="stationRouteMap"
                height="100%"
                :loading="stationDetailLoading || !stationDetail"
                :map-loading="stationRouteMapLoading"
              />
              <RailwayDepotMapPanel
                class="w-full h-full rounded-xl!"
                v-else-if="activeRecommendationType === 'depot'"
                :bounds="depotDetail?.depot.bounds ?? null"
                :color="depotDetail?.depot.color ?? null"
                height="100%"
                :loading="depotDetailLoading || !depotDetail"
              />
              <div
                v-else
                class="flex h-[360px] items-center justify-center text-sm text-slate-500"
              >
                暂无预览
              </div>
            </template>
          </div>
        </div>

        <div class="space-y-4">
          <p v-if="overviewLoading" class="text-sm text-slate-500 text-center">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </p>
          <p
            v-else-if="recommendations.length === 0"
            class="text-sm text-slate-500 text-center"
          >
            暂无设施推荐
          </p>
          <div ref="recommendationContentRef" class="relative space-y-4">
            <label
              v-for="item in pagedRecommendations"
              :key="item.id"
              class="block"
            >
              <div
                class="text-xs text-primary flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 duration-250 outline-2 outline-transparent hover:outline-primary md:flex-row md:items-center md:justify-between md:gap-6 cursor-pointer p-4 transition"
                @click="selectRecommendation(item.id)"
              >
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p
                      class="text-lg font-semibold text-slate-900 dark:text-white"
                    >
                      {{
                        item.item.name?.split('||')[0].split('|')[0] ||
                        '未命名设施'
                      }}
                    </p>
                    <UBadge variant="soft" size="sm">
                      {{ featuredTypeLabels[item.type] }}
                    </UBadge>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ item.item.server.name }} ·
                    {{ getDimensionName(item.item.dimension) || '未知维度' }}
                  </p>
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  :to="buildDetailLink(item)"
                  @click.stop
                >
                  查看
                </UButton>
              </div>
            </label>

            <Transition
              enter-active-class="transition-opacity duration-200"
              enter-from-class="opacity-0"
              enter-to-class="opacity-100"
              leave-active-class="transition-opacity duration-200"
              leave-from-class="opacity-100"
              leave-to-class="opacity-0"
            >
              <div
                v-if="recommendationLoading"
                class="absolute inset-0 rounded-xl bg-white/60 dark:bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center z-10"
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

    <section>
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">
            最近更新
          </h3>
        </div>
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="recentUpdatePage <= 1"
            @click="recentUpdatePage = Math.max(1, recentUpdatePage - 1)"
          >
            上一页
          </UButton>
          <span>{{ recentUpdatePage }} / {{ recentUpdatePageCount }}</span>
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="recentUpdatePage >= recentUpdatePageCount"
            @click="
              recentUpdatePage = Math.min(
                recentUpdatePageCount,
                recentUpdatePage + 1,
              )
            "
          >
            下一页
          </UButton>
        </div>
      </div>

      <div class="relative">
        <div
          ref="recentUpdateContentRef"
          class="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          style="grid-auto-rows: 1fr"
        >
          <div
            v-if="overviewLoading"
            class="col-span-full flex h-60 items-center justify-center text-sm text-slate-500"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-5 w-5 animate-spin text-slate-400"
            />
          </div>
          <div
            v-else-if="recentUpdates.length === 0"
            class="col-span-full flex h-60 items-center justify-center text-sm text-slate-500"
          >
            暂无最近更新
          </div>
          <template v-else>
            <label
              v-for="item in pagedRecentUpdates"
              :key="item.id"
              class="block"
            >
              <RouterLink
                class="block w-full h-full"
                :to="buildRecentDetailLink(item)"
              >
                <div
                  class="text-xs text-primary flex h-full rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 duration-250 outline-2 outline-transparent hover:outline-primary cursor-pointer p-4 transition"
                >
                  <div class="flex flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-x-2">
                      <p
                        class="text-lg font-semibold text-slate-900 dark:text-white"
                      >
                        {{
                          item.item.name?.split('||')[0].split('|')[0] ||
                          '未命名设施'
                        }}
                      </p>
                      <UBadge variant="soft" size="sm">
                        {{ featuredTypeLabels[item.type] }}
                      </UBadge>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      {{ item.item.server.name }} ·
                      {{ getDimensionName(item.item.dimension) || '未知维度' }}
                    </p>
                    <p
                      class="mt-auto text-xs text-slate-500 dark:text-slate-400"
                    >
                      {{ formatLastUpdated(item.lastUpdated) }}
                    </p>
                  </div>
                </div>
              </RouterLink>
            </label>
          </template>
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
            v-if="recentUpdateLoading"
            class="absolute inset-0 rounded-xl bg-white/60 dark:bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center z-10"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="h-5 w-5 animate-spin text-slate-400"
            />
          </div>
        </Transition>
      </div>
    </section>

    <UModal
      :open="settingsModalOpen"
      @update:open="(value: boolean) => (settingsModalOpen = value)"
      :ui="{ width: 'w-full max-w-4xl' }"
    >
      <template #title>设施推荐设置</template>
      <template #body>
        <div class="space-y-5">
          <div
            class="rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900 dark:text-white">
                已置顶内容
              </h4>
            </div>
            <div class="mt-3 space-y-3">
              <p v-if="adminFeaturedLoading" class="text-sm text-slate-500">
                <UIcon
                  name="i-lucide-loader-2"
                  class="inline-block h-5 w-5 animate-spin text-slate-400"
                />
              </p>
              <p
                v-else-if="adminFeatured.length === 0"
                class="text-sm text-slate-500"
              >
                暂无置顶内容，请先添加。
              </p>
              <div
                v-for="item in adminFeatured"
                :key="item.id"
                class="rounded-xl border border-slate-100/80 p-3 text-sm dark:border-slate-800"
                draggable="true"
                @dragstart="handleDragStart(item.id)"
                @dragover.prevent
                @dragenter.prevent
                @drop="handleDrop(item.id)"
                @dragend="handleDragEnd"
                :class="{
                  'border-primary': draggingFeaturedId === item.id,
                  'opacity-80':
                    reorderLoading && draggingFeaturedId !== item.id,
                  'cursor-grab': !reorderLoading,
                  'cursor-not-allowed': reorderLoading,
                }"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <p class="font-medium text-slate-900 dark:text-white">
                      {{
                        item.item.name?.split('||')[0].split('|')[0] ||
                        '未命名设施'
                      }}
                      <span class="ml-2 text-xs text-slate-500">
                        {{ featuredTypeLabels[item.type] }}
                      </span>
                    </p>
                    <p class="text-xs text-slate-500">
                      {{ item.item.server.name }} ·
                      {{ getDimensionName(item.item.dimension) || '未知维度' }}
                    </p>
                  </div>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :loading="featuredSubmitting || reorderLoading"
                    :disabled="reorderLoading"
                    @click="handleRemoveFeatured(item.id)"
                  >
                    移除
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <div
            class="rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900 dark:text-white">
                搜索并置顶
              </h4>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <UButton
                size="xs"
                color="primary"
                :variant="activeFeaturedTab === 'route' ? 'solid' : 'soft'"
                @click="activeFeaturedTab = 'route'"
              >
                线路
              </UButton>
              <UButton
                size="xs"
                color="primary"
                :variant="activeFeaturedTab === 'station' ? 'solid' : 'soft'"
                @click="activeFeaturedTab = 'station'"
              >
                车站
              </UButton>
              <UButton
                size="xs"
                color="primary"
                :variant="activeFeaturedTab === 'depot' ? 'solid' : 'soft'"
                @click="activeFeaturedTab = 'depot'"
              >
                车厂
              </UButton>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <UInput
                v-model="searchTerm"
                placeholder="输入关键字搜索"
                class="flex-1 min-w-[200px]"
                @keyup.enter="runSearch"
              />
              <UButton size="sm" color="primary" @click="runSearch">
                搜索
              </UButton>
            </div>
            <div class="mt-3 space-y-3">
              <p v-if="searchLoading" class="text-sm text-slate-500">
                <UIcon
                  name="i-lucide-loader-2"
                  class="inline-block h-5 w-5 animate-spin text-slate-400"
                />
              </p>
              <p
                v-else-if="searchResults.length === 0"
                class="text-sm text-slate-500"
              >
                {{ searchTerm ? '没有找到匹配内容。' : '输入关键字开始搜索。' }}
              </p>
              <div
                v-for="item in searchResults"
                :key="item.id"
                class="rounded-xl border border-slate-100/80 p-3 text-sm dark:border-slate-800"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <p class="font-medium text-slate-900 dark:text-white">
                      {{
                        item.name?.split('||')[0].split('|')[0] || '未命名设施'
                      }}
                    </p>
                    <p class="text-xs text-slate-500">
                      {{ item.server.name }} ·
                      {{ getDimensionName(item.dimension) || '未知维度' }} ·
                      {{ item.transportMode || '—' }}
                    </p>
                  </div>
                  <UButton
                    size="xs"
                    color="primary"
                    variant="soft"
                    @click="handleAddFeatured(item)"
                  >
                    置顶
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="removeFeaturedConfirmOpen"
      :ui="{ content: 'w-full max-w-md w-[calc(100vw-2rem)]' }"
    >
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <header class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              移除置顶
            </h3>
          </header>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            确定要移除该置顶内容吗？
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="removeFeaturedConfirmOpen = false"
            >
              取消
            </UButton>
            <UButton color="error" @click="confirmRemoveFeatured">
              确认移除
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
