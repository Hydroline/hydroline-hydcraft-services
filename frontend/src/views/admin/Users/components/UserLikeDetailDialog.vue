<script setup lang="ts">
import dayjs from 'dayjs'
import { computed } from 'vue'
import type { AdminUserLikeEntry } from '@/types/admin'

const props = defineProps<{
  open: boolean
  items: AdminUserLikeEntry[]
  loading: boolean
  userName?: string | null
}>()

const emit = defineEmits<{ (event: 'update:open', value: boolean): void }>()

const title = computed(() =>
  props.userName ? `“${props.userName}”的点赞记录` : '点赞详情',
)

const formatTimestamp = (value: string) =>
  dayjs(value).format('YYYY-MM-DD HH:mm')

const resolveLikerLabel = (entry: AdminUserLikeEntry) => {
  return (
    entry.liker.displayName?.trim() ||
    entry.liker.primaryAuthmeRealname ||
    entry.liker.primaryAuthmeUsername ||
    entry.liker.email ||
    '匿名用户'
  )
}

function closeDialog() {
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="(value) => emit('update:open', value)"
    :ui="{
      content: 'w-full max-w-3xl max-h-[calc(100dvh-2rem)] p-0',
    }"
  >
    <template #content>
      <div
        class="flex h-full flex-col overflow-hidden bg-white dark:bg-slate-900"
      >
        <div
          class="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800"
        >
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              点赞信息
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ title }}
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            size="xs"
            variant="ghost"
            @click="closeDialog"
          />
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div
            v-if="props.loading"
            class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400"
          >
            <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
            <span class="ml-2">正在加载点赞记录</span>
          </div>
          <div
            v-else-if="props.items.length === 0"
            class="text-sm text-slate-500 dark:text-slate-400"
          >
            没有点赞记录
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="item in props.items"
              :key="item.id"
              class="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800/70 dark:bg-slate-900/40"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-3">
                  <img
                    v-if="item.liker.avatarUrl"
                    :src="item.liker.avatarUrl"
                    :alt="resolveLikerLabel(item)"
                    class="h-10 w-10 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                  />
                  <div>
                    <p
                      class="text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      {{ resolveLikerLabel(item) }}
                    </p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      {{ item.liker.email ?? '暂无邮箱' }}
                    </p>
                  </div>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  {{ formatTimestamp(item.createdAt) }}
                </div>
              </div>
              <div class="mt-2 text-xs text-slate-500 dark:text-slate-400">
                <span v-if="item.liker.primaryAuthmeRealname">
                  绑定：
                  {{ item.liker.primaryAuthmeRealname }}
                  <span v-if="item.liker.primaryAuthmeUsername"
                    >（{{ item.liker.primaryAuthmeUsername }}）</span
                  >
                </span>
                <span v-else-if="item.liker.primaryAuthmeUsername"
                  >AuthMe：{{ item.liker.primaryAuthmeUsername }}</span
                >
                <span v-else>无 AuthMe 绑定</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
