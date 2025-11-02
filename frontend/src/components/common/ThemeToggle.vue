<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()

const modes = [
  { value: 'light', label: '浅色', icon: 'i-heroicons-sun-20-solid' },
  { value: 'dark', label: '深色', icon: 'i-heroicons-moon-20-solid' },
  { value: 'system', label: '跟随系统', icon: 'i-heroicons-computer-desktop-20-solid' },
]

const current = computed(() => uiStore.themeMode)

function select(mode: 'light' | 'dark' | 'system') {
  uiStore.setTheme(mode)
}
</script>

<template>
  <UPopover :popper="{ placement: 'bottom-end' }">
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      class="h-9 w-9 rounded-full"
      icon-only
    >
      <UIcon :name="modes.find((mode) => mode.value === current)?.icon ?? 'i-heroicons-sun-20-solid'" />
    </UButton>

    <template #content>
      <div class="w-40 space-y-1 p-2">
        <button
          v-for="mode in modes"
          :key="mode.value"
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
          :class="{
            'bg-primary-100/60 text-primary-600 dark:bg-primary-500/20 dark:text-primary-200': current === mode.value,
            'text-slate-600 dark:text-slate-300': current !== mode.value,
          }"
          @click="select(mode.value as 'light' | 'dark' | 'system')"
        >
          <UIcon :name="mode.icon" class="text-base" />
          <span>{{ mode.label }}</span>
          <UIcon
            v-if="current === mode.value"
            name="i-heroicons-check-20-solid"
            class="ml-auto text-base"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
