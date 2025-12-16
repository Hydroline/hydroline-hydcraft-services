<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import { useMinecraftServerStore } from '@/stores/user/minecraftServers'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'
import type {
  BeaconMtrLogRecord,
  BeaconMtrLogsResponse,
  MinecraftServer,
} from '@/types/minecraft'

const serverStore = useMinecraftServerStore()
const { items: servers } = storeToRefs(serverStore)

const loading = ref(false)
const selectedServerId = ref<string | undefined>(undefined)

const query = reactive({
  playerUuid: '',
  playerName: '',
  singleDate: '',
  startDate: '',
  endDate: '',
  changeType: '',
  orderColumn: 'timestamp' as 'timestamp' | 'id',
  order: 'desc' as 'asc' | 'desc',
  page: 1,
  pageSize: 20,
})

const data = ref<BeaconMtrLogsResponse | null>(null)

const rows = computed<BeaconMtrLogRecord[]>(
  () => data.value?.result.records ?? [],
)
const total = computed(() => data.value?.result.total ?? 0)
const page = computed(() => data.value?.result.page ?? query.page)
const pageSize = computed(() => data.value?.result.page_size ?? query.pageSize)
const pageCount = computed(() =>
  pageSize.value > 0 ? Math.max(1, Math.ceil(total.value / pageSize.value)) : 1,
)

const selectedRecord = ref<BeaconMtrLogRecord | null>(null)
const detailDialogOpen = ref(false)

const beaconServers = computed(() =>
  servers.value.filter((s) => s.beaconEnabled || s.beaconConfigured),
)

const serverSelectItems = computed(() =>
  beaconServers.value.map((s) => ({
    id: s.id,
    label: s.displayName,
    description: s.host,
    beaconConfigured: Boolean(s.beaconConfigured),
  })),
)

function formatDate(input?: string | null) {
  if (!input) return '—'
  const d = dayjs(input)
  if (!d.isValid()) return input
  return d.format('YYYY-MM-DD HH:mm:ss')
}

function toggleSort(column: 'timestamp' | 'id') {
  if (query.orderColumn === column) {
    query.order = query.order === 'desc' ? 'asc' : 'desc'
  } else {
    query.orderColumn = column
    query.order = 'desc'
  }
  query.page = 1
  void refresh(1)
}

async function refresh(targetPage?: number) {
  if (!selectedServerId.value) return
  // 防止并发重复请求，导致重复 toast
  if (loading.value) return
  loading.value = true
  try {
    const params = {
      playerUuid: query.playerUuid || undefined,
      playerName: query.playerName || undefined,
      singleDate: query.singleDate || undefined,
      startDate: query.startDate || undefined,
      endDate: query.endDate || undefined,
      changeType: query.changeType || undefined,
      orderColumn: query.orderColumn,
      order: query.order,
      page: targetPage ?? query.page,
      pageSize: query.pageSize,
    }
    const res = (await serverStore.getBeaconMtrLogs(
      selectedServerId.value,
      params,
    )) as BeaconMtrLogsResponse
    data.value = res
    query.page = res.result?.page ?? params.page ?? 1
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err ?? '')
    const message = translateAuthErrorMessage(raw)
    const toast = useToast()
    toast.add({
      title: '加载 MTR 审计日志失败',
      description: message,
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  query.page = 1
  void refresh(1)
}

function resetFilters() {
  query.playerUuid = ''
  query.playerName = ''
  query.singleDate = ''
  query.startDate = ''
  query.endDate = ''
  query.changeType = ''
  query.page = 1
  void refresh(1)
}

async function goToPage(target: number) {
  const clamped = Math.max(1, Math.min(target, pageCount.value))
  query.page = clamped
  await refresh(clamped)
}

function openDetail(record: BeaconMtrLogRecord) {
  selectedRecord.value = record
  detailDialogOpen.value = true
}

const activeServer = computed<MinecraftServer | null>(() => {
  return (
    beaconServers.value.find((s) => s.id === selectedServerId.value) ?? null
  )
})

onMounted(async () => {
  if (servers.value.length === 0) {
    await serverStore.fetchAll()
  }
  selectedServerId.value = beaconServers.value[0]?.id ?? undefined
  // 初始刷新由下面的 watch(selectedServerId) 统一触发，避免重复请求/重复 toast
})

watch(selectedServerId, async (value) => {
  if (!value || !activeServer.value) return
  query.page = 1
  await refresh(1)
})
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          MTR 审计日志
        </h1>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 dark:text-slate-400">服务端</span>
        <USelect
          v-model="selectedServerId"
          :items="
            serverSelectItems.map((s) => ({
              label: s.label + (s.beaconConfigured ? ' · Beacon' : ''),
              value: s.id,
              description: s.description,
            }))
          "
          class="min-w-[220px]"
        />
      </div>
    </header>

    <section
      class="flex flex-wrap items-end gap-3 rounded-3xl border border-slate-200/70 bg-slate-50/60 p-4 text-sm dark:border-slate-800/60 dark:bg-slate-900/60"
    >
      <div class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-wide text-slate-500"
          >玩家 UUID</span
        >
        <UInput v-model="query.playerUuid" placeholder="可选，精确匹配 UUID" />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-wide text-slate-500"
          >玩家名称</span
        >
        <UInput v-model="query.playerName" placeholder="可选，精确匹配名称" />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-wide text-slate-500">单日</span>
        <UInput v-model="query.singleDate" placeholder="YYYY-MM-DD" />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-wide text-slate-500"
          >起始日期</span
        >
        <UInput v-model="query.startDate" placeholder="YYYY-MM-DD" />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-wide text-slate-500"
          >结束日期</span
        >
        <UInput v-model="query.endDate" placeholder="YYYY-MM-DD" />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-wide text-slate-500"
          >变更类型</span
        >
        <UInput
          v-model="query.changeType"
          placeholder="例如 EDIT / CREATE / DELETE"
        />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-wide text-slate-500"
          >排序字段</span
        >
        <USelect
          v-model="query.orderColumn"
          :items="[
            { label: '时间戳', value: 'timestamp' },
            { label: 'ID', value: 'id' },
          ]"
          class="min-w-[120px]"
        />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-wide text-slate-500">顺序</span>
        <USelect
          v-model="query.order"
          :items="[
            { label: '倒序（默认）', value: 'desc' },
            { label: '正序', value: 'asc' },
          ]"
          class="min-w-[120px]"
        />
      </div>
      <div class="flex flex-1 justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="resetFilters">
          重置
        </UButton>
        <UButton color="primary" :loading="loading" @click="applyFilters">
          应用筛选
        </UButton>
      </div>
    </section>

    <div
      class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 text-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <div
        v-if="!beaconServers.length"
        class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        暂无可用的 Beacon 服务器。
      </div>
      <table
        v-else
        class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
      >
        <thead class="bg-slate-50/60 dark:bg-slate-900/60">
          <tr
            class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            <th
              class="px-4 py-3 cursor-pointer select-none"
              @click="toggleSort('timestamp')"
            >
              <span>时间</span>
              <span
                v-if="query.orderColumn === 'timestamp'"
                class="ml-1 text-[10px]"
              >
                {{ query.order === 'desc' ? '↓' : '↑' }}
              </span>
            </th>
            <th class="px-4 py-3">玩家</th>
            <th class="px-4 py-3">动作</th>
            <th class="px-4 py-3">类/上下文</th>
            <th class="px-4 py-3">文件</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr v-if="loading">
            <td colspan="6" class="px-4 py-10 text-center">
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-5 w-5 animate-spin text-slate-400"
              />
            </td>
          </tr>
          <tr v-for="item in rows" :key="item.id">
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ formatDate(item.timestamp) }}
            </td>
            <td class="px-4 py-3 text-xs">
              <div class="flex flex-col">
                <span class="font-medium text-slate-900 dark:text-white">
                  {{ item.player_name || '未知玩家' }}
                </span>
                <span class="text-[11px] text-slate-500">
                  {{ item.player_uuid || '—' }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ item.change_type || '—' }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <div class="flex flex-col">
                <span>{{ item.class_name || '—' }}</span>
                <span class="text-[11px]">
                  {{ item.dimension_context || item.position || '' }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ item.source_file_path || '—' }}
            </td>
            <td class="px-4 py-3 text-right">
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                @click="openDetail(item)"
              >
                查看详情
              </UButton>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td
              colspan="6"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无日志数据
            </td>
          </tr>
        </tbody>
      </table>
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
      >
        <span> 第 {{ page }} / {{ pageCount }} 页，共 {{ total }} 条记录 </span>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="page <= 1 || loading"
            @click="goToPage(1)"
          >
            首页
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="page <= 1 || loading"
            @click="goToPage(page - 1)"
          >
            上一页
          </UButton>
          <span class="text-xs text-slate-500 dark:text-slate-400">
            每页 {{ pageSize }} 条
          </span>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="page >= pageCount || loading"
            @click="goToPage(page + 1)"
          >
            下一页
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="page >= pageCount || loading"
            @click="goToPage(pageCount)"
          >
            末页
          </UButton>
        </div>
      </div>
    </div>

    <UModal
      :open="detailDialogOpen"
      @update:open="detailDialogOpen = $event"
      :ui="{
        content:
          'w-full max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-lg font-semibold">
              日志详情 #{{ selectedRecord?.id ?? '' }}
            </h2>
            <span
              v-if="activeServer"
              class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {{ activeServer.displayName }}
            </span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ selectedRecord?.source_file_path }}
          </p>
          <pre
            class="max-h-[420px] overflow-auto rounded-2xl bg-slate-950/95 p-3 text-xs text-slate-100"
            >{{ JSON.stringify(selectedRecord, null, 2) }}</pre
          >
        </div>
      </template>
    </UModal>
  </div>
</template>
