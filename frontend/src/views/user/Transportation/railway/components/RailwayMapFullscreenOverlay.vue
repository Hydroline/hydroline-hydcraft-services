<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RailwayMapPanel from '@/views/user/Transportation/railway/components/RailwayMapPanel.vue'
import type { RailwayRouteDetail } from '@/types/transportation'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    variantMode: string
    variantItems: Array<{ label: string; value: string }>
    variantDisabled?: boolean
    routeLabel?: string | null
    lengthKm?: number | null
    stopCount?: number | null
    geometry: RailwayRouteDetail['geometry'] | null
    stops?: RailwayRouteDetail['stops'] | null
    color?: number | null
    loading?: boolean
    autoFocus?: boolean
    combinePaths?: boolean
  }>(),
  {
    stops: () => [] as RailwayRouteDetail['stops'],
    color: null,
    loading: false,
    autoFocus: true,
    combinePaths: true,
    variantDisabled: false,
    routeLabel: null,
    lengthKm: null,
    stopCount: null,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'update:variantMode', value: string): void
}>()

const open = computed(() => props.modelValue)

const close = () => {
  emit('update:modelValue', false)
}

const variantModeModel = computed<string>({
  get: () => props.variantMode,
  set: (value) => emit('update:variantMode', value),
})

const lengthLabel = computed(() => {
  if (props.lengthKm == null) return '—'
  return `${props.lengthKm} km`
})

const stopCountLabel = computed(() => {
  if (props.stopCount == null) return '—'
  return `${props.stopCount}`
})

const insetTop = ref(0)
const insetLeft = ref(0)
let resizeObserver: ResizeObserver | null = null

const mapHeight = computed(() => {
  // Use a viewport-based height so Leaflet container never resolves to 0.
  // (Percentage heights would be treated as auto in the current map panel structure.)
  return `calc(100vh - ${insetTop.value}px)`
})

const updateInset = () => {
  const header = document.querySelector<HTMLElement>('[data-user-shell-header]')
  const content = document.querySelector<HTMLElement>(
    '[data-user-shell-content]',
  )

  const headerRect = header?.getBoundingClientRect()
  insetTop.value = headerRect ? Math.max(0, headerRect.bottom) : 0

  if (!content) {
    insetLeft.value = 0
    return
  }
  const paddingLeft = window.getComputedStyle(content).paddingLeft
  const parsed = Number.parseFloat(paddingLeft)
  insetLeft.value = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

let isLocked = false
let previousBodyOverflow = ''

const lockBodyScroll = () => {
  if (isLocked) return
  const body = document.body
  const existing = body.style.overflow
  if (existing !== 'hidden') {
    previousBodyOverflow = existing
  }
  body.style.overflow = 'hidden'
  isLocked = true
}

const unlockBodyScroll = () => {
  if (!isLocked) return
  const body = document.body
  body.style.overflow = previousBodyOverflow
  isLocked = false
}

const startObservers = () => {
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    updateInset()
  })

  const header = document.querySelector<HTMLElement>('[data-user-shell-header]')
  const content = document.querySelector<HTMLElement>(
    '[data-user-shell-content]',
  )
  if (header) resizeObserver.observe(header)
  if (content) resizeObserver.observe(content)

  window.addEventListener('resize', updateInset, { passive: true })
}

const stopObservers = () => {
  window.removeEventListener('resize', updateInset)
  resizeObserver?.disconnect()
  resizeObserver = null
}

watch(
  () => open.value,
  (value) => {
    if (value) {
      updateInset()
      startObservers()
      lockBodyScroll()
    } else {
      stopObservers()
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (open.value) {
    updateInset()
    startObservers()
  }
})

onBeforeUnmount(() => {
  stopObservers()
  unlockBodyScroll()
})
</script>

<template>
  <Teleport to="body">
    <Transition
      appear
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
      @after-leave="unlockBodyScroll"
    >
      <div
        v-if="open"
        class="fixed"
        :style="{
          top: `${insetTop}px`,
          left: `${insetLeft}px`,
          right: '0px',
          bottom: '0px',
        }"
      >
        <div
          class="absolute inset-0 bg-white/70 dark:bg-slate-950/60 backdrop-blur-xl"
        ></div>

        <div class="relative h-full w-full">
          <RailwayMapPanel
            :geometry="props.geometry"
            :stops="props.stops ?? []"
            :color="props.color"
            :loading="props.loading"
            :auto-focus="props.autoFocus"
            :combine-paths="props.combinePaths"
            :rounded="false"
            :height="mapHeight"
          />

          <div class="pointer-events-none absolute bottom-4 left-4 z-999">
            <div
              class="pointer-events-auto inline-flex items-center gap-5 rounded-lg backdrop-blur-2xl text-white bg-black/20 dark:bg-slate-900/10 shadow px-3 py-2"
              style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)"
            >
              <div class="space-y-0.5">
                <div class="text-lg font-semibold">
                  {{ props.routeLabel || '—' }}
                </div>
                <div class="text-xs">
                  <span class="mr-3">线路全长 {{ lengthLabel }}</span>
                  <span>站点数 {{ stopCountLabel }}</span>
                </div>
              </div>

              <USelect
                v-if="props.variantItems.length > 1"
                v-model="variantModeModel"
                :items="props.variantItems"
                value-key="value"
                label-key="label"
                class="w-48"
                :disabled="Boolean(props.variantDisabled)"
                :ui="{ content: 'z-[35000]' }"
              />
            </div>
          </div>

          <div
            class="pointer-events-none absolute inset-x-4 top-4 flex justify-end z-999"
          >
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              class="flex items-center gap-1 pointer-events-auto backdrop-blur-2xl text-white bg-black/20 dark:bg-slate-900/10 hover:bg-white/10 dark:hover:bg-slate-900/20 shadow"
              @click="close"
            >
              <UIcon name="i-lucide-minimize-2" class="h-3.5 w-3.5" />
              退出全屏
            </UButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
