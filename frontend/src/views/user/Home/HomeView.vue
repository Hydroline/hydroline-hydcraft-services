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

const navigationLinks = computed(() => home.value?.navigation ?? [])
const cardIds = computed(() => home.value?.cards ?? [])

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
  () => activeHeroBackground.value?.imageUrl ?? fallbackHeroImage,
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
  cardIds.value.filter((cardId) => cardId !== 'profile'),
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

  updateScrollState()
  window.addEventListener('scroll', updateScrollState, { passive: true })

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
</script>

<template>
  <div class="relative overflow-hidden">
    <section
      ref="heroRef"
      class="relative flex min-h-[60vh] flex-col items-center justify-center px-4 py-24 text-center"
    >
      <div
        class="fixed inset-0 left-16 bottom-24 z-0 flex flex-col justify-center items-center transition duration-300"
        :style="heroBackdropStyle"
      >
        <Motion
          :key="activeHeroImage"
          as="img"
          :src="activeHeroImage"
          :alt="activeHeroDescription"
          class="bg-image block h-full w-full select-none object-cover object-top"
          :initial="{
            opacity: 0.2,
            scale: 1.03,
            filter: 'blur(18px) saturate(1.4)',
          }"
          :animate="{
            opacity: heroImageLoaded ? 1 : 0.2,
            scale: heroImageLoaded ? 1 : 1.03,
            filter: heroImageLoaded
              ? 'blur(0px) saturate(1)'
              : 'blur(18px) saturate(1.4)',
          }"
          :transition="{ duration: 0.6, ease: 'easeOut' }"
          @load="handleHeroImageLoaded"
          @error="handleHeroImageErrored"
        />
      </div>

      <Transition name="fade-slide" mode="out-in">
        <div class="flex flex-col items-center gap-6 relative z-1">
          <div class="space-y-2">
            <h1 class="drop-shadow-sm">
              <HydrolineTextBold
                class="h-28 text-slate-600 dark:text-slate-300"
              />
            </h1>
            <p
              class="text-sm uppercase text-slate-500 dark:text-slate-300"
              v-if="heroSubtitle"
            >
              {{ heroSubtitle }}
            </p>
          </div>

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
      <div class="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-5">
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
    </section>
  </div>
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
