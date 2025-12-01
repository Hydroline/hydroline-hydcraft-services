<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { usePlayerPortalStore } from '@/stores/playerPortal'
import { apiFetch } from '@/utils/api'
import PlayerLoginPrompt from './components/PlayerLoginPrompt.vue'
import PlayerProfileContent from './components/PlayerProfileContent.vue'

const auth = useAuthStore()
const playerStore = usePlayerPortalStore()
let loggedPoller: ReturnType<typeof setInterval> | null = null
const route = useRoute()
const serverOptions = ref<Array<{ id: string; displayName: string }>>([])
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
  const param = route.params.playerId
  if (Array.isArray(param)) {
    return param[0] ?? null
  }
  return (param as string | undefined) ?? null
})

const resolvedTargetPlayerId = computed(
  () => targetPlayerParam.value ?? auth.user?.id ?? undefined,
)

const canViewProfile = computed(
  () => Boolean(targetPlayerParam.value) || auth.isAuthenticated,
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
  await playerStore.fetchProfile({
    id: resolvedTargetPlayerId.value ?? undefined,
  })
  await loadLifecycleEvents()
}

async function loadLifecycleEvents() {
  if (!auth.isAuthenticated) {
    playerStore.lifecycleEvents = []
    return
  }
  try {
    await playerStore.fetchLifecycleEvents({
      sources: lifecycleSources,
      id: resolvedTargetPlayerId.value ?? undefined,
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
  if (!canViewProfile.value) {
    playerStore.logged = null
    return
  }
  const targetId = resolvedTargetPlayerId.value ?? undefined
  try {
    await playerStore.fetchLoggedStatus({ id: targetId })
  } catch {
    // ignore polling errors
  }
}

function startLoggedPolling() {
  stopLoggedPolling()
  if (!canViewProfile.value) {
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

watch(
  () => resolvedTargetPlayerId.value,
  (value, previous) => {
    if (!value || value === previous) {
      return
    }
    if (!canViewProfile.value) {
      return
    }
    void loadProfile()
    void loadLifecycleEvents()
    startLoggedPolling()
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
    <PlayerLoginPrompt :can-view-profile="canViewProfile" />

    <PlayerProfileContent
      v-if="canViewProfile"
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
  transition: opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
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
