<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import AppLoadingBar from '@/components/common/AppLoadingBar.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { useAuthStore } from '@/stores/auth'
import { usePortalStore } from '@/stores/portal'
import { apiFetch, ApiError } from '@/utils/api'

const route = useRoute()
const authStore = useAuthStore()
const portalStore = usePortalStore()

const { admin } = storeToRefs(portalStore)
const sidebarOpen = ref(false)

type MenuItem = {
  label: string
  to: string
  icon: string
}

type MenuGroup = {
  key: string
  label: string
  items: MenuItem[]
  collapsible?: boolean
  defaultCollapsed?: boolean
}

const menuGroups = computed<MenuGroup[]>(() => [
  {
    key: 'overview',
    label: '总览',
    collapsible: true,
    defaultCollapsed: false,
    items: [{ label: '总览', to: '/admin', icon: 'i-lucide-layout-dashboard' }],
  },
  {
    key: 'account',
    label: '用户与权限',
    collapsible: true,
    defaultCollapsed: false,
    items: [
      { label: '用户信息', to: '/admin/users', icon: 'i-lucide-user-round' },
      { label: '玩家信息', to: '/admin/players', icon: 'i-lucide-users' },
      { label: 'RBAC 管理', to: '/admin/rbac', icon: 'i-lucide-shield-check' },
      {
        label: '验证管理',
        to: '/admin/verification',
        icon: 'i-lucide-mail-check',
      },
    ],
  },
  {
    key: 'portal',
    label: '门户管理',
    collapsible: true,
    defaultCollapsed: false,
    items: [
      { label: '门户首页', to: '/admin/portal/home', icon: 'i-lucide-home' },
    ],
  },
  {
    key: 'sync',
    label: '信息状态',
    collapsible: true,
    defaultCollapsed: false,
    items: [
      {
        label: 'AuthMe 状态',
        to: '/admin/authme',
        icon: 'i-lucide-refresh-cw',
      },
      {
        label: 'LuckPerms 状态',
        to: '/admin/luckperms',
        icon: 'i-lucide-database',
      },
      {
        label: '服务端状态',
        to: '/admin/minecraft/servers',
        icon: 'i-lucide-server',
      },
    ],
  },
  {
    key: 'server-info',
    label: '服务端信息',
    collapsible: true,
    defaultCollapsed: false,
    items: [
      {
        label: 'MTR 审计日志',
        to: '/admin/beacon/mtr-logs',
        icon: 'i-lucide-clipboard-list',
      },
      {
        label: '玩家成就信息',
        to: '/admin/beacon/advancements',
        icon: 'i-lucide-medal',
      },
      {
        label: '玩家统计信息',
        to: '/admin/beacon/stats',
        icon: 'i-lucide-bar-chart-3',
      },
    ],
  },
  {
    key: 'oauth',
    label: 'OAuth',
    collapsible: true,
    defaultCollapsed: false,
    items: [
      {
        label: 'Provider 管理',
        to: '/admin/oauth/providers',
        icon: 'i-lucide-plug',
      },
      { label: '绑定记录', to: '/admin/oauth/accounts', icon: 'i-lucide-link' },
      {
        label: 'OAuth 日志',
        to: '/admin/oauth/logs',
        icon: 'i-lucide-scroll-text',
      },
      {
        label: '数据统计',
        to: '/admin/oauth/stats',
        icon: 'i-lucide-chart-line',
      },
    ],
  },
  {
    key: 'company',
    label: '工商系统',
    collapsible: true,
    defaultCollapsed: false,
    items: [
      {
        label: '公司管理',
        to: '/admin/company/registry',
        icon: 'i-lucide-building-2',
      },
      {
        label: '申请审批',
        to: '/admin/company/applications',
        icon: 'i-lucide-clipboard-list',
      },
      {
        label: '行业配置',
        to: '/admin/company/industries',
        icon: 'i-lucide-layers-3',
      },
      {
        label: '类型配置',
        to: '/admin/company/types',
        icon: 'i-lucide-shapes',
      },
    ],
  },
  {
    key: 'advanced',
    label: '高级设置',
    collapsible: true,
    defaultCollapsed: false,
    items: [
      { label: '附件系统', to: '/admin/attachments', icon: 'i-lucide-archive' },
      { label: '配置管理', to: '/admin/config', icon: 'i-lucide-wrench' },
    ],
  },
])

const collapsedGroups = reactive<Record<string, boolean>>({})

menuGroups.value.forEach((group) => {
  if (!(group.key in collapsedGroups)) {
    collapsedGroups[group.key] = Boolean(group.defaultCollapsed)
  }
})

const systemStats = ref<{ uptimeSeconds: number; timestamp: string } | null>(
  null,
)

function toggleGroup(key: string) {
  collapsedGroups[key] = !collapsedGroups[key]
}

function isGroupCollapsed(key: string) {
  return Boolean(collapsedGroups[key])
}

function isActive(item: { to: string }) {
  if (item.to === '/admin') {
    return route.path === item.to
  }
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const systemUptimeText = computed(() => {
  if (!systemStats.value) return '未获取'
  const total = systemStats.value.uptimeSeconds
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) {
    return `${days} 天 ${hours} 小时`
  }
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`
  }
  return `${minutes} 分钟`
})

async function fetchSystemStats() {
  if (!authStore.token) return
  try {
    const result = await apiFetch<{
      system: { uptimeSeconds: number; timestamp: string }
    }>('/authme/admin/overview', {
      token: authStore.token,
    })
    systemStats.value = result.system
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return
    }
    console.warn('[admin] failed to fetch system stats', error)
  }
}

const footerRegisterItems = [
  {
    type: 'miit',
    label: '闽ICP备2023007345号-1',
    link: 'https://beian.miit.gov.cn/',
  },
  {
    type: 'mps',
    label: '闽公网安备35010202001677号',
    link: 'https://www.beian.gov.cn/portal/registersysteminfo?recordcode=35010202001677',
  },
]

onMounted(() => {
  if (!admin.value && authStore.token) {
    void portalStore.fetchAdminOverview().catch(() => {
      /* 概览加载失败时保持侧边统计留空 */
    })
  }
  void fetchSystemStats()
})
</script>

<template>
  <div class="relative min-h-screen">
    <AppLoadingBar />

    <header
      class="sticky top-0 z-40000 flex h-14 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80"
    >
      <div class="flex items-center gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          class="h-9 w-9 rounded-full lg:hidden"
          icon="i-lucide-menu"
          @click="sidebarOpen = !sidebarOpen"
        />
        <h1 class="text-lg font-semibold text-slate-900 dark:text-white">
          Hydroline Admin
        </h1>
      </div>

      <div class="flex items-center gap-2">
        <div
          class="flex items-center gap-2 rounded-full px-2 py-1 text-sm hover:bg-elevated"
        >
          <span class="hidden text-slate-700 dark:text-slate-200 sm:block">
            {{ authStore.displayName ?? authStore.user?.email }}
          </span>
          <UserAvatar
            :name="authStore.displayName"
            :src="authStore.avatarUrl"
            size="sm"
          />
        </div>
        <UTooltip text="前台首页">
          <UButton
            to="/"
            color="neutral"
            variant="ghost"
            size="xs"
            class="rounded-full h-9 w-9 justify-center items-center"
          >
            <UIcon name="i-lucide-home" class="h-6 w-6" />
          </UButton>
        </UTooltip>
        <ThemeToggle />
      </div>
    </header>

    <div class="flex">
      <transition name="slide-fade">
        <aside
          v-if="sidebarOpen"
          class="fixed inset-y-0 left-0 z-40000 w-72 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:bg-slate-950/95 lg:hidden"
        >
          <nav class="space-y-4 text-sm">
            <section
              v-for="group in menuGroups"
              :key="group.key"
              class="space-y-2"
            >
              <button
                class="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                type="button"
                @click="toggleGroup(group.key)"
              >
                <span>{{ group.label }}</span>
                <UIcon
                  :name="
                    isGroupCollapsed(group.key)
                      ? 'i-lucide-chevron-down'
                      : 'i-lucide-chevron-up'
                  "
                  class="h-4 w-4"
                />
              </button>
              <transition name="slide-fade">
                <div v-show="!isGroupCollapsed(group.key)" class="space-y-1">
                  <RouterLink
                    v-for="item in group.items"
                    :key="item.label"
                    :to="item.to"
                    class="flex items-center gap-3 rounded-xl px-3 py-2 transition"
                    :class="[
                      isActive(item)
                        ? 'bg-primary-100/80 text-primary-600 dark:bg-primary-500/20 dark:text-primary-100'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white',
                    ]"
                    @click="sidebarOpen = false"
                  >
                    <UIcon :name="item.icon" class="text-base" />
                    {{ item.label }}
                  </RouterLink>
                </div>
              </transition>
            </section>
          </nav>
        </aside>
      </transition>

      <aside
        class="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-slate-200/60 bg-white/70 dark:border-slate-800/60 dark:bg-slate-950/70 lg:block"
      >
        <div class="flex h-full flex-col">
          <nav class="space-y-4 overflow-y-auto p-4 text-sm">
            <section
              v-for="group in menuGroups"
              :key="group.key"
              class="space-y-2"
            >
              <button
                class="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                type="button"
                @click="toggleGroup(group.key)"
              >
                <span>{{ group.label }}</span>
                <UIcon
                  :name="
                    isGroupCollapsed(group.key)
                      ? 'i-lucide-chevron-down'
                      : 'i-lucide-chevron-up'
                  "
                  class="h-4 w-4"
                />
              </button>
              <transition name="slide-fade">
                <div v-show="!isGroupCollapsed(group.key)" class="space-y-1">
                  <RouterLink
                    v-for="item in group.items"
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
                </div>
              </transition>
            </section>
          </nav>

          <div class="p-2 px-6">
            <div
              class="pointer-events-auto space-y-3 text-xs text-slate-500 dark:text-slate-300"
            >
              <div
                class="border-b border-slate-200/70 dark:border-slate-800/60 pb-3 flex flex-col gap-1 text-center text-xs text-slate-400 dark:text-slate-400"
              >
                <span class="font-semibold text-slate-500 dark:text-slate-500"
                  >© 2025 Team Hyrlab</span
                >
                <span :key="item.type" v-for="item in footerRegisterItems">
                  <a
                    :href="item.link"
                    target="_blank"
                    rel="noreferrer noopener"
                    class="hover:underline"
                    >{{ item.label }}</a
                  >
                </span>
              </div>
              <div>
                <div class="text-xs text-slate-500 dark:text-slate-500">
                  系统运行时长
                </div>
                <div
                  class="line-clamp-1 truncate text-base font-semibold text-slate-800 dark:text-slate-300"
                >
                  {{ systemUptimeText }}
                </div>
              </div>
              <div>
                <div class="text-xs text-slate-500 dark:text-slate-500">
                  上次刷新
                </div>
                <div
                  class="line-clamp-1 truncate text-base font-semibold text-slate-800 dark:text-slate-300"
                >
                  {{
                    systemStats?.timestamp
                      ? new Date(systemStats.timestamp).toLocaleString()
                      : '未知'
                  }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main
        class="flex-1 bg-white/70 px-4 pb-12 pt-6 backdrop-blur-sm dark:bg-slate-950/80"
      >
        <RouterView v-slot="{ Component, route }">
          <Transition name="page-fade" mode="out-in">
            <div v-if="Component" :key="route.fullPath">
              <component :is="Component" />
            </div>
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 250ms ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition:
    transform 200ms ease,
    opacity 200ms ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(0.75rem);
  opacity: 0;
}
</style>
