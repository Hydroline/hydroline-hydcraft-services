<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { AnimatePresence, Motion } from 'motion-v'
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
import MinecraftServerClockPopover from './components/MinecraftServerClockPopover.vue'
import DesktopSidebar from './components/DesktopSidebar.vue'
import MobileSidebar from './components/MobileSidebar.vue'
import AurLemonText from '@/assets/resources/aurlemon_text.svg'
import HoverLinkPreview from '@/components/common/HoverLinkPreview.vue'

const authStore = useAuthStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()

const { heroInView, heroActiveDescription, heroActiveSubtitle } =
  storeToRefs(uiStore)

const menuOpen = ref(false)
const isSidebarCollapsed = ref(true)
const isScrolled = ref(false)

const handleScroll = () => {
  isScrolled.value = window.scrollY > 80
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
  handleScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

const toggleDesktopSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

type NavItem = {
  name: string
  to: string
  icon: string
  requiresAuth?: boolean
}

const mainNav = computed<NavItem[]>(() => {
  const links: NavItem[] = [
    { name: '仪表盘', to: '/', icon: 'i-lucide-home' },
    {
      name: '玩家档案',
      to: '/player',
      icon: 'i-lucide-user-round',
    },
    {
      name: '排行榜',
      to: '/rank',
      icon: 'i-lucide-trophy',
    },
    { name: '服务端状态', to: '/server', icon: 'i-lucide-server' },
    { name: '交通系统', to: '/transportation', icon: 'i-lucide-train-front' },
    { name: '工商系统', to: '/company', icon: 'i-lucide-building-2' },
    { name: '关于', to: '/about', icon: 'i-lucide-info' },
  ]

  if (authStore.permissionKeys.includes('portal.view.admin-dashboard')) {
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
    return (
      (heroActiveSubtitle.value || '').trim() ||
      (heroActiveDescription.value || '').trim() ||
      'Hydroline'
    )
  }
  return 'Hydroline'
})

const headerVariant = computed(() => {
  if (!isMainPage.value) {
    return 'brand'
  }
  return isScrolled.value ? 'logo' : 'title'
})

type MaybeUser = {
  profile?: { avatarUrl?: string; displayName?: string } | null
  image?: string | null
} | null

const userAvatarUrl = computed(() => {
  const user = authStore.user as MaybeUser
  if (!user) return null
  return user.profile?.avatarUrl ?? user.image ?? null
})

const userDisplayLabel = computed(() => {
  const displayName = authStore.displayName
  if (typeof displayName === 'string' && displayName.trim().length > 0) {
    return displayName
  }
  const email = (authStore.user as { email?: string } | null)?.email
  if (typeof email === 'string' && email.trim().length > 0) {
    return email
  }
  return '用户'
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

const userDropdownItems = computed(() => [
  [
    {
      label: '用户信息',
      icon: 'i-lucide-id-card',
      click: () => routerPush('/profile'),
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
  <div class="relative min-h-screen">
    <AppLoadingBar />
    <AuthDialog />

    <DesktopSidebar
      :is-sidebar-collapsed="isSidebarCollapsed"
      :main-nav="mainNav"
      :current-path="route.path"
      @toggle="toggleDesktopSidebar"
    />

    <MobileSidebar
      :menu-open="menuOpen"
      :main-nav="mainNav"
      :current-path="route.path"
      @close="menuOpen = false"
    />

    <div
      class="flex min-h-[110vh] flex-col transition-all duration-300"
      :class="[isSidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64']"
    >
      <header
        class="sticky top-0 z-40000 grid h-16 grid-cols-[1fr_auto_1fr] items-center px-4 border-b transition-all duration-300"
        :class="{
          'backdrop-blur-xl bg-white/60 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800':
            !isMainPage || isScrolled,
          'border-transparent backdrop-blur-none': isMainPage && !isScrolled,
          'backdrop-blur-xl! bg-white/60! dark:bg-slate-950/70! border-slate-200! dark:border-slate-800!':
            isMainPage && !isSidebarCollapsed,
        }"
      >
        <div class="flex items-center gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            class="flex h-9 w-9 items-center justify-center rounded-full lg:hidden"
            icon="i-lucide-menu"
            @click="menuOpen = !menuOpen"
          />

          <MinecraftServerClockPopover />
        </div>

        <div class="flex items-center justify-center text-center">
          <div class="flex items-center justify-center">
            <AnimatePresence mode="wait">
              <Motion
                :key="headerVariant"
                as="div"
                class="flex items-center justify-center"
                :initial="{ opacity: 0, filter: 'blur(4px)' }"
                :animate="{ opacity: 1, filter: 'blur(0px)' }"
                :exit="{ opacity: 0, filter: 'blur(4px)' }"
                :transition="{ duration: 0.2 }"
              >
                <template v-if="headerVariant === 'title'">
                  <Motion
                    :key="uiStore.previewMode ? 'preview' : 'normal'"
                    as="div"
                    :initial="{ opacity: 0, filter: 'blur(4px)' }"
                    :animate="{ opacity: 1, filter: 'blur(0px)' }"
                    :exit="{ opacity: 0, filter: 'blur(4px)' }"
                    :transition="{ duration: 0.25 }"
                  >
                    <UButton
                      v-if="!uiStore.previewMode"
                      color="neutral"
                      variant="link"
                      class="font-normal text-lg text-slate-400 hover:text-slate-600 transition duration-300 cursor-pointer dark:text-white/50 select-none"
                      @click="uiStore.previewMode = true"
                    >
                      {{ headerTitle }}
                    </UButton>
                    <div
                      v-else
                      class="font-normal text-lg text-slate-400 hover:text-slate-600 transition duration-300 cursor-pointer dark:text-white/50 select-none"
                      @click="uiStore.previewMode = false"
                    >
                      退出预览
                    </div>
                  </Motion>
                </template>
                <template v-else>
                  <HydrolineSvg class="h-6 text-slate-500 dark:text-white/75" />
                </template>
              </Motion>
            </AnimatePresence>
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
                <span
                  class="hidden text-slate-700 dark:text-slate-200 sm:block"
                >
                  {{ userDisplayLabel }}
                </span>
                <UserAvatar
                  :src="userAvatarUrl"
                  :name="userDisplayLabel"
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
            class="rounded-full"
            @click="openLogin"
            >登录</UButton
          >
          <UTooltip text="消息中心（开发中）">
            <UButton
              disabled
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

      <MobileSidebar
        :menu-open="menuOpen"
        :main-nav="mainNav"
        :current-path="route.path"
        z-index-class="z-100"
        :show-brand-header="false"
        :close-on-navigate="false"
        @close="menuOpen = false"
      />

      <main class="pt-4 mb-8">
        <RouterView v-slot="{ Component, route }">
          <Transition name="page-fade" mode="out-in">
            <div v-if="Component" :key="route.fullPath">
              <component :is="Component" />
            </div>
          </Transition>
        </RouterView>
      </main>

      <footer
        v-show="!uiStore.previewMode"
        class="mt-auto flex flex-col items-center py-4 px-6 lg:py-8 transition-opacity duration-300"
        :class="{
          'opacity-0 pointer-events-none': uiStore.previewMode,
          'opacity-100': !uiStore.previewMode,
        }"
      >
        <div
          class="w-fit flex justify-center mb-10 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 hover:bg-accented/50 transition select-none"
        >
          <HoverLinkPreview
            url="https://aurlemon.top"
            :width="300"
            :height="180"
            link-class="block px-3 py-1.5"
          >
            <span
              class="flex items-center text-xs text-slate-500 dark:text-slate-500"
            >
              <span class="mr-2">Developed by</span>
              <span class="flex gap-1.5 items-center">
                <img
                  class="block h-5 rounded-full border border-slate-200 dark:border-slate-700"
                  src="@/assets/resources/aurlemon_logo.jpg"
                  alt="AurLemon Logo"
                />
                <AurLemonText class="h-3.5 mx-auto text-primary-700" />
              </span>
            </span>
          </HoverLinkPreview>
        </div>
        <div
          class="mx-auto flex flex-col-reverse items-center w-full gap-3 text-sm text-slate-500 dark:text-slate-400 lg:flex-row lg:justify-between lg:max-w-5xl"
        >
          <div
            class="flex items-center flex-col gap-2 mt-3 lg:flex-row lg:mt-0"
          >
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
              class="hidden lg:block select-none font-bold mx-2 text-slate-300 dark:text-slate-500"
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

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 250ms ease;
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
