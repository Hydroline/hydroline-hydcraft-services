<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Motion } from 'motion-v'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { apiFetch } from '@/utils/http/api'
import type {
  RankLeaderEntry,
  RankLeaderboards,
  RankLeadersResponse,
  RankSortField,
} from '@/types/rank'

const MULTI_APPEARANCES_FIELD = 'multiAppearances' as const
type LeaderMetricField = RankSortField | typeof MULTI_APPEARANCES_FIELD

const route = useRoute()
const router = useRouter()

const leaderboardMetrics: Array<{
  field: LeaderMetricField
  label: string
  description: string
  unit?: string
}> = [
  {
    field: 'lastLogin',
    label: '最近登录',
    description: '最近活跃的玩家',
  },
  {
    field: 'registered',
    label: '注册',
    description: '最新加入的玩家',
  },
  {
    field: 'walkDistance',
    label: '行走距离',
    description: '累计行走公里数',
    unit: 'km',
  },
  {
    field: 'flyDistance',
    label: '飞行距离',
    description: '累计飞行公里数',
    unit: 'km',
  },
  {
    field: 'swimDistance',
    label: '游泳距离',
    description: '累计游泳公里数',
    unit: 'km',
  },
  {
    field: 'achievements',
    label: '成就',
    description: '已解锁成就数',
  },
  {
    field: 'deaths',
    label: '死亡',
    description: '死亡次数',
  },
  {
    field: 'playerKilledBy',
    label: '被玩家击杀',
    description: '被玩家击败次数',
  },
  {
    field: 'jumpCount',
    label: '跳跃',
    description: '跳跃次数',
  },
  {
    field: 'playTime',
    label: '游玩时长',
    description: '累计小时数',
    unit: 'h',
  },
  {
    field: 'wandUses',
    label: '手杖放置',
    description: '手杖方块放置次数',
  },
  {
    field: 'logoutCount',
    label: '退出',
    description: '退出次数',
  },
  {
    field: 'mtrBalance',
    label: 'MTR 余额',
    description: '交通余额',
  },
  {
    field: MULTI_APPEARANCES_FIELD,
    label: '重复上榜',
    description: '至少参与两个榜单的玩家',
    unit: '次',
  },
]

const leaderMetric = ref<LeaderMetricField>(
  leaderboardMetrics[0]?.field ?? 'walkDistance',
)
const response = ref<RankLeadersResponse | null>(null)
const leaderboards = ref<RankLeaderboards | null>(null)
const leadersLoading = ref(false)
const leadersError = ref<string | null>(null)
const selectedServerId = ref<string | undefined>(
  typeof route.query.serverId === 'string'
    ? (route.query.serverId as string)
    : undefined,
)

watch(
  () => route.query.serverId,
  (value) => {
    const normalized = typeof value === 'string' ? value : undefined
    if (normalized !== selectedServerId.value) {
      selectedServerId.value = normalized
    }
  },
)

watch(selectedServerId, (value) => {
  const current =
    typeof route.query.serverId === 'string'
      ? (route.query.serverId as string)
      : undefined
  if (value === current) return
  const nextQuery = { ...route.query }
  if (value) {
    nextQuery.serverId = value
  } else {
    delete nextQuery.serverId
  }
  void router.replace({ query: nextQuery })
})

const selectedServerName = computed(() => {
  const selected = response.value?.selectedServer
  return selected?.displayName ?? selected?.id ?? '选择服务器'
})

const totalLeaderboardCount = computed(() =>
  leaderboards.value ? Object.keys(leaderboards.value).length : 0,
)

const repeatedLeaderboardEntries = computed<RankLeaderEntry[]>(() => {
  if (!leaderboards.value) return []
  const counts = new Map<
    string,
    {
      count: number
      bestRank: number
      entry: RankLeaderEntry
    }
  >()
  Object.values(leaderboards.value).forEach((entries) => {
    entries?.forEach((entry) => {
      const key = entry.playerUuid ?? entry.playerName
      if (!key) return
      const current = counts.get(key)
      const rankValue = Number.isFinite(entry.rank)
        ? entry.rank
        : Number.MAX_SAFE_INTEGER
      if (current) {
        current.count += 1
        current.bestRank = Math.min(current.bestRank, rankValue)
        if (!current.entry.playerName && entry.playerName) {
          current.entry = entry
        }
      } else {
        counts.set(key, {
          count: 1,
          bestRank: rankValue,
          entry,
        })
      }
    })
  })
  const aggregated = Array.from(counts.values())
    .filter((item) => item.count >= 2)
    .sort((a, b) => {
      if (b.count === a.count) {
        return a.bestRank - b.bestRank
      }
      return b.count - a.count
    })
    .slice(0, 10)

  return aggregated.map((item, index) => ({
    ...item.entry,
    rank: index + 1,
    value: item.count,
  }))
})

const leaderboardEntries = computed<RankLeaderEntry[]>(() => {
  if (leaderMetric.value === MULTI_APPEARANCES_FIELD) {
    return repeatedLeaderboardEntries.value
  }
  if (!leaderboards.value) return []
  return leaderboards.value[leaderMetric.value] ?? []
})

const activeLeaderboardMeta = computed(() =>
  getLeaderboardMeta(leaderMetric.value),
)

const leaderboardsEmpty = computed(
  () =>
    !leadersLoading.value &&
    !leadersError.value &&
    leaderboards.value !== null &&
    leaderboardEntries.value.length === 0,
)

function formatTimestamp(value: string | null) {
  if (!value) return '—'
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

const integerFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
})
const decimalFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
})

function toSafeNumber(value: number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return 0
}

function formatDistance(value: number | null) {
  return decimalFormatter.format(toSafeNumber(value))
}

function formatCount(value: number | null) {
  return integerFormatter.format(toSafeNumber(value))
}

function formatLeaderboardValue(
  field: LeaderMetricField,
  value: number | string | null,
  totalLeaderboards = 0,
) {
  if (value === null || value === undefined) {
    return '—'
  }
  if (field === MULTI_APPEARANCES_FIELD) {
    const count = typeof value === 'number' ? value : Number(value)
    if (totalLeaderboards > 0) {
      return `${formatCount(count)} / ${formatCount(totalLeaderboards)}`
    }
    return formatCount(count)
  }
  if (field === 'lastLogin' || field === 'registered') {
    const formatted =
      typeof value === 'string' ? value : new Date(Number(value)).toISOString()
    return formatTimestamp(formatted)
  }
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : 0
  if (
    field === 'walkDistance' ||
    field === 'flyDistance' ||
    field === 'swimDistance' ||
    field === 'playTime'
  ) {
    return formatDistance(numericValue)
  }
  return formatCount(numericValue)
}

function getLeaderboardMeta(field: LeaderMetricField) {
  return (
    leaderboardMetrics.find((metric) => metric.field === field) ??
    leaderboardMetrics[0]
  )
}

function leaderboardEntryKey(entry: {
  rank: number
  playerUuid: string | null
  playerName: string | null
}) {
  return entry.playerUuid ?? `${entry.rank}-${entry.playerName ?? 'unknown'}`
}

function playerProfileLink(playerName: string | null) {
  if (!playerName) return '#'
  return `/player/name/${encodeURIComponent(playerName)}`
}

async function loadLeaders(serverId?: string | null) {
  leadersLoading.value = true
  leadersError.value = null
  try {
    const params = new URLSearchParams()
    const targetServer = serverId ?? selectedServerId.value
    if (targetServer) {
      params.set('serverId', targetServer)
    }
    const query = params.toString()
    const endpoint = query ? `/rank/leaders?${query}` : '/rank/leaders'
    const data = await apiFetch<RankLeadersResponse>(endpoint)
    response.value = data
    leaderboards.value = data.leaders
    selectedServerId.value = data.selectedServer.id
  } catch (cause) {
    leaderboards.value = null
    leadersError.value =
      cause instanceof Error ? cause.message : '无法加载指标榜单'
  } finally {
    leadersLoading.value = false
  }
}

onMounted(() => {
  void loadLeaders(selectedServerId.value)
})
</script>

<template>
  <section class="mx-auto w-full max-w-5xl px-4 py-10">
    <header class="flex flex-col items-start gap-4">
      <RouterLink
        :to="{
          name: 'rank',
          query: selectedServerId ? { serverId: selectedServerId } : undefined,
        }"
      >
        <UButton variant="soft" size="sm" icon="i-lucide-arrow-left">
          返回排行榜列表
        </UButton>
      </RouterLink>
    </header>

    <div class="mt-4 space-y-3">
      <div>
        <div class="text-center">
          <h1
            class="relative text-2xl font-semibold text-slate-900 dark:text-white"
          >
            {{ selectedServerName }}{{ activeLeaderboardMeta.label }} TOP 10
          </h1>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            {{ activeLeaderboardMeta.description }}
          </p>
        </div>
        <div class="mt-6 flex justify-center flex-wrap gap-2">
          <UButton
            v-for="metric in leaderboardMetrics"
            :key="metric.field"
            type="button"
            size="xs"
            :variant="leaderMetric === metric.field ? 'solid' : 'ghost'"
            color="primary"
            @click="leaderMetric = metric.field"
          >
            {{ metric.label }}
          </UButton>
        </div>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white px-4 py-2 dark:border-slate-800/70 dark:bg-slate-900 md:mx-4 mt-4"
      >
        <div v-if="leadersLoading" class="space-y-3">
          <USkeleton
            v-for="n in 8"
            :key="`leaders-loading-${n}`"
            class="h-10 w-full rounded-xl"
          />
        </div>
        <div
          v-else-if="leadersError"
          class="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300"
        >
          <span>无法加载指标榜单：{{ leadersError }}</span>
          <UButton
            size="xs"
            variant="soft"
            icon="i-lucide-rotate-ccw"
            @click="loadLeaders(selectedServerId ?? null)"
          >
            重试
          </UButton>
        </div>
        <div
          v-else-if="leaderboardsEmpty"
          class="text-sm text-slate-500 dark:text-slate-400"
        >
          暂无该指标的统计数据。
        </div>
        <div v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <Motion
            v-for="entry in leaderboardEntries"
            :key="`${leaderMetric}-${leaderboardEntryKey(entry)}`"
            as="div"
            class="flex items-center gap-4 py-2"
            :initial="{ opacity: 0, filter: 'blur(10px)', y: 8 }"
            :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
            :transition="{ duration: 0.35, ease: 'easeOut' }"
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              {{ entry.rank }}
            </div>
            <component
              :is="entry.playerName ? RouterLink : 'div'"
              v-bind="
                entry.playerName
                  ? { to: playerProfileLink(entry.playerName) }
                  : undefined
              "
              class="flex flex-col gap-0.5 text-left focus-visible:outline-none"
              :class="
                entry.playerName
                  ? 'rounded px-1 transition-colors hover:text-primary focus-visible:ring-1 focus-visible:ring-primary'
                  : ''
              "
            >
              <span class="text-sm font-medium text-slate-800 dark:text-white">
                {{ entry.playerName ?? entry.playerUuid ?? '未知玩家' }}
              </span>
              <span class="text-xs text-slate-500 dark:text-slate-400">
                <template v-if="entry.bindingId">
                  {{ entry.displayName ?? '未知用户' }}
                </template>
                <template v-else>未绑定</template>
              </span>
            </component>
            <div class="ml-auto text-right">
              <div
                class="text-base font-semibold text-slate-900 dark:text-white"
              >
                {{
                  formatLeaderboardValue(
                    leaderMetric,
                    entry.value,
                    totalLeaderboardCount,
                  )
                }}
                <span v-if="activeLeaderboardMeta.unit" class="ml-1 text-xs">
                  {{ activeLeaderboardMeta.unit }}
                </span>
              </div>
              <div
                class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                TOP {{ entry.rank }}
              </div>
            </div>
          </Motion>
        </div>
      </div>
    </div>
  </section>
</template>
