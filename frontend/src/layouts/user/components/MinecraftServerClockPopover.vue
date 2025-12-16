<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, nextTick } from 'vue'
import { Motion } from 'motion-v'
import dayjs from 'dayjs'
import { apiFetch } from '@/utils/http/api'

import type { MinecraftPingResult } from '@/types/minecraft'

interface PublicServerStatusItem {
  id: string
  displayName: string
  code?: string
  edition: 'JAVA' | 'BEDROCK'
  beacon?: {
    clock?: {
      displayTime?: string
      locked?: boolean
      worldMinutes?: number
    } | null
  } | null
  ping?: Pick<MinecraftPingResult, 'edition' | 'response'> | null
  mcsm?: { status?: number } | null
}

interface PublicServerStatusResponse {
  servers: PublicServerStatusItem[]
}

const props = defineProps<{
  intervalMs?: number
}>()

const intervalMs = computed(() => props.intervalMs ?? 1 * 60 * 1000)

const loading = ref(false)
const error = ref<string | null>(null)
const servers = ref<PublicServerStatusItem[]>([])

type LocalClock = {
  serverId: string
  baseRealMs: number
  baseMcMinutes: number
  locked: boolean
}

const localClocks = ref<Record<string, LocalClock>>({})

const now = ref(dayjs())
const nowReal = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
let toggleTimer: ReturnType<typeof setInterval> | null = null

const displayMode = ref<0 | 1 | 2>(0)
const serversHeaderContainer = ref<HTMLElement | null>(null)

function animateWidthChange(action: () => void) {
  const el = serversHeaderContainer.value
  if (!el) {
    action()
    return
  }
  const oldWidth = el.getBoundingClientRect().width
  action()
  nextTick(() => {
    const el2 = serversHeaderContainer.value
    if (!el2) return
    const newWidth = el2.getBoundingClientRect().width
    if (oldWidth === newWidth) return
    el2.style.width = oldWidth + 'px'
    el2.style.transition = 'width 0.35s ease'
    void el2.offsetWidth
    el2.style.width = newWidth + 'px'
    const cleanup = () => {
      el2.style.transition = ''
      el2.style.width = ''
      el2.removeEventListener('transitionend', cleanup)
    }
    el2.addEventListener('transitionend', cleanup)
  })
}

function startClock() {
  if (timer) return
  timer = setInterval(() => {
    now.value = dayjs()
    nowReal.value = Date.now()
  }, 1000)
}

function stopClock() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function fetchStatus() {
  loading.value = true
  error.value = null
  try {
    const res = await apiFetch<PublicServerStatusResponse>(
      '/portal/header/minecraft-status',
    )
    servers.value = res.servers || []

    const nowMs = Date.now()
    const map: Record<string, LocalClock> = { ...localClocks.value }
    for (const item of servers.value) {
      const worldMinutes = item.beacon?.clock?.worldMinutes
      const locked = Boolean(item.beacon?.clock?.locked)
      if (typeof worldMinutes === 'number') {
        map[item.id] = {
          serverId: item.id,
          baseRealMs: nowMs,
          baseMcMinutes: worldMinutes,
          locked,
        }
      }
    }
    localClocks.value = map
  } catch (e) {
    error.value = (e as Error).message
    servers.value = []
  } finally {
    loading.value = false
  }
}

function startPolling() {
  if (pollingTimer) return
  void fetchStatus()
  pollingTimer = setInterval(() => {
    void fetchStatus()
  }, intervalMs.value)
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

onMounted(() => {
  startClock()
  startPolling()

  toggleTimer = setInterval(() => {
    animateWidthChange(() => {
      displayMode.value = ((displayMode.value + 1) % 3) as 0 | 1 | 2
    })
  }, 5000)
})

onBeforeUnmount(() => {
  stopClock()
  stopPolling()
  if (toggleTimer) {
    clearInterval(toggleTimer)
    toggleTimer = null
  }
})

function onlineLabel(item: PublicServerStatusItem) {
  const players = item.ping?.response.players
  if (!players) return '暂无在线数据'
  return `${players.online ?? 0} / ${players.max ?? 0}`
}

function latencyLabel(item: PublicServerStatusItem) {
  const latency = item.ping?.response.latency
  if (latency == null) return '—'
  return `${latency} ms`
}

function mcsmStatusLabel(item: PublicServerStatusItem) {
  if (isServerFrozen(item)) {
    return '服卡死了'
  }
  const status = item.mcsm?.status
  switch (status) {
    case -1:
      return '忙碌'
    case 0:
      return '已停止'
    case 1:
      return '停止中'
    case 2:
      return '启动中'
    case 3:
      return '运行中'
    default:
      return '未配置'
  }
}

function mcsmStatusIcon(item: PublicServerStatusItem) {
  const status = item.mcsm?.status
  switch (status) {
    case -1:
      return 'i-lucide-hourglass'
    case 0:
      return 'i-lucide-square'
    case 1:
      return 'i-lucide-power'
    case 2:
      return 'i-lucide-rocket'
    case 3:
      return 'i-lucide-zap'
    default:
      return 'i-lucide-plug-zap'
  }
}

function motdText(item: PublicServerStatusItem) {
  const resp = item.ping?.response as
    | MinecraftPingResult['response']
    | undefined
  if (!resp) return ''
  return ''
}

function isServerFrozen(item: PublicServerStatusItem) {
  const isRunning = item.mcsm?.status === 3
  const latency = item.ping?.response?.latency
  return isRunning && latency == null
}

function serverClockDisplay(item: PublicServerStatusItem) {
  const worldMinutes = item.beacon?.clock?.worldMinutes
  if (worldMinutes == null) return ''
  const local = localClocks.value[item.id]
  let mcMinutes = worldMinutes
  if (local && !local.locked) {
    const diff = nowReal.value - local.baseRealMs
    mcMinutes = Math.floor(local.baseMcMinutes + diff / 833.333)
  }
  const minutesInDay = 24 * 60
  mcMinutes = ((mcMinutes % minutesInDay) + minutesInDay) % minutesInDay
  const hh = Math.floor(mcMinutes / 60)
    .toString()
    .padStart(2, '0')
  const mm = (mcMinutes % 60).toString().padStart(2, '0')
  return `${hh}:${mm}`
}

function displayHeaderLabel(item: PublicServerStatusItem) {
  if (isServerFrozen(item)) {
    return '服卡死了'
  }
  if (displayMode.value === 1) {
    if (item.beacon?.clock?.worldMinutes != null) {
      return serverClockDisplay(item)
    }
    return '--:--'
  }
  if (displayMode.value === 2) {
    return latencyLabel(item)
  }
  return onlineLabel(item)
}

function headerIcon() {
  if (displayMode.value === 1) {
    return 'i-lucide-clock'
  }
  if (displayMode.value === 2) {
    return 'i-lucide-signal'
  }
  return 'i-lucide-server'
}

const totalCapacity = computed(() => {
  let max = 0
  let online = 0
  for (const s of servers.value) {
    const players = s.ping?.response.players
    if (players) {
      online += players.online ?? 0
      max += players.max ?? 0
    }
  }
  return { online, max }
})

const overallOnlinePercent = computed(() => {
  const { online, max } = totalCapacity.value
  if (!max) return 0
  return Math.min(100, Math.round((online / max) * 100))
})

function serverOnlinePercent(item: PublicServerStatusItem) {
  const players = item.ping?.response.players
  const online = players?.online ?? 0
  const max = players?.max ?? 0
  if (!max) return 0
  return Math.min(100, Math.round((online / max) * 100))
}
</script>

<template>
  <UPopover mode="hover" :popper="{ placement: 'bottom-start' }">
    <div
      class="absolute top-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 md:translate-0 md:static flex items-center gap-2 font-mono rounded-full border border-slate-300/50 md:border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 md:dark:border-slate-700 bg-white dark:bg-slate-900 md:bg-transparent md:dark:bg-transparent md:hover:bg-slate-200/40 md:dark:hover:bg-slate-700/40 transition duration-300 cursor-pointer"
    >
      <div
        ref="serversHeaderContainer"
        class="flex items-center gap-3 select-none whitespace-nowrap"
      >
        <template v-if="servers.length">
          <template
            v-for="(item, index) in servers"
            :key="item.id + '-' + displayMode"
          >
            <Motion
              as="div"
              class="flex items-center gap-1"
              :initial="{ opacity: 0, filter: 'blur(6px)', y: 8 }"
              :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
              :transition="{ duration: 0.35, ease: 'easeInOut' }"
            >
              <UIcon :name="headerIcon()" class="h-3 w-3 text-slate-400" />
              <span class="font-medium text-slate-900 dark:text-white">
                {{ item.displayName }}
              </span>
              <span
                :class="[
                  displayMode === 1 && item.beacon?.clock?.locked
                    ? 'text-rose-500 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400',
                ]"
              >
                {{ displayHeaderLabel(item) }}
              </span>
              <UIcon
                v-if="displayMode === 1 && item.beacon?.clock?.locked"
                name="i-lucide-lock"
                class="h-3 w-3 text-rose-500 dark:text-rose-400"
              />
            </Motion>
            <div
              v-if="index < servers.length - 1"
              class="w-0.5 h-0.5 rounded-full bg-slate-300 dark:bg-slate-500"
            />
          </template>
        </template>
        <span v-else-if="loading" class="text-xs text-slate-400"
          >加载中...</span
        >
        <span v-else-if="error" class="text-xs text-rose-500">状态异常</span>
        <span v-else class="text-xs text-slate-400">暂无服务器</span>
      </div>
    </div>

    <template #content>
      <div class="w-80 p-4 space-y-3">
        <h3 class="mb-1 font-medium text-slate-900 dark:text-white">
          服务端状态
        </h3>

        <div v-if="servers.length" class="space-y-3">
          <div class="space-y-1">
            <div class="flex justify-between text-xs text-slate-500">
              <span>整体在线率</span>
              <span>
                {{ totalCapacity.online }} / {{ totalCapacity.max }} ({{
                  overallOnlinePercent
                }}%)
              </span>
            </div>
            <div
              class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <div
                class="h-full bg-primary transition-[width] duration-300 ease-out"
                :style="{ width: overallOnlinePercent + '%' }"
              />
            </div>
          </div>

          <div class="space-y-2">
            <div
              v-for="item in servers"
              :key="item.id"
              :class="[
                'rounded-lg border p-2 text-xs transition-colors',
                isServerFrozen(item)
                  ? 'border-rose-400/70 bg-rose-50/60 dark:border-rose-500/70 dark:bg-rose-950/40'
                  : 'border-slate-200/70 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/50',
              ]"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex flex-col">
                  <span
                    class="text-xs font-medium text-slate-900 dark:text-white"
                    >{{ item.displayName }}</span
                  >
                  <span class="text-[10px] text-slate-500">
                    {{ item.code }} ·
                    {{ item.edition === 'BEDROCK' ? '基岩' : 'Java' }}
                  </span>
                </div>
                <div class="flex items-center gap-1 text-[11px] text-slate-500">
                  <UIcon
                    :name="mcsmStatusIcon(item)"
                    :class="[
                      'h-3 w-3',
                      item.mcsm?.status === 3
                        ? 'text-emerald-500'
                        : item.mcsm?.status === 2
                          ? 'text-amber-500'
                          : item.mcsm?.status === 1
                            ? 'text-orange-500'
                            : item.mcsm?.status === 0
                              ? 'text-slate-400'
                              : 'text-slate-400',
                    ]"
                  />
                  <span>
                    <template v-if="isServerFrozen(item)"> 服卡死了 </template>
                    <template v-else>
                      {{ latencyLabel(item) }} · {{ onlineLabel(item) }} ·
                      {{ mcsmStatusLabel(item) }}
                    </template>
                  </span>
                </div>
              </div>

              <div class="mt-1">
                <div
                  class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <div
                    class="h-full bg-primary transition-[width] duration-300 ease-out"
                    :style="{ width: serverOnlinePercent(item) + '%' }"
                  />
                </div>
              </div>

              <p
                v-if="motdText(item)"
                class="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400"
              >
                {{ motdText(item) }}
              </p>
            </div>
          </div>
        </div>

        <p v-else class="text-xs text-slate-500 dark:text-slate-400">
          暂无服务器状态数据。
        </p>
      </div>
    </template>
  </UPopover>
</template>
