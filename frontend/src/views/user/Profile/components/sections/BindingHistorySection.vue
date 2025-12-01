<script setup lang="ts">
import dayjs from 'dayjs'
import type { UserBindingHistoryEntry } from '@/types/profile'

const props = defineProps<{
  entries: UserBindingHistoryEntry[]
  loading?: boolean
}>()

const emit = defineEmits<{ (e: 'view-all'): void }>()

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY/MM/DD HH:mm') : value
}

function operatorLabel(entry: UserBindingHistoryEntry['operator']) {
  if (!entry) return '系统'
  return entry.profile?.displayName || entry.email || '系统'
}

function bindingLabel(entry: UserBindingHistoryEntry['binding']) {
  if (!entry) return '—'
  return entry.authmeRealname || entry.authmeUsername || '—'
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">绑定记录</h3>
      <UButton
        size="sm"
        variant="ghost"
        :disabled="props.loading"
        @click="emit('view-all')"
      >
        查看全部
      </UButton>
    </div>

    <div v-if="props.loading" class="space-y-3">
      <div
        v-for="n in 1"
        :key="`history-skeleton-${n}`"
        class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-700/60"
      >
        <div class="flex items-center justify-between gap-3">
          <USkeleton class="h-5 w-20" animated />
          <USkeleton class="h-4 w-24" animated />
        </div>
        <div class="mt-3 space-y-2">
          <USkeleton class="h-3 w-full" animated />
          <USkeleton class="h-3 w-3/4" animated />
        </div>
        <div class="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <USkeleton class="h-3 w-24" animated />
          <USkeleton class="h-3 w-20" animated />
        </div>
      </div>
    </div>

    <div v-else class="space-y-3">
      <div
        v-if="props.entries.length === 0"
        class="rounded-xl flex justify-center items-center border border-slate-200/60 bg-white p-4 text-xs dark:border-slate-800/60 dark:bg-slate-700/60"
      >
        暂无流转记录
      </div>

      <div
        v-for="entry in props.entries"
        :key="entry.id"
        class="rounded-xl border border-slate-200/60 bg-white p-4 text-sm text-slate-600 dark:border-slate-800/60 dark:bg-slate-700/60 dark:text-slate-200"
      >
        <div
          class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="text-base font-semibold text-slate-900 dark:text-white">
            {{ entry.action || '未知操作' }}
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400">
            {{ formatDateTime(entry.createdAt) }}
          </div>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-300">
          {{ entry.reason || '无备注' }}
        </p>
        <div class="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div>
            <div class="text-slate-500 dark:text-slate-400">关联账号</div>
            <div
              class="text-base font-semibold text-slate-800 dark:text-slate-100"
            >
              {{ bindingLabel(entry.binding ?? null) }}
            </div>
          </div>
          <div>
            <div class="text-slate-500 dark:text-slate-400">操作人</div>
            <div
              class="text-base font-semibold text-slate-800 dark:text-slate-100"
            >
              {{ operatorLabel(entry.operator) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
