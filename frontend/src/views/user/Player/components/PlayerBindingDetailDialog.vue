<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import dayjs from 'dayjs'
import type { IdleAnimation, SkinViewer } from 'skinview3d'
import type { PlayerSummary } from '@/types/portal'
import { usePlayerPortalStore } from '@/stores/playerPortal'

const props = defineProps<{
  open: boolean
  binding: PlayerSummary['authmeBindings'][number] | null
  luckpermsEntry: PlayerSummary['luckperms'][number] | null
  formatIpLocation: (value: string | null | undefined) => string
  formatDateTime: (value: string | null | undefined) => string
  isViewingSelf: boolean
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'authme-reset'): void
  (event: 'force-login'): void
  (event: 'request-group-change'): void
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
            <UButton size="xs" variant="soft" @click="emit('authme-reset')">
              密码重置
            </UButton>
            <UButton size="xs" variant="soft" @click="emit('force-login')">
              强制登陆
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
      <div class="p-4 sm:p-6 space-y-4">
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
                <span>
                  <UButton
                    class="text-[10px]"
                    variant="soft"
                    size="xs"
                    @click="emit('request-group-change')"
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
</template>
