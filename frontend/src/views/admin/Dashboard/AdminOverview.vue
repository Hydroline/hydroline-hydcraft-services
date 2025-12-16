<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import VChart from 'vue-echarts'
import { usePortalStore } from '@/stores/user/portal'
import { useUiStore } from '@/stores/shared/ui'
import type { AdminHealthStatus } from '@/types/portal'

const portalStore = usePortalStore()
const uiStore = useUiStore()

const { admin } = storeToRefs(portalStore)

onMounted(async () => {
  if (!admin.value) {
    uiStore.startLoading()
    try {
      await portalStore.fetchAdminOverview()
    } finally {
      uiStore.stopLoading()
    }
  }
})

const greeting = computed(() => admin.value?.greeting)
const summary = computed(() => admin.value?.summary)
const activity = computed(() => admin.value?.activity)
const systemMetrics = computed(() => admin.value?.system.metrics ?? [])
const systemUpdatedAt = computed(() => admin.value?.system.updatedAt)
const integrations = computed(() => admin.value?.integrations ?? [])
const quickActions = computed(() => admin.value?.quickActions ?? [])
const highlightStats = computed(() => greeting.value?.highlights ?? [])

const chartHasData = computed(() => (activity.value?.points?.length ?? 0) > 0)

const chartOption = computed(() => {
  const points = activity.value?.points ?? []
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 50, bottom: 30 },
    legend: {
      data: ['新增用户', '新附件'],
      top: 0,
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
    },
    xAxis: {
      type: 'category',
      data: points.map((item) => item.date.slice(5)),
      boundaryGap: false,
      axisLabel: {
        formatter(value: string) {
          const [month, day] = value.split('-')
          return `${Number(month)}月${Number(day)}日`
        },
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitLine: { show: false },
    },
    series: [
      {
        type: 'line',
        name: '新增用户',
        smooth: true,
        showSymbol: false,
        data: points.map((item) => item.registrations),
      },
      {
        type: 'line',
        name: '新附件',
        smooth: true,
        showSymbol: false,
        data: points.map((item) => item.attachments),
      },
    ],
  }
})

const activityStats = computed(() => [
  {
    label: '最近一周注册',
    value: activity.value?.registrationsThisWeek ?? 0,
  },
  {
    label: '最近一周附件',
    value: activity.value?.attachmentsThisWeek ?? 0,
  },
  {
    label: '待绑定玩家',
    value: summary.value?.pendingBindings ?? 0,
  },
])

function formatDateTime(input?: string) {
  if (!input) return '--'
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    return input
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatNumber(value?: number) {
  if (typeof value !== 'number') {
    return '--'
  }
  return new Intl.NumberFormat('zh-CN').format(value)
}

function healthToBadge(status: AdminHealthStatus) {
  switch (status) {
    case 'normal':
      return { color: 'success' as const, label: '正常' }
    case 'warning':
      return { color: 'warning' as const, label: '注意' }
    case 'critical':
    default:
      return { color: 'error' as const, label: '异常' }
  }
}
</script>

<template>
  <div class="space-y-8">
    <section class="px-6 pt-0">
      <div
        class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <p class="text-sm text-slate-500 dark:text-slate-300">
            👋 {{ greeting?.operator ?? '管理员' }}，{{
              greeting?.periodLabel ?? ''
            }}
          </p>
          <h1
            class="mt-2 text-2xl font-semibold text-slate-900 dark:text-white"
          >
            {{ greeting?.message ?? '欢迎回来，继续关注后台动态。' }}
          </h1>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {{ greeting?.subtext ?? '暂无登录记录' }}
          </p>
        </div>
        <div class="grid w-full gap-4 sm:grid-cols-3 lg:w-auto">
          <div
            v-for="item in highlightStats"
            :key="item.label"
            class="rounded-2xl border border-slate-200/60 p-4 text-center dark:border-slate-800/60"
          >
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ item.label }}
            </p>
            <p
              class="mt-2 text-xl font-semibold text-slate-900 dark:text-white"
            >
              {{ item.value }}
            </p>
            <p class="text-xs text-emerald-500" v-if="item.trend === 'up'">
              ↑ {{ item.trendLabel ?? '' }}
            </p>
            <p class="text-xs text-rose-500" v-else-if="item.trend === 'down'">
              ↓ {{ item.trendLabel ?? '' }}
            </p>
            <p class="text-xs text-slate-400" v-else>
              {{ item.trendLabel ?? '—' }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <section
        class="h-full rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <header
          class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
              近况
            </h2>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              {{ activity?.rangeLabel ?? '近 7 天' }} 统计：{{
                summary?.recentActivity ?? ''
              }}
            </p>
          </div>
          <UBadge color="primary" variant="soft">{{
            activity?.rangeLabel ?? '近 7 天'
          }}</UBadge>
        </header>

        <div class="mt-6 h-72">
          <VChart
            v-if="chartHasData"
            :option="chartOption"
            autoresize
            class="h-full w-full"
          />
          <div
            v-else
            class="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
          >
            暂无统计数据
          </div>
        </div>

        <div class="mt-6 grid gap-4 sm:grid-cols-3">
          <div
            v-for="stat in activityStats"
            :key="stat.label"
            class="rounded-2xl border border-slate-200/70 bg-white/70 p-4 dark:border-slate-800/70 dark:bg-slate-900/70"
          >
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ stat.label }}
            </p>
            <p
              class="mt-2 text-2xl font-semibold text-slate-900 dark:text-white"
            >
              {{ formatNumber(stat.value) }}
            </p>
          </div>
        </div>
      </section>

      <div class="flex flex-col gap-4">
        <section
          class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-900/70"
        >
          <header class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                系统运行数据
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                更新时间：{{ formatDateTime(systemUpdatedAt) }}
              </p>
            </div>
            <UBadge color="neutral" variant="soft">延迟监控</UBadge>
          </header>
          <ul class="grid gap-3 md:grid-cols-3 mt-4">
            <li
              v-for="metric in systemMetrics"
              :key="metric.id"
              class="rounded-2xl border border-slate-200/60 bg-white/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <div class="flex items-center justify-between">
                <p
                  class="text-sm font-medium text-slate-800 dark:text-slate-100"
                >
                  {{ metric.label }}
                </p>
                <p
                  class="text-base font-semibold text-slate-900 dark:text-white"
                >
                  {{ metric.value }}
                </p>
              </div>
              <p
                v-if="metric.hint"
                class="text-xs text-slate-500 dark:text-slate-400"
              >
                {{ metric.hint }}
              </p>
            </li>
          </ul>
        </section>

        <section
          class="h-full rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-900/70"
        >
          <header class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              账户系统状态
            </h3>
            <UBadge color="primary" variant="soft">集成</UBadge>
          </header>
          <ul class="grid gap-3 md:grid-cols-2 mt-4">
            <li
              v-for="integration in integrations"
              :key="integration.id"
              class="rounded-2xl border border-slate-200/60 bg-white/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p
                    class="text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {{ integration.name }}
                  </p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    最近同步：{{ formatDateTime(integration.lastSync) }}
                  </p>
                </div>
                <UBadge
                  :color="healthToBadge(integration.status).color"
                  variant="soft"
                >
                  {{ healthToBadge(integration.status).label }}
                </UBadge>
              </div>
              <div class="mt-3 flex flex-col gap-3">
                <div
                  v-for="metric in integration.metrics"
                  :key="metric.label"
                  class="rounded-xl border border-slate-100/60 bg-slate-50/60 p-3 text-sm dark:border-slate-800/60 dark:bg-slate-900/40"
                >
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ metric.label }}
                  </p>
                  <p
                    class="text-base font-semibold text-slate-900 dark:text-white"
                  >
                    {{ metric.value }}
                  </p>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <section class="grid gap-4 md:grid-cols-3">
      <RouterLink
        v-for="action in quickActions"
        :key="action.id"
        :to="action.to"
        class="group"
      >
        <div
          class="h-full rounded-2xl border border-slate-200/70 bg-white/80 hover:bg-slate-100/50 p-5 transition duration-300 dark:border-slate-800/60 dark:bg-slate-900/70 hover:dark:bg-slate-800/70"
        >
          <p
            v-if="action.badge"
            class="text-xs font-medium text-primary-600 dark:text-primary-300"
          >
            {{ action.badge }}
          </p>
          <h3 class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            {{ action.title }}
          </h3>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {{ action.description }}
          </p>
          <p
            class="mt-4 inline-flex items-center text-sm font-medium text-primary-600 dark:text-primary-300"
          >
            查看详情
            <span class="ml-1">→</span>
          </p>
        </div>
      </RouterLink>
    </section>
  </div>
</template>
