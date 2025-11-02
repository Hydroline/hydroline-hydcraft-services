<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import AppLoadingBar from '@/components/common/AppLoadingBar.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { useAuthStore } from '@/stores/auth'
import { usePortalStore } from '@/stores/portal'

const route = useRoute()
const authStore = useAuthStore()
const portalStore = usePortalStore()

const { admin } = storeToRefs(portalStore)
const sidebarOpen = ref(false)

const menu = computed(() => [
  { label: '总览', to: '/admin', icon: 'i-heroicons-presentation-chart-bar-20-solid' },
  { label: '用户与玩家', to: '/admin/users', icon: 'i-heroicons-users-20-solid' },
  { label: '附件系统', to: '/admin/attachments', icon: 'i-heroicons-archive-box-20-solid' },
  { label: 'RBAC 管理', to: '/admin/rbac', icon: 'i-heroicons-shield-check-20-solid' },
  { label: '配置管理', to: '/admin/config', icon: 'i-heroicons-wrench-screwdriver-20-solid' },
])

function isActive(item: { to: string }) {
  if (item.to === '/admin') {
    return route.path === item.to
  }
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

onMounted(() => {
  if (!admin.value && authStore.token) {
    void portalStore.fetchAdminOverview().catch(() => {
      /* 概览加载失败时保持侧边统计留空 */
    })
  }
})
</script>

<template>
  <div class="relative min-h-screen bg-slate-50 dark:bg-slate-950">
    <AppLoadingBar />

    <header class="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80">
      <div class="flex items-center gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          class="h-9 w-9 rounded-full lg:hidden"
          icon="i-heroicons-bars-3-20-solid"
          @click="sidebarOpen = !sidebarOpen"
        />
        <h1 class="text-lg font-semibold text-slate-900 dark:text-white">Hydroline 管理后台</h1>
      </div>

      <div class="flex items-center gap-2">
        <UTooltip text="前台首页">
          <UButton to="/" color="neutral" variant="ghost" size="xs" class="rounded-full" icon="i-heroicons-home-modern-20-solid" />
        </UTooltip>
        <ThemeToggle />
        <div class="flex items-center gap-2 rounded-full bg-white/70 px-2 py-1 text-sm shadow-sm dark:bg-slate-900/70">
          <UserAvatar :name="authStore.displayName" :src="authStore.user?.image ?? null" size="sm" />
          <span class="hidden text-slate-700 dark:text-slate-200 sm:block">{{ authStore.displayName ?? authStore.user?.email }}</span>
        </div>
      </div>
    </header>

    <div class="flex">
      <transition name="slide-fade">
        <aside
          v-if="sidebarOpen"
          class="fixed inset-y-0 left-0 z-30 w-72 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:bg-slate-950/95 lg:hidden"
        >
          <nav class="space-y-2 text-sm">
            <RouterLink
              v-for="item in menu"
              :key="item.label"
              :to="item.to"
              class="flex items-center gap-3 rounded-xl px-3 py-2 transition"
              :class="[
                isActive(item)
                  ? 'bg-primary-100/80 text-primary-600 dark:bg-primary-500/20 dark:text-primary-100'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white',
              ]"
            >
              <UIcon :name="item.icon" class="text-base" />
              {{ item.label }}
            </RouterLink>
          </nav>
        </aside>
      </transition>

      <aside class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-slate-200/60 bg-white/70 p-4 dark:border-slate-800/60 dark:bg-slate-950/70 lg:block">
        <nav class="space-y-2 text-sm">
          <RouterLink
            v-for="item in menu"
            :key="item.label"
            :to="item.to"
            class="flex items-center gap-3 rounded-xl px-3 py-2 transition"
            :class="[
              isActive(item)
                ? 'bg-primary-100/80 text-primary-600 dark:bg-primary-500/20 dark:text-primary-100'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white',
            ]"
          >
            <UIcon :name="item.icon" class="text-base" />
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="mt-6 space-y-3 rounded-xl border border-slate-200/70 bg-white/70 p-4 text-xs text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
          <p class="font-medium text-slate-700 dark:text-slate-200">附件系统总览</p>
          <p>已存储：{{ admin?.attachments.total ?? 0 }} 个附件</p>
          <p>公共资源：{{ admin?.attachments.recent.filter((item) => item.isPublic).length ?? 0 }} 个</p>
        </div>
      </aside>

      <main class="flex-1 bg-white/70 px-4 pb-12 pt-6 backdrop-blur-sm dark:bg-slate-950/80">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-1rem);
  opacity: 0;
}
</style>
