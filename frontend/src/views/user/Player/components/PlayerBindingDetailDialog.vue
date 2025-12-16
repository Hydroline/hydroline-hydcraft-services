<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, reactive } from 'vue'
import dayjs from 'dayjs'
import type { IdleAnimation, SkinViewer } from 'skinview3d'
import type { PlayerSummary, PlayerLifecycleEvent } from '@/types/portal'
import { usePlayerPortalStore } from '@/stores/user/playerPortal'
import PlayerLifecycleTimelineDialog from './PlayerLifecycleTimelineDialog.vue'

const props = defineProps<{
  open: boolean
  binding: PlayerSummary['authmeBindings'][number] | null
  luckpermsEntry: PlayerSummary['luckperms'][number] | null
  formatIpLocation: (value: string | null | undefined) => string
  formatDateTime: (value: string | null | undefined) => string
  isViewingSelf: boolean
  serverOptions?: Array<{ id: string; displayName: string }>
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let viewer: SkinViewer | null = null
let idleAnimationInstance: IdleAnimation | null = null
let skinviewModule: typeof import('skinview3d') | null = null

function resolveIdentifier(
  binding: PlayerSummary['authmeBindings'][number] | null,
) {
  if (!binding) return null
  const realname = binding.realname?.trim()
  if (realname) return realname
  const username = binding.username?.trim()
  return username || null
}

async function ensureSkinview() {
  if (!skinviewModule) {
    skinviewModule = await import('skinview3d')
  }
  return skinviewModule
}

async function updateViewer() {
  if (!props.open || !props.binding) return
  if (typeof window === 'undefined') return
  const identifier = resolveIdentifier(props.binding)
  if (!identifier) return
  const canvas = canvasRef.value
  if (!canvas) return

  const skinview = await ensureSkinview()
  const width = canvas.clientWidth > 0 ? canvas.clientWidth : 180
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
      return
    }
    await nextTick()
    await updateViewer()
  },
  { immediate: true },
)

watch(
  () => props.binding,
  async () => {
    if (!props.open) return
    if (!props.binding) {
      cleanupViewer()
      return
    }
    await nextTick()
    await updateViewer()
  },
)

onBeforeUnmount(() => {
  cleanupViewer()
  stopLifecyclePolling()
})

const displayIdentifier = computed(() => {
  if (!props.binding) return '—'
  return props.binding.realname || props.binding.username || '—'
})

const formattedLastLogin = computed(() => {
  if (!props.binding?.lastlogin) return '—'
  return dayjs(props.binding.lastlogin).format('YYYY/MM/DD HH:mm:ss')
})

const regAgo = computed(() => {
  if (!props.binding?.regdate) return null
  return `${dayjs().diff(dayjs(props.binding.regdate), 'day')} 天前注册` as const
})

const lastLoginAgo = computed(() => {
  if (!props.binding?.lastlogin) return null
  return `${dayjs().diff(dayjs(props.binding.lastlogin), 'day')} 天前登录` as const
})

const formattedRegDate = computed(() => {
  if (!props.binding?.regdate) return '—'
  return dayjs(props.binding.regdate).format('YYYY/MM/DD HH:mm:ss')
})

const regIpLocation = computed(() => {
  if (!props.binding) return ''
  return props.formatIpLocation(props.binding.regIpLocation)
})

const displayLastLoginLocation = computed(() => {
  if (!props.binding) return ''
  return props.formatIpLocation(props.binding.lastLoginLocation)
})

const uuidDisplay = computed(() => props.binding?.uuid ?? '—')
const playerPortalStore = usePlayerPortalStore()
const isPlayerLogged = computed(() => Boolean(playerPortalStore.logged))

const permissionGroupLabel = computed(() => {
  const entry = props.luckpermsEntry
  if (!entry) return '—'
  return entry.primaryGroupDisplayName ?? entry.primaryGroup ?? '—'
})

const toast = useToast()
const serverOptions = computed(() => props.serverOptions ?? [])
const serverOptionMap = computed(() => {
  const map = new Map<string, string>()
  serverOptions.value.forEach((option) =>
    map.set(option.id, option.displayName),
  )
  return map
})

function resolveDefaultServerId() {
  return serverOptions.value[0]?.id ?? ''
}

const bindingId = computed(() => props.binding?.id ?? null)
const targetUserId = computed(() => playerPortalStore.targetUserId ?? undefined)
const lifecycleSources = [
  'portal.player.authme-reset',
  'portal.player.force-login',
  'portal.player.permission-adjust',
] as const

const lifecycleEvents = computed(() => playerPortalStore.lifecycleEvents ?? [])
const bindingLifecycleEvents = computed(() => {
  if (!bindingId.value) return []
  return lifecycleEvents.value
    .filter(
      (event) => getLifecycleMetadata(event).bindingId === bindingId.value,
    )
    .sort(
      (a, b) => dayjs(b.occurredAt).valueOf() - dayjs(a.occurredAt).valueOf(),
    )
})
const passwordLifecycleEvents = computed(() =>
  bindingLifecycleEvents.value.filter(
    (event) => event.source === 'portal.player.authme-reset',
  ),
)
const forceLoginLifecycleEvents = computed(() =>
  bindingLifecycleEvents.value.filter(
    (event) => event.source === 'portal.player.force-login',
  ),
)
const permissionLifecycleEvents = computed(() =>
  bindingLifecycleEvents.value.filter(
    (event) => event.source === 'portal.player.permission-adjust',
  ),
)

const hasActiveLifecycle = computed(() =>
  bindingLifecycleEvents.value.some((event) => {
    const status = getLifecycleStatus(event)
    return (
      status === 'PENDING' || status === 'EXECUTING' || status === 'VERIFYING'
    )
  }),
)

const lifecyclePoller = ref<ReturnType<typeof setInterval> | null>(null)

const passwordDialog = reactive({ open: false, serverId: '', password: '' })
const passwordSubmitting = ref(false)
const forceLoginDialog = reactive({ open: false, serverId: '' })
const forceLoginSubmitting = ref(false)
const permissionDialog = reactive({
  open: false,
  serverId: '',
  targetGroup: '',
  options: [] as Array<{ value: string; label: string; priority: number }>,
  loading: false,
})
const permissionSubmitting = ref(false)
const balanceDialog = reactive({
  open: false,
  serverId: '',
  amount: '',
  operation: 'set' as 'set' | 'add',
})
const balanceSubmitting = ref(false)
const balanceLoading = ref(false)
const balanceError = ref<string | null>(null)
const balanceValue = ref<number | null>(null)
const balanceFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
})
const formattedBalance = computed(() => {
  if (balanceValue.value == null) {
    return '—'
  }
  return balanceFormatter.format(balanceValue.value)
})
const balanceOperationOptions = [
  { value: 'set', label: '直接设置余额' },
  { value: 'add', label: '按增减余额（可负）' },
] as const
const lifecycleDialogOpen = ref(false)

function ensureServerDefaults() {
  const defaultId = resolveDefaultServerId()
  if (!passwordDialog.serverId) passwordDialog.serverId = defaultId
  if (!forceLoginDialog.serverId) forceLoginDialog.serverId = defaultId
  if (!permissionDialog.serverId) permissionDialog.serverId = defaultId
  if (!balanceDialog.serverId) balanceDialog.serverId = defaultId
}

watch(serverOptions, ensureServerDefaults, { immediate: true })

watch(
  () => props.open,
  (open) => {
    if (open) {
      ensureServerDefaults()
      void refreshLifecycleEvents()
      if (hasActiveLifecycle.value) {
        startLifecyclePolling()
      }
    } else {
      stopLifecyclePolling()
    }
  },
  { immediate: true },
)

watch(bindingId, () => {
  passwordDialog.open = false
  forceLoginDialog.open = false
  permissionDialog.open = false
  lifecycleDialogOpen.value = false
  if (props.open) {
    void refreshLifecycleEvents()
  }
})

watch(hasActiveLifecycle, (active) => {
  if (!props.open) return
  if (active) {
    startLifecyclePolling()
  } else {
    stopLifecyclePolling()
  }
})

watch(
  () => passwordDialog.open,
  (open) => {
    if (open) {
      passwordDialog.serverId =
        passwordDialog.serverId || resolveDefaultServerId()
      passwordDialog.password = ''
    }
  },
)

watch(
  () => forceLoginDialog.open,
  (open) => {
    if (open) {
      forceLoginDialog.serverId =
        forceLoginDialog.serverId || resolveDefaultServerId()
    }
  },
)

watch(
  () => permissionDialog.open,
  (open) => {
    if (open) {
      permissionDialog.serverId =
        permissionDialog.serverId || resolveDefaultServerId()
      void loadPermissionOptions()
    }
  },
)

watch(
  () => balanceDialog.open,
  (open) => {
    if (open) {
      balanceDialog.serverId =
        balanceDialog.serverId || resolveDefaultServerId()
      balanceDialog.amount = ''
      void loadPlayerBalance()
    }
  },
)

watch(
  () => balanceDialog.serverId,
  (serverId) => {
    if (balanceDialog.open && serverId) {
      void loadPlayerBalance()
    }
  },
)

async function refreshLifecycleEvents() {
  if (!playerPortalStore.authToken()) {
    return
  }
  try {
    await playerPortalStore.fetchLifecycleEvents({
      sources: lifecycleSources as unknown as string[],
      id: targetUserId.value,
    })
  } catch (error) {
    console.warn('刷新任务状态失败', error)
  }
}

function startLifecyclePolling() {
  stopLifecyclePolling()
  lifecyclePoller.value = setInterval(() => {
    void refreshLifecycleEvents()
  }, 5000)
}

function stopLifecyclePolling() {
  if (lifecyclePoller.value) {
    clearInterval(lifecyclePoller.value)
    lifecyclePoller.value = null
  }
}

function getLifecycleMetadata(event: PlayerLifecycleEvent) {
  return (event.metadata ?? {}) as Record<string, any>
}

function getLifecycleStatus(event: PlayerLifecycleEvent) {
  const meta = getLifecycleMetadata(event)
  const statusRaw = typeof meta.status === 'string' ? meta.status : 'UNKNOWN'
  return statusRaw.toUpperCase()
}

function lifecycleBadge(status: string) {
  switch (status) {
    case 'SUCCESS':
      return { color: 'success', text: '已完成' }
    case 'FAILED':
      return { color: 'error', text: '失败' }
    case 'VERIFYING':
      return { color: 'primary', text: '核查中' }
    case 'EXECUTING':
      return { color: 'primary', text: '执行中' }
    case 'PENDING':
      return { color: 'warning', text: '排队中' }
    default:
      return { color: 'neutral', text: status || '未知状态' }
  }
}

function formatLifecycleEvent(event: PlayerLifecycleEvent) {
  const meta = getLifecycleMetadata(event)
  const status = getLifecycleStatus(event)
  const serverName =
    typeof meta.server?.name === 'string'
      ? meta.server.name
      : typeof meta.server?.id === 'string'
        ? (serverOptionMap.value.get(meta.server.id) ?? meta.server.id)
        : null
  const targetGroup =
    typeof meta.targetGroup === 'string' ? meta.targetGroup : null
  const description =
    typeof meta.resultMessage === 'string'
      ? meta.resultMessage
      : typeof meta.error === 'string'
        ? meta.error
        : '命令已派发'
  return {
    id: event.id,
    status,
    badge: lifecycleBadge(status),
    requestedAt: meta.requestedAt ?? event.occurredAt,
    completedAt: meta.completedAt ?? null,
    serverName,
    targetGroup,
    description,
    reason: typeof meta.reason === 'string' ? meta.reason : null,
  }
}

const passwordTimeline = computed(() =>
  passwordLifecycleEvents.value.map((event) => formatLifecycleEvent(event)),
)
const forceLoginTimeline = computed(() =>
  forceLoginLifecycleEvents.value.map((event) => formatLifecycleEvent(event)),
)
const permissionTimeline = computed(() =>
  permissionLifecycleEvents.value.map((event) => formatLifecycleEvent(event)),
)

function ensureBindingAvailable(action: string) {
  if (!props.binding) {
    toast.add({
      title: '无法执行',
      description: `请选择一个绑定后再${action}`,
      color: 'warning',
    })
    return false
  }
  return true
}

async function submitPasswordReset() {
  if (!ensureBindingAvailable('重置密码')) return
  if (!passwordDialog.serverId) {
    toast.add({ title: '请选择服务器', color: 'warning' })
    return
  }
  const newPassword = passwordDialog.password.trim()
  if (!newPassword) {
    toast.add({ title: '请输入新密码', color: 'warning' })
    return
  }
  passwordSubmitting.value = true
  try {
    await playerPortalStore.requestAuthmePasswordReset({
      serverId: passwordDialog.serverId,
      password: newPassword,
      bindingId: bindingId.value ?? undefined,
    })
    toast.add({ title: '密码重置命令已发送', color: 'primary' })
    passwordDialog.open = false
    passwordDialog.password = ''
    await refreshLifecycleEvents()
    startLifecyclePolling()
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    passwordSubmitting.value = false
  }
}

async function submitForceLogin() {
  if (!ensureBindingAvailable('强制登录')) return
  if (!forceLoginDialog.serverId) {
    toast.add({ title: '请选择服务器', color: 'warning' })
    return
  }
  forceLoginSubmitting.value = true
  try {
    await playerPortalStore.requestForceLogin({
      serverId: forceLoginDialog.serverId,
      bindingId: bindingId.value ?? undefined,
    })
    toast.add({ title: '强制登录命令已发送', color: 'primary' })
    forceLoginDialog.open = false
    await refreshLifecycleEvents()
    startLifecyclePolling()
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    forceLoginSubmitting.value = false
  }
}

async function submitBalanceChange() {
  if (!ensureBindingAvailable('调整 MTR 余额')) return
  if (!balanceDialog.serverId) {
    toast.add({ title: '请选择服务器', color: 'warning' })
    return
  }
  const raw = String(balanceDialog.amount ?? '').trim()
  if (!raw.length) {
    toast.add({ title: '请输入金额', color: 'warning' })
    return
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    toast.add({ title: '请输入有效数字', color: 'warning' })
    return
  }
  balanceSubmitting.value = true
  try {
    const payload = {
      serverId: balanceDialog.serverId,
      bindingId: bindingId.value ?? undefined,
      amount: value,
    }
    if (balanceDialog.operation === 'add') {
      await playerPortalStore.requestAddPlayerMtrBalance(payload)
      toast.add({ title: '余额调整命令已发送', color: 'primary' })
    } else {
      await playerPortalStore.requestSetPlayerMtrBalance(payload)
      toast.add({ title: '余额设置命令已发送', color: 'primary' })
    }
    balanceDialog.amount = ''
    await loadPlayerBalance()
    await playerPortalStore.refreshStats()
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    balanceSubmitting.value = false
  }
}

async function loadPermissionOptions() {
  if (!bindingId.value) {
    permissionDialog.options = []
    permissionDialog.targetGroup = ''
    return
  }
  permissionDialog.loading = true
  try {
    const result = await playerPortalStore.fetchPermissionOptions(
      bindingId.value,
      targetUserId.value,
    )
    permissionDialog.options = result.options ?? []
    if (result.currentGroup) {
      permissionDialog.targetGroup = result.currentGroup
    } else if (permissionDialog.options.length) {
      permissionDialog.targetGroup = permissionDialog.options[0].value
    } else {
      permissionDialog.targetGroup = ''
    }
  } catch (error) {
    toast.add({
      title: '加载权限组失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    permissionDialog.loading = false
  }
}

async function loadPlayerBalance() {
  if (!bindingId.value || !balanceDialog.serverId) {
    balanceValue.value = null
    balanceError.value = null
    return
  }
  balanceLoading.value = true
  balanceError.value = null
  try {
    const response = await playerPortalStore.fetchPlayerMtrBalance({
      serverId: balanceDialog.serverId,
      bindingId: bindingId.value ?? undefined,
    })
    balanceValue.value = response.balance
  } catch (error) {
    balanceValue.value = null
    balanceError.value =
      error instanceof Error ? error.message : '无法获取 MTR 余额'
  } finally {
    balanceLoading.value = false
  }
}

async function submitPermissionChange() {
  if (!ensureBindingAvailable('调整权限组')) return
  if (!permissionDialog.serverId) {
    toast.add({ title: '请选择服务器', color: 'warning' })
    return
  }
  if (!permissionDialog.targetGroup) {
    toast.add({ title: '请选择目标权限组', color: 'warning' })
    return
  }
  permissionSubmitting.value = true
  try {
    await playerPortalStore.requestPermissionChange({
      serverId: permissionDialog.serverId,
      targetGroup: permissionDialog.targetGroup,
      bindingId: bindingId.value ?? undefined,
    })
    toast.add({ title: '权限组调整命令已发送', color: 'primary' })
    permissionDialog.open = false
    await refreshLifecycleEvents()
    startLifecyclePolling()
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    permissionSubmitting.value = false
  }
}
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="emit('update:open', $event)"
    :ui="{
      content: 'w-full max-w-lg w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800"
      >
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            游戏账户
          </h3>

          <div v-if="props.isViewingSelf" class="flex gap-1">
            <UButton
              size="xs"
              variant="soft"
              :disabled="!props.binding || !serverOptions.length"
              @click="passwordDialog.open = true"
            >
              密码重置
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              :disabled="!props.binding || !serverOptions.length"
              @click="forceLoginDialog.open = true"
            >
              强制登录
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              :disabled="!props.binding || !serverOptions.length"
              @click="balanceDialog.open = true"
            >
              调整 MTR 余额
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :disabled="!props.binding"
              @click="lifecycleDialogOpen = true"
            >
              账户操作日志
            </UButton>
          </div>
        </div>

        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          @click="emit('update:open', false)"
        />
      </div>
      <div class="p-4 overflow-auto sm:p-6 space-y-4">
        <div class="flex flex-col md:flex-row gap-6">
          <div
            class="rounded-2xl border border-slate-200/70 dark:border-slate-800/60 flex items-center justify-center bg-slate-50 dark:bg-slate-900 h-fit"
          >
            <canvas ref="canvasRef" class="h-64 w-full max-w-[180px]" />
          </div>

          <div
            class="flex-1 space-y-3 text-sm text-slate-600 dark:text-slate-300"
          >
            <div>
              <div class="text-xs uppercase tracking-wide text-slate-400">
                游戏 ID
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300 items-center gap-2"
              >
                <span class="block">
                  <span
                    v-if="isPlayerLogged"
                    class="inline-flex h-2 w-2 rounded-full bg-emerald-500"
                  ></span>
                  <span>{{ displayIdentifier }}</span>
                </span>
                <span class="block text-xs text-slate-500 font-medium">
                  {{ uuidDisplay }}
                </span>
              </div>
            </div>

            <div>
              <div class="text-xs uppercase tracking-wide text-slate-400">
                绑定时间
              </div>
              <div
                class="break-all text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                <span>
                  {{ props.formatDateTime(props.binding?.boundAt ?? null) }}
                </span>
                <span class="block text-xs text-slate-500 font-medium">
                  {{ props.binding?.id ?? '—' }}
                </span>
              </div>
            </div>

            <div>
              <div class="text-xs uppercase tracking-wide text-slate-400">
                账户注册时间
              </div>
              <div
                class="break-all text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                <span>
                  {{ formattedRegDate }}
                </span>
                <span class="block text-xs text-slate-500 font-medium">
                  <span v-if="regAgo">
                    {{ regAgo }}
                  </span>
                  <span v-if="regAgo && regIpLocation" class="mx-1 select-none"
                    >·</span
                  >
                  <span v-if="regIpLocation">
                    {{ regIpLocation }}
                  </span>
                </span>
              </div>
            </div>

            <div>
              <div class="text-xs uppercase tracking-wide text-slate-400">
                最近上线时间
              </div>
              <div
                class="break-all text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                <span>
                  {{ formattedLastLogin }}
                </span>
                <span class="block text-xs text-slate-500 font-medium">
                  <span v-if="lastLoginAgo">
                    {{ lastLoginAgo }}
                  </span>
                  <span
                    v-if="lastLoginAgo && displayLastLoginLocation"
                    class="mx-1 select-none"
                    >·</span
                  >
                  <span v-if="displayLastLoginLocation">
                    {{ displayLastLoginLocation }}
                  </span>
                </span>
              </div>
            </div>

            <div>
              <div class="text-xs uppercase tracking-wide text-slate-400">
                权限组
              </div>
              <div
                class="break-all flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                <span>
                  {{ permissionGroupLabel }}
                </span>
                <span v-if="props.isViewingSelf">
                  <UButton
                    class="text-[10px]"
                    variant="soft"
                    size="xs"
                    :disabled="!props.binding || !serverOptions.length"
                    @click="permissionDialog.open = true"
                  >
                    权限组调整
                  </UButton>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="passwordDialog.open"
    @update:open="passwordDialog.open = $event"
    :ui="{ content: 'w-full max-w-md w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            重置密码
          </h3>
        </template>
        <form class="space-y-4" @submit.prevent="submitPasswordReset">
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              选择服务器
            </span>
            <USelectMenu
              v-model="passwordDialog.serverId"
              :items="serverOptions"
              value-key="id"
              label-key="displayName"
              placeholder="请选择服务器"
              :disabled="serverOptions.length === 0"
            />
          </label>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              新密码
            </span>
            <UInput
              v-model="passwordDialog.password"
              type="password"
              placeholder="输入新密码"
              autocomplete="new-password"
            />
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              type="button"
              variant="ghost"
              @click="passwordDialog.open = false"
            >
              取消
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="passwordSubmitting"
            >
              发送命令
            </UButton>
          </div>
        </form>
      </UCard>
    </template>
  </UModal>

  <UModal
    :open="forceLoginDialog.open"
    @update:open="forceLoginDialog.open = $event"
    :ui="{ content: 'w-full max-w-md w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            强制登录
          </h3>
        </template>
        <form class="space-y-4" @submit.prevent="submitForceLogin">
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              选择服务器
            </span>
            <USelectMenu
              v-model="forceLoginDialog.serverId"
              :items="serverOptions"
              value-key="id"
              label-key="displayName"
              placeholder="请选择服务器"
              :disabled="serverOptions.length === 0"
            />
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              type="button"
              variant="ghost"
              @click="forceLoginDialog.open = false"
            >
              取消
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="forceLoginSubmitting"
            >
              发送命令
            </UButton>
          </div>
        </form>
      </UCard>
    </template>
  </UModal>

  <UModal
    :open="permissionDialog.open"
    @update:open="permissionDialog.open = $event"
    :ui="{ content: 'w-full max-w-md w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            权限组调整
          </h3>
        </template>
        <form class="space-y-4" @submit.prevent="submitPermissionChange">
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              选择服务器
            </span>
            <USelectMenu
              v-model="permissionDialog.serverId"
              :items="serverOptions"
              value-key="id"
              label-key="displayName"
              placeholder="请选择服务器"
              :disabled="serverOptions.length === 0"
            />
          </label>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              目标权限组
            </span>
            <USelectMenu
              v-model="permissionDialog.targetGroup"
              :items="permissionDialog.options"
              value-key="value"
              label-key="label"
              placeholder="暂无可选项"
              :disabled="
                permissionDialog.loading ||
                permissionDialog.options.length === 0
              "
            />
          </label>
          <div
            v-if="permissionDialog.loading"
            class="text-xs text-slate-500 dark:text-slate-400"
          >
            正在加载可调整的权限组...
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              type="button"
              variant="ghost"
              @click="permissionDialog.open = false"
            >
              取消
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :disabled="permissionDialog.options.length === 0"
              :loading="permissionSubmitting"
            >
              发送命令
            </UButton>
          </div>
        </form>
      </UCard>
    </template>
  </UModal>

  <UModal
    :open="balanceDialog.open"
    @update:open="balanceDialog.open = $event"
    :ui="{ content: 'w-full max-w-md w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            调整 MTR 余额
          </h3>
        </template>
        <form class="space-y-4" @submit.prevent="submitBalanceChange">
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              选择服务器
            </span>
            <USelectMenu
              v-model="balanceDialog.serverId"
              :items="serverOptions"
              value-key="id"
              label-key="displayName"
              placeholder="请选择服务器"
              :disabled="serverOptions.length === 0"
            />
          </label>
          <div class="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            <span class="text-xs text-slate-500 dark:text-slate-500">
              当前余额
            </span>
            <div class="text-lg font-semibold text-slate-900 dark:text-white">
              <template v-if="balanceLoading">
                <UIcon
                  name="i-lucide-loader-2"
                  class="inline-block h-4 w-4 animate-spin"
                />
              </template>
              <template v-else>{{ formattedBalance }}</template>
            </div>
          </div>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              操作类型
            </span>
            <USelectMenu
              v-model="balanceDialog.operation"
              :items="balanceOperationOptions"
              value-key="value"
              label-key="label"
            />
          </label>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              金额
            </span>
            <UInput
              v-model="balanceDialog.amount"
              type="number"
              placeholder="输入要设置或调整的数量"
            />
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              type="button"
              variant="ghost"
              @click="balanceDialog.open = false"
            >
              取消
            </UButton>
            <UButton type="submit" color="primary" :loading="balanceSubmitting">
              发送命令
            </UButton>
          </div>
        </form>
      </UCard>
    </template>
  </UModal>

  <PlayerLifecycleTimelineDialog
    :open="lifecycleDialogOpen"
    :password-entries="passwordTimeline"
    :force-login-entries="forceLoginTimeline"
    :permission-entries="permissionTimeline"
    @update:open="lifecycleDialogOpen = $event"
  />
</template>
