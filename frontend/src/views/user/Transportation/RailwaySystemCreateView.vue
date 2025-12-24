<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import { useTransportationRailwaySystemsStore } from '@/stores/transportation/railwaySystems'
import type { RailwayRoute } from '@/types/transportation'

const router = useRouter()
const railwayStore = useTransportationRailwayStore()
const systemsStore = useTransportationRailwaySystemsStore()
const toast = useToast()

const formState = ref({
  name: '',
  englishName: '',
})

const searchTerm = ref('')
const searching = ref(false)
const searchResults = ref<RailwayRoute[]>([])
const selectedRoutes = ref<RailwayRoute[]>([])
const baseRouteKey = ref<string | null>(null)

function extractBaseKey(name: string | null | undefined) {
  if (!name) return null
  const primary = name.split('||')[0] ?? ''
  const first = primary.split('|')[0] ?? ''
  return first.trim() || null
}

const filteredResults = computed(() => {
  if (!baseRouteKey.value) return searchResults.value
  return searchResults.value.filter((item) => {
    return extractBaseKey(item.name) === baseRouteKey.value
  })
})

async function searchRoutes() {
  if (!searchTerm.value.trim()) {
    searchResults.value = []
    return
  }
  searching.value = true
  try {
    const response = await railwayStore.fetchRouteList({
      search: searchTerm.value.trim(),
      page: 1,
      pageSize: 20,
    })
    searchResults.value = response.items
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '搜索失败',
      color: 'red',
    })
  } finally {
    searching.value = false
  }
}

function addRoute(route: RailwayRoute) {
  if (selectedRoutes.value.find((item) => item.id === route.id)) return
  const baseKey = extractBaseKey(route.name)
  if (!baseRouteKey.value) {
    baseRouteKey.value = baseKey
  }
  if (baseRouteKey.value && baseKey !== baseRouteKey.value) {
    toast.add({
      title: '只能选择同名线路',
      color: 'orange',
    })
    return
  }
  selectedRoutes.value.push(route)
}

function removeRoute(routeId: string) {
  selectedRoutes.value = selectedRoutes.value.filter(
    (item) => item.id !== routeId,
  )
  if (selectedRoutes.value.length === 0) {
    baseRouteKey.value = null
  }
}

async function createSystem() {
  if (!formState.value.name.trim()) {
    toast.add({ title: '请输入线路系统名称', color: 'orange' })
    return
  }
  if (!formState.value.englishName.trim()) {
    toast.add({ title: '请输入线路系统英文名', color: 'orange' })
    return
  }
  if (!selectedRoutes.value.length) {
    toast.add({ title: '至少选择一条线路', color: 'orange' })
    return
  }

  try {
    const system = await systemsStore.createSystem({
      name: formState.value.name.trim(),
      englishName: formState.value.englishName.trim(),
      routes: selectedRoutes.value.map((route) => ({
        entityId: route.id,
        railwayType: route.railwayType,
        serverId: route.server.id,
        dimension: route.dimension ?? null,
      })),
    })
    toast.add({ title: '线路系统已创建', color: 'green' })
    router.push({
      name: 'transportation.railway.system.detail',
      params: { systemId: system.id },
    })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '创建失败',
      color: 'red',
    })
  }
}

watch(
  () => searchTerm.value,
  (value) => {
    if (!value.trim()) {
      searchResults.value = []
    }
  },
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          添加线路系统
        </h1>
        <p class="text-sm text-slate-500">选择同名线路组合成系统</p>
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

    <div
      class="grid gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800/70 dark:bg-slate-900"
    >
      <div class="grid gap-4 md:grid-cols-2">
        <UInput v-model="formState.name" placeholder="线路系统中文名" />
        <UInput v-model="formState.englishName" placeholder="线路系统英文名" />
      </div>

      <div class="flex items-center gap-2">
        <UInput
          v-model="searchTerm"
          placeholder="搜索线路名称"
          icon="i-lucide-search"
          @keyup.enter="searchRoutes"
        />
        <UButton color="primary" :loading="searching" @click="searchRoutes">
          搜索
        </UButton>
      </div>

      <div v-if="filteredResults.length" class="space-y-2">
        <p class="text-xs text-slate-500">可选线路（仅显示同名线路）</p>
        <div class="grid gap-2 md:grid-cols-2">
          <div
            v-for="route in filteredResults"
            :key="route.id"
            class="flex items-center justify-between gap-2 rounded-lg border border-slate-200/60 px-3 py-2 text-sm dark:border-slate-800/60"
          >
            <div>
              <p class="text-slate-900 dark:text-white">
                {{ route.name || route.id }}
              </p>
              <p class="text-xs text-slate-500">
                {{ route.server.name }} · {{ route.railwayType }}
              </p>
            </div>
            <UButton size="2xs" variant="ghost" @click="addRoute(route)">
              选择
            </UButton>
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-xs text-slate-500">已选择线路</p>
        <div v-if="selectedRoutes.length" class="flex flex-col gap-2">
          <div
            v-for="route in selectedRoutes"
            :key="route.id"
            class="flex items-center justify-between gap-2 rounded-lg border border-slate-200/60 px-3 py-2 text-sm dark:border-slate-800/60"
          >
            <div>
              <p class="text-slate-900 dark:text-white">
                {{ route.name || route.id }}
              </p>
              <p class="text-xs text-slate-500">
                {{ route.server.name }} · {{ route.railwayType }}
              </p>
            </div>
            <UButton size="2xs" variant="ghost" @click="removeRoute(route.id)">
              移除
            </UButton>
          </div>
        </div>
        <p v-else class="text-xs text-slate-400">暂无选中线路</p>
      </div>

      <div class="flex justify-end">
        <UButton color="primary" @click="createSystem">创建系统</UButton>
      </div>
    </div>
  </div>
</template>
