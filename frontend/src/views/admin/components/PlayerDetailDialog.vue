<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import dayjs from 'dayjs'
import type { IdleAnimation, SkinViewer } from 'skinview3d'
import type { AdminPlayerEntry } from '@/types/admin'
import type {
  PlayerGameStatsResponse,
  PlayerStatsResponse,
} from '@/types/portal'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  open: boolean
  username: string | null
  initialPlayer?: AdminPlayerEntry | null
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (
    event: 'openUser',
    payload: {
      id: string
      email?: string | null
      displayName?: string | null
    },
  ): void
}>()

const auth = useAuthStore()
const loading = ref(false)
const error = ref<string | null>(null)
const player = ref<AdminPlayerEntry | null>(props.initialPlayer ?? null)
const playerStatsData = ref<PlayerStatsResponse | null>(null)
const playerGameStatsData = ref<PlayerGameStatsResponse | null>(null)
const selectedServerId = ref<string | null>(null)
const statsLoading = ref(false)
const serverLoading = ref(false)

watch(
  () => props.initialPlayer,
  (value) => {
    if (value) {
      player.value = value
    }
  },
)

function resolvePreferredPlayerIdentifier(
  entry: AdminPlayerEntry | null,
): string | null {
  if (!entry) return null
  const realname = entry.authme?.realname?.trim()
  if (realname) return realname
  const boundRealname = entry.binding?.authmeRealname?.trim()
  if (boundRealname) return boundRealname
  const username = entry.authme?.username?.trim()
  if (username) return username
  const boundUsername = entry.binding?.authmeUsername?.trim()
  if (boundUsername) return boundUsername
  return null
}

function matchesPlayerIdentifier(
  entry: AdminPlayerEntry | null,
  candidate?: string | null,
) {
  if (!candidate) return false
  const normalized = candidate.trim().toLowerCase()
  if (!normalized) return false
  return [
    entry?.authme?.realname,
    entry?.binding?.authmeRealname,
    entry?.authme?.username,
    entry?.binding?.authmeUsername,
  ].some((value) => {
    const trimmed = value?.trim()
    if (!trimmed) return false
    return trimmed.toLowerCase() === normalized
  })
}

async function loadPlayer(username: string) {
  const normalized = username.trim()
  if (!normalized) return
  if (!auth.token) {
    if (!player.value) {
      error.value = '未登录，无法加载玩家信息'
    }
    return
  }
  loading.value = true
  error.value = null
  try {
    const response = await apiFetch<{
      player: AdminPlayerEntry | null
      sourceStatus: 'ok' | 'degraded'
    }>(`/auth/players/${encodeURIComponent(normalized)}`, {
      token: auth.token,
    })
    const found = response.player ?? null
    player.value = found
    if (!found) {
      error.value = '未找到匹配的玩家'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载玩家信息失败'
  } finally {
    loading.value = false
  }
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
let viewer: SkinViewer | null = null
let idleAnimationInstance: IdleAnimation | null = null
let skinviewModule: typeof import('skinview3d') | null = null

async function ensureSkinview() {
  if (!skinviewModule) {
    skinviewModule = await import('skinview3d')
  }
  return skinviewModule
}

async function updateViewer() {
  if (!props.open) return
  if (typeof window === 'undefined') return
  const identifier = resolvePreferredPlayerIdentifier(player.value)
  if (!identifier) return
  const canvas = canvasRef.value
  if (!canvas) return
  const skinview = await ensureSkinview()
  const width = canvas.clientWidth > 0 ? canvas.clientWidth : 320
  const height =
    canvas.clientHeight > 0 ? canvas.clientHeight : Math.round(width * 1.2)
  canvas.width = width
  canvas.height = height
  if (!viewer) {
    const instance = new skinview.SkinViewer({
      canvas,
      width,
      height,
      skin: `https://mc-heads.hydcraft.cn/skin/${encodeURIComponent(
        identifier,
      )}`,
    })
    instance.autoRotate = true
    instance.zoom = 0.95
    if (instance.controls) {
      instance.controls.enableZoom = false
      instance.controls.enablePan = false
    }
    idleAnimationInstance = new skinview.IdleAnimation()
    instance.animation = idleAnimationInstance
    viewer = instance
  } else {
    viewer.width = width
    viewer.height = height
    viewer.loadSkin(
      `https://mc-heads.hydcraft.cn/skin/${encodeURIComponent(identifier)}`,
    )
  }
}

function cleanupViewer() {
  if (viewer) {
    viewer.dispose()
  }
  viewer = null
  idleAnimationInstance = null
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      cleanupViewer()
      error.value = null
      loading.value = false
      return
    }
    const target =
      props.username ?? resolvePreferredPlayerIdentifier(player.value)
    if (target) {
      if (!matchesPlayerIdentifier(player.value, target)) {
        await loadPlayer(target)
      }
    } else if (!player.value) {
      error.value = '未提供玩家标识'
    }
    await nextTick()
    await updateViewer()
  },
  { immediate: true },
)

watch(
  () => props.username,
  async (next, prev) => {
    if (!props.open || !next || next === prev) return
    if (!matchesPlayerIdentifier(player.value, next)) {
      await loadPlayer(next)
    }
    await nextTick()
    await updateViewer()
  },
)

watch(player, async () => {
  if (!props.open) return
  await nextTick()
  await updateViewer()
})

onBeforeUnmount(() => {
  cleanupViewer()
})

function fmtMillis(value?: number | null) {
  if (!value) return '—'
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

function fmtIso(value?: string | null) {
  if (!value) return '—'
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

const usernameDisplay = computed(
  () => resolvePreferredPlayerIdentifier(player.value) ?? props.username ?? '—',
)
const realnameDisplay = computed(
  () =>
    player.value?.authme?.realname ??
    player.value?.binding?.authmeRealname ??
    '—',
)
const uuidDisplay = computed(() => {
  if (player.value?.binding?.authmeUuid) {
    return player.value.binding.authmeUuid
  }
  if (
    player.value?.authme?.uuid !== undefined &&
    player.value.authme.uuid !== null
  ) {
    return String(player.value.authme.uuid)
  }
  return '—'
})
const headUrl = computed(() => {
  if (!usernameDisplay.value || usernameDisplay.value === '—') return ''
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(usernameDisplay.value)}/128`
})
const bodyUrl = computed(() => {
  if (!usernameDisplay.value || usernameDisplay.value === '—') return ''
  return `https://mc-heads.hydcraft.cn/body/${encodeURIComponent(usernameDisplay.value)}/160`
})
const bindingInfo = computed(() => player.value?.binding ?? null)
const bindingStatus = computed(() => {
  const binding = bindingInfo.value as { status?: string | null } | null
  return binding?.status ?? '未绑定'
})
const bindingUserSummary = computed(() => {
  const user = bindingInfo.value?.user
  if (!user?.id) return null
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: user.profile?.displayName ?? user.name ?? null,
  }
})
const historyItems = computed(() => player.value?.history ?? [])

const lastLoginInfo = computed(() => ({
  time: fmtMillis(player.value?.authme?.lastlogin ?? null),
  ip: player.value?.authme?.ip ?? '—',
  location:
    player.value?.authme?.ipLocation ??
    player.value?.authme?.ip_location_display ??
    '',
}))

const registerInfo = computed(() => ({
  time: fmtMillis(player.value?.authme?.regdate ?? null),
  ip: player.value?.authme?.regip ?? '—',
  location:
    player.value?.authme?.regipLocation ??
    player.value?.authme?.regip_location_display ??
    '',
}))

const targetUserId = computed(() => player.value?.binding?.user?.id ?? null)
const bindingId = computed(() => player.value?.binding?.id ?? null)
const serverOptions = computed(() =>
  (playerGameStatsData.value?.servers ?? []).map((server) => ({
    id: server.serverId,
    displayName: server.serverName,
  })),
)
const selectedServer = computed(() => {
  if (!playerGameStatsData.value?.servers?.length) return null
  return (
    playerGameStatsData.value.servers.find(
      (server) => server.serverId === selectedServerId.value,
    ) ?? playerGameStatsData.value.servers[0]
  )
})
const selectedServerMetrics = computed(
  () => selectedServer.value?.metrics ?? null,
)
const identityMissing = computed(() =>
  Boolean(playerGameStatsData.value?.identityMissing),
)
const selectedServerMessage = computed(() => {
  const server = selectedServer.value
  if (!server) return null
  if (server.errorMessage) {
    return server.errorMessage
  }
  if (server.error) {
    return '该服务器的游戏统计暂不可用'
  }
  return null
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

const formatMetricValue = (value: number, unit: string) =>
  `${numberFormatter.format(value)} ${unit}`

const formatDistance = (value: number | null | undefined) => {
  const kilometers = (value ?? 0) / 100000
  return `${kmFormatter.format(kilometers)} km`
}

const formatTicksToHours = (value: number | null | undefined) => {
  const safeValue = value ?? 0
  if (!Number.isFinite(safeValue)) return '—'
  return `${decimalFormatter.format(safeValue / 72000)} 小时`
}

const formatTicksToDays = (value: number | null | undefined) => {
  const safeValue = value ?? 0
  const days = safeValue / 1728000
  if (Number.isFinite(days) && days >= 1) {
    return `${decimalFormatter.format(days)} 天`
  }
  return formatTicksToHours(safeValue)
}

const formatServerUpdatedAt = (value: string | null) => {
  if (!value) return '更新时间未知'
  return dayjs(value).format('YYYY/MM/DD HH:mm:ss')
}

const formatTimes = (value: number | null | undefined, unit = '次') => {
  const safeValue = value ?? 0
  return `${numberFormatter.format(safeValue)} ${unit}`
}

function closeDialog() {
  emit('update:open', false)
}

function openBoundUser() {
  const summary = bindingUserSummary.value
  if (!summary) return
  emit('openUser', summary)
}

async function loadPlayerStats(userId: string) {
  if (!auth.token) return
  statsLoading.value = true
  try {
    playerStatsData.value = await apiFetch<PlayerStatsResponse>(
      `/player/stats?id=${encodeURIComponent(userId)}`,
      { token: auth.token },
    )
  } catch (error) {
    console.warn('[admin] load player stats failed', error)
    playerStatsData.value = null
  } finally {
    statsLoading.value = false
  }
}

async function loadGameStats(
  userId: string,
  bindingIdValue: string,
  serverId?: string | null,
) {
  if (!auth.token) return
  if (serverId) {
    serverLoading.value = true
  }
  try {
    const params = new URLSearchParams({
      bindingId: bindingIdValue,
      id: userId,
    })
    if (serverId) {
      params.set('serverId', serverId)
    }
    const response = await apiFetch<PlayerGameStatsResponse>(
      `/player/game-stats?${params.toString()}`,
      { token: auth.token },
    )
    if (!serverId) {
      playerGameStatsData.value = response
      return
    }
    const updatedServer = response.servers?.[0]
    if (!updatedServer) return
    const current = playerGameStatsData.value
    if (!current) {
      playerGameStatsData.value = response
      return
    }
    const nextServers = current.servers.map((server) =>
      server.serverId === updatedServer.serverId ? updatedServer : server,
    )
    playerGameStatsData.value = {
      ...current,
      identity: response.identity ??
        current.identity ?? { uuid: null, name: null },
      identityMissing:
        typeof response.identityMissing === 'boolean'
          ? response.identityMissing
          : current.identityMissing,
      updatedAt: response.updatedAt ?? current.updatedAt,
      servers: nextServers,
    }
  } catch (error) {
    console.warn('[admin] load game stats failed', error)
  } finally {
    if (serverId) {
      serverLoading.value = false
    }
  }
}

async function refreshAllStats(userId: string, bindingIdValue: string) {
  playerStatsData.value = null
  playerGameStatsData.value = null
  selectedServerId.value = null
  await Promise.all([
    loadPlayerStats(userId),
    loadGameStats(userId, bindingIdValue),
  ])
}

async function refreshCurrentServerStats() {
  if (!targetUserId.value || !bindingId.value || !selectedServerId.value) return
  await loadGameStats(
    targetUserId.value,
    bindingId.value,
    selectedServerId.value,
  )
}

watch(
  () => [props.open, targetUserId.value, bindingId.value],
  ([open, userId, bindId]) => {
    if (!open) {
      playerStatsData.value = null
      playerGameStatsData.value = null
      selectedServerId.value = null
      return
    }
    if (userId && bindId) {
      void refreshAllStats(userId, bindId)
    }
  },
  { immediate: true },
)

watch(
  () => playerGameStatsData.value?.servers,
  (servers) => {
    if (!servers?.length) {
      selectedServerId.value = null
      return
    }
    if (!selectedServerId.value) {
      const candidate =
        servers.find((server) => Boolean(server.metrics)) ?? servers[0]
      selectedServerId.value = candidate.serverId
    }
  },
  { immediate: true },
)

watch(selectedServerId, (serverId, previous) => {
  if (!serverId || serverId === previous) return
  if (!targetUserId.value || !bindingId.value) return
  void loadGameStats(targetUserId.value, bindingId.value, serverId)
})
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="(value) => emit('update:open', value)"
    :ui="{
      content:
        'w-full max-w-4xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="flex h-full max-h-[90vh] flex-col">
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800"
        >
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              玩家资料
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ realnameDisplay }}
            </h3>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              v-if="bindingUserSummary"
              color="primary"
              size="xs"
              variant="soft"
              @click="openBoundUser"
            >
              查看绑定用户
            </UButton>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="closeDialog"
            />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div
            v-if="loading"
            class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400"
          >
            <UIcon name="i-lucide-loader-2" class="mr-2 h-4 w-4 animate-spin" />
            正在加载玩家信息
          </div>
          <UAlert
            v-else-if="error"
            color="error"
            variant="soft"
            class="rounded-xl"
          >
            {{ error }}
          </UAlert>
          <div v-else-if="player" class="space-y-6 text-sm">
            <div class="grid gap-6 md:grid-cols-[minmax(0,260px)_1fr]">
              <div class="flex flex-col items-center gap-3">
                <canvas
                  ref="canvasRef"
                  width="320"
                  height="360"
                  class="h-64 w-full max-w-xs rounded-2xl border border-slate-200 bg-slate-200/70 shadow-inner dark:border-slate-200"
                />
                <div class="flex items-center gap-3">
                  <img
                    v-if="headUrl"
                    :src="headUrl"
                    alt="玩家头像"
                    class="h-6 w-6 rounded border border-slate-200 bg-white object-cover dark:border-slate-200"
                  />
                  <img
                    v-if="bodyUrl"
                    :src="bodyUrl"
                    alt="玩家模型"
                    class="h-10 rounded object-cover dark:border-slate-700"
                  />
                </div>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">
                    游戏 ID
                  </div>
                  <div
                    class="flex flex-col text-lg font-semibold text-slate-900 dark:text-white"
                  >
                    <span>
                      {{ realnameDisplay }}
                    </span>
                    <span
                      class="text-slate-500 dark:text-slate-400 text-xs font-medium"
                      >{{ uuidDisplay }}</span
                    >
                  </div>
                </div>

                <div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">
                    绑定状态
                  </div>
                  <div
                    class="text-lg font-semibold text-slate-900 dark:text-white"
                  >
                    {{ bindingStatus }}
                  </div>
                  <div
                    v-if="bindingInfo?.boundAt"
                    class="text-[11px] text-slate-500 dark:text-slate-400"
                  >
                    绑定于 {{ fmtIso(bindingInfo.boundAt) }}
                  </div>
                </div>

                <div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">
                    最近登录时间
                  </div>
                  <div
                    class="text-lg font-semibold text-slate-900 dark:text-white"
                  >
                    {{ lastLoginInfo.time }}
                  </div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">
                    {{ lastLoginInfo.ip }}
                    <span class="block leading-tight">
                      {{ lastLoginInfo.location }}
                    </span>
                  </div>
                </div>

                <div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">
                    注册时间
                  </div>
                  <div
                    class="text-lg font-semibold text-slate-900 dark:text-white"
                  >
                    {{ registerInfo.time }}
                  </div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">
                    {{ registerInfo.ip }}
                    <span class="block leading-tight">
                      {{ registerInfo.location }}
                    </span>
                  </div>
                </div>

                <div class="sm:col-span-2">
                  <div class="text-xs text-slate-500 dark:text-slate-400">
                    最近绑定事件
                  </div>
                  <ul v-if="historyItems.length" class="mt-2 space-y-2">
                    <li
                      v-for="entry in historyItems.slice(0, 5)"
                      :key="entry.id"
                      class="rounded-xl border border-slate-200/70 p-3 text-xs dark:border-slate-800/70"
                    >
                      <div class="flex items-center justify-between">
                        <span class="font-semibold">{{ entry.action }}</span>
                        <span>{{ fmtIso(entry.createdAt) }}</span>
                      </div>
                      <div
                        class="mt-1 text-[11px] text-slate-500 dark:text-slate-400"
                      >
                        {{ entry.reason ?? '无备注' }}
                      </div>
                      <div
                        class="mt-1 text-[11px] text-slate-500 dark:text-slate-400"
                      >
                        操作人：{{
                          entry.operator?.profile?.displayName ??
                          entry.operator?.email ??
                          '系统'
                        }}
                      </div>
                    </li>
                  </ul>
                  <p
                    v-else
                    class="mt-2 text-sm text-slate-500 dark:text-slate-400"
                  >
                    暂无绑定历史
                  </p>
                </div>
              </div>
            </div>
            <div
              class="mt-6 rounded-2xl border border-slate-200/70 bg-white/70 p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/40"
            >
              <div class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p
                      class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      统计信息
                    </p>
                    <h4
                      class="text-lg font-semibold text-slate-900 dark:text-white"
                    >
                      游戏统计
                    </h4>
                  </div>
                  <div class="flex items-center gap-2">
                    <USelectMenu
                      v-model="selectedServerId"
                      :items="serverOptions"
                      value-key="id"
                      label-key="displayName"
                      placeholder="选择服务器"
                      :disabled="serverOptions.length === 0"
                      class="w-44"
                      size="xs"
                    />
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-refresh-ccw"
                      :loading="serverLoading"
                      :disabled="!selectedServerId"
                      @click="refreshCurrentServerStats"
                    />
                  </div>
                </div>

                <div v-if="statsLoading" class="grid grid-cols-2 gap-3">
                  <USkeleton
                    class="h-16 rounded-xl"
                    v-for="index in 4"
                    :key="index"
                  />
                </div>
                <div v-else class="grid grid-cols-2 gap-3">
                  <div
                    v-for="metric in playerStatsData?.metrics ?? []"
                    :key="metric.id"
                    class="rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-3 text-sm dark:border-slate-800/70 dark:bg-slate-900/40"
                  >
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      {{ metric.label }}
                    </p>
                    <p
                      class="text-xl font-semibold text-slate-900 dark:text-white"
                    >
                      {{ formatMetricValue(metric.value, metric.unit) }}
                    </p>
                  </div>
                </div>

                <UAlert
                  v-if="identityMissing"
                  icon="i-lucide-alert-triangle"
                  color="warning"
                  variant="soft"
                  title="缺少 AuthMe 绑定"
                  description="未找到有效的 AuthMe 账户，无法获取游戏统计信息。"
                />

                <div v-if="selectedServer" class="space-y-3">
                  <div
                    class="rounded-xl border border-slate-200/70 bg-white/80 p-4 shadow-inner dark:border-slate-800/70 dark:bg-slate-900/40"
                  >
                    <div class="flex items-center justify-between">
                      <div
                        class="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        {{ selectedServer.serverName }}
                      </div>
                      <div class="text-xs text-slate-500 dark:text-slate-400">
                        更新于
                        {{ formatServerUpdatedAt(selectedServer.fetchedAt) }}
                      </div>
                    </div>
                    <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                          走了多远
                        </p>
                        <p
                          class="text-lg font-semibold text-slate-900 dark:text-white"
                        >
                          {{ formatDistance(selectedServerMetrics?.walkOneCm) }}
                        </p>
                      </div>
                      <div>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                          飞了多远
                        </p>
                        <p
                          class="text-lg font-semibold text-slate-900 dark:text-white"
                        >
                          {{ formatDistance(selectedServerMetrics?.flyOneCm) }}
                        </p>
                      </div>
                      <div>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                          上线时长
                        </p>
                        <p
                          class="text-lg font-semibold text-slate-900 dark:text-white"
                        >
                          {{
                            formatTicksToHours(selectedServerMetrics?.playTime)
                          }}
                        </p>
                      </div>
                      <div>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                          击杀 / 死亡
                        </p>
                        <p
                          class="text-lg font-semibold text-slate-900 dark:text-white"
                        >
                          {{ formatTimes(selectedServerMetrics?.playerKills) }}
                          /
                          {{ formatTimes(selectedServerMetrics?.deaths) }}
                        </p>
                      </div>
                    </div>
                    <UAlert
                      v-if="selectedServerMessage"
                      class="mt-3"
                      color="warning"
                      variant="soft"
                    >
                      {{ selectedServerMessage }}
                    </UAlert>
                  </div>
                </div>
                <div v-else class="text-sm text-slate-500 dark:text-slate-400">
                  暂无可展示的服务器统计数据
                </div>
              </div>
            </div>
          </div>
          <div
            v-else
            class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400"
          >
            暂无可展示的玩家信息
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
