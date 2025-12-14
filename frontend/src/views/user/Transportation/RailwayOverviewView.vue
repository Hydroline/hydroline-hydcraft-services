<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createHydcraftDynmapMap, DynmapMapController } from '@/utils/map'
import { useTransportationRailwayStore } from '@/stores/transportationRailway'
import { useAuthStore } from '@/stores/auth'
import type {
  RailwayBanner,
  RailwayEntity,
  RailwayRoute,
  RailwayRouteDetail,
} from '@/types/transportation'

dayjs.extend(relativeTime)

const transportationStore = useTransportationRailwayStore()
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const overview = computed(() => transportationStore.overview)
const banners = computed(() => overview.value?.banners ?? [])
const stats = computed(
  () =>
    overview.value?.stats ?? {
      serverCount: 0,
      routes: 0,
      stations: 0,
      depots: 0,
    },
)
const latest = computed(
  () =>
    overview.value?.latest ?? {
      depots: [],
      stations: [],
      routes: [],
    },
)
const recommendations = computed(() => overview.value?.recommendations ?? [])
const warnings = computed(() => overview.value?.warnings ?? [])

const overviewLoading = computed(() => transportationStore.overviewLoading)

const activeBannerIndex = ref(0)
const bannerCycleTimer = ref<number | null>(null)
const activeBanner = computed<RailwayBanner | null>(
  () => banners.value[activeBannerIndex.value] ?? null,
)

const canManageBanners = computed(() =>
  authStore.permissionKeys.includes('transportation.railway.manage-banners'),
)

const settingsModalOpen = ref(false)
const editingBannerId = ref<string | null>(null)
const bannerForm = reactive({
  attachmentId: '',
  title: '',
  subtitle: '',
  description: '',
  ctaLabel: '',
  ctaLink: '',
  isPublished: true,
  displayOrder: 0,
})

const adminBanners = computed(() => transportationStore.adminBanners)
const adminBannersLoading = computed(
  () => transportationStore.adminBannersLoading,
)
const bannerSubmitting = computed(() => transportationStore.bannerSubmitting)

const selectedRecommendationIndex = ref(0)
const activeRecommendation = computed<RailwayRoute | null>(
  () => recommendations.value[selectedRecommendationIndex.value] ?? null,
)
const recommendationDetail = ref<RailwayRouteDetail | null>(null)

const mapContainerRef = ref<HTMLElement | null>(null)
const dynmapController = ref<DynmapMapController | null>(null)
const activePolyline = ref<L.Polyline | null>(null)
const mapReady = ref(false)

function resetBannerForm(banner?: RailwayBanner | null) {
  bannerForm.attachmentId = banner?.attachmentId ?? ''
  bannerForm.title = banner?.title ?? ''
  bannerForm.subtitle = banner?.subtitle ?? ''
  bannerForm.description = banner?.description ?? ''
  bannerForm.ctaLabel = banner?.ctaLabel ?? ''
  bannerForm.ctaLink = banner?.ctaLink ?? ''
  bannerForm.isPublished = banner?.isPublished ?? true
  bannerForm.displayOrder = banner?.displayOrder ?? 0
}

function openCreateBanner() {
  editingBannerId.value = null
  resetBannerForm(null)
}

function openEditBanner(banner: RailwayBanner) {
  editingBannerId.value = banner.id
  resetBannerForm(banner)
}

function colorToHex(color: number | null) {
  if (color == null || Number.isNaN(color)) return '#0f172a'
  const normalized = color >>> 0
  return `#${normalized.toString(16).padStart(6, '0')}`
}

function formatLastUpdated(timestamp: number | null) {
  if (!timestamp) return '未知'
  const date = dayjs(timestamp)
  if (!date.isValid()) return '未知'
  return `${date.format('YYYY-MM-DD HH:mm')} · ${date.fromNow()}`
}

function stopBannerCycle() {
  if (bannerCycleTimer.value) {
    window.clearInterval(bannerCycleTimer.value)
    bannerCycleTimer.value = null
  }
}

function startBannerCycle() {
  stopBannerCycle()
  if (banners.value.length <= 1) return
  bannerCycleTimer.value = window.setInterval(() => {
    activeBannerIndex.value =
      (activeBannerIndex.value + 1) % banners.value.length
  }, 8000)
}

function selectBanner(index: number) {
  activeBannerIndex.value = index
  stopBannerCycle()
  startBannerCycle()
}

function selectRecommendation(index: number) {
  selectedRecommendationIndex.value = index
}

function buildRouteDetailLink(item: RailwayRoute) {
  return {
    name: 'transportation.railway.route',
    params: { routeId: item.id },
    query: {
      serverId: item.server.id,
      dimension: item.dimension ?? undefined,
    },
  }
}

async function refreshRecommendationDetail(routeItem: RailwayRoute | null) {
  if (!routeItem) {
    recommendationDetail.value = null
    return
  }
  try {
    const detail = await transportationStore.fetchRouteDetail({
      routeId: routeItem.id,
      serverId: routeItem.server.id,
      dimension: routeItem.dimension ?? undefined,
    })
    recommendationDetail.value = detail
    drawRouteGeometry(detail)
  } catch (error) {
    console.error(error)
    toast.add({
      title: '加载线路详情失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  }
}

function teardownMap() {
  activePolyline.value?.remove()
  activePolyline.value = null
  dynmapController.value?.destroy()
  dynmapController.value = null
  mapReady.value = false
}

async function initMap() {
  if (!mapContainerRef.value || dynmapController.value) return
  try {
    const controller = createHydcraftDynmapMap()
    controller.mount({
      container: mapContainerRef.value,
      zoom: 2,
      showZoomControl: true,
    })
    dynmapController.value = controller
    mapReady.value = true
    if (recommendationDetail.value) {
      drawRouteGeometry(recommendationDetail.value)
    }
  } catch (error) {
    mapReady.value = false
    console.error(error)
  }
}

function drawRouteGeometry(detail: RailwayRouteDetail | null) {
  if (!detail || !dynmapController.value) return
  activePolyline.value?.remove()
  const points = detail.geometry.points
  if (!points.length) return
  const latlngs = points
    .map((point) =>
      dynmapController.value?.toLatLng({ x: point.x, z: point.z }),
    )
    .filter((point): point is L.LatLngExpression => Boolean(point))
  if (!latlngs.length) return
  const polyline = L.polyline(latlngs, {
    color: colorToHex(detail.route.color ?? null),
    weight: 4,
    opacity: 0.85,
  }).addTo(dynmapController.value.getLeafletInstance()!)
  activePolyline.value = polyline
  dynmapController.value.flyToBlock(points[0], 4)
}

async function handleSubmitBanner() {
  if (!bannerForm.attachmentId.trim()) {
    toast.add({ title: '请填写附件 ID', color: 'warning' })
    return
  }
  try {
    if (editingBannerId.value) {
      await transportationStore.updateBanner(editingBannerId.value, {
        ...bannerForm,
      })
      toast.add({ title: 'Banner 已更新', color: 'success' })
    } else {
      await transportationStore.createBanner({
        ...bannerForm,
      })
      toast.add({ title: 'Banner 已创建', color: 'success' })
    }
    resetBannerForm(null)
    editingBannerId.value = null
    await transportationStore.fetchAdminBanners()
  } catch (error) {
    console.error(error)
    toast.add({
      title: '保存失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
    })
  }
}

async function handleDeleteBanner(bannerId: string) {
  if (!window.confirm('确定要删除该 Banner 吗？')) return
  try {
    await transportationStore.deleteBanner(bannerId)
    toast.add({ title: 'Banner 已删除', color: 'warning' })
    await transportationStore.fetchAdminBanners()
  } catch (error) {
    console.error(error)
    toast.add({
      title: '删除失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
    })
  }
}

watch(
  () => banners.value.length,
  () => {
    activeBannerIndex.value = 0
    startBannerCycle()
  },
)

watch(
  () => selectedRecommendationIndex.value,
  () => {
    void refreshRecommendationDetail(activeRecommendation.value)
  },
)

watch(
  () => recommendations.value,
  (items) => {
    selectedRecommendationIndex.value = 0
    if (items.length) {
      void refreshRecommendationDetail(items[0])
    } else {
      recommendationDetail.value = null
      activePolyline.value?.remove()
      activePolyline.value = null
    }
  },
)

watch(
  () => settingsModalOpen.value,
  (open) => {
    if (open) {
      void transportationStore.fetchAdminBanners()
      openCreateBanner()
    } else {
      transportationStore.clearBannerCache()
    }
  },
)

onMounted(async () => {
  await transportationStore.fetchOverview()
  startBannerCycle()
  await initMap()
  if (activeRecommendation.value) {
    void refreshRecommendationDetail(activeRecommendation.value)
  }
})

onBeforeUnmount(() => {
  stopBannerCycle()
  teardownMap()
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <section
      class="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-slate-950/90 shadow-lg dark:border-slate-800/60"
    >
      <div class="relative h-[320px] w-full">
        <Transition name="fade" mode="out-in">
          <div
            v-if="activeBanner"
            :key="activeBanner.id"
            class="absolute inset-0"
          >
            <img
              v-if="activeBanner.imageUrl"
              :src="activeBanner.imageUrl"
              alt="banner"
              class="h-full w-full object-cover opacity-70"
            />
            <div
              class="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/70 to-transparent"
            ></div>
          </div>
          <div v-else class="absolute inset-0 bg-slate-900"></div>
        </Transition>
        <div
          class="relative z-10 flex h-full flex-col justify-between px-6 py-6 md:px-10"
        >
          <div>
            <p class="text-xs uppercase text-slate-200">
              {{ activeBanner?.subtitle || 'Beacon Railway Snapshot' }}
            </p>
            <h2 class="mt-2 text-3xl font-semibold text-white">
              {{ activeBanner?.title || '铁路网络总览' }}
            </h2>
            <p class="mt-3 max-w-2xl text-sm text-slate-200">
              {{
                activeBanner?.description ||
                '实时拉取各服务器的 Beacon MTR 数据，展示最新上线的线路、车站与车厂。'
              }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <UButton
                v-if="activeBanner?.ctaLink"
                color="primary"
                size="sm"
                :to="activeBanner.ctaLink"
                target="_blank"
              >
                {{ activeBanner.ctaLabel || '了解更多' }}
              </UButton>
              <UButton
                v-if="canManageBanners"
                color="neutral"
                variant="soft"
                size="sm"
                icon="i-lucide-settings-2"
                @click="settingsModalOpen = true"
              >
                设置轮播
              </UButton>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-for="(banner, index) in banners"
              :key="banner.id"
              class="h-1 w-10 rounded-full transition"
              :class="index === activeBannerIndex ? 'bg-white' : 'bg-white/30'"
              @click="selectBanner(index)"
            ></button>
            <span v-if="banners.length === 0" class="text-xs text-slate-200"
              >暂无轮播配置</span
            >
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-4 md:grid-cols-4">
      <div
        v-for="card in [
          { label: '接入服务器', value: stats.serverCount },
          { label: '登记线路', value: stats.routes },
          { label: '有效车站', value: stats.stations },
          { label: '车厂/段', value: stats.depots },
        ]"
        :key="card.label"
        class="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900"
      >
        <p class="text-xs uppercase tracking-wide text-slate-500">
          {{ card.label }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
          {{ card.value }}
        </p>
      </div>
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

    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
          最新更新
        </h3>
        <p class="text-xs text-slate-500">
          基于各 Beacon 数据库的 last_updated 排序
        </p>
      </div>
      <div class="grid gap-4 lg:grid-cols-3">
        <div
          v-for="section in [
            { key: 'depots', label: '车厂/车段', items: latest.depots },
            { key: 'stations', label: '车站', items: latest.stations },
            { key: 'routes', label: '线路', items: latest.routes },
          ]"
          :key="section.key"
          class="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/80"
        >
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
              {{ section.label }}
            </p>
            <UBadge color="neutral" variant="soft" size="xs">
              {{ section.items.length }} 条
            </UBadge>
          </div>
          <div class="space-y-3">
            <p v-if="section.items.length === 0" class="text-sm text-slate-500">
              暂无更新记录
            </p>
            <div
              v-for="item in section.items"
              :key="item.id + item.server.id"
              class="rounded-xl border border-slate-100/80 p-3 text-sm transition hover:border-primary-200 hover:bg-primary-50/40 dark:border-slate-800/70 dark:hover:border-primary-400/40 dark:hover:bg-primary-500/10"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="font-medium text-slate-900 dark:text-white">
                  {{ item.name || '未命名' }}
                </p>
                <UBadge color="primary" variant="soft" size="xs">
                  {{ item.server.name }}
                </UBadge>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ item.dimension || '未知维度' }} ·
                {{ formatLastUpdated(item.lastUpdated) }}
              </p>
              <div class="mt-2 flex gap-2 text-xs text-slate-500">
                <span>模式：{{ item.transportMode || '—' }}</span>
                <span>ID：{{ item.id }}</span>
              </div>
              <template v-if="section.key === 'routes'">
                <RouterLink
                  class="mt-2 inline-flex text-xs text-primary hover:underline"
                  :to="buildRouteDetailLink(item as RailwayRoute)"
                >
                  查看线路详情 →
                </RouterLink>
              </template>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-6 lg:grid-cols-2">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            推荐线路
          </h3>
          <p class="text-xs text-slate-500">
            基于 Beacon last_updated 与活跃度随机推荐
          </p>
        </div>
        <div class="space-y-3">
          <p v-if="recommendations.length === 0" class="text-sm text-slate-500">
            暂无推荐线路，稍后再试。
          </p>
          <label
            v-for="(item, index) in recommendations"
            :key="item.id + item.server.id"
            class="flex cursor-pointer flex-col gap-2 rounded-2xl border border-slate-200/70 p-4 transition hover:border-primary-200 dark:border-slate-800/70 dark:hover:border-primary-400/50"
          >
            <div class="flex items-center justify-between gap-2">
              <div>
                <p
                  class="text-base font-semibold text-slate-900 dark:text-white"
                >
                  {{ item.name || '未命名线路' }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ item.server.name }} · {{ item.dimension || '未知维度' }}
                </p>
              </div>
              <label
                class="inline-flex items-center gap-2 text-xs text-slate-500"
              >
                <input
                  type="radio"
                  name="recommendation"
                  class="h-4 w-4"
                  :checked="index === selectedRecommendationIndex"
                  @change="selectRecommendation(index)"
                />
                查看
              </label>
            </div>
            <div class="flex flex-wrap gap-2 text-xs text-slate-500">
              <span>模式：{{ item.transportMode || '—' }}</span>
              <span>站点数：{{ item.platformCount ?? '—' }}</span>
              <span>更新时间：{{ formatLastUpdated(item.lastUpdated) }}</span>
            </div>
            <RouterLink
              class="text-xs text-primary hover:underline"
              :to="buildRouteDetailLink(item)"
            >
              打开线路详情 →
            </RouterLink>
          </label>
        </div>
      </div>
      <div
        class="rounded-2xl border border-slate-200/70 bg-white/90 p-0 shadow-sm dark:border-slate-800/70 dark:bg-slate-900"
      >
        <div class="flex items-center justify-between px-5 py-3">
          <div>
            <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
              Dynmap 路径预览
            </p>
            <p class="text-xs text-slate-500">
              仅展示推荐线路的路线骨架，点击上方可切换
            </p>
          </div>
          <UBadge v-if="!mapReady" color="warning" variant="soft" size="xs">
            地图初始化中
          </UBadge>
        </div>
        <div
          ref="mapContainerRef"
          class="h-[360px] w-full overflow-hidden rounded-b-2xl"
        ></div>
      </div>
    </section>

    <UModal
      :open="settingsModalOpen"
      @update:open="(value: boolean) => (settingsModalOpen = value)"
      :ui="{ width: 'w-full max-w-4xl' }"
    >
      <template #title>铁路轮播配置</template>
      <template #description>
        仅管理员可编辑，背景图需先在附件库上传并设置为公开访问。
      </template>
      <template #body>
        <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div class="space-y-4">
            <div
              class="rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div class="flex items-center justify-between">
                <h4
                  class="text-sm font-semibold text-slate-900 dark:text-white"
                >
                  Banner 列表
                </h4>
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  @click="openCreateBanner()"
                >
                  新增
                </UButton>
              </div>
              <div class="mt-3 space-y-3">
                <p v-if="adminBannersLoading" class="text-sm text-slate-500">
                  加载中…
                </p>
                <p
                  v-else-if="adminBanners.length === 0"
                  class="text-sm text-slate-500"
                >
                  暂无数据，请先创建。
                </p>
                <div
                  v-for="banner in adminBanners"
                  :key="banner.id"
                  class="rounded-xl border border-slate-100/80 p-3 text-sm dark:border-slate-800"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-medium text-slate-900 dark:text-white">
                        {{ banner.title || '未命名 Banner' }}
                      </p>
                      <p class="text-xs text-slate-500">
                        附件：{{ banner.attachmentId || '未配置' }}
                      </p>
                    </div>
                    <div class="flex gap-2">
                      <UButton
                        size="xs"
                        variant="soft"
                        @click="openEditBanner(banner)"
                      >
                        编辑
                      </UButton>
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        :loading="bannerSubmitting"
                        @click="handleDeleteBanner(banner.id)"
                      >
                        删除
                      </UButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            class="rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h4 class="text-sm font-semibold text-slate-900 dark:text-white">
              {{ editingBannerId ? '编辑' : '创建' }} Banner
            </h4>
            <div class="mt-3 space-y-3">
              <UFormGroup label="附件 ID" required>
                <UInput
                  v-model="bannerForm.attachmentId"
                  placeholder="示例：att_xxx"
                />
              </UFormGroup>
              <UFormGroup label="标题">
                <UInput v-model="bannerForm.title" />
              </UFormGroup>
              <UFormGroup label="副标题">
                <UInput v-model="bannerForm.subtitle" />
              </UFormGroup>
              <UFormGroup label="描述">
                <UTextarea v-model="bannerForm.description" rows="3" />
              </UFormGroup>
              <div class="grid gap-3 md:grid-cols-2">
                <UFormGroup label="按钮文本">
                  <UInput v-model="bannerForm.ctaLabel" />
                </UFormGroup>
                <UFormGroup label="跳转链接">
                  <UInput v-model="bannerForm.ctaLink" placeholder="https://" />
                </UFormGroup>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <UFormGroup label="排序值">
                  <UInput
                    v-model.number="bannerForm.displayOrder"
                    type="number"
                    min="0"
                  />
                </UFormGroup>
                <UFormGroup label="发布状态">
                  <UToggle v-model="bannerForm.isPublished" />
                </UFormGroup>
              </div>
              <div class="flex justify-end gap-2">
                <UButton
                  variant="ghost"
                  :disabled="bannerSubmitting"
                  @click="openCreateBanner()"
                >
                  重置
                </UButton>
                <UButton
                  color="primary"
                  :loading="bannerSubmitting"
                  @click="handleSubmitBanner"
                >
                  {{ editingBannerId ? '保存修改' : '创建 Banner' }}
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
