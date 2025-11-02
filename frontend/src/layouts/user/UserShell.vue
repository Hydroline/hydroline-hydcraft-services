<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { usePortalStore } from '@/stores/portal'
import { useUiStore } from '@/stores/ui'
import AppLoadingBar from '@/components/common/AppLoadingBar.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import AuthDialog from '@/components/dialogs/AuthDialog.vue'

const authStore = useAuthStore()
const portalStore = usePortalStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()

const { home } = storeToRefs(portalStore)
const { heroInView } = storeToRefs(uiStore)

const menuOpen = ref(false)

const mainNav = computed(() => {
  const links = [
    { name: '首页', to: '/', icon: 'i-heroicons-home-modern-20-solid' },
    { name: '个人资料', to: '/profile', icon: 'i-heroicons-identification-20-solid', requiresAuth: true },
  ]
  if (authStore.permissionKeys.includes('auth.manage.users')) {
    links.push({ name: '后台控制台', to: '/admin', icon: 'i-heroicons-command-line-20-solid', requiresAuth: true })
  }
  return links
})

const headerTitle = computed(() => {
  if (route.meta.layout === 'admin') {
    return '管理工作台'
  }
  if (heroInView.value) {
    return home.value?.header.idleTitle ?? 'Hydroline'
  }
  return home.value?.header.activeTitle ?? 'Hydroline'
})

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

function openLogin() {
  uiStore.openLoginDialog()
}

const navigationLinks = computed(() => home.value?.navigation ?? [])

const userDropdownItems = computed(() => [
  [
    {
      label: '个人资料',
      icon: 'i-heroicons-user-circle-20-solid',
      click: () => routerPush('/profile'),
    },
    {
      label: '网站偏好设置',
      icon: 'i-heroicons-adjustments-horizontal-20-solid',
      click: () => routerPush('/profile'),
    },
  ],
  [
    {
      label: '退出登录',
      icon: 'i-heroicons-arrow-left-on-rectangle-20-solid',
      click: () => authStore.signOut(),
    },
  ],
])

function routerPush(path: string) {
  if (route.fullPath === path) return
  router.push(path)
}
</script>

<template>
  <div class="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
    <AppLoadingBar />
    <AuthDialog />

    <header
      class="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-slate-200/60 bg-white/60 px-4 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/70"
    >
      <div class="flex items-center gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          class="h-9 w-9 rounded-full"
          icon="i-heroicons-bars-3-20-solid"
          @click="menuOpen = !menuOpen"
        />
        <div class="hidden text-sm text-slate-600 dark:text-slate-300 sm:block">
          <p class="font-medium">Minecraft 状态</p>
          <p class="text-xs text-slate-500">实时占位，等待后端数据</p>
        </div>
      </div>

      <div class="text-center">
        <Transition name="fade-slide" mode="out-in">
          <p :key="headerTitle" class="text-lg font-semibold text-slate-900 dark:text-white">
            {{ headerTitle }}
          </p>
        </Transition>
      </div>

      <div class="flex items-center gap-2">
        <UTooltip text="消息中心">
          <UButton color="neutral" variant="ghost" size="xs" class="h-9 w-9 rounded-full" icon-only>
            <UIcon name="i-heroicons-envelope-20-solid" />
          </UButton>
        </UTooltip>
        <ThemeToggle />
        <div v-if="authStore.isAuthenticated">
          <UPopover :popper="{ placement: 'bottom-end' }">
            <template #anchor>
              <button class="flex items-center gap-2 rounded-full bg-white/60 px-2 py-1 text-sm shadow-sm transition hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-800">
                <UserAvatar :src="home?.user?.avatarUrl ?? null" :name="home?.user?.displayName ?? authStore.displayName" size="sm" />
                <span class="hidden text-slate-700 dark:text-slate-200 sm:block">
                  {{ home?.user?.displayName ?? authStore.displayName ?? '用户' }}
                </span>
                <UIcon name="i-heroicons-chevron-down-20-solid" class="hidden text-base text-slate-400 sm:block" />
              </button>
            </template>
            <template #content="{ close }">
              <div class="w-48 space-y-2 p-2">
                <div v-for="(group, index) in userDropdownItems" :key="index" class="space-y-1">
                  <button
                    v-for="item in group"
                    :key="item.label"
                    type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    :class="item.label === '退出登录' ? 'text-red-600 dark:text-red-300' : 'text-slate-600 dark:text-slate-200'"
                    @click="item.click?.(); close()"
                  >
                    <UIcon :name="item.icon" class="text-base" />
                    <span>{{ item.label }}</span>
                  </button>
                  <hr
                    v-if="index < userDropdownItems.length - 1"
                    class="border-slate-200/70 dark:border-slate-700/70"
                  />
                </div>
              </div>
            </template>
          </UPopover>
        </div>
        <UButton v-else color="primary" size="xs" class="rounded-full" @click="openLogin">登录</UButton>
      </div>
    </header>

    <transition name="slide-fade">
      <aside
        v-if="menuOpen"
        class="fixed inset-y-0 left-0 z-40 w-72 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:bg-slate-950/95"
      >
        <div class="mb-6 flex items-center justify-between">
          <span class="text-lg font-semibold text-slate-900 dark:text-white">导航</span>
          <UButton icon="i-heroicons-x-mark-20-solid" variant="ghost" size="xs" class="h-8 w-8" @click="menuOpen = false" />
        </div>
        <nav class="space-y-2">
          <RouterLink
            v-for="item in mainNav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition"
            :class="[
              route.path === item.to
                ? 'bg-primary-100/80 text-primary-600 dark:bg-primary-500/20 dark:text-primary-100'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white',
            ]"
          >
            <UIcon :name="item.icon" class="text-base" />
            {{ item.name }}
          </RouterLink>
        </nav>

        <div class="mt-6 space-y-2">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">快捷入口</p>
          <a
            v-for="link in navigationLinks"
            :key="link.id"
            :href="link.url ?? undefined"
            class="flex items-center justify-between rounded-xl border border-slate-200/70 px-3 py-2 text-sm transition hover:bg-slate-100/70 dark:border-slate-700/60 dark:hover:bg-slate-800/70"
            :class="{ 'pointer-events-none opacity-60': !link.available }"
            target="_blank"
            rel="noreferrer"
          >
            <span>{{ link.label }}</span>
            <UIcon name="i-heroicons-arrow-top-right-on-square-16-solid" class="text-slate-400" />
          </a>
        </div>
      </aside>
    </transition>

    <main class="pt-20">
      <RouterView />
    </main>

    <footer class="mt-16 border-t border-slate-200/60 bg-white/60 px-4 py-10 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/60">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 text-sm text-slate-500 dark:text-slate-400 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-3">
          <img src="@/assets/resources/hydroline_logo.svg" alt="Hydroline" class="h-8" />
          <span>Hydroline</span>
        </div>
        <div class="flex flex-wrap gap-4">
          <span>隐私政策（待补充）</span>
          <span>备案号（待补充）</span>
          <span>© HydCraft Network</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}
</style>
