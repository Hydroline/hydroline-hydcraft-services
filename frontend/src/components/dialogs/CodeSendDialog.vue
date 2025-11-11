<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  TransitionChild,
  TransitionRoot,
} from '@headlessui/vue'

const props = defineProps<{
  open: boolean
  target: string
  countdown?: number
  title?: string
  description?: string
  // 可选：禁用重发按钮
  disableResend?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'close'): void
  (e: 'resend'): void | Promise<void>
}>()

const secondsLeft = ref(0)
const timer = ref<number | null>(null)
const countdown = computed(() => Math.max(0, secondsLeft.value))
const canResend = computed(() => countdown.value <= 0 && !props.disableResend)

function startTimer() {
  clearTimer()
  secondsLeft.value =
    typeof props.countdown === 'number' ? props.countdown! : 60
  timer.value = window.setInterval(() => {
    if (secondsLeft.value <= 0) {
      clearTimer()
      return
    }
    secondsLeft.value -= 1
  }, 1000)
}

function clearTimer() {
  if (timer.value) {
    clearInterval(timer.value)
    timer.value = null
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) startTimer()
    else clearTimer()
  },
)

onMounted(() => {
  if (props.open) startTimer()
})

onBeforeUnmount(() => {
  clearTimer()
})

function close() {
  emit('update:open', false)
  emit('close')
}

async function handleResend() {
  if (!canResend.value) return
  await emit('resend')
  startTimer()
}
</script>

<template>
  <TransitionRoot :show="props.open" as="template">
    <Dialog class="relative z-1200" @close="close">
      <TransitionChild
        as="template"
        enter="duration-200 ease-out"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="duration-150 ease-in"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
      </TransitionChild>

      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
          <TransitionChild
            as="template"
            enter="duration-200 ease-out"
            enter-from="opacity-0 translate-y-3 scale-95"
            enter-to="opacity-100 translate-y-0 scale-100"
            leave="duration-150 ease-in"
            leave-from="opacity-100 translate-y-0 scale-100"
            leave-to="opacity-0 translate-y-3 scale-95"
          >
            <DialogPanel
              class="w-full max-w-md transform overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/80"
            >
              <DialogTitle
                class="text-lg font-semibold text-slate-900 dark:text-white"
              >
                {{ props.title || '验证码已发送' }}
              </DialogTitle>

              <div class="mt-2 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  {{ props.description || '我们已向以下目标发送验证码：' }}
                  <span
                    class="font-medium text-slate-900 dark:text-slate-100"
                    >{{ props.target }}</span
                  >
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  如果未收到，请检查垃圾邮箱，或稍后重试。
                </p>
              </div>

              <div class="mt-4 flex items-center justify-between">
                <UButton variant="ghost" @click="close">我知道了</UButton>
                <UButton :disabled="!canResend" @click="handleResend">
                  {{ canResend ? '重新发送' : `重新发送（${countdown}s）` }}
                </UButton>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
