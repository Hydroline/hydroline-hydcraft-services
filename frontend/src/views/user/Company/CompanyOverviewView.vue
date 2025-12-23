<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import VChart from 'vue-echarts'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import { useUiStore } from '@/stores/shared/ui'
import CompanySummaryCard from '@/components/company/CompanySummaryCard.vue'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const router = useRouter()
const uiStore = useUiStore()
const registrationDays = ref(30)

const canManage = computed(() => authStore.isAuthenticated)

const industries = computed(() => companyStore.meta?.industries ?? [])
const types = computed(() => companyStore.meta?.types ?? [])

const isDarkMode = computed(() => uiStore.resolvedTheme === 'dark')

const registrationPalette = computed(() => {
  if (isDarkMode.value) {
    return {
      text: '#f8fafc',
      label: '#e2e8f0',
      axis: '#94a3b8',
      split: '#1f2937',
      companyLine: '#38bdf8',
      individualLine: '#fb7185',
      companyArea: 'rgba(56,189,248,0.18)',
      individualArea: 'rgba(251,113,133,0.18)',
      tooltipBg: '#0f172a',
      tooltipText: '#f8fafc',
    }
  }
  return {
    text: '#0f172a',
    label: '#475569',
    axis: '#94a3b8',
    split: '#e2e8f0',
    companyLine: '#0ea5e9',
    individualLine: '#ec4899',
    companyArea: 'rgba(14,165,233,0.18)',
    individualArea: 'rgba(236,72,153,0.18)',
    tooltipBg: '#ffffff',
    tooltipText: '#0f172a',
  }
})

const normalizedRegistrations = computed(() => {
  if (companyStore.dailyRegistrations.length) {
    return companyStore.dailyRegistrations
  }
  const days = Math.max(1, registrationDays.value)
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(base)
    day.setDate(base.getDate() - (days - 1 - index))
    return {
      date: day.toISOString().slice(0, 10),
      total: 0,
      individual: 0,
    }
  })
})

const registrationTotals = computed(() => {
  const rows = normalizedRegistrations.value
  return rows.reduce(
    (acc, row) => {
      const individual = row.individual ?? 0
      const total = row.total ?? 0
      const companyOnly = Math.max(total - individual, 0)
      acc.company += companyOnly
      acc.individual += individual
      acc.total += total
      return acc
    },
    { company: 0, individual: 0, total: 0 },
  )
})

const registrationChartOption = computed(() => {
  const palette = registrationPalette.value
  const rows = normalizedRegistrations.value
  const labels = rows.map((row) => row.date.slice(5))
  const companySeries = rows.map((row) =>
    Math.max((row.total ?? 0) - (row.individual ?? 0), 0),
  )
  const individualSeries = rows.map((row) => row.individual ?? 0)
  const maxSeriesValue = Math.max(1, ...companySeries, ...individualSeries)
  return {
    darkMode: isDarkMode.value,
    textStyle: { color: palette.text },
    tooltip: {
      trigger: 'axis',
      backgroundColor: palette.tooltipBg,
      textStyle: { color: palette.tooltipText },
      borderColor: palette.split,
      borderWidth: 1,
      padding: 12,
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || !params.length) {
          return ''
        }
        const axisValue = params[0]?.axisValue ?? ''
        const lines = params
          .map((entry: any) => {
            if (entry.data == null) return null
            return `${entry.marker} ${entry.seriesName}: ${entry.data}`
          })
          .filter(Boolean)
        return [axisValue, ...lines].join('<br/>')
      },
    },
    grid: { left: 18, right: 18, bottom: 36, top: 24 },
    legend: {
      data: ['公司主体', '个体工商户'],
      textStyle: { color: palette.text },
      icon: 'circle',
      itemGap: 24,
      itemWidth: 10,
      itemHeight: 10,
      top: 0,
      left: 'center',
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: palette.axis } },
      axisLabel: { color: palette.label },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false, lineStyle: { color: palette.axis } },
      axisLabel: { color: palette.label },
      splitLine: { show: false, lineStyle: { color: palette.split } },
      minInterval: 1,
      min: 0,
      max: maxSeriesValue,
    },
    series: [
      {
        name: '公司主体',
        type: 'line',
        data: companySeries,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: palette.companyLine, width: 2 },
        areaStyle: { color: palette.companyArea },
      },
      {
        name: '个体工商户',
        type: 'line',
        data: individualSeries,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: palette.individualLine, width: 2 },
        areaStyle: { color: palette.individualArea },
      },
    ],
  }
})

const formatCount = (value: number) =>
  value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })

const handleDashboard = () => {
  if (!authStore.isAuthenticated) {
    uiStore.openLoginDialog()
    return
  }
  router.push('/company/dashboard')
}

const refreshRegistrations = () => {
  void companyStore.fetchDailyRegistrations(registrationDays.value)
}

onMounted(() => {
  companyStore.fetchMeta()
  companyStore.fetchRecommendations('recent')
  companyStore.fetchRecommendations('active')
  void companyStore.fetchDailyRegistrations(registrationDays.value)
})
</script>

<template>
  <section class="space-y-6">
    <div
      class="relative overflow-hidden rounded-3xl border border-slate-200 bg-linear-to-br from-slate-50 via-white to-primary-50 p-8 dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900"
    >
      <div class="space-y-4 relative z-1">
        <p
          class="text-sm font-semibold uppercase tracking-widest text-primary-500"
        >
          Hydroline 工商系统
        </p>
        <h1
          class="text-3xl font-semibold leading-tight text-slate-800 dark:text-white"
        >
          仿真工商系统 · 全服统一信息 · 先批后审
        </h1>
        <p class="text-base text-slate-600 dark:text-slate-300">
          MTR 铁路想要运营主体？信息只登记在玩家名下不够带派？氢气工艺使用
          Hydroline 工商系统为所有玩家提供仿真式的公司注册与管理服务！
        </p>
      </div>
      <div
        class="pointer-events-none absolute z-0 inset-y-0 right-0 hidden w-1/2 select-none items-center justify-center lg:flex"
      >
        <div
          class="h-48 w-48 rounded-full bg-primary-100/80 dark:bg-primary-900/80 blur-3xl"
        />
      </div>
    </div>

    <div class="space-y-4">
      <div
        class="rounded-3xl border border-slate-200 bg-white/80 p-6 transition dark:border-slate-800 dark:bg-slate-900/70"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              近 {{ registrationDays }} 天注册趋势
            </p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400">
              近 {{ registrationDays }} 天
            </span>
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              icon="i-lucide-refresh-cw"
              :loading="companyStore.dailyRegistrationsLoading"
              @click="refreshRegistrations"
            >
              刷新
            </UButton>
          </div>
        </div>
        <div class="mt-6">
          <div class="relative">
            <VChart
              :option="registrationChartOption"
              autoresize
              class="w-full"
              :style="{ height: '280px' }"
              theme="hyd-font"
            />
            <div
              v-if="
                !companyStore.dailyRegistrations.length &&
                !companyStore.dailyRegistrationsLoading
              "
              class="mt-2 text-xs text-slate-500 dark:text-slate-400"
            >
              目前尚无注册数据，图表展示最近
              {{ registrationDays }} 天的空白趋势。
            </div>
            <div
              v-else-if="companyStore.dailyRegistrationsLoading"
              class="mt-2 text-xs text-slate-500 dark:text-slate-400"
            >
              正在加载注册趋势...
            </div>
          </div>
        </div>
        <div class="mt-6 grid gap-4 sm:grid-cols-3">
          <div
            class="rounded-2xl border border-slate-200/60 bg-white/70 p-4 text-xs dark:border-slate-800/60 dark:bg-slate-900/70"
          >
            <p
              class="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400"
            >
              公司主体总数
            </p>
            <p
              class="mt-2 text-2xl font-semibold text-slate-900 dark:text-white"
            >
              {{ formatCount(registrationTotals.company) }}
            </p>
          </div>
          <div
            class="rounded-2xl border border-slate-200/60 bg-white/70 p-4 text-xs dark:border-slate-800/60 dark:bg-slate-900/70"
          >
            <p
              class="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400"
            >
              个体工商户总数
            </p>
            <p
              class="mt-2 text-2xl font-semibold text-slate-900 dark:text-white"
            >
              {{ formatCount(registrationTotals.individual) }}
            </p>
          </div>
          <div
            class="rounded-2xl border border-slate-200/60 bg-white/70 p-4 text-xs dark:border-slate-800/60 dark:bg-slate-900/70"
          >
            <p
              class="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400"
            >
              累计注册
            </p>
            <p
              class="mt-2 text-2xl font-semibold text-slate-900 dark:text-white"
            >
              {{ formatCount(registrationTotals.total) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                最近入库公司
              </h2>
            </div>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-refresh-cw"
              :loading="companyStore.recommendationsLoading"
              @click="companyStore.fetchRecommendations('recent')"
            />
          </div>
        </template>
        <div class="grid gap-4 md:grid-cols-2">
          <CompanySummaryCard
            v-for="item in companyStore.recommendations.recent"
            :key="item.id"
            :company="item"
          />
          <div
            v-if="companyStore.recommendations.recent.length === 0"
            class="col-span-full rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
          >
            暂无数据，稍后再来看看。
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                最近活跃公司
              </h2>
            </div>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-refresh-cw"
              :loading="companyStore.recommendationsLoading"
              @click="companyStore.fetchRecommendations('active')"
            />
          </div>
        </template>
        <div class="grid gap-4 md:grid-cols-2">
          <CompanySummaryCard
            v-for="item in companyStore.recommendations.active"
            :key="item.id"
            :company="item"
          />
          <div
            v-if="companyStore.recommendations.active.length === 0"
            class="col-span-full rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
          >
            暂无数据，稍后再来看看。
          </div>
        </div>
      </UCard>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              行业体系
            </h3>
          </div>
        </template>
        <div class="grid gap-3 md:grid-cols-2" v-if="industries.length > 0">
          <div
            v-for="industry in industries"
            :key="industry.id"
            class="rounded-2xl border border-slate-200/80 p-4 text-sm dark:border-slate-800"
          >
            <div class="font-semibold text-slate-900 dark:text-white">
              {{ industry.name }}
            </div>
            <p class="mt-1 text-slate-500">
              {{ industry.description || '行业描述待完善。' }}
            </p>
          </div>
        </div>
        <div
          v-else
          class="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
        >
          尚未配置行业，请稍后查看。
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              公司类型
            </h3>
          </div>
        </template>
        <div class="space-y-3">
          <div
            v-for="type in types"
            :key="type.id"
            class="rounded-2xl border border-slate-200/80 p-4 text-sm dark:border-slate-800"
          >
            <div class="flex items-center justify-between">
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ type.name }}
              </p>
              <span class="text-xs text-slate-500">{{ type.category }}</span>
            </div>
            <p class="mt-1 text-slate-500">
              {{ type.description || '暂无描述，创建流程时可自定义。' }}
            </p>
          </div>
          <div
            v-if="types.length === 0"
            class="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
          >
            尚未配置类型。
          </div>
        </div>
      </UCard>
    </div>
  </section>
</template>
