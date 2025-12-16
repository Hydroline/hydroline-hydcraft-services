<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/shared/ui'

const uiStore = useUiStore()

const modes = [
  { value: 'light', label: '浅色', icon: 'i-lucide-sun' },
  { value: 'dark', label: '深色', icon: 'i-lucide-moon' },
  { value: 'system', label: '跟随系统', icon: 'i-lucide-monitor' },
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
      class="h-9 w-9 rounded-full hover:bg-accented/70 active:bg-accented/70"
      icon-only
    >
      <UIcon
        :name="
          modes.find((mode) => mode.value === current)?.icon ?? 'i-lucide-sun'
        "
        class="h-6 w-6"
      />
    </UButton>

    <template #content>
      <div class="w-40 space-y-1 p-2">
        <button
          v-for="mode in modes"
          :key="mode.value"
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
          :class="{
            'bg-primary-100/60 text-primary-600 dark:bg-primary-500/20 dark:text-primary-200':
              current === mode.value,
            'text-slate-600 dark:text-slate-300': current !== mode.value,
          }"
          @click="select(mode.value as 'light' | 'dark' | 'system')"
        >
          <UIcon :name="mode.icon" class="text-base" />
          <span>{{ mode.label }}</span>
          <UIcon
            v-if="current === mode.value"
            name="i-lucide-check"
            class="ml-auto text-base"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
