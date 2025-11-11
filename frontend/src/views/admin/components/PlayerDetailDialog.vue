<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import dayjs from 'dayjs'
import type { IdleAnimation, SkinViewer } from 'skinview3d'
import type { AdminPlayerEntry } from '@/types/admin'
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

watch(
  () => props.initialPlayer,
  (value) => {
    if (value) {
      player.value = value
    }
  },
)

function resolvedUsername(entry: AdminPlayerEntry | null): string | null {
  if (!entry) return null
  if (entry.authme?.username) return entry.authme.username
  if (entry.binding?.authmeUsername) return entry.binding.authmeUsername
  return null
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
    const params = new URLSearchParams({
      keyword: normalized,
      pageSize: '1',
    })
    const response = await apiFetch<{ items: AdminPlayerEntry[] }>(
      `/auth/players?${params.toString()}`,
      { token: auth.token },
    )
    const found =
      response.items.find((item) => {
        const candidate = resolvedUsername(item)
        return candidate?.toLowerCase() === normalized.toLowerCase()
      }) ??
      response.items[0] ??
      null
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
  const username = resolvedUsername(player.value)
  if (!username) return
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
      skin: `https://mc-heads.net/skin/${encodeURIComponent(username)}`,
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
    viewer.loadSkin(`https://mc-heads.net/skin/${encodeURIComponent(username)}`)
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
    const current = resolvedUsername(player.value)
    const target = props.username ?? current
    if (target) {
      if (!current || current.toLowerCase() !== target.toLowerCase()) {
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
    const current = resolvedUsername(player.value)
    if (!current || current.toLowerCase() !== next.toLowerCase()) {
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
  () => resolvedUsername(player.value) ?? props.username ?? '—',
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
  return `https://mc-heads.net/avatar/${encodeURIComponent(usernameDisplay.value)}/128`
})
const bodyUrl = computed(() => {
  if (!usernameDisplay.value || usernameDisplay.value === '—') return ''
  return `https://mc-heads.net/body/${encodeURIComponent(usernameDisplay.value)}/160`
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

function closeDialog() {
  emit('update:open', false)
}

function openBoundUser() {
  const summary = bindingUserSummary.value
  if (!summary) return
  emit('openUser', summary)
}
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="(value) => emit('update:open', value)"
    :ui="{ content: 'w-full max-w-4xl' }"
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
                    暂无绑定历史。
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div
            v-else
            class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400"
          >
            暂无可展示的玩家信息。
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
