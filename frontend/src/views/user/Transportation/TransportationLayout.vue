<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const tabs = [
  {
    label: '铁路系统',
    name: 'transportation.railway',
    disabled: false,
    description: 'Beacon Railway / Dynmap',
  },
  {
    label: '航空系统（筹备中）',
    name: 'transportation.aviation',
    disabled: true,
    description: '即将上线的航空交通数据',
  },
]

const activeTab = computed(() => {
  if (route.name === 'transportation.aviation') {
    return 'transportation.aviation'
  }
  return 'transportation.railway'
})

function handleTabClick(name: string, disabled: boolean) {
  if (disabled) return
  if (route.name === name) return
  router.push({ name })
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-8xl flex-col gap-5 px-4 py-6 md:py-10">
    <header
      class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/70"
    >
      <p
        class="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400"
      >
        Hydroline Transportation
      </p>
      <div
        class="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <h1 class="text-3xl font-semibold text-slate-900 dark:text-white">
            交通系统管控台
          </h1>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            汇总各启用 Beacon
            的铁路、航空等交通数据，统一展示线路、车站与实时运行态势。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UTooltip
            v-for="tab in tabs"
            :key="tab.name"
            :text="tab.disabled ? '数据整理中，敬请期待' : tab.description"
          >
            <UButton
              :color="activeTab === tab.name ? 'primary' : 'neutral'"
              :variant="activeTab === tab.name ? 'solid' : 'soft'"
              :disabled="tab.disabled"
              @click="handleTabClick(tab.name, tab.disabled)"
            >
              {{ tab.label }}
            </UButton>
          </UTooltip>
        </div>
      </div>
    </header>

    <section class="min-h-[40vh]">
      <RouterView />
    </section>
  </div>
</template>
