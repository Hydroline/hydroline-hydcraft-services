<script setup lang="ts">
import { computed, toRefs } from 'vue'
import { AnimatePresence, Motion } from 'motion-v'
import { RouterLink, useRouter } from 'vue-router'

type NavItem = {
  name: string
  to: string
  icon: string
  requiresAuth?: boolean
  key?: string
  isFallback?: boolean
}

const props = defineProps<{
  isSidebarCollapsed: boolean
  mainNav: NavItem[]
  currentPath: string
}>()

const { isSidebarCollapsed, mainNav, currentPath } = toRefs(props)

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
  const hasCurrent = items.some((item) => isPathActive(item, activePath))

  if (hasCurrent) {
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
  (event: 'toggle'): void
}>()

const handleToggle = () => {
  emit('toggle')
}
</script>

<template>
  <!-- Desktop Sidebar -->
  <aside
    class="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white/60 backdrop-blur-xl transition-all duration-300 dark:border-slate-800 dark:bg-slate-950/70 lg:flex"
    :class="[isSidebarCollapsed ? 'w-16' : 'w-64']"
  >
    <div class="h-16 border-b border-slate-200 dark:border-slate-800">
      <div class="flex justify-center w-16 h-16 p-3">
        <Motion
          as="div"
          :while-tap="{ scale: 0.92, rotate: isSidebarCollapsed ? -6 : 6 }"
          :while-hover="{ scale: 1.05 }"
          :transition="{ type: 'spring', stiffness: 420, damping: 30 }"
          class="hidden lg:block w-full h-full"
        >
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            class="flex justify-center items-center rounded-lg w-full h-full"
            @click="handleToggle"
          >
            <Motion
              as="div"
              :animate="{
                scale: isSidebarCollapsed ? 1.1 : 1,
              }"
              :transition="{ type: 'spring', stiffness: 280, damping: 22 }"
              class="flex items-center justify-center h-full"
            >
              <UIcon
                :name="
                  isSidebarCollapsed
                    ? 'i-lucide-panel-left-open'
                    : 'i-lucide-panel-left-close'
                "
                class="h-4 w-4"
              />
            </Motion>
          </UButton>
        </Motion>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto overflow-x-hidden p-3">
      <AnimatePresence
        name="sidebar-link"
        as="div"
        class="flex flex-col space-y-1"
        move-class="sidebar-link-move"
        mode="sync"
        :initial="false"
      >
        <Motion
          v-for="item in displayNav"
          :key="item.key ?? item.to"
          as="div"
          :initial="{ opacity: 0, y: -12, scale: 0.96 }"
          :animate="{
            opacity: 1,
            y: 0,
            scale: 1,
          }"
          :exit="{ opacity: 0, y: -12, scale: 0.9 }"
          :transition="{ type: 'spring', stiffness: 320, damping: 32 }"
        >
          <RouterLink
            :to="item.to"
            class="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors"
            :class="[
              isPathActive(item, currentPath) || item.isFallback
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/30 dark:text-primary-400'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
              isSidebarCollapsed ? 'justify-center px-2' : '',
            ]"
          >
            <UTooltip
              :text="item.name"
              class="outline-0"
              :content="{ side: 'right' }"
            >
              <Motion
                v-if="item.isFallback"
                :key="`${item.icon}-${item.name}`"
                as="div"
                :initial="{ opacity: 0.7, scale: 0.92 }"
                :animate="{
                  opacity: 1,
                  scale: 1,
                }"
                :transition="{ type: 'spring', stiffness: 360, damping: 24 }"
                class="flex h-5 w-4 shrink-0 items-center justify-center"
              >
                <UIcon
                  :name="item.icon"
                  class="h-5 w-4 shrink-0 text-primary-500"
                />
              </Motion>
              <UIcon v-else :name="item.icon" class="h-5 w-4 shrink-0" />
              <span
                class="whitespace-nowrap transition-all duration-300"
                :class="[
                  isSidebarCollapsed
                    ? 'hidden w-0 opacity-0'
                    : 'w-auto opacity-100',
                ]"
              >
                {{ item.name }}
              </span>
            </UTooltip>
          </RouterLink>
        </Motion>
      </AnimatePresence>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar-link-move {
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}
</style>
