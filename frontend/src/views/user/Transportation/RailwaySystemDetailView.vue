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
const editMode = ref(false)
const formState = ref({
  name: '',
  englishName: '',
})
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

async function fetchSystemDetail() {
  loading.value = true
  try {
    const detail = await systemsStore.fetchSystemDetail(systemId.value)
    system.value = detail
    formState.value = {
      name: detail.name,
      englishName: detail.englishName ?? '',
    }
    await fetchBindings(detail)
    await fetchRouteDetails(detail)
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

async function updateSystemInfo() {
  if (!system.value) return
  if (!formState.value.name.trim()) {
    toast.add({ title: '请输入线路系统名称', color: 'orange' })
    return
  }
  if (!formState.value.englishName.trim()) {
    toast.add({ title: '请输入线路系统英文名', color: 'orange' })
    return
  }
  try {
    const updated = await systemsStore.updateSystem(system.value.id, {
      name: formState.value.name.trim(),
      englishName: formState.value.englishName.trim(),
    })
    system.value = updated
    editMode.value = false
    toast.add({ title: '已更新线路系统信息', color: 'green' })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '更新失败',
      color: 'red',
    })
  }
}

async function uploadLogo(event: Event) {
  if (!system.value) return
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return
  try {
    const result = await systemsStore.uploadSystemLogo(system.value.id, file)
    system.value = {
      ...system.value,
      logoAttachmentId: result.logoAttachmentId,
      logoUrl: result.logoUrl,
    }
    toast.add({ title: 'Logo 已更新', color: 'green' })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '上传失败',
      color: 'red',
    })
  } finally {
    target!.value = ''
  }
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
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <img
          v-if="system?.logoUrl"
          :src="system.logoUrl"
          :alt="system.name"
          class="h-12 w-12 rounded-2xl object-cover"
        />
        <div>
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
            {{ system?.name || '线路系统' }}
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

    <div v-if="loading" class="text-sm text-slate-500">正在加载…</div>

    <div v-else-if="system" class="space-y-6">
      <div
        class="rounded-3xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-200">
            系统地图
          </h2>
          <UButton size="sm" variant="ghost" @click="fullscreenOpen = true">
            全屏
          </UButton>
        </div>
        <RailwaySystemMapPanel
          :routes="routeDetails"
          :loading="routeDetails.length === 0"
          height="520px"
        />
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-4">
          <div
            class="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div class="flex items-center justify-between">
              <h3
                class="text-base font-semibold text-slate-800 dark:text-slate-200"
              >
                基本信息
              </h3>
              <UButton size="2xs" variant="ghost" @click="editMode = !editMode">
                {{ editMode ? '取消' : '编辑' }}
              </UButton>
            </div>
            <div v-if="!editMode" class="mt-3 space-y-2 text-sm text-slate-600">
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
              <div class="flex justify-between">
                <span>维度</span>
                <span class="text-slate-900 dark:text-white">{{
                  systemDimension || '—'
                }}</span>
              </div>
            </div>
            <div v-else class="mt-3 space-y-3">
              <UInput v-model="formState.name" placeholder="线路系统中文名" />
              <UInput
                v-model="formState.englishName"
                placeholder="线路系统英文名"
              />
              <div class="flex justify-end">
                <UButton size="sm" color="primary" @click="updateSystemInfo">
                  保存
                </UButton>
              </div>
            </div>

            <div class="mt-4 space-y-2">
              <label class="text-xs font-semibold text-slate-500"
                >系统 Logo</label
              >
              <input type="file" accept="image/*,.svg" @change="uploadLogo" />
            </div>
          </div>

          <div
            class="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3
              class="text-base font-semibold text-slate-800 dark:text-slate-200"
            >
              线路系统 SVG
            </h3>
            <div
              class="mt-3 relative h-32 w-full rounded-xl border border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
            >
              <div
                v-for="(svg, index) in combinedSvgEntries"
                :key="index"
                class="absolute inset-0 flex items-center justify-center opacity-90"
                v-html="svg"
              ></div>
              <div
                v-if="combinedSvgEntries.length === 0"
                class="absolute inset-0 flex items-center justify-center text-xs text-slate-400"
              >
                暂无 SVG
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <div
            class="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3
              class="text-base font-semibold text-slate-800 dark:text-slate-200"
            >
              线路清单
            </h3>
            <div class="mt-3 space-y-2">
              <div
                v-for="routeInfo in system.routes"
                :key="routeInfo.entityId"
                class="flex items-center justify-between rounded-lg border border-slate-200/60 px-3 py-2 text-sm dark:border-slate-800/60"
              >
                <div>
                  <p class="text-slate-900 dark:text-white">
                    {{ routeInfo.name || routeInfo.entityId }}
                  </p>
                  <p class="text-xs text-slate-500">
                    {{ routeInfo.server.name }} · {{ routeInfo.railwayType }}
                  </p>
                </div>
                <UButton
                  size="2xs"
                  variant="ghost"
                  @click="
                    router.push({
                      name: 'transportation.railway.route',
                      params: {
                        railwayType: routeInfo.railwayType.toLowerCase(),
                        routeId: routeInfo.entityId,
                      },
                      query: {
                        serverId: routeInfo.server.id,
                        dimension: routeInfo.dimension ?? undefined,
                      },
                    })
                  "
                >
                  查看线路
                </UButton>
              </div>
            </div>
          </div>

          <div
            class="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3
              class="text-base font-semibold text-slate-800 dark:text-slate-200"
            >
              运营 / 建设单位
            </h3>
            <RailwayCompanyBindingSection
              entity-type="SYSTEM"
              :entity-id="system.id"
              :server-id="system.serverId"
              :railway-type="system.routes[0]?.railwayType ?? null"
              :dimension="systemDimension"
              :operator-company-ids="bindingPayload.operatorCompanyIds"
              :builder-company-ids="bindingPayload.builderCompanyIds"
            />
            <p class="mt-2 text-xs text-slate-400">
              系统必须至少绑定一个运营单位
            </p>
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
