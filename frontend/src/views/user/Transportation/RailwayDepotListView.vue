<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type {
  RailwayEntity,
  RailwayEntityListResponse,
  RailwayServerOption,
} from '@/types/transportation'
import { getDimensionName } from '@/utils/minecraft/dimension-names'

const router = useRouter()
const railwayStore = useTransportationRailwayStore()

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const response = ref<RailwayEntityListResponse | null>(null)

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

const servers = computed<RailwayServerOption[]>(() => railwayStore.servers)
const serverOptions = computed(() => [
  { id: ALL_OPTION_VALUE, name: '全部服务器', railwayType: ALL_OPTION_VALUE },
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
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error ? error.message : '加载失败'
    response.value = null
  } finally {
    loading.value = false
  }
}

function resetToFirstPageAndFetch() {
  filters.page = 1
  void fetchList()
}

function goToPage(page: number) {
  const safe = Math.max(1, Math.min(page, pagination.value.pageCount))
  if (safe === filters.page) return
  filters.page = safe
  void fetchList()
}

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
  () => [
    filters.search,
    filters.serverId,
    filters.railwayType,
    filters.dimension,
    filters.transportMode,
    filters.pageSize,
  ],
  () => {
    resetToFirstPageAndFetch()
  },
)

onMounted(async () => {
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
        <p class="text-sm text-slate-500">支持搜索、筛选与查看详情</p>
      </div>
      <UButton
        size="sm"
        variant="ghost"
        icon="i-lucide-arrow-left"
        @click="router.push({ name: 'transportation.railway' })"
      >
        返回概览
      </UButton>
    </div>

    <section
      class="grid gap-3 rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-800/70 dark:bg-slate-900/70 md:grid-cols-5"
    >
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-xs text-slate-500">关键词</span>
        <UInput v-model="filters.search" placeholder="车厂名 / ID / 模式" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-xs text-slate-500">服务器</span>
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
      class="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/90 dark:border-slate-800/70 dark:bg-slate-900/70"
    >
      <table class="w-full text-left text-sm">
        <thead class="text-slate-500">
          <tr>
            <th class="px-4 py-3">车厂</th>
            <th class="px-4 py-3">服务器</th>
            <th class="px-4 py-3">维度</th>
            <th class="px-4 py-3">模式</th>
            <th class="px-4 py-3">更新时间</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>

        <tbody v-if="loading">
          <tr>
            <td colspan="6" class="p-6 text-center text-slate-500">
              加载中...
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="items.length === 0">
          <tr>
            <td colspan="6" class="p-6 text-center text-slate-500">暂无数据</td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr
            v-for="item in items"
            :key="item.server.id + '::' + item.id"
            class="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200"
          >
            <td class="px-4 py-3">
              <p class="font-medium text-slate-900 dark:text-white">
                {{ item.name || '未命名' }}
              </p>
              <p class="text-xs text-slate-500">ID：{{ item.id }}</p>
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
          </tr>
        </tbody>
      </table>
    </section>

    <div
      v-if="pagination.pageCount > 1"
      class="flex items-center justify-between text-sm text-slate-500"
    >
      <span>
        共 {{ pagination.total }} 条，{{ pagination.page }}/{{
          pagination.pageCount
        }}
        页
      </span>
      <div class="space-x-2">
        <UButton
          size="xs"
          :disabled="filters.page <= 1 || loading"
          @click="goToPage(filters.page - 1)"
        >
          上一页
        </UButton>
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
