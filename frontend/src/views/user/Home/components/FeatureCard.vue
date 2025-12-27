<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = withDefaults(
  defineProps<{
    title: string
    description: string
    icon: string
    image?: string
    to?: string
  }>(),
  {
    image: '',
    to: '',
  },
)

const hasLink = computed(() => Boolean(props.to))
const wrapperComponent = computed(() => (hasLink.value ? RouterLink : 'div'))
const wrapperProps = computed(() => (hasLink.value ? { to: props.to } : {}))
</script>

<template>
  <component
    :is="wrapperComponent"
    v-bind="wrapperProps"
    class="group relative flex h-50 flex-col justify-end overflow-hidden rounded-3xl border border-slate-700/20 bg-white/20 p-5 text-slate-800 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.4)] backdrop-blur dark:border-slate-200/80 dark:bg-slate-900/70 dark:text-slate-100 hover:outline-primary-600 outline-2 outline-transparent transition duration-200 cursor-pointer group"
  >
    <div
      v-if="image"
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,var(--color-slate-900),transparent_70%)] filter-[brightness(0.8)]"
    >
      <img
        :src="image"
        :alt="title"
        class="h-full w-full object-cover saturate-110 opacity-85"
      />
    </div>

    <div class="relative z-10 flex items-end justify-between gap-4">
      <div style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)">
        <h3 class="text-2xl font-semibold leading-snug text-slate-100">
          {{ title }}
        </h3>
        <p class="text-sm leading-relaxed text-slate-300">
          {{ description }}
        </p>
      </div>

      <div
        class="flex shrink-0 h-11 w-11 items-center justify-center rounded-2xl border border-slate-500/50 bg-slate-700/80 text-slate-100 group-hover:bg-slate-800 transition duration-300"
      >
        <UIcon :name="icon" class="h-6 w-6" />
      </div>
    </div>
  </component>
</template>
