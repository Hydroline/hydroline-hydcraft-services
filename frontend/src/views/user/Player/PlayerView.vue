<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/user/auth'
import { usePlayerPortalStore } from '@/stores/user/playerPortal'
import { ApiError, apiFetch } from '@/utils/http/api'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'
import PlayerLoginPrompt from './components/PlayerLoginPrompt.vue'
import PlayerProfileContent from './components/PlayerProfileContent.vue'
import PlayerAuthmeProfileContent from './components/PlayerAuthmeProfileContent.vue'

const auth = useAuthStore()
const playerStore = usePlayerPortalStore()
let loggedPoller: ReturnType<typeof setInterval> | null = null
const route = useRoute()
function normalizeRouteParam(param: string | string[] | undefined | null) {
  if (!param) {
    return null
  }
  if (Array.isArray(param)) {
    return param[0] ?? null
  }
  const trimmed = param.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isLikelyUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
}

const serverOptions = ref<Array<{ id: string; displayName: string }>>([])
const routePlayerIdParam = computed(() =>
  normalizeRouteParam(route.params.playerId),
)
const routePlayerNameParam = computed(() =>
  normalizeRouteParam(route.params.playerName),
)
const isPlayerNameRoute = computed(() => route.name === 'player.name')
const lifecycleSources = [
  'portal.player.authme-reset',
  'portal.player.force-login',
  'portal.player.permission-adjust',
]
const restartDialog = reactive({
  open: false,
  serverId: '',
  reason: '',
})
const toast = useToast()

const targetPlayerParam = computed(() => {
  return routePlayerNameParam.value ?? routePlayerIdParam.value ?? null
})

const canViewProfile = computed(
  () =>
    Boolean(routePlayerNameParam.value) ||
    Boolean(routePlayerIdParam.value) ||
    auth.isAuthenticated,
)

const shouldTreatAsPlayerName = computed(
  () => isPlayerNameRoute.value || Boolean(routePlayerNameParam.value),
)

const isViewingSelf = computed(() => {
  if (!auth.user?.id || !playerStore.targetUserId) {
    return false
  }
  return auth.user.id === playerStore.targetUserId
})

const summary = computed(() => playerStore.summary)
const region = computed(() => playerStore.region)
const minecraft = computed(() => playerStore.minecraft)
const stats = computed(() => playerStore.stats)
const statusSnapshot = computed(() => playerStore.statusSnapshot)
const authmeProfile = computed(() => playerStore.authmeProfile)
const authmeBindings = computed(() => {
  if (!authmeProfile.value) {
    return []
  }
  return [
    {
      id: `authme-${authmeProfile.value.username}`,
      username: authmeProfile.value.username,
      realname: authmeProfile.value.realname,
      uuid: authmeProfile.value.uuid,
      boundAt: authmeProfile.value.boundAt ?? new Date().toISOString(),
      status: authmeProfile.value.status ?? 'ACTIVE',
      notes: null,
      boundByIp: null,
      lastlogin: authmeProfile.value.lastlogin,
      regdate: authmeProfile.value.regdate,
      lastKnownLocation: authmeProfile.value.lastKnownLocation,
      lastLoginLocation: authmeProfile.value.ipLocation,
      regIpLocation: authmeProfile.value.regIpLocation,
    },
  ]
})

async function loadServerOptions() {
  const publicServers = await apiFetch<{
    servers: Array<{ id: string; displayName: string }>
  }>('/portal/header/minecraft-status')
  serverOptions.value = publicServers.servers ?? []
}

async function loadProfile() {
  if (!canViewProfile.value) {
    playerStore.reset()
    return
  }
  const routeIdentifier = targetPlayerParam.value
  const fallbackId = auth.user?.id ?? undefined
  const resolvedIdentifier = routeIdentifier ?? fallbackId
  if (!resolvedIdentifier) {
    playerStore.reset()
    return
  }
  const playerNameValue =
    routePlayerNameParam.value ?? routePlayerIdParam.value ?? undefined
  if (shouldTreatAsPlayerName.value) {
    if (!playerNameValue) {
      playerStore.reset()
      return
    }
    try {
      await playerStore.fetchAuthmeProfile(playerNameValue)
    } catch (error) {
      toast.add({
        title: '加载玩家数据失败',
        description:
          error instanceof Error
            ? translateAuthErrorMessage(error.message)
            : 'Failed to load player info',
        color: 'error',
      })
    }
    return
  }

  try {
    await playerStore.fetchProfile({ id: resolvedIdentifier })
    await loadLifecycleEvents()
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      try {
        await playerStore.fetchAuthmeProfile(
          playerNameValue ?? resolvedIdentifier,
        )
      } catch (nested) {
        toast.add({
          title: '加载玩家数据失败',
          description:
            nested instanceof Error
              ? translateAuthErrorMessage(nested.message)
              : 'Failed to load player info',
          color: 'error',
        })
      }
      return
    }
    console.warn('加载玩家失败', error)
  }
}

async function loadLifecycleEvents() {
  if (!auth.isAuthenticated || !playerStore.targetUserId) {
    playerStore.lifecycleEvents = []
    return
  }
  try {
    await playerStore.fetchLifecycleEvents({
      sources: lifecycleSources,
      id: playerStore.targetUserId,
    })
  } catch (error) {
    console.warn('加载任务状态失败', error)
  }
}

function stopLoggedPolling() {
  if (loggedPoller) {
    clearInterval(loggedPoller)
    loggedPoller = null
  }
}

async function refreshLoggedStatus() {
  if (!canViewProfile.value || !playerStore.targetUserId) {
    playerStore.logged = null
    return
  }
  try {
    await playerStore.fetchLoggedStatus({ id: playerStore.targetUserId })
  } catch {
    // ignore polling errors
  }
}

function startLoggedPolling() {
  stopLoggedPolling()
  if (!canViewProfile.value || !playerStore.targetUserId) {
    playerStore.logged = null
    return
  }
  void refreshLoggedStatus()
  loggedPoller = setInterval(() => {
    void refreshLoggedStatus()
  }, 60 * 1000)
}

onMounted(() => {
  void loadServerOptions()
  void loadProfile()
  startLoggedPolling()
})

onBeforeUnmount(() => {
  stopLoggedPolling()
})

watch(
  () => targetPlayerParam.value,
  () => {
    void loadProfile()
    void loadLifecycleEvents()
    startLoggedPolling()
  },
)

watch(
  () => auth.isAuthenticated,
  () => {
    if (!targetPlayerParam.value) {
      void loadProfile()
      void loadLifecycleEvents()
      startLoggedPolling()
    }
  },
)

watch(
  () => canViewProfile.value,
  (available) => {
    if (available) {
      startLoggedPolling()
      return
    }
    stopLoggedPolling()
    playerStore.logged = null
  },
)

async function submitRestartRequest() {
  if (!restartDialog.serverId) {
    toast.add({ title: '请选择服务器', color: 'warning' })
    return
  }
  try {
    await playerStore.requestServerRestart(
      restartDialog.serverId,
      restartDialog.reason,
    )
    toast.add({ title: '已提交重启请求', color: 'primary' })
    restartDialog.open = false
    restartDialog.serverId = ''
    restartDialog.reason = ''
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return dayjs(value).format('YYYY/MM/DD HH:mm:ss')
}

function formatMetricValue(value: number, unit: string) {
  if (unit === 'seconds') {
    return `${Math.round(value / 3600)} 小时`
  }
  if (unit === 'times') {
    return `${value} 次`
  }
  if (unit === 'days') {
    return `${value} 天`
  }
  return `${value}`
}

function formatIpLocation(location: string | null | undefined) {
  if (!location) return ''
  let text = location
  if (text.includes('|')) {
    const parts = text
      .split('|')
      .map((part) => part.trim())
      .filter((part) => part && part !== '0')
    if (parts.length === 0) return ''
    text = parts.join(' ')
  }
  const cleaned = text
    .replace(/\s*·\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || ''
}
</script>

<template>
  <Transition name="opacity-motion">
    <div
      v-if="summary?.avatarUrl"
      class="absolute top-0 left-0 lg:left-16 right-0 h-1/5 md:h-2/3 pointer-events-none select-none mask-[linear-gradient(to_bottom,#fff_-20%,transparent_80%)] filter-[blur(32px)_saturate(250%)_opacity(0.2)] dark:filter-[blur(48px)_saturate(200%)_opacity(0.8)]"
    >
      <img
        :src="summary.avatarUrl"
        alt="Player Avatar"
        class="h-full w-full object-cover"
      />
    </div>
  </Transition>

  <section class="relative z-0 mx-auto w-full max-w-6xl px-8 pb-16 pt-8">
    <PlayerLoginPrompt
      v-if="!canViewProfile"
      :can-view-profile="canViewProfile"
    />

    <PlayerAuthmeProfileContent
      v-else-if="canViewProfile && authmeProfile"
      :profile="authmeProfile"
      :stats="stats"
      :bindings="authmeBindings"
    />

    <PlayerProfileContent
      v-else
      :is-viewing-self="isViewingSelf"
      :summary="summary"
      :region="region"
      :minecraft="minecraft"
      :stats="stats"
      :format-date-time="formatDateTime"
      :format-metric-value="formatMetricValue"
      :status-snapshot="statusSnapshot"
      :format-ip-location="formatIpLocation"
      :server-options="serverOptions"
    />
  </section>
</template>

<style scoped>
.opacity-motion-enter-active,
.opacity-motion-leave-active {
  transition: opacity 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.opacity-motion-enter-from,
.opacity-motion-leave-to {
  opacity: 0;
}

.opacity-motion-enter-to,
.opacity-motion-leave-from {
  opacity: 1;
}
</style>
