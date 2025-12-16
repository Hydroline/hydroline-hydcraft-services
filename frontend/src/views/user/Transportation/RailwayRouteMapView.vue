<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RailwayMapPanel from '@/views/user/Transportation/railway/components/RailwayMapPanel.vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type { RailwayRouteDetail } from '@/types/transportation'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const transportationStore = useTransportationRailwayStore()

const detail = ref<RailwayRouteDetail | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const geometry = computed(() => detail.value?.geometry ?? null)

const params = computed(() => {
  const routeId = route.params.routeId as string | undefined
  const railwayType = route.params.railwayType as string | undefined
  const serverId = route.query.serverId as string | undefined
  const dimension = (route.query.dimension as string | undefined) ?? undefined
  return { routeId, serverId, dimension, railwayType }
})

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

function goBackToDetail() {
  router.push({
    name: 'transportation.railway.route',
    params: route.params,
    query: route.query,
  })
}
</script>

<template>
  <div class="relative h-screen w-screen overflow-hidden bg-slate-900">
    <RailwayMapPanel
      :geometry="geometry"
      :stops="detail?.stops ?? []"
      :color="detail?.route.color ?? null"
      :loading="loading"
      height="100%"
      :showZoomControl="false"
    />
    <div class="pointer-events-auto absolute right-4 top-4">
      <UButton
        size="sm"
        variant="soft"
        color="neutral"
        icon="i-lucide-arrow-left"
        @click="goBackToDetail"
      >
        返回
      </UButton>
    </div>
  </div>
</template>
