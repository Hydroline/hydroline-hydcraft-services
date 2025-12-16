<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Motion } from 'motion-v'
import type {
  PlayerLoginRecommendation,
  PlayerLoginRecommendationsResponse,
} from '@/types/portal'
import { apiFetch } from '@/utils/http/api'

const PAGE_SIZE = 10

const props = defineProps<{
  canViewProfile: boolean
}>()

const recommendations = ref<PlayerLoginRecommendation[]>([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / PAGE_SIZE)),
)
const hasMultiplePages = computed(() => total.value > PAGE_SIZE)

function avatarUrl(item: PlayerLoginRecommendation) {
  if (item.avatarUrl) {
    return item.avatarUrl
  }
  if (item.type === 'authme') {
    return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(
      item.targetId,
    )}/64`
  }
  return null
}

async function loadRecommendations(nextPage = 1) {
  loading.value = true
  try {
    const response = await apiFetch<PlayerLoginRecommendationsResponse>(
      `/player/authme/recommendations?page=${nextPage}&pageSize=${PAGE_SIZE}`,
    )
    recommendations.value = response.items
    total.value = response.total
    page.value = Math.max(1, response.page)
  } catch (error) {
    console.warn('Failed to load recommendations', error)
  } finally {
    loading.value = false
  }
}

function handleSwap() {
  const nextPage = page.value >= totalPages.value ? 1 : page.value + 1
  void loadRecommendations(nextPage)
}

onMounted(() => {
  void loadRecommendations()
})
</script>

<template>
  <div
    v-if="!props?.canViewProfile"
    class="text-center text-slate-700 dark:text-slate-300 my-20"
  >
    <div class="flex flex-col gap-4 justify-center items-center">
      <UIcon name="i-lucide-info" class="w-8 h-8" />
      <span>请先登录以查看玩家资料</span>
    </div>

    <div class="mt-24">
      <div class="text-slate-400 text-xs">
        这么想看就实践一下下面这几个人吧 ↓
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-10 gap-3 mt-4">
        <Motion
          v-for="item in recommendations"
          :key="item.id"
          as="div"
          :initial="{ opacity: 0, filter: 'blur(6px)', y: 8 }"
          :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
          :transition="{ duration: 0.35, ease: 'easeInOut' }"
        >
          <RouterLink
            :to="
              item.type === 'authme'
                ? { name: 'player.name', params: { playerName: item.targetId } }
                : { name: 'player', params: { playerId: item.targetId } }
            "
            class="flex flex-col items-center gap-2 rounded-xl p-2 text-sm transition hover:border-primary-500 hover:bg-white hover:dark:bg-slate-600/50"
          >
            <div
              class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
            >
              <img
                v-if="avatarUrl(item)"
                :src="avatarUrl(item) || ''"
                :alt="item.displayName"
                class="h-full w-full object-cover"
              />
            </div>
            <p
              class="text-center text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2"
            >
              {{ item.displayName }}
            </p>
            <span class="text-[10px] uppercase tracking-wider text-slate-400">
              {{ item.type === 'user' ? '用户' : '玩家' }}
            </span>
          </RouterLink>
        </Motion>
      </div>

      <div class="mt-6 flex justify-center">
        <UButton
          size="xs"
          variant="link"
          color="primary"
          :disabled="!hasMultiplePages || loading"
          @click="handleSwap"
        >
          换一批
        </UButton>
      </div>
    </div>
  </div>
</template>
