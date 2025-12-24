<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RailwaySystemMapPanel from '@/views/user/Transportation/railway/components/RailwaySystemMapPanel.vue'
import RailwaySystemMapFullscreenOverlay from '@/views/user/Transportation/railway/components/RailwaySystemMapFullscreenOverlay.vue'
import RailwayCompanyBindingSection from '@/views/user/Transportation/railway/components/RailwayCompanyBindingSection.vue'
import { useTransportationRailwaySystemsStore } from '@/stores/transportation/railwaySystems'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import { useTransportationRailwayBindingsStore } from '@/stores/transportation/railwayBindings'
import type {
  RailwayRouteDetail,
  RailwaySystemDetail,
} from '@/types/transportation'

const route = useRoute()
const router = useRouter()
const systemsStore = useTransportationRailwaySystemsStore()
const railwayStore = useTransportationRailwayStore()
const bindingStore = useTransportationRailwayBindingsStore()
const toast = useToast()

const system = ref<RailwaySystemDetail | null>(null)
const loading = ref(true)
const routeDetails = ref<RailwayRouteDetail[]>([])
const fullscreenOpen = ref(false)
const bindingPayload = ref({
  operatorCompanyIds: [] as string[],
  builderCompanyIds: [] as string[],
})
const relatedSystems = ref<Array<{ id: string; name: string }>>([])

const systemId = computed(() => route.params.systemId as string)

const systemDimension = computed(() => {
  const context = system.value?.dimensionContext
  if (!context) return null
  const parts = context.split(':')
  return parts.length > 1 ? parts[1] : context
})

const combinedSvgEntries = computed(() => {
  return routeDetails.value
    .map((detail) => detail.route.previewSvg)
    .filter((svg): svg is string => Boolean(svg))
})

const totalLengthKm = computed(() => {
  let total = 0
  for (const detail of routeDetails.value) {
    if (detail.metadata.lengthKm) {
      total += detail.metadata.lengthKm
    }
  }
  return total > 0 ? Number(total.toFixed(2)) : null
})

async function fetchSystemDetail() {
  loading.value = true
  try {
    const detail = await systemsStore.fetchSystemDetail(systemId.value)
    system.value = detail

    if (detail.bindings) {
      bindingPayload.value = detail.bindings
    } else {
      await fetchBindings(detail)
    }

    if (detail.routeDetails) {
      routeDetails.value = detail.routeDetails
    } else {
      await fetchRouteDetails(detail)
    }

    await fetchRelatedSystems(detail)
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '加载失败',
      color: 'red',
    })
  } finally {
    loading.value = false
  }
}

async function fetchRelatedSystems(detail: RailwaySystemDetail) {
  try {
    const response = await systemsStore.fetchSystems({
      serverId: detail.serverId,
      dimension: systemDimension.value ?? undefined,
      page: 1,
      pageSize: 10,
    })
    relatedSystems.value = response.items
      .filter((item) => item.id !== detail.id)
      .map((item) => ({ id: item.id, name: item.name }))
  } catch {
    relatedSystems.value = []
  }
}

async function fetchBindings(detail: RailwaySystemDetail) {
  try {
    const payload = await bindingStore.fetchBindings({
      entityType: 'SYSTEM',
      entityId: detail.id,
      serverId: detail.serverId,
      railwayType: detail.routes[0]?.railwayType ?? null,
      dimension: systemDimension.value ?? null,
    })
    bindingPayload.value = {
      operatorCompanyIds: payload.operatorCompanyIds,
      builderCompanyIds: payload.builderCompanyIds,
    }
  } catch {
    bindingPayload.value = { operatorCompanyIds: [], builderCompanyIds: [] }
  }
}

async function fetchRouteDetails(detail: RailwaySystemDetail) {
  const results: RailwayRouteDetail[] = []
  for (const routeInfo of detail.routes) {
    try {
      const routeDetail = await railwayStore.fetchRouteDetail(
        {
          routeId: routeInfo.entityId,
          serverId: routeInfo.server.id,
          railwayType: routeInfo.railwayType.toLowerCase(),
          dimension: routeInfo.dimension ?? undefined,
        },
        true,
      )
      results.push(routeDetail)
    } catch (error) {
      // ignore single route errors
    }
  }
  routeDetails.value = results
}

watch(
  () => systemId.value,
  () => {
    void fetchSystemDetail()
  },
)

onMounted(() => {
  void fetchSystemDetail()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-1">
      <p class="text-sm uppercase text-slate-500">铁路线路系统信息</p>
      <div class="flex items-center gap-1">
        <img
          v-if="system?.logoUrl"
          :src="system.logoUrl"
          :alt="system.name"
          class="h-12 w-12 rounded-2xl object-cover"
        />
        <div>
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
            {{ system?.name }}
          </h1>
          <p class="text-sm text-slate-500">
            {{ system?.englishName || '—' }}
          </p>
          <div v-if="relatedSystems.length" class="mt-2 flex flex-wrap gap-2">
            <span class="text-xs text-slate-400">相关线路系统：</span>
            <RouterLink
              v-for="item in relatedSystems"
              :key="item.id"
              :to="{
                name: 'transportation.railway.system.detail',
                params: { systemId: item.id },
              }"
              class="text-xs text-primary hover:underline"
            >
              {{ item.name }}
            </RouterLink>
          </div>
        </div>
      </div>
      <UButton
        size="sm"
        class="absolute left-4 top-6 md:top-10"
        variant="ghost"
        icon="i-lucide-arrow-left"
        @click="router.push({ name: 'transportation.railway' })"
      >
        返回概览
      </UButton>
    </div>

    <div v-if="loading" class="text-sm text-slate-500">
      <UIcon name="i-lucide-loader-2" class="animate-spin" />
    </div>

    <div v-else-if="system" class="space-y-6">
      <div
        class="mt-3 relative rounded-3xl border border-slate-200/70 dark:border-slate-800"
      >
        <RailwaySystemMapPanel
          :routes="routeDetails"
          :loading="routeDetails.length === 0"
          height="520px"
        />

        <div class="pointer-events-none absolute bottom-3 left-3 z-998">
          <div
            class="rounded-lg text-xl font-semibold text-white"
            style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)"
          >
            <span class="text-xs mr-1">系统总长</span>
            <span>
              {{ totalLengthKm ? `${totalLengthKm} km` : '—' }}
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
            @click="fullscreenOpen = true"
          >
            <UIcon name="i-lucide-maximize" class="h-3.5 w-3.5" />
            全屏
          </UButton>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-6">
          <div class="space-y-3">
            <div class="flex items-center gap-1">
              <h3 class="text-lg text-slate-600 dark:text-slate-300">
                基本信息
              </h3>
              <UButton
                size="xs"
                variant="link"
                color="primary"
                @click="
                  router.push({
                    name: 'transportation.railway.system.edit',
                    params: { systemId: system.id },
                  })
                "
              >
                编辑
              </UButton>
            </div>

            <div class="space-y-3">
              <div class="mt-1 flex gap-3 items-center">
                <div
                  class="h-32 w-32 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <img
                    v-if="system.logoUrl"
                    :src="system.logoUrl"
                    :alt="system.name"
                    class="h-full w-full object-cover block"
                  />
                </div>

                <div
                  class="relative h-32 w-32 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-500"
                >
                  <div
                    v-for="(svg, index) in combinedSvgEntries"
                    :key="index"
                    class="absolute inset-0 flex items-center justify-center opacity-90"
                    v-html="svg"
                  ></div>
                </div>
              </div>

              <div
                class="space-y-3 rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:bg-slate-700/60 dark:text-slate-300"
              >
                <div class="flex justify-between">
                  <span>中文名</span>
                  <span class="text-slate-900 dark:text-white">{{
                    system.name
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span>英文名</span>
                  <span class="text-slate-900 dark:text-white">{{
                    system.englishName
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span>所属服务端</span>
                  <span class="text-slate-900 dark:text-white">{{
                    system.serverId
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <h3 class="text-lg text-slate-600 dark:text-slate-300">有关单位</h3>

            <div
              class="space-y-3 rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:bg-slate-700/60 dark:text-slate-300"
            >
              <RailwayCompanyBindingSection
                entity-type="SYSTEM"
                :entity-id="system.id"
                :server-id="system.serverId"
                :railway-type="system.routes[0]?.railwayType ?? null"
                :dimension="systemDimension"
                :operator-company-ids="bindingPayload.operatorCompanyIds"
                :builder-company-ids="bindingPayload.builderCompanyIds"
              />
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="space-y-3">
            <h3 class="text-lg text-slate-600 dark:text-slate-300">包含线路</h3>
            <div
              v-if="routeDetails.length === 0"
              class="text-sm text-slate-500"
            >
              暂无线路数据
            </div>
            <div
              v-else
              class="space-y-3 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <div class="divide-y divide-slate-100 dark:divide-slate-800/60">
                <RouterLink
                  v-for="detail in routeDetails"
                  :key="detail.route.id"
                  :to="{
                    name: 'transportation.railway.route',
                    params: {
                      railwayType: detail.route.railwayType.toLowerCase(),
                      routeId: detail.route.id,
                    },
                    query: {
                      serverId: detail.server.id,
                      dimension: detail.dimension ?? undefined,
                    },
                  }"
                  class="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:underline"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="h-2.5 w-2.5 rounded-full"
                      :style="{
                        backgroundColor: detail.route.color
                          ? `#${(detail.route.color >>> 0)
                              .toString(16)
                              .padStart(6, '0')}`
                          : '#cbd5e1',
                      }"
                    ></div>
                    <div>
                      <div class="font-medium text-slate-900 dark:text-white">
                        {{ detail.route.name?.split('||')[0].split('|')[0] }}
                      </div>
                      <div class="text-xs text-slate-500">
                        {{
                          detail.metadata.lengthKm
                            ? `${detail.metadata.lengthKm} km`
                            : '—'
                        }}
                        · {{ detail.stops.length }} 站
                      </div>
                    </div>
                  </div>
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="h-4 w-4 text-slate-400"
                  />
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <RailwaySystemMapFullscreenOverlay
      v-model="fullscreenOpen"
      :routes="routeDetails"
      :loading="routeDetails.length === 0"
    />
  </div>
</template>
