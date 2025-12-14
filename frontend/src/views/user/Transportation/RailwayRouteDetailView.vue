<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createHydcraftDynmapMap, DynmapMapController } from '@/utils/map'
import { useTransportationRailwayStore } from '@/stores/transportationRailway'
import type { RailwayRouteDetail } from '@/types/transportation'

dayjs.extend(relativeTime)

const route = useRoute()
const router = useRouter()
const toast = useToast()
const transportationStore = useTransportationRailwayStore()

const detail = ref<RailwayRouteDetail | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const mapContainerRef = ref<HTMLElement | null>(null)
const dynmapController = ref<DynmapMapController | null>(null)
const polyline = ref<L.Polyline | null>(null)

const params = computed(() => {
  const routeId = route.params.routeId as string | undefined
  const serverId = route.query.serverId as string | undefined
  const dimension = (route.query.dimension as string | undefined) ?? undefined
  return { routeId, serverId, dimension }
})

const metadataList = computed(() => {
  const payload = detail.value?.route.payload ?? {}
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
      value: formatTimestamp(detail.value?.metadata.lastDeployed),
    },
    {
      label: '数据更新',
      value: formatTimestamp(detail.value?.metadata.lastUpdated),
    },
  ]
})

const stations = computed(() => detail.value?.stations ?? [])
const platforms = computed(() => detail.value?.platforms ?? [])
const depots = computed(() => detail.value?.depots ?? [])

function formatTimestamp(value: number | null | undefined) {
  if (!value) return '—'
  const d = dayjs(value)
  if (!d.isValid()) return '—'
  return `${d.format('YYYY-MM-DD HH:mm')} (${d.fromNow()})`
}

function getStationName(stationId: string | null | undefined) {
  if (!stationId) return '未知'
  const station = stations.value.find((item) => item.id === stationId)
  return station?.name || `站点 ${stationId}`
}

function colorToHex(color: number | null | undefined) {
  if (color == null) return '#0ea5e9'
  return `#${(color >>> 0).toString(16).padStart(6, '0')}`
}

function teardownMap() {
  polyline.value?.remove()
  polyline.value = null
  dynmapController.value?.destroy()
  dynmapController.value = null
}

function drawGeometry() {
  if (!detail.value || !dynmapController.value) return
  polyline.value?.remove()
  const points = detail.value.geometry.points
  const latlngs = points
    .map((point) =>
      dynmapController.value?.toLatLng({ x: point.x, z: point.z }),
    )
    .filter((val): val is L.LatLngExpression => Boolean(val))
  if (!latlngs.length) return
  const map = dynmapController.value.getLeafletInstance()
  if (!map) return
  polyline.value = L.polyline(latlngs, {
    color: colorToHex(detail.value.route.color),
    weight: 4,
    opacity: 0.85,
  }).addTo(map)
  dynmapController.value.flyToBlock(points[0], 4)
}

async function initMap() {
  if (!mapContainerRef.value) return
  if (!dynmapController.value) {
    const controller = createHydcraftDynmapMap()
    controller.mount({
      container: mapContainerRef.value,
      zoom: 2,
      showZoomControl: true,
    })
    dynmapController.value = controller
  }
  drawGeometry()
}

async function fetchDetail() {
  const { routeId, serverId, dimension } = params.value
  if (!routeId || !serverId) {
    errorMessage.value = '缺少 routeId 或 serverId 参数'
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const result = await transportationStore.fetchRouteDetail(
      { routeId, serverId, dimension },
      true,
    )
    detail.value = result
    await initMap()
  } catch (error) {
    console.error(error)
    errorMessage.value =
      error instanceof Error ? error.message : '加载失败，请稍后再试'
    toast.add({ title: errorMessage.value, color: 'error' })
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

onBeforeUnmount(() => {
  teardownMap()
})
</script>

<template>
  <div class="space-y-6">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-arrow-left"
      @click="router.push({ name: 'transportation.railway' })"
    >
      返回概览
    </UButton>

    <UCard>
      <template #header>
        <div class="flex flex-col gap-1">
          <p class="text-xs uppercase text-slate-500">铁路线路详情</p>
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
            {{ detail?.route.name || '未命名线路' }}
          </h1>
          <p class="text-sm text-slate-500">
            服务器：{{ detail?.server.name || params.serverId }} ·
            {{ detail?.dimension || params.dimension || '未知维度' }}
          </p>
        </div>
      </template>
      <div v-if="loading" class="text-sm text-slate-500">加载中…</div>
      <div v-else-if="errorMessage" class="text-sm text-red-500">
        {{ errorMessage }}
      </div>
      <div v-else-if="detail" class="space-y-6">
        <section class="grid gap-4 lg:grid-cols-2">
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
              基本信息
            </h3>
            <div
              class="grid gap-3 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800"
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
                  <span>运输模式</span>
                  <span class="text-slate-900 dark:text-white">
                    {{ detail.route.transportMode || '—' }}
                  </span>
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
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
              数据状态
            </h3>
            <div
              class="grid gap-2 rounded-2xl border border-slate-200/70 p-4 text-sm dark:border-slate-800"
            >
              <div
                v-for="item in metadataList"
                :key="item.label"
                class="flex justify-between text-slate-600 dark:text-slate-300"
              >
                <span>{{ item.label }}</span>
                <span class="text-slate-900 dark:text-white">{{
                  item.value
                }}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
              Dynmap 路径
            </h3>
            <div
              class="mt-3 rounded-3xl border border-slate-200/70 p-2 dark:border-slate-800"
            >
              <div
                ref="mapContainerRef"
                class="h-[360px] w-full overflow-hidden rounded-2xl"
              ></div>
            </div>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
              所经站点
            </h3>
            <div class="mt-3 space-y-3">
              <p v-if="stations.length === 0" class="text-sm text-slate-500">
                暂无站点数据。
              </p>
              <div
                v-for="station in stations"
                :key="station.id"
                class="rounded-2xl border border-slate-200/70 p-3 text-sm dark:border-slate-800"
              >
                <p class="font-medium text-slate-900 dark:text-white">
                  {{ station.name || station.id }}
                </p>
                <p class="text-xs text-slate-500">
                  区域：{{ station.bounds.xMin }} ~ {{ station.bounds.xMax }},
                  {{ station.bounds.zMin }} ~ {{ station.bounds.zMax }}
                </p>
                <p class="text-xs text-slate-500">
                  区号：{{ station.zone ?? '—' }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
            平台 & 关联车厂
          </h3>
          <div class="grid gap-4 lg:grid-cols-2">
            <div
              class="rounded-2xl border border-slate-200/70 p-4 text-sm dark:border-slate-800"
            >
              <h4 class="mb-2 font-medium text-slate-700 dark:text-white">
                平台
              </h4>
              <table class="w-full text-left text-xs">
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
                    <td class="py-1">{{ platform.name || platform.id }}</td>
                    <td class="py-1">
                      {{ getStationName(platform.stationId) }}
                    </td>
                    <td class="py-1">{{ platform.dwellTime ?? '—' }} tick</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              class="rounded-2xl border border-slate-200/70 p-4 text-sm dark:border-slate-800"
            >
              <h4 class="mb-2 font-medium text-slate-700 dark:text-white">
                关联车厂/车段
              </h4>
              <div class="space-y-2">
                <p v-if="depots.length === 0" class="text-slate-500">
                  暂无关联数据。
                </p>
                <div
                  v-for="depot in depots"
                  :key="depot.id"
                  class="rounded-xl border border-slate-100 p-2 dark:border-slate-700"
                >
                  <p class="font-medium text-slate-900 dark:text-white">
                    {{ depot.name || depot.id }}
                  </p>
                  <p class="text-xs text-slate-500">
                    颜色：{{ depot.color || '—' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </UCard>
  </div>
</template>
