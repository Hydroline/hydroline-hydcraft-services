<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AnimatePresence, Motion } from 'motion-v'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type {
  RailwayEntity,
  RailwayEntityListResponse,
  RailwayServerOption,
} from '@/types/transportation'
import { getDimensionName } from '@/utils/minecraft/dimension-names'

const router = useRouter()
const route = useRoute()
const railwayStore = useTransportationRailwayStore()

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const response = ref<RailwayEntityListResponse | null>(null)
const renderToken = ref(0)

const ALL_OPTION_VALUE = '__all__'

const filters = reactive({
  search: '',
  serverId: ALL_OPTION_VALUE,
  railwayType: ALL_OPTION_VALUE,
  dimension: '',
  transportMode: '',
  page: 1,
  pageSize: 20,
})

const pageInput = ref<string>('1')

let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFetchList(delayMs = 400) {
  if (filterDebounceTimer) {
    clearTimeout(filterDebounceTimer)
  }
  filterDebounceTimer = setTimeout(() => {
    syncQuery()
    void fetchList()
  }, delayMs)
}

const servers = computed<RailwayServerOption[]>(() => railwayStore.servers)
const serverOptions = computed(() => [
  { id: ALL_OPTION_VALUE, name: '全部服务端', railwayType: ALL_OPTION_VALUE },
  ...servers.value,
])

const railwayTypeOptions = computed(() => {
  const types = Array.from(
    new Set(servers.value.map((s) => s.railwayType).filter(Boolean)),
  )
  return [
    { value: ALL_OPTION_VALUE, label: '全部类型' },
    ...types.map((value) => ({ value, label: value })),
  ]
})

const items = computed<RailwayEntity[]>(() => response.value?.items ?? [])
const pagination = computed(
  () =>
    response.value?.pagination ?? {
      total: 0,
      page: filters.page,
      pageSize: filters.pageSize,
      pageCount: 1,
    },
)

function formatLastUpdated(value: number | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

async function fetchList() {
  loading.value = true
  errorMessage.value = null
  try {
    const data = await railwayStore.fetchDepotList({
      search: filters.search || undefined,
      serverId:
        filters.serverId === ALL_OPTION_VALUE ? undefined : filters.serverId,
      railwayType:
        filters.railwayType === ALL_OPTION_VALUE
          ? undefined
          : filters.railwayType,
      dimension: filters.dimension || undefined,
      transportMode: filters.transportMode || undefined,
      page: filters.page,
      pageSize: filters.pageSize,
    })
    response.value = data
    renderToken.value += 1
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function resetToFirstPageAndFetch() {
  filters.page = 1
  pageInput.value = '1'
  syncQuery()
  void fetchList()
}

function goToPage(page: number) {
  const safe = Math.max(1, Math.min(page, pagination.value.pageCount))
  if (safe === filters.page) return
  filters.page = safe
  pageInput.value = String(safe)
  syncQuery()
  void fetchList()
}

function syncQuery() {
  void router.replace({
    query: {
      ...route.query,
      search: filters.search || undefined,
      serverId:
        filters.serverId === ALL_OPTION_VALUE ? undefined : filters.serverId,
      railwayType:
        filters.railwayType === ALL_OPTION_VALUE
          ? undefined
          : filters.railwayType,
      dimension: filters.dimension || undefined,
      transportMode: filters.transportMode || undefined,
      page: String(filters.page),
      pageSize: String(filters.pageSize),
    },
  })
}

function initFiltersFromQuery() {
  const query = route.query

  const search = typeof query.search === 'string' ? query.search : ''
  const serverId = typeof query.serverId === 'string' ? query.serverId : ''
  const railwayType =
    typeof query.railwayType === 'string' ? query.railwayType : ''
  const dimension = typeof query.dimension === 'string' ? query.dimension : ''
  const transportMode =
    typeof query.transportMode === 'string' ? query.transportMode : ''

  const page =
    typeof query.page === 'string' ? Number.parseInt(query.page, 10) : 1
  const pageSize =
    typeof query.pageSize === 'string'
      ? Number.parseInt(query.pageSize, 10)
      : filters.pageSize

  filters.search = search
  filters.serverId = serverId || ALL_OPTION_VALUE
  filters.railwayType = railwayType || ALL_OPTION_VALUE
  filters.dimension = dimension
  filters.transportMode = transportMode
  filters.page = Number.isFinite(page) && page > 0 ? page : 1
  filters.pageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? pageSize : filters.pageSize
  pageInput.value = String(filters.page)
}

watch(
  () => [filters.search, filters.dimension, filters.transportMode],
  () => {
    filters.page = 1
    pageInput.value = '1'
    scheduleFetchList(400)
  },
)

function openDetail(item: RailwayEntity) {
  router.push({
    name: 'transportation.railway.depot',
    params: {
      railwayType: item.railwayType.toLowerCase(),
      depotId: item.id,
    },
    query: {
      serverId: item.server.id,
      dimension: item.dimension ?? undefined,
    },
  })
}

watch(
  () => [filters.serverId, filters.railwayType, filters.pageSize],
  () => {
    resetToFirstPageAndFetch()
  },
)

onMounted(async () => {
  initFiltersFromQuery()
  if (railwayStore.servers.length === 0) {
    try {
      await railwayStore.fetchServers()
    } catch (error) {
      console.error(error)
    }
  }
  await fetchList()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          全部车厂
        </h1>
      </div>
      <UButton
        size="sm"
        variant="ghost"
        class="absolute left-4 top-6 md:top-10"
        icon="i-lucide-arrow-left"
        @click="router.push({ name: 'transportation.railway' })"
      >
        返回概览
      </UButton>
    </div>

    <section class="grid gap-3 rounded-2xl py-4 md:grid-cols-5">
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-xs text-slate-500">关键词</span>
        <UInput v-model="filters.search" placeholder="车厂名 / ID / 模式" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-xs text-slate-500">服务端</span>
        <USelectMenu
          v-model="filters.serverId"
          :items="serverOptions"
          value-key="id"
          label-key="name"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-xs text-slate-500">铁路类型</span>
        <USelectMenu
          v-model="filters.railwayType"
          :items="railwayTypeOptions"
          value-key="value"
          label-key="label"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-xs text-slate-500">维度</span>
        <UInput
          v-model="filters.dimension"
          placeholder="例如 minecraft:overworld"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-xs text-slate-500">运输模式</span>
        <UInput v-model="filters.transportMode" placeholder="例如 TRAIN" />
      </label>
    </section>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      title="加载失败"
      :description="errorMessage"
    />

    <section
      class="relative overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/90 dark:border-slate-800/70 dark:bg-slate-900/70"
    >
      <table class="w-full text-left text-sm">
        <thead class="text-slate-500">
          <tr>
            <th class="px-4 py-3">车厂</th>
            <th class="px-4 py-3">服务端</th>
            <th class="px-4 py-3">维度</th>
            <th class="px-4 py-3">模式</th>
            <th class="px-4 py-3">更新时间</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>

        <tbody v-if="items.length === 0">
          <Motion
            as="tr"
            :initial="{ opacity: 0, filter: 'blur(10px)' }"
            :animate="{ opacity: 1, filter: 'blur(0px)' }"
            :transition="{ duration: 0.3 }"
          >
            <td colspan="6" class="p-6 text-center text-slate-500">
              {{ loading ? '加载中...' : '暂无数据' }}
            </td>
          </Motion>
        </tbody>

        <Motion
          v-else
          as="tbody"
          :animate="{ opacity: 1, filter: 'blur(0px)' }"
          :transition="{ duration: 0.3 }"
        >
          <AnimatePresence>
            <Motion
              v-for="item in items"
              :key="`${renderToken}::${item.server.id}::${item.id}`"
              as="tr"
              :initial="{ opacity: 0, filter: 'blur(10px)', y: 4 }"
              :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
              :exit="{ opacity: 0, filter: 'blur(10px)', y: -4 }"
              :transition="{ duration: 0.3 }"
              class="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200"
            >
              <td class="px-4 py-3">
                <p class="font-medium text-slate-900 dark:text-white">
                  {{ item.name?.split('|')[0] || '未命名' }}
                </p>
                <p
                  class="text-xs text-slate-500"
                  v-if="item.name?.split('|')[1]"
                >
                  {{ item.name?.split('|')[1] }}
                </p>
              </td>
              <td class="px-4 py-3">{{ item.server.name }}</td>
              <td class="px-4 py-3">
                {{ getDimensionName(item.dimension) || '未知维度' }}
              </td>
              <td class="px-4 py-3">{{ item.transportMode || '—' }}</td>
              <td class="px-4 py-3 text-xs text-slate-500">
                {{ formatLastUpdated(item.lastUpdated) }}
              </td>
              <td class="px-4 py-3 text-right">
                <UButton size="xs" variant="soft" @click="openDetail(item)">
                  查看
                </UButton>
              </td>
            </Motion>
          </AnimatePresence>
        </Motion>
      </table>

      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="loading"
          class="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[1px] dark:bg-slate-900/30"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="h-5 w-5 animate-spin text-slate-400"
          />
        </div>
      </Transition>
    </section>

    <div class="flex items-center justify-between text-sm text-slate-500">
      <span>
        共 {{ pagination.total }} 条，{{ pagination.page }}/{{
          pagination.pageCount
        }}
        页
      </span>
      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          :disabled="filters.page <= 1 || loading"
          @click="goToPage(filters.page - 1)"
        >
          上一页
        </UButton>

        <div class="flex items-center gap-2">
          <span class="text-xs">跳转</span>
          <UInput
            v-model="pageInput"
            class="w-20"
            type="number"
            :min="1"
            :max="pagination.pageCount"
            @keydown.enter.prevent="goToPage(Number(pageInput))"
          />
          <UButton
            size="xs"
            variant="soft"
            :disabled="loading"
            @click="goToPage(Number(pageInput))"
          >
            前往
          </UButton>
        </div>

        <UButton
          size="xs"
          :disabled="filters.page >= pagination.pageCount || loading"
          @click="goToPage(filters.page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>
  </div>
</template>
