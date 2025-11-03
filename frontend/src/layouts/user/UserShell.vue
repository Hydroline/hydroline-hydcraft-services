<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import AppLoadingBar from '@/components/common/AppLoadingBar.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import AuthDialog from '@/components/dialogs/AuthDialog.vue'
import HydrlabSvg from '@/assets/resources/hydrlab_logo.svg'
import HydrolineSvg from '@/assets/resources/hydroline_logo.svg'

const authStore = useAuthStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()

// 当前布局无需直接使用 portalStore.home
const { heroInView, heroActiveDescription } = storeToRefs(uiStore)

const menuOpen = ref(false)

const mainNav = computed(() => {
  const links = [
    { name: '首页', to: '/', icon: 'i-lucide-home' },
    {
      name: '玩家档案',
      to: '/profile',
      icon: 'i-lucide-user-round',
    },
  ]
  if (authStore.permissionKeys.includes('auth.manage.users')) {
    links.push({
      name: '后台控制台',
      to: '/admin',
      icon: 'i-lucide-terminal',
      requiresAuth: true,
    })
  }
  return links
})

const headerTitle = computed(() => {
  if (route.meta.layout === 'admin') {
    return '管理工作台'
  }
  if (heroInView.value) {
    return (heroActiveDescription.value || '').trim() || 'Hydroline'
  }
  return 'Hydroline'
})

// 已改为使用静态 key（header-title / header-logo）进行过渡，这里的动态 key 不再需要
type MaybeUser = {
  profile?: { avatarUrl?: string; displayName?: string } | null
  image?: string | null
} | null

const userAvatarUrl = computed(() => {
  const user = authStore.user as MaybeUser
  if (!user) return null
  return user.profile?.avatarUrl ?? user.image ?? null
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

// 页面头部导航由 HomeView 自行渲染，这里无需派生 navigationLinks

const userDropdownItems = computed(() => [
  [
    {
      label: '玩家档案',
      icon: 'i-lucide-user-round',
      click: () => routerPush('/profile'),
    },
    {
      label: '用户偏好设置',
      icon: 'i-lucide-sliders-horizontal',
      click: () => routerPush('/profile/preferences'),
    },
  ],
  [
    {
      label: '退出登录',
      icon: 'i-lucide-log-out',
      click: () => authStore.signOut(),
    },
  ],
])

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

const siteItems = [
  {
    label: '门户站',
    link: 'https://hydcraft.cn/',
  },
  {
    label: '知识库',
    link: 'https://wiki.hydcraft.cn/',
  },
  {
    label: 'GitHub',
    link: 'https://github.com/Hydroline/',
  },
]

const isMainPage = computed(() => route.path === '/' || route.path === '')

const handleDropdownItemClick = (
  action: (() => void) | undefined,
  close: () => void,
) => {
  action?.()
  close()
}

const routerPush = (path: string) => {
  if (route.fullPath === path) return
  router.push(path)
}
</script>

<template>
  <div
    class="relative min-h-screen flex flex-col dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
  >
    <AppLoadingBar />
    <AuthDialog />

    <header
      class="fixed inset-x-0 top-0 z-50 grid grid-cols-[1fr_auto_1fr] h-16 items-center border-slate-200/60 px-4 dark:border-slate-800/60"
      :class="{
        'bg-white/60 dark:bg-slate-950/70 border-b backdrop-blur-xl':
          !isMainPage,
      }"
    >
      <div class="flex items-center gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          class="flex items-center justify-center h-9 w-9 rounded-full"
          icon="i-lucide-menu"
          @click="menuOpen = !menuOpen"
        />
        <div class="hidden text-sm text-slate-600 dark:text-slate-300 sm:block">
          <p class="font-medium">Aurora_Lemon</p>
        </div>
      </div>

      <div class="flex items-center justify-center text-center">
        <div v-if="isMainPage" class="flex items-center justify-center">
          <Transition
            mode="out-in"
            enter-active-class="transition-opacity duration-150 ease-out"
            leave-active-class="transition-opacity duration-150 ease-in"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <p
              v-if="heroInView"
              key="header-title"
              class="text-lg text-slate-400 dark:text-white/50"
            >
              {{ headerTitle }}
            </p>
            <HydrolineSvg
              v-else
              key="header-logo"
              class="h-6 text-slate-500 dark:text-white/75"
            />
          </Transition>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2">
        <div v-if="authStore.isAuthenticated">
          <UPopover :popper="{ placement: 'bottom-end' }">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              class="flex items-center gap-2 rounded-full px-2 py-1 text-sm hover:bg-accented/70 active:bg-accented/70"
            >
              <span class="hidden text-slate-700 dark:text-slate-200 sm:block">
                {{ authStore.displayName ?? authStore.user?.email ?? '用户' }}
              </span>
              <UserAvatar
                :src="userAvatarUrl"
                :name="authStore.displayName ?? authStore.user?.email"
                size="sm"
              />
            </UButton>
            <template #content="{ close }">
              <div class="w-48 space-y-2 p-2">
                <div
                  v-for="(group, index) in userDropdownItems"
                  :key="index"
                  class="space-y-1"
                >
                  <button
                    v-for="item in group"
                    :key="item.label"
                    type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    :class="
                      item.label === '退出登录'
                        ? 'text-red-600 dark:text-red-300'
                        : 'text-slate-600 dark:text-slate-200'
                    "
                    @click="handleDropdownItemClick(item.click, close)"
                  >
                    <UIcon :name="item.icon" class="text-base h-4 w-4" />
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
        <UButton
          v-else
          color="neutral"
          variant="link"
          size="xs"
          class="rounded-full"
          @click="openLogin"
          >登录</UButton
        >
        <UTooltip text="消息中心">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            class="h-9 w-9 rounded-full hover:bg-accented/70 active:bg-accented/70"
            icon-only
          >
            <UIcon name="i-lucide-mail" class="h-6 w-6" />
          </UButton>
        </UTooltip>
        <ThemeToggle />
      </div>
    </header>

    <transition name="slide-fade">
      <aside
        v-if="menuOpen"
        class="fixed inset-y-0 left-0 z-100 w-72 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:bg-slate-950/95"
      >
        <div class="mb-6 flex items-center justify-between">
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            class="flex justify-center items-center h-9 w-9"
            @click="menuOpen = false"
          />
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
            <UIcon :name="item.icon" class="text-base h-fit" />
            {{ item.name }}
          </RouterLink>
        </nav>
      </aside>
    </transition>

    <main class="pt-20">
      <RouterView />
    </main>

    <footer class="mt-auto py-4 px-6 lg:py-8">
      <div
        class="mx-auto flex flex-col-reverse items-center w-full gap-3 text-sm text-slate-500 dark:text-slate-400 lg:flex-row lg:justify-between lg:max-w-5xl"
      >
        <div class="flex items-center flex-col gap-2 mt-3 lg:flex-row lg:mt-0">
          <span class="flex items-center gap-2">
            <HydrlabSvg class="h-6" />
            <div
              class="select-none font-bold mx-0.5 w-px h-5 bg-slate-200 dark:bg-slate-600"
            ></div>
            <HydrolineSvg class="h-6" />
          </span>
          <span
            class="font-semibold flex flex-col justify-center items-center gap-1 leading-none lg:flex-row"
          >
            Hydroline HydCraft
            <span
              class="rounded px-1 py-0.5 text-[0.625rem] bg-primary-100 text-primary-500 leading-none"
              >ALPHA</span
            >
          </span>
        </div>
        <div
          class="flex justify-center flex-wrap gap-y-0.5 gap-x-3 lg:items-end lg:gap-x-0.5"
        >
          <div class="flex gap-x-3 gap-y-0.5 flex-wrap justify-center">
            <span :key="item.label" v-for="item in siteItems">
              <a
                :href="item.link"
                target="_blank"
                rel="noreferrer noopener"
                class="hover:underline"
                >{{ item.label }}</a
              >
            </span>
          </div>
          <div
            class="hidden lg:block select-none font-bold mx-2 text-slate-300 dark:text-slate-500"
          >
            ·
          </div>
          <div class="flex gap-x-3 gap-y-0.5 flex-wrap justify-center">
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
          <div
            class="hidden lg:block select-none font-bold mx-2 text-slate-300 dark:text-slate-200"
          >
            ·
          </div>
          <div class="flex gap-x-3 gap-y-0.5 flex-wrap justify-center">
            <span>© Team Hydrlab {{ dayjs().year() }}</span>
          </div>
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
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}
</style>
