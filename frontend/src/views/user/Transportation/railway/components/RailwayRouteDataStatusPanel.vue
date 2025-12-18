<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { RailwayRouteDetail } from '@/types/transportation'

dayjs.extend(relativeTime)

const props = defineProps<{
  detail: RailwayRouteDetail
}>()

const payload = computed(() => props.detail.route.payload ?? {})

const routeType = computed(() => (payload.value.route_type as string) || '—')
const circularState = computed(
  () => (payload.value.circular_state as string) || '—',
)

const lightRailNumberParts = computed(() => {
  const raw = payload.value.light_rail_route_number
  if (typeof raw !== 'string') return []
  return raw.split('|').map((part) => part.trim())
})

const lightRailNumberPrimary = computed(
  () => lightRailNumberParts.value[0] || '—',
)

const lightRailNumberSecondary = computed(
  () => lightRailNumberParts.value[1] || null,
)

function formatTimestamp(value: number | null | undefined) {
  if (!value) return '—'
  const d = dayjs(value)
  if (!d.isValid()) return '—'
  return `${d.format('YYYY-MM-DD HH:mm:ss')}`
}

const lastUpdatedDisplay = computed(() =>
  formatTimestamp(props.detail.metadata.lastUpdated ?? null),
)
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-lg text-slate-600 dark:text-slate-300">数据状态</h3>
    <div
      class="grid gap-2 rounded-xl border border-slate-200/60 bg-white px-4 py-3 dark:border-slate-800/60 dark:bg-slate-700/60"
    >
      <div
        class="flex justify-between text-sm text-slate-600 dark:text-slate-300"
      >
        <span>运输模式</span>
        <span class="font-medium text-slate-900 dark:text-white">
          {{ detail.route.transportMode || '—' }}
        </span>
      </div>

      <div
        class="flex justify-between text-sm text-slate-600 dark:text-slate-300"
      >
        <span>线路类型</span>
        <span class="font-medium text-slate-900 dark:text-white">
          {{ routeType }}
        </span>
      </div>

      <div
        class="flex justify-between text-sm text-slate-600 dark:text-slate-300"
      >
        <span>环线属性</span>
        <span class="font-medium text-slate-900 dark:text-white">
          {{ circularState }}
        </span>
      </div>

      <div
        class="flex justify-between text-sm text-slate-600 dark:text-slate-300"
      >
        <span>轻轨编号</span>
        <span class="text-slate-900 dark:text-white">
          <span class="font-medium">{{ lightRailNumberPrimary }}</span>
          <span
            v-if="lightRailNumberSecondary"
            class="ml-1 text-xs text-slate-600 dark:text-slate-400"
          >
            {{ lightRailNumberSecondary }}
          </span>
        </span>
      </div>

      <div
        class="flex justify-between text-sm text-slate-600 dark:text-slate-300"
      >
        <span>数据更新</span>
        <span class="font-medium text-slate-900 dark:text-white">
          {{ lastUpdatedDisplay }}
        </span>
      </div>
    </div>
  </div>
</template>
