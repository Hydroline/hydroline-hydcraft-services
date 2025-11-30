<script setup lang="ts">
import { computed, toRefs } from 'vue'
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
    showBrandHeader?: boolean
    closeOnNavigate?: boolean
    zIndexClass?: string
  }>(),
  {
    showBrandHeader: true,
    closeOnNavigate: true,
    zIndexClass: 'z-50',
  },
)

const {
  menuOpen,
  mainNav,
  currentPath,
  showBrandHeader,
  closeOnNavigate,
  zIndexClass,
} = toRefs(props)

const router = useRouter()

const displayNav = computed<NavItem[]>(() => {
  const items = mainNav.value
  const activePath = currentPath.value

  if (items.some((item) => item.to === activePath)) {
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
</script>

<template>
  <!-- Mobile Sidebar (Drawer) -->
  <transition name="slide-fade">
    <aside
      v-if="menuOpen"
      class="fixed inset-y-0 left-0 w-72 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:bg-slate-950/95 lg:hidden"
      :class="[zIndexClass]"
    >
      <div class="mb-6 flex items-center justify-between">
        <div v-if="showBrandHeader" class="flex items-center gap-2">
          <HydrolineSvg class="h-6 text-primary-500" />
          <span class="font-bold">HydCraft</span>
        </div>
        <div v-else class="flex-1"></div>
        <Motion
          as="div"
          :while-tap="{ scale: 0.9, rotate: -8 }"
          :while-hover="{ scale: 1.08 }"
          :transition="{ type: 'spring', stiffness: 420, damping: 30 }"
          class="flex"
        >
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            class="flex justify-center items-center h-9 w-9"
            @click="handleClose"
          />
        </Motion>
      </div>
      <nav>
        <AnimatePresence
          name="mobile-sidebar-link"
          as="div"
          class="flex flex-col space-y-2"
          move-class="mobile-sidebar-link-move"
          mode="sync"
          :initial="false"
        >
          <Motion
            v-for="item in displayNav"
            :key="item.key ?? item.to"
            as="div"
            :initial="{ opacity: 0, y: 16, scale: 0.95 }"
            :animate="{
              opacity: 1,
              y: 0,
              scale: 1,
              boxShadow: item.isFallback
                ? '0 0 0.75rem rgba(99, 102, 241, 0.35)'
                : '0 0 0 rgba(0, 0, 0, 0)',
            }"
            :exit="{ opacity: 0, y: 16, scale: 0.9 }"
            :transition="{ type: 'spring', stiffness: 310, damping: 28 }"
          >
            <RouterLink
              :to="item.to"
              class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition"
              :class="[
                currentPath === item.to || item.isFallback
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
                class="flex h-5 w-5 items-center justify-center"
              >
                <UIcon :name="item.icon" class="text-base text-primary-500" />
              </Motion>
              <UIcon v-else :name="item.icon" class="text-base h-fit" />
              {{ item.name }}
            </RouterLink>
          </Motion>
        </AnimatePresence>
      </nav>
    </aside>
  </transition>
</template>

<style scoped>
.mobile-sidebar-link-move {
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}
</style>
