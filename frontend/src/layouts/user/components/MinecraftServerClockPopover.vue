<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { apiFetch } from '@/utils/api'

import type { MinecraftPingResult } from '@/types/minecraft'

// 约定后端公共接口返回结构（参考后台 ServerStatus 逻辑做精简聚合）
// 实际类型请根据后端 /types/minecraft.ts 对应结构调整
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
  mcsmConnected?: boolean
}

interface PublicServerStatusResponse {
  servers: PublicServerStatusItem[]
  // 可选：后端当前时间等公共字段
}

const props = defineProps<{
  // 轮询间隔（毫秒），默认 5 分钟
  intervalMs?: number
}>()

const intervalMs = computed(() => props.intervalMs ?? 5 * 60 * 1000)

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

// 本地时钟动画：用 beacon 返回的 tick 时间或服务器时间为基准，每秒 +50ms（Minecraft tick）
const now = ref(dayjs())
const nowReal = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null

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
})

onBeforeUnmount(() => {
  stopClock()
  stopPolling()
})

// 计算展示用时间（从 beacon tick / timeLocked 推导），这里先简单展示 beacon.time
function formatServerTime(item: PublicServerStatusItem) {
  const minutes = currentDisplayMinutes(item)
  if (minutes != null) {
    const h = Math.floor(minutes / 60)
    const m = Math.floor(minutes % 60)
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    return `${pad(h)}:${pad(m)}`
  }
  if (item.beacon?.clock?.displayTime) {
    return item.beacon.clock.displayTime
  }
  return now.value.format('HH:mm')
}

function isTimeLocked(item: PublicServerStatusItem) {
  return Boolean(item.beacon?.clock?.locked)
}

function currentDisplayMinutes(item: PublicServerStatusItem): number | null {
  const clock = localClocks.value[item.id]
  if (!clock) return null
  if (clock.locked) return clock.baseMcMinutes
  const deltaMs = nowReal.value - clock.baseRealMs
  // 视觉效果：现实 1 秒 ≈ 世界 1 分钟
  const deltaMinutes = deltaMs / 1000
  const total = (clock.baseMcMinutes + deltaMinutes) % (24 * 60)
  return total
}

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

function motdText(item: PublicServerStatusItem) {
  const resp = item.ping?.response as
    | MinecraftPingResult['response']
    | undefined
  if (!resp) return ''
  // 简化提取文本，Java / Bedrock 后端可提前解析
  // 这里不再访问未知字段，后端统一填充 motdText
  return ''
  return ''
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
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      class="flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-sm"
    >
      <UIcon name="i-lucide-clock" class="h-4 w-4" />
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="servers.length">
          <div
            v-for="item in servers"
            :key="item.id"
            class="relative inline-flex items-center gap-1"
          >
            <span class="inline-flex items-center gap-1">
              <UIcon name="i-lucide-clock" class="h-3 w-3 text-slate-400" />
              <span>{{ formatServerTime(item) }}</span>
            </span>
            <span class="text-xs text-slate-400">
              ({{ item.displayName }})
            </span>
            <UIcon
              v-if="isTimeLocked(item)"
              name="i-lucide-lock"
              class="absolute -bottom-1 -right-1 h-3 w-3 text-amber-500"
            />
          </div>
        </template>
        <span v-else-if="loading">加载中...</span>
        <span v-else-if="error">状态异常</span>
        <span v-else>暂无服务器</span>
      </div>
    </UButton>

    <template #content>
      <div class="w-80 p-4 space-y-3">
        <h3 class="mb-1 font-medium text-slate-900 dark:text-white">
          服务端运行情况
        </h3>

        <div v-if="servers.length" class="space-y-3">
          <div class="space-y-1">
            <div class="flex justify-between text-xs text-slate-500">
              <span>整体在线率</span>
              <span>
                {{ totalCapacity.online }} / {{ totalCapacity.max }}
                ({{ overallOnlinePercent }}%)
              </span>
            </div>
            <UProgress :value="overallOnlinePercent" size="xs" />
          </div>

          <div class="space-y-2">
            <div
              v-for="item in servers"
              :key="item.id"
              class="rounded-lg border border-slate-200/70 bg-slate-50/60 p-2 text-xs dark:border-slate-700 dark:bg-slate-900/50"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex flex-col">
                  <span
                    class="text-xs font-medium text-slate-900 dark:text-white"
                    >{{ item.displayName }}</span
                  >
                  <span class="text-[10px] text-slate-500">
                    {{ item.code }} · {{ item.edition === 'BEDROCK' ? '基岩' : 'Java' }}
                  </span>
                </div>
                <div class="flex items-center gap-1 text-[11px] text-slate-500">
                  <UIcon
                    :name="item.mcsmConnected ? 'i-lucide-zap' : 'i-lucide-plug-zap'"
                    :class="[
                      'h-3 w-3',
                      item.mcsmConnected
                        ? 'text-emerald-500'
                        : 'text-slate-400',
                    ]"
                  />
                  <span>
                    {{ latencyLabel(item) }} ·
                    {{ onlineLabel(item) }}
                  </span>
                </div>
              </div>

              <div class="mt-1">
                <UProgress
                  :value="serverOnlinePercent(item)"
                  size="xs"
                  class="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"
                  :ui="{
                    track: 'rounded-full',
                    indicator: 'bg-sky-500 dark:bg-sky-400 rounded-full',
                  }"
                />
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

        <p
          v-else
          class="text-xs text-slate-500 dark:text-slate-400"
        >
          暂无服务器状态数据。
        </p>
      </div>
    </template>
  </UPopover>
</template>
