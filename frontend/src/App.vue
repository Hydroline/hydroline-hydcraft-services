<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { zh_cn } from '@nuxt/ui/locale'
import { useRoute } from 'vue-router'

const appTooltipConfig = {
  delayDuration: 150,
}

const appToasterConfig = {
  ui: {
    viewport: 'z-[260]',
  },
}

const authStore = useAuthStore()
const { loading, initialized, refreshing } = storeToRefs(authStore)
const route = useRoute()

const showSessionLoader = computed(
  () => (!initialized.value && loading.value) || refreshing.value,
)
const layoutKey = computed(
  () => (route.meta.layout as string) ?? 'default-layout',
)
</script>

<template>
  <UApp :locale="zh_cn" :tooltip="appTooltipConfig" :toaster="appToasterConfig">
    <RouterView v-slot="{ Component }">
      <Transition mode="out-in" appear name="layout-fade">
        <component :is="Component" :key="layoutKey" />
      </Transition>
    </RouterView>

    <Transition
      appear
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showSessionLoader"
        class="fixed inset-0 z-2000 grid place-items-center backdrop-blur-xl"
        role="status"
        aria-live="polite"
      >
        <div
          class="flex w-full h-full flex-col justify-center items-center gap-4 0 bg-white/75 px-8 py-6 dark:bg-slate-900/70"
        >
          <div class="flex h-14 w-14 items-center justify-center rounded-full">
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

<style scoped>
.layout-fade-enter-active,
.layout-fade-leave-active {
  transition: opacity 250ms ease;
}

.layout-fade-enter-from,
.layout-fade-leave-to {
  opacity: 0;
}
</style>
