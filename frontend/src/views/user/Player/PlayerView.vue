<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { usePlayerPortalStore } from '@/stores/playerPortal'
import { apiFetch } from '@/utils/api'
import PlayerLoginPrompt from './components/PlayerLoginPrompt.vue'
import PlayerProfileContent from './components/PlayerProfileContent.vue'
import PlayerPermissionDialog from './components/PlayerPermissionDialog.vue'
import PlayerRestartDialog from './components/PlayerRestartDialog.vue'

const auth = useAuthStore()
const playerStore = usePlayerPortalStore()
const route = useRoute()
const statsPeriod = ref('30d')
const serverOptions = ref<Array<{ id: string; displayName: string }>>([])
const permissionDialog = reactive({
  open: false,
  targetGroup: '',
  reason: '',
})
const restartDialog = reactive({
  open: false,
  serverId: '',
  reason: '',
})
const actionsPage = ref(1)
const toast = useToast()

const targetPlayerParam = computed(() => {
  const param = route.params.playerId
  if (Array.isArray(param)) {
    return param[0] ?? null
  }
  return (param as string | undefined) ?? null
})

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
const ownership = computed(() => summary.value?.ownership ?? null)

const assets = computed(() => playerStore.assets)
const region = computed(() => playerStore.region)
const minecraft = computed(() => playerStore.minecraft)
const stats = computed(() => playerStore.stats)
const actions = computed(() => playerStore.actions)
const storeLoading = computed(() => playerStore.loading)

async function loadServerOptions() {
  const publicServers = await apiFetch<{
    servers: Array<{ id: string; displayName: string }>
  }>('/portal/header/minecraft-status')
  serverOptions.value = publicServers.servers ?? []
}

async function loadProfile(actionsPageOverride?: number) {
  if (!canViewProfile.value) {
    playerStore.reset()
    return
  }
  const nextPage = actionsPageOverride ?? actionsPage.value
  actionsPage.value = nextPage
  await playerStore.fetchProfile({
    id: targetPlayerParam.value ?? undefined,
    period: statsPeriod.value,
    actionsPage: nextPage,
  })
}

onMounted(() => {
  void loadServerOptions()
  void loadProfile(1)
})

watch(
  () => [targetPlayerParam.value, statsPeriod.value],
  () => {
    actionsPage.value = 1
    void loadProfile(1)
  },
)

watch(
  () => auth.isAuthenticated,
  () => {
    if (!targetPlayerParam.value) {
      actionsPage.value = 1
      void loadProfile(1)
    }
  },
)

async function refreshActions(page = 1) {
  actionsPage.value = page
  await playerStore.fetchActions(
    actionsPage.value,
    targetPlayerParam.value ?? undefined,
  )
}

async function handleAuthmeReset() {
  try {
    await playerStore.requestAuthmeReset()
    toast.add({ title: '已提交 AuthMe 密码重置申请', color: 'primary' })
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function handleForceLogin() {
  try {
    await playerStore.requestForceLogin()
    toast.add({ title: '已提交强制登陆申请', color: 'primary' })
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function submitPermissionChange() {
  if (!permissionDialog.targetGroup.trim()) {
    toast.add({ title: '请输入目标权限组', color: 'warning' })
    return
  }
  try {
    await playerStore.requestPermissionChange(
      permissionDialog.targetGroup,
      permissionDialog.reason,
    )
    toast.add({ title: '已提交权限组调整申请', color: 'primary' })
    permissionDialog.open = false
    permissionDialog.targetGroup = ''
    permissionDialog.reason = ''
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

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
</script>

<template>
  <Transition name="opacity-motion">
    <div
      v-if="summary?.avatarUrl"
      class="absolute top-0 left-0 right-0 h-1/2 pointer-events-none select-none mask-[linear-gradient(to_bottom,#fff_-20%,transparent_80%)] filter-[blur(32px)_saturate(250%)_opacity(0.2)] dark:filter-[blur(48px)_saturate(200%)_opacity(0.8)]"
    >
      <img
        :src="summary.avatarUrl"
        alt="Player Avatar"
        class="h-full w-full object-cover"
      />
    </div>
  </Transition>

  <section class="relative z-0 mx-auto w-full max-w-6xl px-4 pb-16 pt-8">
    <PlayerLoginPrompt :can-view-profile="canViewProfile" />

    <PlayerProfileContent
      v-if="canViewProfile"
      :is-viewing-self="isViewingSelf"
      :summary="summary"
      :actions="actions"
      :ownership="ownership"
      :minecraft="minecraft"
      :stats="stats"
      :stats-period="statsPeriod"
      :format-date-time="formatDateTime"
      :format-metric-value="formatMetricValue"
      @update:stats-period="statsPeriod = $event"
      @refresh-actions="refreshActions"
      @authme-reset="handleAuthmeReset"
      @force-login="handleForceLogin"
      @open-permission-dialog="permissionDialog.open = true"
      @open-restart-dialog="restartDialog.open = true"
    />

    <PlayerPermissionDialog
      :open="permissionDialog.open"
      :target-group="permissionDialog.targetGroup"
      :reason="permissionDialog.reason"
      @update:open="permissionDialog.open = $event"
      @update:target-group="permissionDialog.targetGroup = $event"
      @update:reason="permissionDialog.reason = $event"
      @submit="submitPermissionChange"
    />

    <PlayerRestartDialog
      :open="restartDialog.open"
      :server-id="restartDialog.serverId"
      :reason="restartDialog.reason"
      :server-options="serverOptions"
      @update:open="restartDialog.open = $event"
      @update:server-id="restartDialog.serverId = $event"
      @update:reason="restartDialog.reason = $event"
      @submit="submitRestartRequest"
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
