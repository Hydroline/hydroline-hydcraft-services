<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const appTooltipConfig = {
  delayDuration: 150,
}

const authStore = useAuthStore()
const { loading, initialized, refreshing } = storeToRefs(authStore)

// Prevent a blank screen while the session endpoint hydrates client state
const showSessionLoader = computed(
  () => (!initialized.value && loading.value) || refreshing.value,
)
</script>

<template>
  <UApp :tooltip="appTooltipConfig">
    <RouterView />
    <Transition
      appear
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showSessionLoader"
        class="fixed inset-0 z-1200 grid place-items-center backdrop-blur-xl"
        role="status"
        aria-live="polite"
      >
        <div
          class="flex min-w-[220px] flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/75 px-8 py-6 text-center backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/70"
        >
          <div
            class="flex h-14 w-14 items-center justify-center rounded-full"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="h-7 w-7 animate-spin text-primary-600 dark:text-primary-400"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </Transition>
  </UApp>
</template>
