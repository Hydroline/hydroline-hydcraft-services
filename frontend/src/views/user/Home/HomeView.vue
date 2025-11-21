<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePortalStore } from '@/stores/portal'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import HydrolineTextBold from '@/assets/resources/hydroline_text_bold.svg'
import fallbackHeroImage from '@/assets/images/image_home_background_240730.webp'
import { Motion } from 'motion-v'

const portalStore = usePortalStore()
const uiStore = useUiStore()

const { home } = storeToRefs(portalStore)
const { heroInView } = storeToRefs(uiStore)

const heroRef = ref<HTMLElement | null>(null)
const observer = ref<IntersectionObserver | null>(null)
const cycleTimer = ref<number | null>(null)
const scrolled = ref(false)
const heroImageLoaded = ref(false)
const homeLoaded = ref(false)
const heroPreviewOpen = ref(false)
const heroParallaxOffset = reactive({ x: 0, y: 0 })

const navigationLinks = computed(() => home.value?.navigation ?? [])
const cardIds = computed(() => home.value?.cards ?? [])
const dashboard = computed(() => home.value?.dashboard ?? null)
const serverOverview = computed(() => dashboard.value?.serverOverview ?? null)
const ownershipOverview = computed(
  () => dashboard.value?.ownershipOverview ?? null,
)
const applicationOverview = computed(
  () => dashboard.value?.applicationOverview ?? null,
)
const serverCards = computed(() => home.value?.serverCards ?? [])

const heroSubtitle = computed(() => home.value?.hero.subtitle ?? null)
const heroBackgrounds = computed(() => home.value?.hero.background ?? [])

const carouselState = reactive({
  heroIndex: 0,
  navIndex: 0,
})

const activeHeroBackground = computed(
  () => heroBackgrounds.value[carouselState.heroIndex] ?? null,
)

const activeHeroImage = computed(
  () => activeHeroBackground.value?.imageUrl || null,
)

const activeHeroDescription = computed(() =>
  (activeHeroBackground.value?.description ?? '').trim(),
)

const showHeroIndicators = computed(() => navigationLinks.value.length > 1)

const heroBackdropStyle = computed(() => {
  if (!heroImageLoaded.value || heroInView.value) {
    return {}
  }
  return {
    opacity: '0.15',
    transform: 'translateY(-3rem)',
    filter: 'blur(8px) saturate(2)',
  }
})

const secondaryCards = computed(() =>
  cardIds.value.filter(
    (cardId) => cardId !== 'profile' && !cardId.startsWith('dashboard-'),
  ),
)

const cardMetadata: Record<string, { title: string; description: string }> = {
  'server-status': {
    title: '服务端状态',
    description: '实时掌握在线人数与运行状态。',
  },
  tasks: {
    title: '任务队列',
    description: '同步作业与自动化任务的进展情况。',
  },
  documents: {
    title: '文档中心',
    description: '面向成员的知识库与流程文档。',
  },
}

function resolveCardMetadata(cardId: string) {
  return (
    cardMetadata[cardId] ?? {
      title: '功能筹备中',
      description: '敬请期待更多服务能力。',
    }
  )
}

function updateScrollState() {
  scrolled.value = window.scrollY > 80
  uiStore.setHeroInView(!scrolled.value)
}

function updateHeroDescription() {
  uiStore.setHeroActiveDescription(activeHeroDescription.value)
}

function stopHeroCycle() {
  if (cycleTimer.value !== null) {
    window.clearInterval(cycleTimer.value)
    cycleTimer.value = null
  }
}

function startHeroCycle() {
  stopHeroCycle()
  if (heroBackgrounds.value.length <= 1) {
    return
  }
  cycleTimer.value = window.setInterval(() => {
    carouselState.heroIndex =
      (carouselState.heroIndex + 1) % heroBackgrounds.value.length
    if (navigationLinks.value.length > 0) {
      carouselState.navIndex =
        carouselState.heroIndex % navigationLinks.value.length
    }
    updateHeroDescription()
  }, 8000)
}

function activateNavigation(index: number) {
  carouselState.navIndex = index
  if (heroBackgrounds.value.length > 0) {
    carouselState.heroIndex = index % heroBackgrounds.value.length
  }
  if (heroBackgrounds.value.length > 1) {
    startHeroCycle()
  }
  updateHeroDescription()
}

onMounted(async () => {
  if (!home.value) {
    uiStore.startLoading()
    try {
      await portalStore.fetchHome()
    } finally {
      uiStore.stopLoading()
    }
  }

  homeLoaded.value = true

  updateScrollState()
  window.addEventListener('scroll', updateScrollState, { passive: true })

  window.addEventListener('mousemove', (event: MouseEvent) => {
    const vw = window.innerWidth || 1
    const vh = window.innerHeight || 1

    const relX = event.clientX / vw
    const relY = event.clientY / vh

    const maxOffset = 16
    const offsetX = (relX - 0.5) * maxOffset * -1
    const offsetY = (relY - 0.5) * maxOffset * -1

    heroParallaxOffset.x = offsetX
    heroParallaxOffset.y = offsetY
  })

  if (heroRef.value) {
    observer.value = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            uiStore.setHeroInView(true)
          } else {
            uiStore.setHeroInView(false)
          }
        }
      },
      { threshold: [0.3, 0.6, 1] },
    )
    observer.value.observe(heroRef.value)
  }

  if (heroBackgrounds.value.length > 1) {
    startHeroCycle()
  } else {
    updateHeroDescription()
  }
})

watch(
  () => activeHeroImage.value,
  () => {
    heroImageLoaded.value = false
  },
  { immediate: true },
)

watch(
  heroBackgrounds,
  (list) => {
    carouselState.heroIndex = 0
    carouselState.navIndex = 0
    if (list.length > 1) {
      startHeroCycle()
    } else {
      stopHeroCycle()
    }
    updateHeroDescription()
  },
  { immediate: true },
)

watch(
  () => activeHeroDescription.value,
  () => {
    updateHeroDescription()
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateScrollState)
  if (observer.value && heroRef.value) {
    observer.value.unobserve(heroRef.value)
    observer.value.disconnect()
  }
  stopHeroCycle()
  uiStore.setHeroInView(true)
  uiStore.setHeroActiveDescription('')
})

function handleHeroImageLoaded() {
  heroImageLoaded.value = true
}

function handleHeroImageErrored() {
  heroImageLoaded.value = true
}

function resetHeroParallax() {
  heroParallaxOffset.x = 0
  heroParallaxOffset.y = 0
}

function formatNumberCompact(value: number | null | undefined) {
  if (value == null) return '0'
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatPercentage(value: number | null | undefined) {
  if (value == null) return '0%'
  return `${Math.round(value)}%`
}

function formatLatency(value: number | null | undefined) {
  if (value == null) return '—'
  return `${value} ms`
}
</script>

<template>
  <div class="relative overflow-hidden">
    <section
      ref="heroRef"
      class="relative flex min-h-[60vh] flex-col items-center justify-center px-4 py-24 text-center"
    >
      <div
        v-if="homeLoaded && (activeHeroImage || fallbackHeroImage)"
        class="fixed inset-0 left-16 bottom-24 z-0 flex flex-col items-center justify-center transition duration-300"
        :style="heroBackdropStyle"
      >
        <div
          class="bg-image relative block h-full w-full select-none overflow-hidden rounded-2xl text-left focus:outline-none"
        >
          <Motion
            v-if="activeHeroImage"
            :key="activeHeroImage as string"
            as="img"
            :src="activeHeroImage as string"
            :alt="activeHeroDescription"
            class="block h-full w-full object-cover object-top"
            :initial="{
              opacity: 0.2,
              scale: 1.03,
              filter: 'blur(18px) saturate(1.4)',
              translateX: 0,
              translateY: 0,
            }"
            :animate="{
              opacity: heroImageLoaded ? 1 : 0.2,
              scale: heroImageLoaded ? 1 : 1.03,
              filter: heroImageLoaded
                ? 'blur(0px) saturate(1)'
                : 'blur(18px) saturate(1.4)',
              translateX: heroParallaxOffset.x,
              translateY: heroParallaxOffset.y,
            }"
            :transition="{ duration: 0.45, ease: 'easeOut' }"
            @load="handleHeroImageLoaded"
            @error="handleHeroImageErrored"
          />
          <Motion
            v-else
            key="fallback-hero"
            as="img"
            :src="fallbackHeroImage"
            :alt="activeHeroDescription || 'Hydroline Portal 背景图'"
            class="block h-full w-full object-cover object-top"
            :initial="{
              opacity: 0.2,
              scale: 1.03,
              filter: 'blur(18px) saturate(1.4)',
              translateX: 0,
              translateY: 0,
            }"
            :animate="{
              opacity: heroImageLoaded ? 1 : 0.2,
              scale: heroImageLoaded ? 1 : 1.03,
              filter: heroImageLoaded
                ? 'blur(0px) saturate(1)'
                : 'blur(18px) saturate(1.4)',
              translateX: heroParallaxOffset.x,
              translateY: heroParallaxOffset.y,
            }"
            :transition="{ duration: 0.45, ease: 'easeOut' }"
            @load="handleHeroImageLoaded"
            @error="handleHeroImageErrored"
          />
        </div>
      </div>

      <Transition name="fade-slide" mode="out-in">
        <div class="flex flex-col items-center gap-6 relative z-1">
          <Motion
            as="div"
            class="space-y-2"
            :initial="{ opacity: 0, filter: 'blur(6px)', y: 8 }"
            :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
            :transition="{ duration: 0.35, ease: 'easeOut' }"
          >
            <h1 class="drop-shadow-sm">
              <HydrolineTextBold
                class="h-28 text-slate-600 dark:text-slate-300"
              />
            </h1>

            <Motion
              v-if="heroSubtitle"
              :key="heroSubtitle"
              as="p"
              class="text-sm uppercase text-slate-500 dark:text-slate-300"
              :initial="{ opacity: 0, filter: 'blur(6px)', y: 8 }"
              :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
              :exit="{ opacity: 0, filter: 'blur(6px)', y: -4 }"
              :transition="{ duration: 0.25, ease: 'easeOut' }"
            >
              {{ heroSubtitle }}
            </Motion>
          </Motion>

          <div class="flex flex-wrap items-center justify-center gap-4">
            <UTooltip
              v-for="(link, index) in navigationLinks"
              :key="link.id"
              :text="link.tooltip ?? link.label"
            >
              <UButton
                :color="link.available ? 'primary' : 'neutral'"
                variant="soft"
                class="rounded-full px-6 py-2 text-sm"
                :disabled="!link.available"
                :href="link.url ?? undefined"
                target="_blank"
                rel="noreferrer"
                @mouseenter="activateNavigation(index)"
                @focusin="activateNavigation(index)"
              >
                {{ link.label }}
              </UButton>
            </UTooltip>
          </div>

          <div v-if="showHeroIndicators" class="flex items-center gap-2">
            <span
              v-for="index in navigationLinks.length"
              :key="index"
              class="h-2 w-2 rounded-full"
              :class="{
                'bg-primary-500':
                  (carouselState.navIndex % navigationLinks.length) + 1 ===
                  index,
                'bg-slate-300 dark:bg-slate-600':
                  (carouselState.navIndex % navigationLinks.length) + 1 !==
                  index,
              }"
            />
          </div>
        </div>
      </Transition>
    </section>

    <section class="relative z-10 -mt-12 px-4">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div class="grid gap-4 md:grid-cols-3">
          <UCard
            v-if="serverOverview"
            class="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/70"
          >
            <template #header>
              <div class="flex flex-col gap-1">
                <p
                  class="text-sm font-semibold text-slate-700 dark:text-slate-200"
                >
                  服务器情况
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  上次更新：{{ serverOverview.lastUpdatedAt }}
                </p>
              </div>
            </template>
            <dl class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt class="text-xs text-slate-500 dark:text-slate-400">
                  在线玩家
                </dt>
                <dd
                  class="text-2xl font-semibold text-slate-900 dark:text-white"
                >
                  {{ formatNumberCompact(serverOverview.onlinePlayers) }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500 dark:text-slate-400">
                  承载容量
                </dt>
                <dd
                  class="text-2xl font-semibold text-slate-900 dark:text-white"
                >
                  {{ formatNumberCompact(serverOverview.maxPlayers) }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500 dark:text-slate-400">
                  健康服务器
                </dt>
                <dd
                  class="text-xl font-semibold text-slate-900 dark:text-white"
                >
                  {{ serverOverview.healthyServers }}/{{
                    serverOverview.totalServers
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500 dark:text-slate-400">
                  平均延迟
                </dt>
                <dd
                  class="text-xl font-semibold text-slate-900 dark:text-white"
                >
                  {{ formatLatency(serverOverview.averageLatencyMs) }}
                </dd>
              </div>
            </dl>
          </UCard>

          <UCard
            v-if="ownershipOverview"
            class="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/70"
          >
            <template #header>
              <p
                class="text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                名下数据
              </p>
            </template>
            <div
              class="grid grid-cols-2 gap-3 text-sm text-slate-700 dark:text-slate-200"
            >
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  AuthMe 绑定
                </p>
                <p class="text-xl font-semibold">
                  {{ formatNumberCompact(ownershipOverview.authmeBindings) }}
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Minecraft 档案
                </p>
                <p class="text-xl font-semibold">
                  {{ formatNumberCompact(ownershipOverview.minecraftProfiles) }}
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  公司/铁路
                </p>
                <p class="text-xl font-semibold">
                  {{
                    formatNumberCompact(
                      ownershipOverview.companyCount +
                        ownershipOverview.railwayCount,
                    )
                  }}
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  角色授权
                </p>
                <p class="text-xl font-semibold">
                  {{ formatNumberCompact(ownershipOverview.roleAssignments) }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard
            v-if="applicationOverview"
            class="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/70"
          >
            <template #header>
              <p
                class="text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                申请流程
              </p>
            </template>
            <div class="space-y-3 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-slate-500 dark:text-slate-400">待处理</span>
                <span
                  class="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  {{ applicationOverview.pendingContacts }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500 dark:text-slate-400">活跃会话</span>
                <span
                  class="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  {{ applicationOverview.activeSessions }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500 dark:text-slate-400"
                  >资料完整度</span
                >
                <span
                  class="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  {{
                    formatPercentage(applicationOverview.profileCompleteness)
                  }}
                </span>
              </div>
            </div>
          </UCard>
        </div>

        <div v-if="serverCards.length" class="grid gap-4 md:grid-cols-2">
          <UCard
            v-for="card in serverCards"
            :key="card.id"
            class="rounded-2xl border border-slate-200/70 bg-white/90 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/70"
          >
            <div class="flex items-start justify-between">
              <div>
                <p
                  class="text-sm font-semibold text-slate-800 dark:text-slate-100"
                >
                  {{ card.title }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ card.description }}
                </p>
              </div>
              <UBadge
                v-if="card.badge"
                size="sm"
                color="primary"
                variant="soft"
              >
                {{ card.badge }}
              </UBadge>
            </div>
            <div class="mt-4 flex items-baseline justify-between">
              <span
                class="text-3xl font-semibold text-slate-900 dark:text-white"
              >
                {{ card.value }}
                <span
                  class="text-base font-normal text-slate-500 dark:text-slate-400"
                  >{{ card.unit }}</span
                >
              </span>
              <span
                class="text-sm font-medium"
                :class="{
                  'text-emerald-500': card.trend === 'up',
                  'text-amber-500': card.trend === 'flat',
                  'text-rose-500': card.trend === 'down',
                }"
              >
                {{ card.trendLabel }}
              </span>
            </div>
          </UCard>
        </div>

        <div class="grid gap-6 md:grid-cols-5">
          <div class="md:col-span-3">
            <!-- 等东西 -->
            <Transition name="fade-slide" mode="out-in"> </Transition>
          </div>

          <div class="grid gap-4 md:col-span-2">
            <UCard
              v-for="cardId in secondaryCards"
              :key="cardId"
              class="rounded-2xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
            >
              <div class="flex items-center justify-between">
                <div>
                  <h3
                    class="text-base font-medium text-slate-900 dark:text-white"
                  >
                    {{ resolveCardMetadata(cardId).title }}
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ resolveCardMetadata(cardId).description }}
                  </p>
                </div>
                <UBadge color="neutral" variant="soft">开发中</UBadge>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </section>
  </div>

  <UModal v-model:open="heroPreviewOpen" :ui="{ content: 'w-full max-w-4xl' }">
    <template #content>
      <div class="space-y-2">
        <img
          :src="(activeHeroImage as string) || fallbackHeroImage"
          :alt="activeHeroDescription"
          class="rounded-2xl object-cover"
        />
        <p class="text-sm text-slate-600 dark:text-slate-300">
          {{ activeHeroDescription || 'Hydroline Portal 背景图' }}
        </p>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.35s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.bg-image {
  mask:
    linear-gradient(
      to bottom,
      rgba(255, 255, 255, 1) 40%,
      rgba(255, 255, 255, 0.25) 70%,
      transparent 95%
    ),
    linear-gradient(
      to right,
      transparent,
      rgba(255, 255, 255, 1) 10% 90%,
      transparent
    );
  mask-composite: intersect;
  -webkit-mask-composite: destination-in;
}
</style>
