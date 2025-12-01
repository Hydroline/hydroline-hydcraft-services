<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import type { AdminUserDetail } from '@/types/admin'

const { detail, likesSummary } = defineProps<{
  detail: AdminUserDetail | null
  likesSummary?: { total: number; latestAt: string | null } | null
}>()

const emit = defineEmits<{ (e: 'openLikeDetail'): void }>()

const likeCount = computed(() => likesSummary?.total ?? 0)
const latestLikeLabel = computed(() => {
  if (!likesSummary?.latestAt) return '暂无'
  return dayjs(likesSummary.latestAt).format('YYYY-MM-DD HH:mm')
})
</script>

<template>
  <section
    class="rounded-2xl p-6 border border-slate-200/70 dark:border-slate-800/70"
  >
    <div class="flex items-center justify-between">
      <div class="text-sm tracking-wide text-slate-500 dark:text-slate-400">
        被点赞信息
      </div>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!detail"
        @click="emit('openLikeDetail')"
      >
        查看点赞记录
      </UButton>
    </div>
    <div class="mt-4 text-slate-600 dark:text-slate-300">
      <div class="text-lg font-semibold text-slate-900 dark:text-white">
        {{ likeCount }} 次
      </div>
      <div class="text-xs text-slate-500 dark:text-slate-400">
        最近：{{ latestLikeLabel }}
      </div>
    </div>
  </section>
</template>
