<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usePlayerPortalStore } from '@/stores/playerPortal'
import { useAuthStore } from '@/stores/auth'

const playerPortalStore = usePlayerPortalStore()
const auth = useAuthStore()
const selectedCategory = ref('login-count')
const selectedPeriod = ref('30d')
const loading = computed(() => playerPortalStore.loading)

const categories = computed(() => playerPortalStore.rankCategories)
const leaderboard = computed(() => playerPortalStore.leaderboard?.items ?? [])
const pagination = computed(
  () => playerPortalStore.leaderboard?.pagination ?? null,
)
const meContext = computed(() => playerPortalStore.rankContext?.me ?? null)
const aroundContext = computed(
  () => playerPortalStore.rankContext?.around ?? [],
)
const periodOptions = [
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '近 90 天', value: '90d' },
  { label: '全部', value: 'all' },
]

async function refreshLeaderboard() {
  await playerPortalStore.fetchLeaderboard(
    selectedCategory.value,
    selectedPeriod.value,
  )
  if (auth.isAuthenticated) {
    await playerPortalStore.fetchRankContext(
      selectedCategory.value,
      selectedPeriod.value,
    )
  } else {
    playerPortalStore.rankContext = null
  }
}

onMounted(async () => {
  await playerPortalStore.fetchRankCategories()
  if (!categories.value.length) {
    categories.value.push({
      id: 'login-count',
      name: '上线次数',
      description: '根据会话统计的上线次数',
      unit: '次',
    })
  }
  if (!categories.value.find((entry) => entry.id === selectedCategory.value)) {
    selectedCategory.value = categories.value[0]?.id ?? 'login-count'
  }
  await refreshLeaderboard()
})

watch(
  () => [selectedCategory.value, selectedPeriod.value],
  async () => {
    await refreshLeaderboard()
  },
)

const highlightUserId = computed(() => auth.user?.id ?? null)

function formatValue(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  }
  return value.toString()
}
</script>

<template>
  <section class="mx-auto w-full max-w-5xl px-4 py-10">
    <header
      class="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          排行榜
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          浏览近段时间的活跃度排行，点击行可跳转到玩家档案。
        </p>
      </div>
      <div class="flex flex-wrap gap-3">
        <USelectMenu
          v-model="selectedCategory"
          :options="
            categories.map((entry) => ({
              label: entry.name,
              value: entry.id,
            }))
          "
          class="w-44"
        />
        <USelectMenu
          v-model="selectedPeriod"
          :options="periodOptions"
          class="w-36"
        />
      </div>
    </header>

    <UCard class="space-y-4 bg-white/80 backdrop-blur-sm dark:bg-slate-900/60">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
            排行榜
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{
              categories.find((c) => c.id === selectedCategory)?.description ||
              '根据活跃度排序'
            }}
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-ccw"
          variant="ghost"
          color="neutral"
          :loading="loading"
          @click="refreshLeaderboard"
        >
          刷新
        </UButton>
      </div>

      <div
        class="overflow-hidden rounded-xl border border-slate-200/70 dark:border-slate-800/70"
      >
        <div
          class="hidden bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800/50 dark:text-slate-300 md:grid md:grid-cols-[80px_1fr_120px] md:px-6 md:py-3"
        >
          <div>#</div>
          <div>玩家</div>
          <div class="text-right">数值</div>
        </div>
        <div v-if="loading" class="p-6">
          <div class="space-y-3">
            <USkeleton
              v-for="n in 5"
              :key="n"
              class="h-10 w-full rounded-full"
            />
          </div>
        </div>
        <div v-else>
          <div
            v-for="item in leaderboard"
            :key="item.rank"
            class="flex flex-col border-t border-slate-100 px-3 py-4 text-sm text-slate-800 dark:border-slate-800 dark:text-slate-100 md:grid md:grid-cols-[80px_1fr_120px] md:items-center md:px-6"
            :class="{
              'bg-primary-50/60 dark:bg-primary-500/10':
                highlightUserId && item.user.id === highlightUserId,
            }"
          >
            <div
              class="text-base font-semibold text-slate-500 dark:text-slate-400 md:text-xl"
            >
              {{ item.rank }}
            </div>
            <div class="flex flex-col">
              <span class="font-medium">
                {{
                  item.user.displayName || item.user.minecraftName || '未知玩家'
                }}
              </span>
              <span class="text-xs text-slate-500 dark:text-slate-400">
                {{ item.user.minecraftName || item.user.email || item.user.id }}
              </span>
            </div>
            <div class="text-right text-base font-semibold">
              {{ formatValue(item.value) }}
            </div>
          </div>
          <div
            v-if="!leaderboard.length"
            class="p-6 text-center text-sm text-slate-500 dark:text-slate-400"
          >
            暂无数据，稍后再试。
          </div>
        </div>
      </div>

      <div
        v-if="meContext"
        class="rounded-xl border border-primary-200/70 bg-primary-50/80 px-4 py-3 text-sm text-primary-900 dark:border-primary-500/50 dark:bg-primary-500/10 dark:text-primary-100"
      >
        <p>
          你的当前位置：
          <span class="font-semibold">第 {{ meContext.rank }} 名</span> ·
          <span>{{ formatValue(meContext.value) }}</span>
        </p>
      </div>
    </UCard>

    <UCard
      v-if="aroundContext.length"
      class="mt-6 bg-white/80 backdrop-blur-sm dark:bg-slate-900/60"
    >
      <template #header>
        <div>
          <p class="font-medium text-slate-900 dark:text-white">最近排名快照</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            包含你附近的玩家，便于比较
          </p>
        </div>
      </template>
      <div class="space-y-3">
        <div
          v-for="item in aroundContext"
          :key="item.rank"
          class="flex items-center justify-between rounded-xl border border-slate-200/70 px-4 py-3 text-sm dark:border-slate-800/70"
        >
          <div>
            <p class="font-semibold text-slate-800 dark:text-slate-100">
              #{{ item.rank }} ·
              {{
                item.user.displayName || item.user.minecraftName || '未知玩家'
              }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ item.user.minecraftName || item.user.email || item.user.id }}
            </p>
          </div>
          <div class="text-base font-semibold text-slate-900 dark:text-white">
            {{ formatValue(item.value) }}
          </div>
        </div>
      </div>
    </UCard>

    <div
      v-if="pagination"
      class="mt-6 text-center text-xs text-slate-500 dark:text-slate-400"
    >
      第 {{ pagination.page }} / {{ pagination.pageCount }} 页 · 共
      {{ pagination.total }} 位玩家
    </div>
  </section>
</template>
