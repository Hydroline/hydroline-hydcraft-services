<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RailwayStationMapPanel from '@/views/user/Transportation/railway/components/RailwayStationMapPanel.vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type { RailwayStationDetail } from '@/types/transportation'
import { getDimensionName } from '@/utils/minecraft/dimension-names'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const transportationStore = useTransportationRailwayStore()

const detail = ref<RailwayStationDetail | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

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

const associatedRoutes = computed(() => detail.value?.routes ?? [])
const platforms = computed(() => detail.value?.platforms ?? [])

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

function goBack() {
  router.push({ name: 'transportation.railway' })
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
    <div class="flex items-center gap-3">
      <UButton
        size="sm"
        variant="ghost"
        icon="i-lucide-arrow-left"
        @click="goBack"
      >
        返回概览
      </UButton>
      <h1 class="text-3xl font-semibold text-slate-900 dark:text-white">
        车站详情
      </h1>
    </div>

    <div
      class="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70"
    >
      <div class="flex flex-col gap-2">
        <p class="text-sm uppercase text-slate-500">车站信息</p>
        <div>
          <p class="text-3xl font-semibold text-slate-900 dark:text-white">
            {{ stationName }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <UBadge variant="soft">{{ serverBadge }}</UBadge>
            <UBadge variant="soft">{{ dimensionName || '未知维度' }}</UBadge>
          </div>
        </div>
      </div>
    </div>

    <RailwayStationMapPanel
      :bounds="detail?.station.bounds ?? null"
      :platforms="platforms"
      :color="detail?.station.color ?? detail?.routes[0]?.color ?? null"
      :loading="loading"
      height="460px"
    />

    <div v-if="loading" class="text-sm text-slate-500">加载中…</div>
    <div v-else-if="detail" class="space-y-6">
      <section class="grid gap-4 lg:grid-cols-2">
        <div
          class="rounded-xl border border-slate-200/70 bg-white/90 p-5 dark:border-slate-800/70 dark:bg-slate-900/70"
        >
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            基本信息
          </h3>
          <dl class="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <div class="flex justify-between gap-4">
              <dt>站点 ID</dt>
              <dd class="font-mono text-slate-900 dark:text-white">
                {{ detail.station.id }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>所属服务器</dt>
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
        <div
          class="rounded-xl border border-slate-200/70 bg-white/90 p-5 dark:border-slate-800/70 dark:bg-slate-900/70"
        >
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            服务线路
          </h3>
          <div class="mt-3 space-y-2">
            <p
              v-if="associatedRoutes.length === 0"
              class="text-sm text-slate-500"
            >
              暂无线路数据
            </p>
            <div
              v-for="route in associatedRoutes"
              :key="route.id"
              class="flex items-center justify-between rounded-xl border border-slate-100/70 px-3 py-2 text-sm transition hover:border-primary-200 dark:border-slate-800/60 dark:hover:border-primary-400/60"
            >
              <div>
                <p class="font-medium text-slate-900 dark:text-white">
                  {{ route.name || route.id }}
                </p>
                <p class="text-xs text-slate-500">
                  {{ route.server.name }} ·
                  {{ getDimensionName(route.dimension) || '未知维度' }}
                </p>
              </div>
              <UButton size="xs" variant="soft" @click="goRoute(route.id)">
                查看
              </UButton>
            </div>
          </div>
        </div>
      </section>

      <section
        class="rounded-xl border border-slate-200/70 bg-white/90 p-5 dark:border-slate-800/70 dark:bg-slate-900/70"
      >
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
          站台详情
        </h3>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="text-slate-500">
                <th class="py-2">站台</th>
                <th class="py-2">停靠线路</th>
                <th class="py-2">停留时间</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="platform in platforms"
                :key="platform.id"
                class="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200"
              >
                <td class="py-2 font-medium">
                  {{ platform.name || platform.id }}
                </td>
                <td class="py-2">
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="routeId in platform.routeIds"
                      :key="routeId"
                      size="xs"
                      variant="soft"
                    >
                      {{ routeId }}
                    </UBadge>
                  </div>
                </td>
                <td class="py-2">
                  {{ platform.dwellTime ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
