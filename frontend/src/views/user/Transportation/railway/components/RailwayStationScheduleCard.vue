<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'

const props = defineProps<{
  stationId: string
  serverId: string
  railwayType: string
}>()

type ScheduleItem = {
  routeName: string
  route: string
  color: number
  destination: string
  circular: string
  routeId: string | number
  arrivalMillis: number
  trainCars: number
  currentStationIndex: number
  platform?: string
}

const store = useTransportationRailwayStore()
const loading = ref(true)
const error = ref<string | null>(null)
const schedule = ref<ScheduleItem[]>([])
const now = ref(Date.now())
const failCount = ref(0)
const emptyCount = ref(0)

const expanded = ref(false)
const contentRef = ref<HTMLElement | null>(null)
let lastContentHeight: number | null = null

let timerInterval: number | null = null
let pollingInterval: number | null = null

function debounce(fn: Function, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: any[]) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

const startPolling = () => {
  stopPolling()
  pollingInterval = window.setInterval(() => {
    fetchSchedule(true)
  }, 5000)
}

const stopPolling = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

const fetchSchedule = async (isPolling = false) => {
  if (!isPolling) loading.value = true
  if (!isPolling) error.value = null
  try {
    const data = await store.fetchStationSchedule({
      id: props.stationId,
      serverId: props.serverId,
      railwayType: props.railwayType,
    })
    schedule.value = data
    failCount.value = 0
    error.value = null

    if (data.length === 0) {
      emptyCount.value++
      if (isPolling && emptyCount.value > 2) {
        stopPolling()
      }
    } else {
      emptyCount.value = 0
    }

    return true
  } catch (e) {
    console.error(e)
    failCount.value++
    if (!isPolling || failCount.value > 2) {
      error.value = '时刻表加载失败'
      if (isPolling) stopPolling()
    }
    return false
  } finally {
    if (!isPolling) loading.value = false
  }
}

const handleRefresh = debounce(async () => {
  stopPolling()
  const success = await fetchSchedule(false)
  if (success) {
    startPolling()
  }
}, 1000)

watch(
  () => [props.stationId, props.serverId, props.railwayType],
  async () => {
    stopPolling()
    const success = await fetchSchedule()
    if (success) startPolling()
  },
)

onMounted(async () => {
  const success = await fetchSchedule()
  if (success) {
    startPolling()
  }

  const updateTimer = () => {
    now.value = Date.now()
    timerInterval = requestAnimationFrame(updateTimer)
  }
  timerInterval = requestAnimationFrame(updateTimer)
})

onUnmounted(() => {
  if (timerInterval) cancelAnimationFrame(timerInterval)
  stopPolling()
})

function colorToHex(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '#cccccc'
  const sanitized = Math.max(0, Math.floor(value))
  return `#${sanitized.toString(16).padStart(6, '0').slice(-6)}`
}

function formatTime(seconds: number) {
  if (seconds < 0) return ''
  if (seconds >= 3600) {
    return (
      Math.floor(seconds / 3600) +
      ':' +
      ('0' + Math.floor((seconds % 3600) / 60)).slice(-2) +
      ':' +
      ('0' + Math.floor(seconds % 60)).slice(-2)
    )
  } else {
    return (
      Math.floor(seconds / 60) +
      ':' +
      ('0' + Math.floor(seconds % 60)).slice(-2)
    )
  }
}

const sortedItems = computed(() => {
  return schedule.value
    .map((item) => {
      const arrivalDifference = Math.floor(
        (item.arrivalMillis - now.value) / 1000,
      )

      // Parse names like "English|Chinese"
      const routeNameParts = (item.routeName || '').split('||')[0].split('|')
      const routeName = routeNameParts[0]
      const routeNameSub = routeNameParts[1] || ''

      const routeNumberParts = (item.route || '').split('|')
      const routeNumber = routeNumberParts[0]

      const destinationParts = (item.destination || '').split('|')
      const destination = destinationParts[0]

      return {
        ...item,
        arrivalDifference,
        displayTime: arrivalDifference < 0 ? '' : formatTime(arrivalDifference),
        routeNameDisplay: routeName,
        routeNameSubDisplay: routeNameSub,
        routeNumberDisplay: routeNumber,
        destinationDisplay: destination,
        hexColor: colorToHex(item.color),
      }
    })
    .sort((a, b) => a.arrivalMillis - b.arrivalMillis)
})

const MAX_VISIBLE_ITEMS = 6

const visibleItems = computed(() => {
  if (expanded.value) return sortedItems.value
  return sortedItems.value.slice(0, MAX_VISIBLE_ITEMS)
})

const hasMore = computed(() => sortedItems.value.length > MAX_VISIBLE_ITEMS)

watch(
  () => [visibleItems.value.length, expanded.value] as const,
  async () => {
    await nextTick()
    const el = contentRef.value
    if (!el) return

    const nextHeight = el.getBoundingClientRect().height
    if (lastContentHeight == null) {
      lastContentHeight = nextHeight
      return
    }
    if (Math.abs(nextHeight - lastContentHeight) < 1) return

    el.style.height = `${lastContentHeight}px`
    el.style.overflow = 'hidden'
    // force reflow
    void el.getBoundingClientRect()
    el.style.transition = 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)'
    el.style.height = `${nextHeight}px`

    window.setTimeout(() => {
      if (el !== contentRef.value) return
      el.style.transition = ''
      el.style.height = ''
      el.style.overflow = ''
    }, 320)

    lastContentHeight = nextHeight
  },
  { flush: 'post' },
)
</script>

<template>
  <div>
    <h3
      class="flex items-center justify-between text-lg text-slate-600 dark:text-slate-300"
    >
      时刻表
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="ghost"
        :loading="loading"
        @click="handleRefresh"
      >
        刷新
      </UButton>
    </h3>

    <div
      class="mt-3 relative rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 overflow-hidden"
    >
      <div
        v-if="loading && !schedule.length"
        class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm z-10"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="h-6 w-6 animate-spin text-slate-400"
        />
      </div>

      <div v-if="error" class="p-4 text-center text-sm">
        {{ error }}
      </div>

      <div
        v-else-if="!schedule.length && !loading"
        class="text-center text-sm text-slate-500"
      >
        暂无班次信息
      </div>

      <div v-else>
        <div ref="contentRef">
          <div class="divide-y divide-slate-100 dark:divide-slate-800/60">
            <div
              v-for="item in visibleItems"
              :key="`${item.routeId}-${item.arrivalMillis}`"
              class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <div class="flex items-center gap-3 overflow-hidden">
                <div
                  class="shrink-0 w-1.5 h-10 rounded-full"
                  :style="{ backgroundColor: item.hexColor }"
                ></div>

                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span
                      class="font-semibold text-slate-900 dark:text-white truncate"
                    >
                      {{ item.routeNumberDisplay }}
                    </span>
                    <span
                      class="text-sm text-slate-600 dark:text-slate-300 truncate"
                    >
                      {{ item.destinationDisplay }}
                    </span>
                    <UIcon
                      v-if="item.circular === 'cw'"
                      name="i-lucide-rotate-cw"
                      class="h-3.5 w-3.5 text-slate-400"
                    />
                    <UIcon
                      v-else-if="item.circular === 'ccw'"
                      name="i-lucide-rotate-ccw"
                      class="h-3.5 w-3.5 text-slate-400"
                    />
                  </div>
                  <div
                    class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <span class="truncate">{{ item.routeNameDisplay }}</span>
                    <span
                      v-if="item.platform"
                      class="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono"
                    >
                      {{ item.platform.split('||')[0].split('|')[0] }}
                    </span>
                    <span
                      v-if="item.trainCars"
                      class="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500"
                    >
                      {{ item.trainCars }} 节
                    </span>
                  </div>
                </div>
              </div>

              <div class="text-right shrink-0 ml-4">
                <div
                  class="text-lg font-mono font-medium text-slate-900 dark:text-white"
                >
                  {{ item.displayTime }}
                </div>
                <Transition
                  mode="out-in"
                  enter-active-class="transition-all duration-500 ease-out"
                  enter-from-class="opacity-0 blur-sm"
                  enter-to-class="opacity-100 blur-0"
                  leave-active-class="transition-all duration-500 ease-in"
                  leave-from-class="opacity-100 blur-0"
                  leave-to-class="opacity-0 blur-sm"
                >
                  <div
                    v-if="item.arrivalDifference < 0"
                    class="text-xs text-green-400"
                    key="arrived"
                  >
                    已到站
                  </div>
                  <div v-else class="text-xs text-slate-400" key="arriving">
                    后到达
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="hasMore && !expanded"
          class="pt-2 flex justify-center border-t border-slate-100 dark:border-slate-800/60"
        >
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            class="w-full flex justify-center"
            @click="expanded = true"
          >
            查看剩余 {{ sortedItems.length - MAX_VISIBLE_ITEMS }} 个班次
            <UIcon name="i-lucide-chevron-down" class="ml-1 h-3 w-3" />
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
