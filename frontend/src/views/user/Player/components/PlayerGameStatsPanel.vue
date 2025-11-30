<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import type { PlayerGameServerStat, PlayerStatsResponse } from '@/types/portal'

const props = defineProps<{
  stats: PlayerStatsResponse | null
  isViewingSelf: boolean
  refreshing: boolean
}>()

const emit = defineEmits<{ (event: 'refresh'): void }>()

const selectedServerId = ref<string | null>(null)

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

const dropdownItems = computed(() =>
  servers.value.map((server) => ({
    serverId: server.serverId,
    serverName: server.serverName,
  })),
)

const identityLabel = computed(() => {
  if (!gameStats.value?.identity) return '未找到玩家身份信息'
  const parts: string[] = []
  if (gameStats.value.identity.name) {
    parts.push(gameStats.value.identity.name)
  }
  if (gameStats.value.identity.uuid) {
    parts.push(gameStats.value.identity.uuid)
  }
  if (!parts.length) {
    return '未找到玩家身份信息'
  }
  return parts.join(' · ')
})

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
  if (!log) return '—'
  return log.description ?? '—'
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

const mtrErrorMessage = computed(() => {
  if (!selectedServer.value) return null
  return selectedServer.value.mtrErrorMessage ?? null
})

const hasServers = computed(() => servers.value.length > 0)
const showStatsGrid = computed(() => Boolean(props.stats && hasServers.value))
const showNoServersMessage = computed(() =>
  Boolean(props.stats && !hasServers.value),
)
const isStatsLoading = computed(() => !props.stats)
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
              v-model="selectedServerId"
              :items="dropdownItems"
              value-key="serverId"
              label-key="serverName"
              placeholder="选择服务器"
              class="w-full max-w-32"
              :disabled="dropdownItems.length === 0"
              size="xs"
            />
            <UTooltip
              v-if="selectedServerMessage"
              :text="selectedServerMessage"
              :popper="{ placement: 'top' }"
            >
              <UIcon
                name="i-lucide-alert-circle"
                class="text-amber-500 text-lg"
              />
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
            class="col-span-4 row-span-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white backdrop-blur dark:bg-slate-800 overflow-hidden min-h-64"
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
              <template v-if="hasMetrics">
                {{ formatDistance(selectedMetrics?.walkOneCm) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-28" />
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">飞了多远</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="hasMetrics">
                {{ formatDistance(selectedMetrics?.flyOneCm) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-28" />
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">游了多远</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="hasMetrics">
                {{ formatDistance(selectedMetrics?.swimOneCm) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-28" />
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
              <template v-if="hasMetrics">
                {{ formatTicksToDays(selectedMetrics?.totalWorldTime) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-32" />
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
              <template v-if="hasMetrics">
                {{ formatTimes(selectedMetrics?.playerKills) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-28" />
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">死亡多少次</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="hasMetrics">
                {{ formatTimes(selectedMetrics?.deaths) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-28" />
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">跳了多少次</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="hasMetrics">
                {{ formatTimes(selectedMetrics?.jump) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-28" />
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">游玩时间</p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              <template v-if="hasMetrics">
                {{ formatTicksToHours(selectedMetrics?.playTime) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-28" />
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
              <template v-if="hasMetrics">
                {{ formatTimes(selectedMetrics?.useWand) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-28" />
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
              <template v-if="hasMetrics">
                {{ formatTimes(selectedMetrics?.leaveGame) }}
              </template>
              <template v-else>
                <USkeleton class="h-6 w-28" />
              </template>
            </p>
          </div>

          <div
            class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800 md:col-span-2"
          >
            <p class="text-xs text-slate-500 dark:text-slate-500">
              最近一次 MTR 操作

              <span
                class="font-semibold text-xs text-slate-500 dark:text-slate-500"
              >
                {{ formattedMtrDescription }}
              </span>
            </p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              {{ formattedMtrTimestamp }}
            </p>
            <p
              v-if="mtrErrorMessage"
              class="text-xs text-rose-500 dark:text-rose-400 mt-1"
            >
              {{ mtrErrorMessage }}
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
            class="col-span-2 row-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white backdrop-blur dark:bg-slate-800 overflow-hidden"
          >
            <USkeleton class="h-44" />
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
