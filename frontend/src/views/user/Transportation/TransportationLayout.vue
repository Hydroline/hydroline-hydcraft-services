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
    description: '全服正在运行的周目的铁路系统数据',
    icon: 'i-lucide-train',
  },
  {
    label: '航空系统',
    name: 'transportation.aviation',
    disabled: true,
    description: '即将上线的航空交通数据',
    icon: 'i-lucide-navigation',
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
  <div class="relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:py-10">
    <header>
      <div class="flex justify-center gap-4">
        <div class="flex flex-wrap gap-2">
          <UTooltip
            v-for="tab in tabs"
            :key="tab.name"
            :text="tab.disabled ? undefined : tab.description"
          >
            <UButton
              class="flex items-center gap-1 text-xs"
              color="primary"
              :variant="activeTab === tab.name ? 'soft' : 'ghost'"
              :disabled="tab.disabled"
              @click="handleTabClick(tab.name, tab.disabled)"
            >
              <UIcon :name="tab.icon" class="size-4" />
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
