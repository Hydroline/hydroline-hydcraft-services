<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const tabs = [
  {
    label: '导览',
    name: 'company.overview',
    disabled: false,
    description: '工商系统导览与入口说明',
    icon: 'i-lucide-compass',
  },
  {
    label: '仪表盘',
    name: 'company.dashboard',
    disabled: false,
    description: '个人工商数据与公司管理工作台',
    icon: 'i-lucide-gauge',
  },
  {
    label: '工商数据库',
    name: 'company.database',
    disabled: false,
    description: '全服工商主体数据库与筛选',
    icon: 'i-lucide-database',
  },
]

const activeTab = computed(() => {
  if (
    route.name === 'company.database' ||
    route.name === 'company.database.detail'
  ) {
    return 'company.database'
  }
  if (
    route.name === 'company.dashboard' ||
    route.name === 'company.dashboard.owned' ||
    route.name === 'company.dashboard.join'
  ) {
    return 'company.dashboard'
  }
  return 'company.overview'
})

function handleTabClick(name: string, disabled: boolean) {
  if (disabled) return
  if (route.name === name) return
  router.push({ name })
}
</script>

<template>
  <div
    class="relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:py-10"
  >
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
