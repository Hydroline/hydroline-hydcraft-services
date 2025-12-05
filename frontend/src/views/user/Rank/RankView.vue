<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Motion } from 'motion-v'
import dayjs from 'dayjs'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import type {
  RankPlayerItem,
  RankResponse,
  RankSyncJobStatus,
} from '@/types/rank'

type SortField = RankResponse['sortField']

enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

const authStore = useAuthStore()
const response = ref<RankResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(20)
const sortField = ref<SortField>('walkDistance')
const sortOrder = ref<SortOrder>(SortOrder.DESC)
const selectedServerId = ref<string | undefined>(undefined)
const syncJob = ref<RankSyncJobStatus | null>(null)
const skipServerChange = ref(false)
const syncTimer = ref<number | null>(null)
const syncError = ref<string | null>(null)
const SYNC_JOB_STORAGE_KEY = 'rank-sync-job-id'
const tableScrollContainer = ref<HTMLElement | null>(null)
const pendingScrollLeft = ref<number | null>(null)
const tableRefreshKey = ref(0)

const isAdmin = computed(() =>
  authStore.hasPermission('portal.view.admin-dashboard'),
)

const servers = computed(() => response.value?.servers ?? [])
const selectedServer = computed(() => response.value?.selectedServer ?? null)
const pagination = computed(() => response.value?.pagination ?? null)
const tableRows = computed<RankPlayerItem[]>(() => response.value?.items ?? [])
const tableEmpty = computed(
  () => !loading.value && !tableRows.value.length && !error.value,
)

const serverOptions = computed(() =>
  servers.value.map((entry) => ({
    id: entry.id,
    label: entry.displayName ?? entry.id,
  })),
)
const selectedServerName = computed(
  () =>
    selectedServer.value?.displayName ??
    selectedServer.value?.id ??
    '选择服务器',
)

const syncStatusLabel = computed(() => {
  if (syncJob.value) {
    if (syncJob.value.status === 'RUNNING') {
      return '数据同步中...'
    }
    if (syncJob.value.status === 'SUCCESS') {
      return '同步已完成，数据已刷新'
    }
    return `同步失败：${syncJob.value.message ?? '未知错误'}`
  }
  if (selectedServer.value?.lastSyncedAt) {
    return `最近同步于 ${formatTimestamp(selectedServer.value.lastSyncedAt)}`
  }
  return '尚未同步'
})

function formatTimestamp(value: string | null) {
  if (!value) return '—'
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

const integerFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
})
const decimalFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
})

function toSafeNumber(value: number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return 0
}

function formatDistance(value: number | null) {
  return decimalFormatter.format(toSafeNumber(value))
}

function formatCount(value: number | null) {
  return integerFormatter.format(toSafeNumber(value))
}

function rowKey(entry: RankPlayerItem) {
  return entry.playerUuid ?? `${entry.rank}-${entry.playerName ?? 'unknown'}`
}

function playerProfileLink(playerName: string | null) {
  if (!playerName) return '#'
  return `/player/name/${encodeURIComponent(playerName)}`
}

function setSort(field: SortField) {
  const currentScroll = tableScrollContainer.value?.scrollLeft
  pendingScrollLeft.value = currentScroll ?? null
  if (sortField.value === field) {
    sortOrder.value =
      sortOrder.value === SortOrder.DESC ? SortOrder.ASC : SortOrder.DESC
  } else {
    sortField.value = field
    sortOrder.value = SortOrder.DESC
  }
  page.value = 1
  void loadData()
}

function sortIcon(field: SortField) {
  if (sortField.value !== field) {
    return 'i-lucide-arrow-up-down'
  }
  return sortOrder.value === SortOrder.DESC
    ? 'i-lucide-arrow-down'
    : 'i-lucide-arrow-up'
}

async function loadData() {
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('pageSize', String(pageSize.value))
    params.set('sortField', sortField.value)
    params.set('order', sortOrder.value)
    if (selectedServerId.value) {
      params.set('serverId', selectedServerId.value)
    }
    const data = await apiFetch<RankResponse>(`/rank?${params.toString()}`)
    response.value = data
    skipServerChange.value = true
    selectedServerId.value = data.selectedServer.id
    page.value = data.pagination.page
    tableRefreshKey.value += 1
  } catch (err) {
    response.value = null
    error.value =
      err instanceof Error ? err.message : '无法加载排行榜数据，请稍后重试'
  } finally {
    loading.value = false
    if (pendingScrollLeft.value !== null) {
      const target = pendingScrollLeft.value
      pendingScrollLeft.value = null
      await nextTick()
      if (tableScrollContainer.value) {
        tableScrollContainer.value.scrollLeft = target
      }
    }
  }
}

function handleServerChange(value?: string | null) {
  if (skipServerChange.value) {
    skipServerChange.value = false
    return
  }
  selectedServerId.value = value ?? undefined
  page.value = 1
  void loadData()
}

function goToPage(target: number) {
  if (!pagination.value) return
  const safePage = Math.max(1, Math.min(target, pagination.value.pageCount))
  if (safePage === pagination.value.page) return
  page.value = safePage
  void loadData()
}

async function triggerSync() {
  if (!selectedServerId.value) return
  syncError.value = null
  try {
    const job = await apiFetch<RankSyncJobStatus>('/rank/sync', {
      method: 'POST',
      body: { serverId: selectedServerId.value },
      token: authStore.token,
    })
    syncJob.value = job
    startPolling(job.id)
  } catch (err) {
    syncJob.value = null
    syncError.value = err instanceof Error ? err.message : '同步请求失败'
  }
}

function persistSyncJobId(jobId: string | null) {
  if (typeof window === 'undefined') return
  if (jobId) {
    window.localStorage.setItem(SYNC_JOB_STORAGE_KEY, jobId)
  } else {
    window.localStorage.removeItem(SYNC_JOB_STORAGE_KEY)
  }
}

function loadPersistedSyncJobId() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(SYNC_JOB_STORAGE_KEY)
}

function startPolling(jobId: string) {
  if (!authStore.token) {
    return
  }
  stopPolling(false)
  persistSyncJobId(jobId)
  const checkStatus = async () => {
    try {
      const status = await apiFetch<RankSyncJobStatus>(`/rank/sync/${jobId}`, {
        token: authStore.token,
      })
      syncJob.value = status
      if (status.status === 'SUCCESS') {
        stopPolling(true)
        void loadData()
      } else if (status.status === 'FAILED') {
        stopPolling(true)
      }
    } catch (pollErr) {
      console.warn('Failed to check rank sync job status', pollErr)
      stopPolling(true)
    }
  }
  syncTimer.value = window.setInterval(() => {
    void checkStatus()
  }, 2000)
  void checkStatus()
}

function stopPolling(clearStorage = false) {
  if (syncTimer.value) {
    clearInterval(syncTimer.value)
    syncTimer.value = null
  }
  if (clearStorage) {
    persistSyncJobId(null)
  }
}

onMounted(() => {
  void loadData()
  const persistedJobId = loadPersistedSyncJobId()
  if (persistedJobId) {
    startPolling(persistedJobId)
  }
})

onBeforeUnmount(() => {
  stopPolling(false)
})
</script>

<template>
  <section class="mx-auto w-full max-w-5xl px-4 py-10">
    <header
      class="mb-8 flex flex-col justify-center items-center gap-5 text-center"
    >
      <div class="w-full">
        <div class="relative">
          <h1
            class="relative text-2xl font-semibold text-slate-900 dark:text-white"
          >
            服务器排行榜
          </h1>

          <UButton
            v-if="isAdmin"
            variant="ghost"
            icon="i-lucide-refresh-ccw"
            size="sm"
            class="absolute top-0 right-0 bottom-0"
            :loading="syncJob?.status === 'RUNNING'"
            @click="triggerSync"
          >
            立即同步
          </UButton>
        </div>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {{ syncStatusLabel }}
        </p>
      </div>
    </header>

    <div class="mt-6 flex items-center gap-2 w-full justify-between">
      <USelectMenu
        size="sm"
        v-model="selectedServerId"
        :items="serverOptions"
        value-key="id"
        label-key="label"
        class="w-22"
        placeholder="选择服务器"
        @update:modelValue="handleServerChange"
      >
        <template #default>
          <span class="pointer-events-none block truncate text-left">
            {{ selectedServerName }}
          </span>
        </template>
      </USelectMenu>

      <UButton
        variant="soft"
        size="sm"
        icon="i-lucide-line-chart"
        :to="{
          name: 'rank.top',
          query: selectedServerId ? { serverId: selectedServerId } : undefined,
        }"
      >
        查看指标榜
      </UButton>
    </div>

    <div
      class="mt-3 overflow-hidden rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900"
    >
      <div class="overflow-x-auto" ref="tableScrollContainer">
        <table
          class="min-w-[960px] w-full text-left text-sm text-slate-600 dark:text-slate-300"
        >
          <thead
            class="bg-slate-50 text-xs uppercase tracking-wide whitespace-nowrap text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            <tr>
              <th
                class="sticky left-0 z-20 px-4 py-3 text-left text-slate-600 bg-slate-50 dark:text-slate-300 dark:bg-slate-800"
                style="width: 3.5rem; min-width: 3.5rem"
              >
                #
              </th>
              <th
                class="sticky left-14 z-20 px-4 py-3 text-left text-slate-600 bg-slate-50 dark:text-slate-300 dark:bg-slate-800"
                style="min-width: 14rem"
              >
                玩家
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('lastLogin')"
              >
                <div class="flex items-center gap-1">
                  <span>登录</span>
                  <UIcon :name="sortIcon('lastLogin')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('registered')"
              >
                <div class="flex items-center gap-1">
                  <span>注册</span>
                  <UIcon :name="sortIcon('registered')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('walkDistance')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>走路 (km)</span>
                  <UIcon :name="sortIcon('walkDistance')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('flyDistance')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>飞行 (km)</span>
                  <UIcon :name="sortIcon('flyDistance')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('swimDistance')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>游泳 (km)</span>
                  <UIcon :name="sortIcon('swimDistance')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('achievements')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>成就</span>
                  <UIcon :name="sortIcon('achievements')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('deaths')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>死亡</span>
                  <UIcon :name="sortIcon('deaths')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('playerKilledBy')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>被玩家击杀</span>
                  <UIcon :name="sortIcon('playerKilledBy')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('jumpCount')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>跳跃</span>
                  <UIcon :name="sortIcon('jumpCount')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('playTime')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>游玩 (H)</span>
                  <UIcon :name="sortIcon('playTime')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('wandUses')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>手杖方块放置数</span>
                  <UIcon :name="sortIcon('wandUses')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('logoutCount')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>退出</span>
                  <UIcon :name="sortIcon('logoutCount')" class="h-3 w-3" />
                </div>
              </th>
              <th
                class="px-4 py-3 text-right cursor-pointer"
                @click="setSort('mtrBalance')"
              >
                <div class="flex items-center justify-end gap-1">
                  <span>MTR 余额</span>
                  <UIcon :name="sortIcon('mtrBalance')" class="h-3 w-3" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="15" class="p-6">
                <div class="space-y-3">
                  <USkeleton
                    v-for="n in 5"
                    :key="n"
                    class="h-8 w-full rounded-lg"
                  />
                </div>
              </td>
            </tr>
            <tr v-else-if="tableEmpty">
              <td
                colspan="15"
                class="p-6 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                暂无数据，稍后再试。
              </td>
            </tr>
            <template v-else>
              <Motion
                v-for="(entry, rowIndex) in tableRows"
                :key="`${tableRefreshKey}-${rowKey(entry)}`"
                as="tr"
                class="border-t border-slate-100 odd:bg-white even:bg-slate-50 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-800"
                :initial="{ opacity: 0, filter: 'blur(10px)', y: 8 }"
                :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
                :transition="{ duration: 0.35, ease: 'easeOut' }"
              >
                <td
                  class="sticky left-0 z-10 px-4 py-3 text-left font-semibold text-slate-800 dark:text-slate-100"
                  style="width: 3.5rem; min-width: 3.5rem"
                  :class="
                    rowIndex % 2 === 0
                      ? 'bg-white dark:bg-slate-900'
                      : 'bg-slate-50 dark:bg-slate-800'
                  "
                >
                  {{ entry.rank }}
                </td>
                <td
                  class="sticky left-14 z-10 px-4 py-3"
                  style="min-width: 14rem"
                  :class="
                    rowIndex % 2 === 0
                      ? 'bg-white dark:bg-slate-900'
                      : 'bg-slate-50 dark:bg-slate-800'
                  "
                >
                  <component
                    :is="entry.playerName ? RouterLink : 'div'"
                    v-bind="
                      entry.playerName
                        ? { to: playerProfileLink(entry.playerName) }
                        : undefined
                    "
                    class="flex flex-col gap-0.5 focus-visible:outline-none"
                    :class="
                      entry.playerName
                        ? 'transition-colors hover:text-primary focus-visible:ring-1 focus-visible:ring-primary rounded'
                        : ''
                    "
                  >
                    <span class="font-medium text-slate-900 dark:text-white">
                      {{ entry.playerName ?? entry.playerUuid ?? '未知玩家' }}
                    </span>
                    <span class="text-xs text-slate-500 dark:text-slate-400">
                      <template v-if="entry.bindingId">
                        {{ entry.displayName ?? '未知用户' }}
                      </template>
                      <template v-else>未绑定</template>
                    </span>
                  </component>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                  {{ formatTimestamp(entry.lastLoginAt) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                  {{ formatTimestamp(entry.registeredAt) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatDistance(entry.walkDistanceKm) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatDistance(entry.flyDistanceKm) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatDistance(entry.swimDistanceKm) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatCount(entry.achievements) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatCount(entry.deaths) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatCount(entry.playerKilledByCount) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatCount(entry.jumpCount) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatDistance(entry.playTimeHours) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatCount(entry.useWandCount) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatCount(entry.logoutCount) }}
                </td>
                <td class="px-4 py-3 text-right">
                  {{ formatCount(entry.mtrBalance) }}
                </td>
              </Motion>
            </template>
          </tbody>
        </table>
      </div>
      <div
        v-if="error"
        class="px-6 py-4 text-sm text-rose-600 dark:text-rose-400"
      >
        {{ error }}
      </div>
      <div
        v-if="pagination"
        class="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs text-slate-500 dark:border-slate-800"
      >
        <div>
          共 {{ pagination.total }} 条 · 第 {{ pagination.page }} /
          {{ pagination.pageCount }} 页
        </div>
        <div class="flex items-center gap-2">
          <UButton
            variant="ghost"
            size="sm"
            :disabled="pagination.page <= 1"
            @click="goToPage(pagination.page - 1)"
          >
            上一页
          </UButton>
          <UButton
            variant="ghost"
            size="sm"
            :disabled="pagination.page >= pagination.pageCount"
            @click="goToPage(pagination.page + 1)"
          >
            下一页
          </UButton>
        </div>
      </div>
    </div>

    <div
      class="mt-12 w-full text-center text-xs text-slate-500 dark:text-slate-400"
    >
      统计数据非实时更新，可能存在延迟，每天由系统自动拉取数据更新
    </div>
  </section>
</template>
