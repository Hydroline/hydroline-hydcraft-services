<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import type {
  PlayerGameServerStat,
  PlayerStatsResponse,
  PlayerSummary,
  PlayerGameStatsResponse,
} from '@/types/portal'
import { usePlayerPortalStore } from '@/stores/playerPortal'

const props = defineProps<{
  stats: PlayerStatsResponse | null
  bindings: PlayerSummary['authmeBindings']
  isViewingSelf: boolean
  refreshing: boolean
}>()

const emit = defineEmits<{ (event: 'refresh'): void }>()

type PlayerAuthmeBinding = PlayerSummary['authmeBindings'][number]

const selectedServerId = ref<string | undefined>(undefined)
const selectedPlayerId = ref<string | undefined>(undefined)

const playerPortalStore = usePlayerPortalStore()

const gameStats = computed(() => props.stats?.gameStats ?? null)
const servers = computed<PlayerGameServerStat[]>(
  () => gameStats.value?.servers ?? [],
)

watch(
  () => servers.value,
  (next) => {
    if (!next.length) {
      selectedServerId.value = null
      return
    }
    const current = next.find(
      (server) => server.serverId === selectedServerId.value,
    )
    if (current) {
      return
    }
    const candidate = next.find((server) => server.metrics) ?? next[0]
    selectedServerId.value = candidate?.serverId ?? null
  },
  { immediate: true, deep: true },
)

const selectedServer = computed<PlayerGameServerStat | null>(() => {
  if (!servers.value.length) return null
  return (
    servers.value.find(
      (server) => server.serverId === selectedServerId.value,
    ) ??
    servers.value[0] ??
    null
  )
})

const selectedMetrics = computed(() => selectedServer.value?.metrics ?? null)
const hasMetrics = computed(() => Boolean(selectedMetrics.value))

const serverOptions = computed(() =>
  servers.value.map((server) => ({
    id: server.serverId,
    displayName: server.serverName,
  })),
)

const playerOptions = computed(() =>
  (props.bindings ?? []).map((binding: PlayerAuthmeBinding) => {
    const realname = binding.realname?.trim() || binding.username
    return {
      id: binding.id,
      label: realname,
      avatarUrl: `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(
        realname,
      )}`,
      raw: binding,
    }
  }),
)

watch(
  () => playerOptions.value,
  (list) => {
    if (!list.length) {
      selectedPlayerId.value = undefined
      return
    }
    if (!selectedPlayerId.value) {
      selectedPlayerId.value = list[0].id
    }
  },
  { immediate: true },
)

const isLoadingGameStats = ref(false)

const latestUpdateLabel = computed(() => {
  const source = selectedServer.value?.fetchedAt ?? props.stats?.generatedAt
  if (!source) return '更新时间未知'
  return `更新于 ${dayjs(source).format('YYYY/MM/DD HH:mm:ss')}`
})

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
})
const decimalFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})
const kmFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const formatDistance = (value: number | null | undefined) => {
  if (!hasMetrics.value) return '—'
  const kilometers = (value ?? 0) / 100000
  return `${kmFormatter.format(kilometers)} km`
}

const formatTimes = (value: number | null | undefined, unit = '次') => {
  if (!hasMetrics.value) return '—'
  const safeValue = value ?? 0
  return `${numberFormatter.format(safeValue)} ${unit}`
}

const formatTicksToHours = (value: number | null | undefined) => {
  if (!hasMetrics.value) return '—'
  const safeValue = value ?? 0
  const hours = safeValue / 72000
  if (!Number.isFinite(hours)) return '—'
  return `${decimalFormatter.format(hours)} 小时`
}

const formatTicksToDays = (value: number | null | undefined) => {
  if (!hasMetrics.value) return '—'
  const safeValue = value ?? 0
  const days = safeValue / 1728000
  if (Number.isFinite(days) && days >= 1) {
    return `${decimalFormatter.format(days)} 天`
  }
  return formatTicksToHours(safeValue)
}

const formattedMtrTimestamp = computed(() => {
  const log = selectedServer.value?.lastMtrLog
  if (!log) return '—'
  if (log.timestamp) {
    return dayjs(log.timestamp).format('YYYY/MM/DD HH:mm:ss')
  }
  if (log.rawTimestamp) {
    return log.rawTimestamp
  }
  return '—'
})

const formattedMtrDescription = computed(() => {
  const log = selectedServer.value?.lastMtrLog
  if (!log) return null
  return log.description ?? null
})

const selectedServerMessage = computed(() => {
  if (!selectedServer.value) return null
  if (selectedServer.value.errorMessage) {
    return selectedServer.value.errorMessage
  }
  if (selectedServer.value.error) {
    return '该服务器的游戏统计暂不可用'
  }
  return null
})

const hasServers = computed(() => servers.value.length > 0)
const showStatsGrid = computed(() => Boolean(props.stats && hasServers.value))
const showNoServersMessage = computed(() =>
  Boolean(props.stats && !hasServers.value),
)
const isStatsLoading = computed(() => !props.stats)

async function refreshGameStatsForSelection() {
  if (!selectedPlayerId.value || !selectedServerId.value) return
  if (!playerOptions.value.length) return
  const binding = playerOptions.value.find(
    (item) => item.id === selectedPlayerId.value,
  )
  if (!binding) return
  try {
    isLoadingGameStats.value = true
    const response = await playerPortalStore.fetchGameStatsForBinding(
      binding.id,
      {
        serverId: selectedServerId.value,
      },
    )
    const updated = response?.servers?.[0]
    if (!updated || !gameStats.value) return
    const current = gameStats.value.servers ?? []
    const nextServers = current.map((server) =>
      server.serverId === updated.serverId ? updated : server,
    )
    const nextPayload: PlayerGameStatsResponse = {
      ...gameStats.value,
      identity: response.identity ?? gameStats.value.identity,
      identityMissing:
        typeof response.identityMissing === 'boolean'
          ? response.identityMissing
          : gameStats.value.identityMissing,
      updatedAt: response.updatedAt ?? gameStats.value.updatedAt,
      servers: nextServers,
    }
    if (props.stats) {
      playerPortalStore.stats = {
        ...props.stats,
        gameStats: nextPayload,
      }
    }
  } finally {
    isLoadingGameStats.value = false
  }
}

watch(
  () => [selectedPlayerId.value, selectedServerId.value] as const,
  () => {
    void refreshGameStatsForSelection()
  },
)
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-4">
      <div class="flex gap-3 items-start md:items-center justify-between mb-1">
        <div class="flex gap-0.5 px-1">
          <span class="text-lg text-slate-600 dark:text-slate-300">
            游戏统计信息
          </span>

          <UTooltip
            v-if="props.isViewingSelf"
            text="刷新游戏统计"
            :popper="{ placement: 'top' }"
          >
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              :loading="props.refreshing"
              :disabled="props.refreshing || !props.stats"
              @click="emit('refresh')"
            >
              <UIcon name="i-lucide-refresh-ccw" class="h-4 w-4" />
            </UButton>
          </UTooltip>
        </div>
        <div
          class="flex flex-col-reverse items-end md:gap-2 md:flex-row md:items-center"
        >
          <template v-if="props.stats">
            <span class="text-xs text-slate-400 dark:text-slate-500">
              {{ latestUpdateLabel }}
            </span>
          </template>
          <template v-else>
            <USkeleton class="h-4 w-32" />
          </template>
          <div class="flex items-center gap-2">
            <USelectMenu
              v-model="selectedPlayerId"
              :items="playerOptions"
              value-key="id"
              label-key="label"
              placeholder="选择玩家"
              class="w-full max-w-40"
              :disabled="playerOptions.length === 0"
              size="xs"
            >
              <template #item="{ item }">
                <div class="flex items-center gap-2">
                  <img
                    :src="item.avatarUrl"
                    :alt="item.label"
                    class="h-5 w-5 rounded-sm border border-slate-200 dark:border-slate-700"
                  />
                  <span class="truncate text-xs">{{ item.label }}</span>
                </div>
              </template>
              <template #default>
                <div v-if="selectedPlayerId" class="flex items-center gap-2">
                  <img
                    :src="
                      playerOptions.find((p) => p.id === selectedPlayerId)
                        ?.avatarUrl
                    "
                    :alt="
                      playerOptions.find((p) => p.id === selectedPlayerId)
                        ?.label || ''
                    "
                    class="h-5 w-5 rounded-sm border border-slate-200 dark:border-slate-700"
                  />
                  <span class="truncate text-xs">
                    {{
                      playerOptions.find((p) => p.id === selectedPlayerId)
                        ?.label || '选择玩家'
                    }}
                  </span>
                </div>
                <span v-else class="text-xs text-slate-400">选择玩家</span>
              </template>
            </USelectMenu>

            <USelectMenu
              v-model="selectedServerId"
              :items="serverOptions"
              value-key="id"
              label-key="displayName"
              placeholder="选择服务器"
              class="w-full max-w-32"
              :disabled="serverOptions.length === 0"
              size="xs"
            />

            <UTooltip
              class="shrink-0"
              v-if="selectedServerMessage"
              :text="selectedServerMessage"
              :popper="{ placement: 'top' }"
            >
              <UIcon name="i-lucide-alert-circle" class="text-amber-500" />
            </UTooltip>
          </div>
        </div>
      </div>

      <UAlert
        v-if="gameStats?.identityMissing"
        icon="i-lucide-alert-triangle"
        color="warning"
        variant="soft"
        title="缺少 AuthMe 绑定"
        description="未找到有效的 AuthMe 账户，无法向 Beacon 请求游戏统计信息。"
      />

      <div v-if="showStatsGrid" class="space-y-3">
        <div class="grid gap-2 md:grid-cols-4">
          <div
            class="col-span-1 md:col-span-4 row-span-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white backdrop-blur dark:bg-slate-800 overflow-hidden min-h-64"
          >
            <iframe
              src="https://map.nitrogen.hydcraft.cn/"
              class="block w-full h-full"
            ></iframe>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">走了多远</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-28" />
              </template>
              <template v-else>
                {{ formatDistance(selectedMetrics?.walkOneCm) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">飞了多远</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-28" />
              </template>
              <template v-else>
                {{ formatDistance(selectedMetrics?.flyOneCm) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">游了多远</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-28" />
              </template>
              <template v-else>
                {{ formatDistance(selectedMetrics?.swimOneCm) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">
              在游戏里待了多久
            </p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-32" />
              </template>
              <template v-else>
                {{ formatTicksToDays(selectedMetrics?.totalWorldTime) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">
              被人杀了多少次
            </p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-28" />
              </template>
              <template v-else>
                {{ formatTimes(selectedMetrics?.playerKills) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">死亡多少次</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-28" />
              </template>
              <template v-else>
                {{ formatTimes(selectedMetrics?.deaths) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">跳了多少次</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-28" />
              </template>
              <template v-else>
                {{ formatTimes(selectedMetrics?.jump) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">游玩时间</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-28" />
              </template>
              <template v-else>
                {{ formatTicksToHours(selectedMetrics?.playTime) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">
              用了几次斧头
            </p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-28" />
              </template>
              <template v-else>
                {{ formatTimes(selectedMetrics?.useWand) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">
              退出游戏几次
            </p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="isStatsLoading">
                <USkeleton class="h-6 w-28" />
              </template>
              <template v-else>
                {{ formatTimes(selectedMetrics?.leaveGame) }}
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800 md:col-span-2"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">
              最近一次 MTR 操作

              <span
                v-if="formattedMtrDescription"
                class="font-semibold text-xs text-slate-500 dark:text-slate-500"
              >
                {{ formattedMtrDescription }}
              </span>
            </p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              {{ formattedMtrTimestamp }}
            </p>
          </div>
        </div>
      </div>
      <div
        v-else-if="showNoServersMessage"
        class="text-sm text-slate-500 dark:text-slate-500 flex items-center gap-2"
      >
        <UIcon name="i-lucide-server-off" /> 暂无可用的服务器配置
      </div>
      <div v-else class="space-y-3">
        <div class="grid gap-2 md:grid-cols-4">
          <div
            class="col-span-1 md:col-span-4 row-span-1 min-h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white backdrop-blur dark:bg-slate-800 overflow-hidden"
          >
            <USkeleton class="h-64" />
          </div>
          <div
            v-for="index in 10"
            :key="`game-stats-placeholder-${index}`"
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <USkeleton class="h-4 w-24" />
            <USkeleton class="h-8 w-full mt-2" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
