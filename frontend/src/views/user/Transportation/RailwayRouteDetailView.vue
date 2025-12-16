<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import RailwayMapPanel from '@/transportation/railway/components/RailwayMapPanel.vue'
import { useTransportationRailwayStore } from '@/transportation/railway/store'
import type { RailwayRouteDetail } from '@/types/transportation'
import { getDimensionName } from '@/utils/dimension-names'
import { parseRouteName } from '@/utils/route-name'

dayjs.extend(relativeTime)

const route = useRoute()
const router = useRouter()
const toast = useToast()
const transportationStore = useTransportationRailwayStore()

const detail = ref<RailwayRouteDetail | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const params = computed(() => {
  const routeId = route.params.routeId as string | undefined
  const serverId = route.query.serverId as string | undefined
  const dimension = (route.query.dimension as string | undefined) ?? undefined
  return { routeId, serverId, dimension }
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

function getStationName(stationId: string | null | undefined) {
  if (!stationId) return '未知'
  const station = stations.value.find((item) => item.id === stationId)
  return station?.name || `站点 ${stationId}`
}

function goDetailedMap() {
  router.push({
    name: 'transportation.railway.route.map',
    params: route.params,
    query: route.query,
  })
}

async function fetchDetail() {
  const { routeId, serverId, dimension } = params.value
  if (!routeId || !serverId) {
    errorMessage.value = '缺少 routeId 或 serverId 参数'
    detail.value = null
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
        <p class="text-sm uppercase text-slate-500 mb-2">铁路线路详情</p>

        <div>
          <div class="text-4xl font-semibold text-slate-900 dark:text-white">
            {{ routeName.title }}
          </div>
          <div
            class="flex items-center gap-1.5 text-lg font-semibold text-slate-600 dark:text-slate-300"
            v-if="routeName.subtitle"
          >
            {{ routeName.subtitle }}

            <UBadge variant="solid" size="sm" v-if="routeName.badge">
              {{ routeName.badge }}
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

    <div
      class="mt-3 relative rounded-3xl border border-slate-200/70 dark:border-slate-800"
    >
      <RailwayMapPanel
        :geometry="detail?.geometry ?? null"
        :stops="detail?.stops ?? []"
        :color="detail?.route.color ?? null"
        :loading="!detail"
        height="420px"
      />
      <div
        class="pointer-events-none absolute inset-x-4 top-4 flex justify-end z-999"
      >
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          class="pointer-events-auto backdrop-blur-2xl text-white bg-black/20 dark:bg-slate-900/10 hover:bg-white/20 dark:hover:bg-slate-900/20 shadow"
          icon="i-lucide-compass"
          @click="goDetailedMap"
        >
          查看地图
        </UButton>
      </div>
    </div>

    <div>
      <div v-if="loading" class="text-sm text-slate-500">加载中…</div>
      <div v-else-if="detail" class="space-y-6">
        <section class="flex flex-col">
          <h3 class="text-lg text-slate-600 dark:text-slate-300">所经站点</h3>
          <div class="mt-3 flex gap-3 overflow-x-auto">
            <p v-if="stations.length === 0" class="text-sm text-slate-500">
              暂无站点数据
            </p>

            <div
              v-for="station in stations"
              :key="station.id"
              class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
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
            <h3 class="text-lg text-slate-600 dark:text-slate-300">数据状态</h3>
            <div
              class="grid gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <div
                v-for="item in metadataList"
                :key="item.label"
                class="flex justify-between text-slate-600 dark:text-slate-300"
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
              class="rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <h4 class="mb-2 font-medium text-slate-700 dark:text-white">
                关联车厂/车段
              </h4>
              <div class="space-y-2">
                <p v-if="depots.length === 0">暂无关联数据。</p>

                <div v-for="depot in depots" :key="depot.id">
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
    </div>
  </div>
</template>
