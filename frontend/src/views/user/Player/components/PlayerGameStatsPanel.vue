<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import dayjs from 'dayjs'
import 'leaflet/dist/leaflet.css'
import { Marker, divIcon } from 'leaflet'
import type {
  PlayerGameServerStat,
  PlayerStatsResponse,
  PlayerSummary,
  PlayerGameStatsResponse,
} from '@/types/portal'
import { usePlayerPortalStore } from '@/stores/user/playerPortal'
import {
  createHydcraftDynmapMap,
  DynmapMapController,
  hydcraftDynmapSource,
  type DynmapBlockPoint,
} from '@/utils/map'

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
const mapContainerRef = ref<HTMLElement | null>(null)
const dynmapController = ref<DynmapMapController | null>(null)
const mapIsInitializing = ref(false)
const mapHasLoaded = ref(false)
const mapErrorMessage = ref<string | null>(null)
const defaultMapCenter: DynmapBlockPoint =
  hydcraftDynmapSource.defaultCenter ?? { x: 0, z: 0 }
const preferredMapCenter = computed<DynmapBlockPoint>(() => {
  const origin = selectedServer.value?.nbtPosition
  if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.z)) {
    return { x: origin.x, z: origin.z }
  }
  return defaultMapCenter
})
const pointerBlockCoord = ref<DynmapBlockPoint | null>(null)
const mapCursorCleanup = ref<(() => void) | null>(null)
const lastLoginMarker = ref<Marker | null>(null)
const teardownMapInstance = () => {
  mapCursorCleanup.value?.()
  mapCursorCleanup.value = null
  pointerBlockCoord.value = null
  // 清理上次登录标记
  if (lastLoginMarker.value) {
    const map = dynmapController.value?.getLeafletInstance()
    map?.removeLayer(lastLoginMarker.value)
    lastLoginMarker.value = null
  }
  dynmapController.value?.destroy()
  dynmapController.value = null
}

const gameStats = computed(() => props.stats?.gameStats ?? null)
const servers = computed<PlayerGameServerStat[]>(
  () => gameStats.value?.servers ?? [],
)

watch(
  () => servers.value,
  (next) => {
    if (!next.length) {
      selectedServerId.value = undefined
      return
    }
    const current = next.find(
      (server) => server.serverId === selectedServerId.value,
    )
    if (current) {
      return
    }
    const candidate = next.find((server) => server.metrics) ?? next[0]
    selectedServerId.value = candidate?.serverId ?? undefined
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

const formatAchievementsCount = (value: number | null | undefined) => {
  if (!hasMetrics.value) return '—'
  if (value == null) return '—'
  return numberFormatter.format(value)
}

const formattedMtrTimestamp = computed(() => {
  const log = selectedServer.value?.lastMtrLog
  if (!log) return null
  if (log.timestamp) {
    return dayjs(log.timestamp).format('YYYY/MM/DD HH:mm:ss')
  }
  if (log.rawTimestamp) {
    return log.rawTimestamp
  }
  return null
})

const formattedMtrDaysAgo = computed(() => {
  const log = selectedServer.value?.lastMtrLog
  if (!log || !log.timestamp) return '—'
  const days = dayjs().diff(dayjs(log.timestamp), 'day')
  return `${days}天前`
})

const formattedMtrDescription = computed(() => {
  const log = selectedServer.value?.lastMtrLog
  if (!log) return null
  return log.description ?? null
})

const formattedMtrBalance = computed(() => {
  const balance = selectedServer.value?.mtrBalance
  if (balance == null) {
    return '—'
  }
  return numberFormatter.format(balance)
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
const statsReady = computed(() => Boolean(props.stats))

const showStatsGrid = computed(() => Boolean(props.stats && hasServers.value))
const showNoServersMessage = computed(() =>
  Boolean(props.stats && !hasServers.value),
)
const formatBlockCoordinate = (value: number) => Math.round(value)

type LeafletLatLngExpression = [number, number] | { lat: number; lng: number }
type LeafletMouseMoveEvent = { latlng: { lat: number; lng: number } }

const initializeDynmap = async (root?: HTMLElement | null) => {
  const container = root ?? mapContainerRef.value
  if (!container) return
  mapIsInitializing.value = true
  mapHasLoaded.value = false
  mapErrorMessage.value = null
  try {
    teardownMapInstance()
    const controller = createHydcraftDynmapMap()
    controller.mount({
      container,
      center: preferredMapCenter.value,
      showZoomControl: false,
    })
    dynmapController.value = controller
    attachMapCursorTracking(controller)
    mapHasLoaded.value = true
    focusMapOnPreferredCenter()
    updateLastLoginMarker()
  } catch (error) {
    console.error(error)
    mapErrorMessage.value =
      error instanceof Error ? error.message : '地图加载失败，请稍后重试'
  } finally {
    mapIsInitializing.value = false
  }
}

const updateLastLoginMarker = () => {
  const controller = dynmapController.value
  const map = controller?.getLeafletInstance()
  // 移除旧标记
  if (lastLoginMarker.value) {
    map?.removeLayer(lastLoginMarker.value)
    lastLoginMarker.value = null
  }
  if (!controller || !map || !mapHasLoaded.value) return
  const pos = selectedServer.value?.nbtPosition
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return
  const latlng = controller.toLatLng({
    x: pos.x,
    z: pos.z,
  }) as LeafletLatLngExpression
  const icon = divIcon({
    className: 'hc-login-dot',
    html: '<div class="hc-login-dot-inner w-4 h-4 rounded-full border-3 border-white bg-primary shadow-[0_0_16px_4px_var(--background-light-3)]"></div>',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
  const marker = new Marker(latlng, {
    icon,
    interactive: false,
    zIndexOffset: 1000,
  })
  marker.addTo(map)
  lastLoginMarker.value = marker
}

const attachMapCursorTracking = (controller: DynmapMapController) => {
  mapCursorCleanup.value?.()
  pointerBlockCoord.value = null
  const map = controller.getLeafletInstance()
  if (!map) return

  const handleMove = (event: LeafletMouseMoveEvent) => {
    pointerBlockCoord.value = controller.fromLatLng(event.latlng)
  }
  const handleLeave = () => {
    pointerBlockCoord.value = null
  }

  map.on('mousemove', handleMove)
  map.on('mouseout', handleLeave)
  mapCursorCleanup.value = () => {
    map.off('mousemove', handleMove)
    map.off('mouseout', handleLeave)
  }
}

const focusMapOnPreferredCenter = () => {
  if (!dynmapController.value || !mapHasLoaded.value) return
  dynmapController.value.flyToBlock(preferredMapCenter.value)
}

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

watch(
  () => [showStatsGrid.value, mapContainerRef.value] as const,
  async ([visible, container]) => {
    if (visible && container) {
      if (dynmapController.value) return
      await initializeDynmap(container)
    } else {
      teardownMapInstance()
      mapHasLoaded.value = false
    }
  },
  { immediate: true },
)

watch(
  () => preferredMapCenter.value,
  (center, prev) => {
    if (!dynmapController.value || !mapHasLoaded.value) return
    if (prev && center.x === prev.x && center.z === prev.z) return
    dynmapController.value.flyToBlock(center)
  },
)

watch(
  () => selectedServer.value?.nbtPosition,
  () => {
    updateLastLoginMarker()
  },
)

onBeforeUnmount(() => {
  teardownMapInstance()
})
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-4">
      <div
        class="flex flex-col md:flex-row gap-1.5 items-start md:items-center justify-between mb-3 md:mb-1"
      >
        <div class="flex gap-0.5 px-1">
          <span class="text-lg text-slate-600 dark:text-slate-300">
            游戏数据
          </span>

          <UTooltip
            v-if="props.isViewingSelf"
            text="刷新数据"
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
          class="flex flex-col w-full md:w-fit md:gap-2 md:flex-row md:items-center px-1 md:px-0"
        >
          <template v-if="props.stats">
            <span class="text-xs text-slate-400 dark:text-slate-500">
              {{ latestUpdateLabel }}
            </span>
          </template>
          <template v-else>
            <USkeleton class="h-4 w-32" />
          </template>
          <div class="flex mt-1 md:mt-0 items-center gap-2">
            <template v-if="playerOptions.length">
              <USelectMenu
                v-model="selectedPlayerId"
                :items="playerOptions"
                value-key="id"
                label-key="label"
                placeholder="选择玩家"
                class="w-full max-w-40"
                size="xs"
              >
                <template #item="{ item }">
                  <div class="flex items-center gap-2">
                    <img
                      :src="item.avatarUrl"
                      :alt="item.label"
                      class="block h-4 w-4 rounded-sm border border-slate-200 dark:border-slate-700"
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
                      class="h-4 w-4 rounded-sm border border-slate-200 dark:border-slate-700"
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
            </template>

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

      <div
        class="overflow-hidden transition-[max-height] duration-280 ease-in-out"
        :style="{ maxHeight: statsReady ? '2000px' : '200px' }"
      >
        <div v-if="props.stats" class="space-y-3">
          <UAlert
            v-if="gameStats?.identityMissing"
            icon="i-lucide-alert-triangle"
            color="warning"
            variant="soft"
            title="缺少 AuthMe 绑定"
            description="未找到有效的 AuthMe 账户，无法向 Beacon 请求游戏统计信息。"
          />
          <div v-if="showStatsGrid">
            <div
              class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white backdrop-blur dark:bg-slate-800 overflow-hidden min-h-64"
            >
              <div class="relative flex min-h-64 bg-black">
                <div
                  v-if="mapIsInitializing && !mapHasLoaded"
                  class="absolute inset-0 flex items-center justify-center"
                >
                  <USkeleton class="h-12 w-32" />
                </div>
                <div
                  v-else-if="mapErrorMessage"
                  class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-rose-500 dark:text-rose-400"
                >
                  <span>{{ mapErrorMessage }}</span>
                  <UButton
                    size="xs"
                    variant="solid"
                    color="primary"
                    @click="() => initializeDynmap()"
                  >
                    重试
                  </UButton>
                </div>
                <div
                  ref="mapContainerRef"
                  class="absolute inset-0 bg-black!"
                ></div>

                <div
                  class="absolute inset-0 bg-[linear-gradient(180deg,transparent_75%,var(--background-dark-2)_125%)] z-998 p-3 pointer-events-none flex items-end transition duration-200"
                >
                  <div
                    class="rounded-lg text-xs text-white flex items-end justify-between w-full"
                    style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)"
                  >
                    <div class="text-xl font-semibold">
                      <span class="text-xs mr-1">上次登录</span>
                      <span v-if="selectedServer && selectedServer.nbtPosition">
                        {{
                          formatBlockCoordinate(selectedServer.nbtPosition.x)
                        }},
                        {{
                          formatBlockCoordinate(selectedServer.nbtPosition.z)
                        }}
                      </span>
                      <span v-else>—</span>
                    </div>

                    <transition
                      enter-active-class="transition-opacity duration-200"
                      enter-from-class="opacity-0"
                      enter-to-class="opacity-100"
                      leave-active-class="transition-opacity duration-200"
                      leave-from-class="opacity-100"
                      leave-to-class="opacity-0"
                    >
                      <div
                        v-if="
                          pointerBlockCoord && mapHasLoaded && !mapErrorMessage
                        "
                      >
                        {{ formatBlockCoordinate(pointerBlockCoord.x) }},
                        {{ formatBlockCoordinate(pointerBlockCoord.z) }}
                      </div>
                    </transition>
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-3 grid gap-2 md:grid-cols-4">
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  走了多远
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formatDistance(selectedMetrics?.walkOneCm) }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  飞了多远
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formatDistance(selectedMetrics?.flyOneCm) }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  游了多远
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formatDistance(selectedMetrics?.swimOneCm) }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  已达成成就
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{
                    formatAchievementsCount(selectedServer?.achievementsTotal)
                  }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  被人杀了多少次
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formatTimes(selectedMetrics?.playerKills) }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  总共死了几次
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formatTimes(selectedMetrics?.deaths) }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  跳了多少次
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formatTimes(selectedMetrics?.jump) }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  游玩时间
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formatTicksToHours(selectedMetrics?.playTime) }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  用建筑手杖放了多少方块
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formatTimes(selectedMetrics?.useWand) }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  退出游戏几次
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formatTimes(selectedMetrics?.leaveGame) }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  MTR 余额
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ formattedMtrBalance }}
                </p>
              </div>
              <div
                class="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p
                  class="flex gap-1 items-center text-xs text-slate-500 dark:text-slate-500"
                >
                  <span> 最近 MTR 操作 </span>
                  <UTooltip
                    :text="formattedMtrTimestamp"
                    v-if="formattedMtrTimestamp && !isLoadingGameStats"
                  >
                    <UBadge variant="soft" size="xs">
                      {{ formattedMtrDaysAgo }}
                    </UBadge>
                  </UTooltip>
                </p>
                <p
                  class="line-clamp-1 truncate text-xl font-semibold text-slate-900 dark:text-white"
                >
                  {{ formattedMtrDescription ?? '—' }}
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
          <div v-else>
            <div
              class="min-h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white backdrop-blur dark:bg-slate-800 overflow-hidden"
            >
              <USkeleton class="h-64" />
            </div>
          </div>
        </div>
        <div
          v-else
          class="flex min-h-[180px] items-center justify-center text-slate-500 dark:text-slate-400"
        >
          <UIcon name="i-lucide-loader-2" class="h-6 w-6 animate-spin" />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* 使用 :global 以确保作用于 Leaflet 创建的 DOM（不受 SFC scoped 限制） */
:global(.hc-login-dot) {
  pointer-events: none;
}
:global(.hc-login-dot-inner) {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background: #f59e0b; /* 主题橙色 */
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.8);
}
</style>
