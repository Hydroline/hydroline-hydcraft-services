<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Motion } from 'motion-v'
import VChart from 'vue-echarts'
import { apiFetch } from '@/utils/http/api'

type ServerStatusResponse = {
  servers: PublicServerStatusItem[]
}

type PublicServerStatusItem = {
  id: string
  displayName: string
  code: string
  edition: 'JAVA' | 'BEDROCK'
  host: string
  port: number
  description?: string | null
  ping: {
    latest?: PublicServerStatusPingLatest
    history: PublicServerStatusHistoryPoint[]
  }
  mcsm: PublicServerStatusMcsm
  beacon: PublicServerStatusBeacon
}

type PublicServerStatusPingLatest = {
  latency?: number | null
  onlinePlayers?: number | null
  maxPlayers?: number | null
  versionLabel?: string | null
  fetchedAt: string
}

type PublicServerStatusHistoryPoint = {
  timestamp: string
  latency?: number | null
  onlinePlayers?: number | null
}

type PublicServerStatusMcsm = {
  configured: boolean
  status?: number | null
}

type PublicServerStatusBeacon = {
  configured: boolean
  connection: {
    connected: boolean
    connecting: boolean
    lastConnectedAt: string | null
    lastError: string | null
    reconnectAttempts: number
    endpoint: string
  } | null
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

const servers = ref<PublicServerStatusItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const isDark = ref(false)
const refreshTimer = ref<number | null>(null)
const countdownTimer = ref<number | null>(null)
const nextRefreshAt = ref<dayjs.Dayjs | null>(null)
const countdownText = ref('—')
const skeletonPlaceholders = Array.from({ length: 3 }, (_, index) => index)

const editionLabels = {
  JAVA: 'Java 版',
  BEDROCK: '基岩版',
} as const

const formatLatestTime = (item: PublicServerStatusItem) => {
  const timestamp = item.ping.latest?.fetchedAt
  if (!timestamp) return ''
  return dayjs(timestamp).format('MM-DD HH:mm')
}

const latencyLabel = (item: PublicServerStatusItem) => {
  const latency = item.ping.latest?.latency
  if (latency == null) return '—'
  return `${latency} ms`
}

const playersLabel = (item: PublicServerStatusItem) => {
  const latest = item.ping.latest
  if (!latest || latest.onlinePlayers == null) return '—'
  const max = latest.maxPlayers ?? latest.onlinePlayers
  return `${latest.onlinePlayers} / ${max}`
}

const versionLabel = (item: PublicServerStatusItem) => {
  return item.ping.latest?.versionLabel || '—'
}

const mcsmStatusLabel = (mcsm: PublicServerStatusMcsm) => {
  if (!mcsm.configured) return '未配置'
  switch (mcsm.status) {
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
      return '等待中'
  }
}

const beaconStatusLabel = (beacon: PublicServerStatusBeacon) => {
  if (!beacon.configured) return '未配置'
  if (!beacon.connection) return '未连接'
  if (beacon.connection.connected) return '已连接'
  if (beacon.connection.connecting) return '连接中'
  return '重连中'
}

const hasHistory = (item: PublicServerStatusItem) =>
  item.ping.history.length > 0

const chartLabel = (timestamp?: string) =>
  timestamp ? dayjs(timestamp).format('MM-DD HH:mm') : ''

const createChartOption = (item: PublicServerStatusItem, dark: boolean) => {
  const history = item.ping.history
  const labels = history.map((record) => chartLabel(record.timestamp))
  const latencySeries = history.map((record) =>
    record.latency != null ? record.latency : null,
  )
  const playerSeries = history.map((record) =>
    record.onlinePlayers != null ? record.onlinePlayers : null,
  )

  // 根据当前主题设置 ECharts 文本颜色，避免日间过浅或夜间过灰
  const palette = dark
    ? {
        text: '#f8fafc', // brighter
        axis: '#e2e8f0', // bright ticks
        name: '#f8fafc',
        line: '#94a3b8', // lighter divider
      }
    : {
        text: '#1f2937', // slate-800-ish for clear light text
        axis: '#1f2937', // same for ticks
        name: '#0f172a', // slate-900 for axis name
        line: '#94a3b8', // subtle divider
      }

  return {
    darkMode: dark,
    textStyle: { color: palette.text },
    tooltip: {
      trigger: 'axis',
      formatter: (
        params:
          | { axisValue: string; seriesName: string; data: unknown }[]
          | unknown,
      ) => {
        if (!Array.isArray(params) || !params.length) return ''
        const label = params[0].axisValue
        const latencyItem = params.find(
          (entry) => entry.seriesName === '延迟',
        ) as { data: number | null } | undefined
        const playersItem = params.find(
          (entry) => entry.seriesName === '在线人数',
        ) as { data: number | null } | undefined
        const latency = latencyItem?.data ?? null
        const players = playersItem?.data ?? null
        const parts = [
          label,
          latency != null ? `延迟：${latency} ms` : '',
          players != null ? `在线：${players}` : '',
        ]
        return parts.filter(Boolean).join('<br/>')
      },
    },
    grid: { left: 40, right: 40, top: 20, bottom: 18 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLabel: { color: palette.axis },
      axisLine: { lineStyle: { color: palette.line } },
    },
    yAxis: [
      {
        type: 'value',
        name: '延迟(ms)',
        min: 0,
        splitLine: { show: false },
        axisLabel: { color: palette.axis },
        nameTextStyle: { color: palette.name },
        axisLine: { lineStyle: { color: palette.line } },
      },
      {
        type: 'value',
        name: '人数',
        position: 'right',
        min: 0,
        splitLine: { show: false },
        axisLabel: { color: palette.axis },
        nameTextStyle: { color: palette.name },
        axisLine: { lineStyle: { color: palette.line } },
      },
    ],
    series: [
      {
        name: '延迟',
        type: 'line',
        data: latencySeries,
        yAxisIndex: 0,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2 },
      },
      {
        name: '在线人数',
        type: 'line',
        data: playerSeries,
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2 },
      },
    ],
  }
}

const updateCountdown = () => {
  if (!nextRefreshAt.value) {
    countdownText.value = '—'
    return
  }
  const diffSeconds = Math.max(
    Math.round(nextRefreshAt.value.diff(dayjs(), 'second')),
    0,
  )
  const minutes = Math.floor(diffSeconds / 60)
  const seconds = diffSeconds % 60
  countdownText.value = `${String(minutes).padStart(2, '0')}:${String(
    seconds,
  ).padStart(2, '0')}`
}

const startCountdown = () => {
  updateCountdown()
  if (countdownTimer.value !== null) return
  countdownTimer.value = window.setInterval(updateCountdown, 1000)
}

const syncTheme = () => {
  if (typeof document === 'undefined') return
  isDark.value = document.documentElement.classList.contains('dark')
}

const loadServers = async () => {
  loading.value = true
  error.value = null
  // Pause countdown while refreshing to avoid showing stale time
  nextRefreshAt.value = null
  updateCountdown()
  try {
    const payload = await apiFetch<ServerStatusResponse>('/server/status')
    servers.value = payload.servers
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    loading.value = false
  }
}

const scheduleAutoRefresh = () => {
  if (refreshTimer.value !== null) {
    window.clearTimeout(refreshTimer.value)
  }
  nextRefreshAt.value = dayjs().add(REFRESH_INTERVAL_MS, 'millisecond')
  updateCountdown()
  startCountdown()
  refreshTimer.value = window.setTimeout(async () => {
    await loadServers()
    scheduleAutoRefresh()
  }, REFRESH_INTERVAL_MS)
}

const handleManualRefresh = async () => {
  await loadServers()
  scheduleAutoRefresh()
}

onMounted(() => {
  syncTheme()
  const observer = new MutationObserver(syncTheme)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', syncTheme)
  onUnmounted(() => {
    observer.disconnect()
    media.removeEventListener('change', syncTheme)
  })

  void loadServers().then(() => {
    scheduleAutoRefresh()
  })
})

onUnmounted(() => {
  if (refreshTimer.value !== null) {
    window.clearTimeout(refreshTimer.value)
    refreshTimer.value = null
  }
  if (countdownTimer.value !== null) {
    window.clearInterval(countdownTimer.value)
    countdownTimer.value = null
  }
})
</script>

<template>
  <section class="server-status-view z-0 mx-auto w-full max-w-4xl p-8">
    <div class="relative flex flex-wrap items-center justify-center gap-3 mb-8">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
        服务端状态
      </h1>

      <UButton
        size="sm"
        variant="ghost"
        color="primary"
        :loading="loading"
        @click="handleManualRefresh"
        class="absolute top-0 right-0 bottom-0"
      >
        刷新
      </UButton>
    </div>

    <div
      v-if="error"
      class="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-500/50 dark:bg-danger-900/40 dark:text-danger-100"
    >
      {{ error }}
    </div>

    <Transition name="fade-expand" mode="out-in">
      <div v-if="loading && !servers.length" class="flex flex-col gap-8">
        <Motion
          v-for="placeholder in skeletonPlaceholders"
          :key="`server-skeleton-${placeholder}`"
          as="div"
          :initial="{ opacity: 0, filter: 'blur(10px)', y: 12 }"
          :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
          :transition="{ duration: 0.35, ease: 'easeOut' }"
        >
          <div class="space-y-2">
            <USkeleton class="h-6 w-48" />
            <USkeleton class="h-4 w-24" />
            <USkeleton class="h-4 w-64" />
          </div>

          <div
            class="mt-2 bg-white dark:bg-slate-700 p-3 border border-slate-200 dark:border-slate-600 rounded-lg"
          >
            <div class="grid gap-3 text-sm text-slate-700 dark:text-slate-200">
              <div class="grid grid-cols-2 gap-2">
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 space-y-2"
                >
                  <USkeleton class="h-3 w-16" />
                  <USkeleton class="h-7 w-24" />
                  <USkeleton class="h-3 w-20" />
                </div>
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 space-y-2"
                >
                  <USkeleton class="h-3 w-20" />
                  <USkeleton class="h-7 w-24" />
                  <USkeleton class="h-3 w-24" />
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/60 space-y-2"
                >
                  <USkeleton class="h-3 w-16" />
                  <USkeleton class="h-5 w-24" />
                </div>
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/60 space-y-2"
                >
                  <USkeleton class="h-3 w-16" />
                  <USkeleton class="h-5 w-20" />
                </div>
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/60 space-y-2"
                >
                  <USkeleton class="h-3 w-20" />
                  <USkeleton class="h-5 w-20" />
                </div>
              </div>
            </div>

            <div
              class="relative mt-5 h-40 rounded-lg border border-slate-200 dark:border-slate-800 py-3 px-1"
            >
              <USkeleton class="h-full w-full rounded-lg" />
            </div>
          </div>
        </Motion>
      </div>
    </Transition>

    <Transition name="fade-expand" mode="out-in">
      <div
        v-if="!loading && !servers.length"
        class="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700/60"
      >
        暂无可用的服务器数据。
      </div>
    </Transition>

    <Transition name="fade-expand" mode="out-in">
      <div v-if="servers.length" class="flex flex-col gap-8">
        <Motion
          v-for="server in servers"
          :key="server.id"
          as="div"
          :initial="{ opacity: 0, filter: 'blur(10px)', y: 12 }"
          :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
          :transition="{ duration: 0.35, ease: 'easeOut' }"
        >
          <div class="space-y-2">
            <div class="space-y-1">
              <div class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ server.displayName }}
              </div>
              <p
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300"
              >
                {{ server.code }}
                <span class="select-none mx-1">·</span>
                {{ editionLabels[server.edition] }}
              </p>
            </div>
            <p
              v-if="server.description"
              class="text-xs text-slate-600 dark:text-slate-300"
            >
              {{ server.description }}
            </p>
          </div>

          <div
            class="mt-2 bg-white dark:bg-slate-700 p-3 border border-slate-200 dark:border-slate-600 rounded-lg"
          >
            <div class="grid gap-3 text-sm text-slate-700 dark:text-slate-200">
              <div class="grid grid-cols-2 gap-2">
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 text-slate-500 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <p
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300"
                  >
                    延迟
                  </p>
                  <p
                    class="text-lg font-semibold text-slate-900 dark:text-white"
                  >
                    {{ latencyLabel(server) }}
                  </p>
                  <p class="text-xs text-slate-500 dark:text-slate-300">
                    {{ formatLatestTime(server) || '暂无数据' }}
                  </p>
                </div>
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 text-slate-500 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <p
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300"
                  >
                    在线人数
                  </p>
                  <p
                    class="text-lg font-semibold text-slate-900 dark:text-white"
                  >
                    {{ playersLabel(server) }}
                  </p>
                  <p class="text-xs text-slate-500 dark:text-slate-300">
                    {{
                      server.ping.latest?.maxPlayers
                        ? `最大：${server.ping.latest.maxPlayers}`
                        : '最大人数未知'
                    }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <p
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300"
                  >
                    游戏版本
                  </p>
                  <p
                    class="text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {{ versionLabel(server) }}
                  </p>
                </div>
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <p
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300"
                  >
                    状态
                  </p>
                  <p
                    class="text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {{ mcsmStatusLabel(server.mcsm) }}
                  </p>
                </div>
                <div
                  class="rounded-lg border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <p
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300"
                  >
                    Beacon 连接
                  </p>
                  <p
                    class="text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {{ beaconStatusLabel(server.beacon) }}
                  </p>
                </div>
              </div>
            </div>

            <div
              class="relative mt-5 h-40 rounded-lg border border-slate-200 dark:border-slate-800 py-3 px-1"
            >
              <VChart
                :key="isDark ? 'chart-dark' : 'chart-light'"
                :option="createChartOption(server, isDark)"
                autoresize
                class="h-full w-full rounded-lg bg-transparent"
              />
              <div
                v-if="!hasHistory(server)"
                class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60 text-sm font-medium text-slate-500 dark:bg-slate-950/60 dark:text-slate-300"
              >
                暂无 Ping 历史
              </div>
            </div>
          </div>
        </Motion>
      </div>
    </Transition>

    <div
      class="mt-12 w-full text-center text-xs text-slate-500 dark:text-slate-400"
    >
      <div>将在 {{ countdownText }} 后自动刷新</div>
      <div class="mt-1">
        更细致的监测数据可在
        <a
          href="https://monitor.hydcraft.cn"
          target="_blank"
          rel="noopener noreferrer"
          class="font-semibold hover:underline"
          >HydCraft Monitor</a
        >
        上查看
      </div>
    </div>
  </section>
</template>

<style scoped>
.fade-expand-enter-active,
.fade-expand-leave-active {
  transition:
    max-height 220ms ease,
    opacity 180ms ease,
    transform 200ms ease,
    margin 220ms ease;
  overflow: hidden;
}

.fade-expand-enter-from,
.fade-expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(6px);
  margin-top: 0;
  margin-bottom: 0;
}

.fade-expand-enter-to,
.fade-expand-leave-from {
  max-height: 999px; /* large enough to cover content height */
  opacity: 1;
  transform: translateY(0);
}
</style>
