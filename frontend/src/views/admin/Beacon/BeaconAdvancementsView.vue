<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useMinecraftServerStore } from '@/stores/minecraftServers'
import type {
  BeaconPlayerAdvancementsResult,
  BeaconPlayerGenericResponse,
  MinecraftServer,
} from '@/types/minecraft'

const serverStore = useMinecraftServerStore()
const { items: servers } = storeToRefs(serverStore)

const selectedServerId = ref<string | undefined>(undefined)
const loading = ref(false)
const toast = useToast()

const query = reactive({
  playerUuid: '',
  playerName: '',
  page: 1,
  pageSize: 50,
})

const data =
  ref<BeaconPlayerGenericResponse<BeaconPlayerAdvancementsResult> | null>(null)

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

const activeServer = computed<MinecraftServer | null>(() => {
  return (
    beaconServers.value.find((s) => s.id === selectedServerId.value) ?? null
  )
})

const rows = computed(() => {
  const adv = data.value?.result.advancements ?? {}
  const all = Object.entries(adv).map(([key, raw]) => {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw as string)
    } catch {
      parsed = raw
    }
    return { id: key, raw, parsed }
  })
  const start = (query.page - 1) * query.pageSize
  const end = start + query.pageSize
  return all.slice(start, end)
})

const total = computed(() => {
  const adv = data.value?.result.advancements ?? {}
  return Object.keys(adv).length
})

const page = computed(() => query.page)
const pageSize = computed(() => query.pageSize)
const pageCount = computed(() =>
  pageSize.value > 0 ? Math.max(1, Math.ceil(total.value / pageSize.value)) : 1,
)

const detailOpen = ref(false)
const detailItem = ref<{ id: string; raw: unknown; parsed: unknown } | null>(
  null,
)

const hasPlayerFilter = computed(
  () => query.playerUuid.trim() !== '' || query.playerName.trim() !== '',
)

const hasQueried = ref(false)

async function refresh() {
  if (!selectedServerId.value) return
  if (!hasPlayerFilter.value) {
    toast.add({
      color: 'warning',
      title: '请输入玩家信息',
      description: '请至少填写玩家 UUID 或名称后再查询。',
    })
    return
  }
  loading.value = true
  try {
    const params = {
      playerUuid: query.playerUuid || undefined,
      playerName: query.playerName || undefined,
    }
    const res = (await serverStore.getBeaconPlayerAdvancements(
      selectedServerId.value,
      params,
    )) as BeaconPlayerGenericResponse<BeaconPlayerAdvancementsResult>
    data.value = res
    hasQueried.value = true
  } catch (err) {
    const message =
      err instanceof Error ? err.message : '无法加载玩家成就数据，请稍后再试。'
    toast.add({
      color: 'error',
      title: '查询失败',
      description: message,
    })
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  query.page = 1
  void refresh()
}

function resetFilters() {
  query.playerUuid = ''
  query.playerName = ''
  query.page = 1
  void refresh()
}

function openDetail(id: string, raw: unknown, parsed: unknown) {
  detailItem.value = { id, raw, parsed }
  detailOpen.value = true
}

async function goToPage(target: number) {
  const clamped = Math.max(1, Math.min(target, pageCount.value))
  query.page = clamped
  await refresh()
}

onMounted(async () => {
  if (servers.value.length === 0) {
    await serverStore.fetchAll()
  }
  selectedServerId.value = beaconServers.value[0]?.id ?? undefined
})
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          玩家成就信息
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
      <div class="flex flex-1 justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="resetFilters">
          重置
        </UButton>
        <UButton color="primary" :loading="loading" @click="applyFilters">
          查询
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
            <th class="px-4 py-3">成就 ID</th>
            <th class="px-4 py-3">状态</th>
            <th class="px-4 py-3">原始 JSON</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr v-if="loading">
            <td colspan="4" class="px-4 py-10 text-center">
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-5 w-5 animate-spin text-slate-400"
              />
            </td>
          </tr>
          <tr v-for="item in rows" :key="item.id">
            <td class="px-4 py-3 text-xs">
              {{ item.id }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="(item.parsed as any)?.done">已完成</span>
              <span v-else>进行中/未知</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <span class="line-clamp-2 break-all">
                {{ item.raw }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                @click="openDetail(item.id, item.raw, item.parsed)"
              >
                查看详情
              </UButton>
            </td>
          </tr>
          <tr v-if="!loading && !hasQueried">
            <td
              colspan="4"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              请在上方输入玩家 UUID 或名称后点击查询。
            </td>
          </tr>
          <tr v-else-if="!loading && rows.length === 0">
            <td
              colspan="4"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无成就数据
            </td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="hasQueried && total > 0"
        class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
      >
        <span>
          第 {{ page }} / {{ pageCount }} 页，共 {{ total }} 条成就
        </span>
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
      :open="detailOpen"
      @update:open="detailOpen = $event"
      :ui="{ content: 'w-full max-w-3xl' }"
    >
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-lg font-semibold">
              成就详情 {{ detailItem?.id ?? '' }}
            </h2>
            <span
              v-if="activeServer"
              class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {{ activeServer.displayName }}
            </span>
          </div>
          <pre
            class="max-h-[420px] overflow-auto rounded-2xl bg-slate-950/95 p-3 text-xs text-slate-100"
            >{{
              JSON.stringify(detailItem?.parsed ?? detailItem?.raw, null, 2)
            }}</pre
          >
        </div>
      </template>
    </UModal>
  </div>
</template>
