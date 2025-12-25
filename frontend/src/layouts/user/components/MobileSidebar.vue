<script setup lang="ts">
import { computed, toRefs, watch, onUnmounted } from 'vue'
import { AnimatePresence, Motion } from 'motion-v'
import { RouterLink, useRouter } from 'vue-router'
import HydrolineSvg from '@/assets/resources/hydroline_logo.svg'

type NavItem = {
  name: string
  to: string
  icon: string
  requiresAuth?: boolean
  key?: string
  isFallback?: boolean
}

const props = withDefaults(
  defineProps<{
    menuOpen: boolean
    mainNav: NavItem[]
    currentPath: string
    closeOnNavigate?: boolean
    zIndexClass?: string
    showBrandHeader?: boolean
  }>(),
  {
    closeOnNavigate: true,
    zIndexClass: 'z-50',
    showBrandHeader: true,
  },
)

const {
  menuOpen,
  mainNav,
  currentPath,
  closeOnNavigate,
  zIndexClass,
  showBrandHeader,
} = toRefs(props)

const router = useRouter()

const isPathActive = (item: NavItem, path: string) => {
  if (item.to === '/') {
    return path === '/'
  }
  return path === item.to || path.startsWith(`${item.to}/`)
}

const displayNav = computed<NavItem[]>(() => {
  const items = mainNav.value
  const activePath = currentPath.value

  if (items.some((item) => isPathActive(item, activePath))) {
    return items
  }

  const resolvedRoute = router.resolve(activePath)

  if (!resolvedRoute.matched.length) {
    return items
  }

  const fallbackName =
    (typeof resolvedRoute.meta?.title === 'string'
      ? (resolvedRoute.meta.title as string)
      : undefined) ||
    (typeof resolvedRoute.name === 'string' ? resolvedRoute.name : undefined) ||
    'Current Page'

  const fallbackIcon =
    (typeof resolvedRoute.meta?.icon === 'string'
      ? (resolvedRoute.meta.icon as string)
      : undefined) || 'i-lucide-circle-dot'

  return [
    ...items,
    {
      key: '__fallback-nav__',
      isFallback: true,
      name: fallbackName,
      to: resolvedRoute.fullPath ?? activePath,
      icon: fallbackIcon,
    },
  ]
})

const emit = defineEmits<{
  (event: 'close'): void
}>()

const handleClose = () => {
  emit('close')
}

const handleNavigate = () => {
  if (closeOnNavigate.value) {
    emit('close')
  }
}

watch(
  menuOpen,
  (isOpen) => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = isOpen ? 'hidden' : ''
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <!-- Mobile Sidebar (Drawer) -->
  <AnimatePresence>
    <template v-if="menuOpen">
      <!-- Backdrop -->
      <Motion
        key="sidebar-backdrop"
        class="fixed inset-0 bg-black/20 blur-sm"
        :class="[zIndexClass]"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.3 }"
        @click="handleClose"
      />

      <!-- Bottom Sheet -->
      <Motion
        key="sidebar-sheet"
        as="aside"
        :initial="{ y: '100%' }"
        :animate="{ y: 0 }"
        :exit="{ y: '100%' }"
        :transition="{ type: 'spring', stiffness: 400, damping: 30, mass: 1 }"
        class="fixed left-0 right-0 overflow-hidden rounded-t-3xl bg-white/90 pt-4 shadow-2xl backdrop-blur-2xl dark:bg-slate-950/90 border-t border-white/20 dark:border-slate-800/50"
        :class="[zIndexClass]"
        style="bottom: -100px; padding-bottom: calc(2rem + 5rem)"
        @click.stop
      >
        <nav
          class="flex items-center gap-3 overflow-x-auto px-6 py-2 no-scrollbar"
        >
          <RouterLink
            v-for="item in displayNav"
            :key="item.key ?? item.to"
            :to="item.to"
            class="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-xs font-medium transition active:scale-95"
            :class="[
              isPathActive(item, currentPath) || item.isFallback
                ? 'bg-primary-100/80 text-primary-600 dark:bg-primary-500/20 dark:text-primary-100'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white',
            ]"
            @click="handleNavigate"
          >
            <Motion
              v-if="item.isFallback"
              :key="`${item.icon}-${item.name}`"
              as="div"
              :initial="{
                opacity: 0.7,
                scale: 0.88,
                filter: 'drop-shadow(0 0 0 rgba(99, 102, 241, 0))',
              }"
              :animate="{
                opacity: 1,
                scale: 1,
                filter: 'drop-shadow(0 0 0.75rem rgba(99, 102, 241, 0.45))',
              }"
              :transition="{ type: 'spring', stiffness: 360, damping: 24 }"
              class="flex h-6 w-6 items-center justify-center"
            >
              <UIcon :name="item.icon" class="text-xl text-primary-500" />
            </Motion>
            <UIcon v-else :name="item.icon" class="text-xl h-fit" />
            <span class="whitespace-nowrap">{{ item.name }}</span>
          </RouterLink>
        </nav>
        <div
          v-if="showBrandHeader"
          class="text-xs text-center tracking-widest font-semibold text-slate-500 dark:text-slate-400"
        >
          HYDROLINE HYDCRAFT
        </div>
      </Motion>
    </template>
  </AnimatePresence>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
