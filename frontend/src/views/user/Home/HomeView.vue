<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePortalStore } from '@/stores/user/portal'
import { useUiStore } from '@/stores/shared/ui'
import { Motion } from 'motion-v'
import dayjs from 'dayjs'
import HydrolineTextBold from '@/assets/resources/hydroline_text_bold.svg'
import fallbackHeroImage from '@/assets/images/image_home_background_240730.webp'

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
const heroParallaxOffset = reactive({ x: 0, y: 0 })
const parallaxEnabled = ref(true)
const scrollLockPosition = ref(0)

const heroParallaxAnimatedOffset = computed(() => {
  if (uiStore.previewMode || !parallaxEnabled.value) {
    return { x: 0, y: 0 }
  }
  return { x: heroParallaxOffset.x, y: heroParallaxOffset.y }
})

const navigationLinks = computed(() => home.value?.navigation ?? [])

const heroSubtitle = computed(() => home.value?.hero.subtitle ?? '')
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

const activeHeroSubtitle = computed(() =>
  (activeHeroBackground.value?.subtitle ?? '').trim(),
)

const activeHeroTitle = computed(() =>
  (activeHeroBackground.value?.title ?? '').trim(),
)

const activeHeroPhotographer = computed(() =>
  (activeHeroBackground.value?.photographer ?? '').trim(),
)

const activeHeroShootDate = computed(() => {
  const shootAt = activeHeroBackground.value?.shootAt
  if (!shootAt) return ''
  const parsed = dayjs(shootAt)
  if (!parsed.isValid()) return ''
  return parsed.format('YYYY.MM.DD')
})

const showHeroIndicators = computed(() => navigationLinks.value.length > 1)

const heroBackdropStyle = computed(() => {
  if (!heroImageLoaded.value || heroInView.value || uiStore.previewMode) {
    return {}
  }
  return {
    opacity: '0.15',
    transform: 'translateY(-3rem)',
    filter: 'blur(8px) saturate(2)',
  }
})

function updateScrollState() {
  scrolled.value = window.scrollY > 80
  uiStore.setHeroInView(!scrolled.value)
}

function updateParallaxEnabled() {
  const enabled = window.innerWidth > 1024
  parallaxEnabled.value = enabled
  if (!enabled) {
    heroParallaxOffset.x = 0
    heroParallaxOffset.y = 0
  }
}

function handleMouseMove(event: MouseEvent) {
  if (!parallaxEnabled.value || uiStore.previewMode) {
    heroParallaxOffset.x = 0
    heroParallaxOffset.y = 0
    return
  }

  const vw = window.innerWidth || 1
  const vh = window.innerHeight || 1

  const relX = event.clientX / vw
  const relY = event.clientY / vh

  const maxOffset = 36
  const offsetX = (relX - 0.5) * maxOffset * -1
  const offsetY = (relY - 0.5) * maxOffset * -1

  heroParallaxOffset.x = offsetX
  heroParallaxOffset.y = offsetY
}

function updateHeroMetadata() {
  uiStore.setHeroActiveDescription(activeHeroDescription.value)
  uiStore.setHeroActiveSubtitle(
    activeHeroSubtitle.value || heroSubtitle.value || '',
  )
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
    updateHeroMetadata()
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
  updateHeroMetadata()
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

  updateParallaxEnabled()
  window.addEventListener('resize', updateParallaxEnabled)

  updateScrollState()
  window.addEventListener('scroll', updateScrollState, { passive: true })

  window.addEventListener('mousemove', handleMouseMove)

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
    updateHeroMetadata()
  }
})

// 伟大的预览模式
watch(
  () => uiStore.previewMode,
  (enabled) => {
    if (enabled) {
      scrollLockPosition.value = window.scrollY || 0
      window.scrollTo({ top: 0, behavior: 'smooth' })
      document.body.style.overflow = 'hidden'
      uiStore.setHeroInView(true)
    } else {
      document.body.style.overflow = ''
      window.scrollTo({ top: scrollLockPosition.value, behavior: 'smooth' })
      updateScrollState()
    }
  },
  { immediate: true },
)

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
    updateHeroMetadata()
  },
  { immediate: true },
)

watch(heroSubtitle, () => {
  updateHeroMetadata()
})

watch([activeHeroDescription, activeHeroSubtitle], () => {
  updateHeroMetadata()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateScrollState)
  window.removeEventListener('resize', updateParallaxEnabled)
  window.removeEventListener('mousemove', handleMouseMove)
  if (observer.value && heroRef.value) {
    observer.value.unobserve(heroRef.value)
    observer.value.disconnect()
  }
  stopHeroCycle()
  uiStore.setHeroInView(true)
  uiStore.setHeroActiveDescription('')
  uiStore.setHeroActiveSubtitle('')
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
        v-if="homeLoaded && (activeHeroImage || fallbackHeroImage)"
        class="fixed top-0 left-0 lg:left-16 right-0 bottom-24 z-0 flex flex-col items-center justify-center transition duration-300"
        :class="{ 'bottom-0!': uiStore.previewMode }"
        :style="heroBackdropStyle"
      >
        <div
          v-if="!uiStore.previewMode"
          class="bg-image-mobile lg:bg-image relative block h-full w-full select-none overflow-hidden text-left focus:outline-none"
        >
          <Motion
            v-if="activeHeroImage"
            :key="activeHeroImage as string"
            as="img"
            :src="activeHeroImage as string"
            :alt="activeHeroDescription"
            class="block h-full w-full object-cover object-top select-none pointer-events-none"
            :initial="{
              opacity: 0,
              scale: 1.03,
              filter: 'blur(18px) saturate(1.4)',
              translateX: 0,
              translateY: 0,
            }"
            :animate="{
              opacity: 1,
              scale: heroImageLoaded ? 1 : 1.03,
              filter: heroImageLoaded
                ? 'blur(0px) saturate(1)'
                : 'blur(18px) saturate(1.4)',
              translateX: heroParallaxAnimatedOffset.x,
              translateY: heroParallaxAnimatedOffset.y,
            }"
            :exit="{
              opacity: 0,
              scale: 1.02,
              filter: 'blur(18px) saturate(1.4)',
            }"
            :transition="{
              duration: 0.6,
              ease: 'easeOut',
            }"
            @load="handleHeroImageLoaded"
            @error="handleHeroImageErrored"
          />

          <Motion
            v-else
            key="fallback-hero"
            as="img"
            :src="fallbackHeroImage"
            :alt="activeHeroDescription || 'Hydroline Portal 背景图'"
            class="block h-full w-full object-cover object-top select-none pointer-events-none"
            :initial="{
              opacity: 0,
              scale: 1.03,
              filter: 'blur(18px) saturate(1.4)',
              translateX: 0,
              translateY: 0,
            }"
            :animate="{
              opacity: 1,
              scale: heroImageLoaded ? 1 : 1.03,
              filter: heroImageLoaded
                ? 'blur(0px) saturate(1)'
                : 'blur(18px) saturate(1.4)',
              translateX: heroParallaxAnimatedOffset.x,
              translateY: heroParallaxAnimatedOffset.y,
            }"
            :exit="{
              opacity: 0,
              scale: 1.02,
              filter: 'blur(18px) saturate(1.4)',
            }"
            :transition="{
              duration: 0.6,
              ease: 'easeOut',
            }"
            @load="handleHeroImageLoaded"
            @error="handleHeroImageErrored"
          />
        </div>

        <!-- 预览模式 -->
        <div
          v-else
          class="relative block h-full w-full select-none overflow-hidden text-left focus:outline-none"
        >
          <div
            class="absolute inset-0 z-1 flex flex-col items-center bg-[linear-gradient(0deg,white_5%,transparent_30%)] dark:bg-[linear-gradient(0deg,rgba(15,23,42,0.95)_5%,transparent_30%)] justify-end p-6 text-slate-900 dark:from-slate-950/95 dark:via-slate-950/60 dark:text-slate-100"
          >
            <div class="w-full max-w-3xl text-center">
              <div
                v-if="activeHeroTitle"
                class="text-3xl text-slate-800 dark:text-slate-100 font-semibold leading-tight tracking-wide"
              >
                {{ activeHeroTitle }}
              </div>
              <div
                v-else-if="heroSubtitle"
                class="text-base font-semibold leading-tight tracking-wide"
              >
                {{ heroSubtitle }}
              </div>
              <div
                v-if="activeHeroSubtitle"
                class="text-base font-medium text-slate-600 dark:text-slate-300"
              >
                {{ activeHeroSubtitle }}
              </div>
              <div
                v-if="activeHeroDescription"
                class="mt-2 text-sm text-slate-500 dark:text-slate-300"
              >
                {{ activeHeroDescription }}
              </div>
              <div
                v-if="activeHeroShootDate || activeHeroPhotographer"
                class="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400"
              >
                <span v-if="activeHeroPhotographer">
                  <span class="font-semibold">
                    {{ activeHeroPhotographer }}
                  </span>
                  摄
                </span>
                <span v-if="activeHeroPhotographer && activeHeroShootDate"
                  >/</span
                >
                <span v-if="activeHeroShootDate">
                  {{ activeHeroShootDate }}
                </span>
              </div>
            </div>
          </div>

          <Motion
            v-if="activeHeroImage"
            :key="activeHeroImage as string"
            as="img"
            :src="activeHeroImage as string"
            :alt="activeHeroDescription"
            class="block h-full w-full object-cover object-top select-none pointer-events-none"
            :initial="{
              opacity: 0,
              scale: 1.03,
              translateX: 0,
              translateY: 0,
            }"
            :animate="{
              opacity: 1,
              scale: heroImageLoaded ? 1 : 1.03,
              translateX: heroParallaxAnimatedOffset.x,
              translateY: heroParallaxAnimatedOffset.y,
            }"
            :exit="{
              opacity: 0,
              scale: 1.02,
            }"
            :transition="{
              duration: 0.6,
              ease: 'easeOut',
            }"
            @load="handleHeroImageLoaded"
            @error="handleHeroImageErrored"
          />

          <Motion
            v-else
            key="fallback-hero-preview"
            as="img"
            :src="fallbackHeroImage"
            :alt="activeHeroDescription || 'Hydroline Portal 背景图'"
            class="block h-full w-full object-cover object-top select-none pointer-events-none"
            :initial="{
              opacity: 0,
              scale: 1.03,
              translateX: 0,
              translateY: 0,
            }"
            :animate="{
              opacity: 1,
              scale: heroImageLoaded ? 1 : 1.03,
              translateX: heroParallaxAnimatedOffset.x,
              translateY: heroParallaxAnimatedOffset.y,
            }"
            :exit="{
              opacity: 0,
              scale: 1.02,
            }"
            :transition="{
              duration: 0.6,
              ease: 'easeOut',
            }"
            @load="handleHeroImageLoaded"
            @error="handleHeroImageErrored"
          />
        </div>
      </div>

      <Transition name="fade-slide" mode="out-in">
        <div
          v-show="!uiStore.previewMode"
          class="flex flex-col items-center gap-6 relative z-1 opacity-100"
        >
          <Motion
            as="div"
            class="space-y-2"
            :initial="{ opacity: 0, filter: 'blur(6px)', y: 8 }"
            :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
            :transition="{ duration: 0.35, ease: 'easeOut' }"
          >
            <h1 class="drop-shadow-sm">
              <HydrolineTextBold
                class="h-24 lg:h-28 text-slate-600 dark:text-slate-300"
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

    <section
      v-show="!uiStore.previewMode"
      class="relative z-10 -mt-12 px-4 opacity-100"
    >
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6"></div>
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
      transparent 1%,
      rgba(255, 255, 255, 1) 10% 90%,
      transparent 99%
    );
  mask-composite: intersect;
  -webkit-mask-composite: destination-in;
}

.bg-image-mobile {
  mask: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 1) 40%,
    rgba(255, 255, 255, 0.25) 70%,
    transparent 95%
  );
  mask-composite: intersect;
  -webkit-mask-composite: destination-in;
}

@media (min-width: 1024px) {
  .lg\:bg-image {
    mask:
      linear-gradient(
        to bottom,
        rgba(255, 255, 255, 1) 40%,
        rgba(255, 255, 255, 0.25) 70%,
        transparent 95%
      ),
      linear-gradient(
        to right,
        transparent 1%,
        rgba(255, 255, 255, 1) 10% 90%,
        transparent 99%
      );
    mask-composite: intersect;
    -webkit-mask-composite: destination-in;
  }
}
</style>
