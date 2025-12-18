<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RailwayDepotMapPanel from '@/views/user/Transportation/railway/components/RailwayDepotMapPanel.vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type { RailwayDepotDetail } from '@/types/transportation'
import { getDimensionName } from '@/utils/minecraft/dimension-names'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const transportationStore = useTransportationRailwayStore()

const detail = ref<RailwayDepotDetail | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const params = computed(() => {
  return {
    depotId: route.params.depotId as string | undefined,
    railwayType: route.params.railwayType as string | undefined,
    serverId: route.query.serverId as string | undefined,
    dimension: (route.query.dimension as string | undefined) ?? undefined,
  }
})

const depotName = computed(
  () => detail.value?.depot.name ?? detail.value?.depot.id ?? '未知车厂',
)
const serverBadge = computed(
  () => detail.value?.server.name ?? params.value.serverId ?? '—',
)
const dimensionName = computed(() =>
  getDimensionName(detail.value?.depot.dimension || params.value.dimension),
)

const associatedRoutes = computed(() => detail.value?.routes ?? [])

async function fetchDetail() {
  const { depotId, railwayType, serverId, dimension } = params.value
  if (!depotId || !railwayType || !serverId) {
    errorMessage.value = '缺少 depotId、serverId 或铁路类型参数'
    detail.value = null
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const result = await transportationStore.fetchDepotDetail(
      {
        id: depotId,
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
      dimension: detail.value.depot.dimension,
    },
  })
}

const frequencyLabel = computed(() => {
  const frequencies = detail.value?.depot.frequencies ?? []
  if (!frequencies?.length) return '—'
  const total = frequencies.reduce((sum, current) => sum + current, 0)
  return `${frequencies.length} 段 · 总计 ${total}`
})

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
      @click="goBack"
    >
      返回概览
    </UButton>

    <div>
      <div class="flex flex-col gap-2">
        <p class="text-sm uppercase text-slate-500">铁路车厂信息</p>
        <div>
          <p class="text-3xl font-semibold text-slate-900 dark:text-white">
            {{ depotName }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <UBadge variant="soft" size="sm">{{ serverBadge }}</UBadge>
            <UBadge variant="soft" size="sm">{{
              dimensionName || '未知维度'
            }}</UBadge>
          </div>
        </div>
      </div>
    </div>

    <RailwayDepotMapPanel
      :bounds="detail?.depot.bounds ?? null"
      :color="detail?.depot.color ?? detail?.routes[0]?.color ?? null"
      :loading="loading"
      height="460px"
    />

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
          <dl
            class="mt-4 space-y-2 text-sm rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
          >
            <div class="flex justify-between gap-4">
              <dt>车厂 ID</dt>
              <dd class="font-mono text-slate-900 dark:text-white">
                {{ detail.depot.id }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>服务线路</dt>
              <dd class="text-slate-900 dark:text-white">
                {{ detail.depot.routeIds.length }} 条
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>实时调度</dt>
              <dd class="text-slate-900 dark:text-white">
                {{
                  detail.depot.useRealTime == null
                    ? '—'
                    : detail.depot.useRealTime
                      ? '是'
                      : '否'
                }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>巡航高度</dt>
              <dd class="text-slate-900 dark:text-white">
                {{ detail.depot.cruisingAltitude ?? '—' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>班次频率</dt>
              <dd class="text-slate-900 dark:text-white">
                {{ frequencyLabel }}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 class="text-lg text-slate-600 dark:text-slate-300">服务线路</h3>
          <div
            class="mt-3 space-y-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
          >
            <p
              v-if="associatedRoutes.length === 0"
              class="text-sm text-slate-500"
            >
              暂无线路数据
            </p>
            <div class="divide-y divide-slate-100 dark:divide-slate-800/60">
              <div
                v-for="route in associatedRoutes"
                :key="route.id"
                class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p
                    class="flex items-center gap-1 font-medium text-slate-900 dark:text-white"
                  >
                    <span>
                      {{ route.name?.split('|')[0] }}
                    </span>

                    <span>
                      {{ route.name?.split('|')[1] }}
                    </span>
                  </p>
                  <p class="text-xs text-slate-500 flex items-center gap-1">
                    <UBadge
                      variant="soft"
                      size="sm"
                      v-if="(route.name?.split('||').length ?? 0) > 1"
                    >
                      {{ route.name?.split('||')[1] }}
                    </UBadge>

                    <UBadge variant="soft" color="neutral" size="sm">
                      {{ route.server.name }}
                    </UBadge>

                    <UBadge variant="soft" color="neutral" size="sm">
                      {{ getDimensionName(route.dimension) || '未知维度' }}
                    </UBadge>
                  </p>
                </div>
                <UButton size="xs" variant="soft" @click="goRoute(route.id)">
                  查看
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
