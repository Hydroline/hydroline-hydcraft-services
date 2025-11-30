<script setup lang="ts">
import dayjs from 'dayjs'
import type { AdminBindingHistoryEntry } from '@/types/admin'

const { open, items, loading } = defineProps<{
  open: boolean
  items: AdminBindingHistoryEntry[]
  loading?: boolean
}>()

const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

function fmtDateTime(ts?: string | null, format = 'YYYY-MM-DD HH:mm') {
  if (!ts) return '—'
  return dayjs(ts).format(format)
}
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
    :ui="{
      content:
        'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            绑定流转记录
          </h3>
          <div class="flex items-center gap-2">
            <USkeleton v-if="loading" class="h-4 w-20" />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="emit('update:open', false)"
            />
          </div>
        </div>
        <ul class="space-y-3">
          <li
            v-for="entry in items"
            :key="entry.id"
            class="rounded-lg bg-slate-100/60 px-4 py-3 text-[11px] text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-900 dark:text-white">{{
                entry.action
              }}</span>
              <span>{{ fmtDateTime(entry.createdAt) }}</span>
            </div>
            <p class="mt-1">{{ entry.reason ?? '无备注' }}</p>
            <p class="mt-1">
              操作人：{{
                entry.operator?.profile?.displayName ??
                entry.operator?.email ??
                '系统'
              }}
            </p>
          </li>
          <li
            v-if="!loading && items.length === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
          >
            暂无流转记录
          </li>
        </ul>
      </div>
    </template>
  </UModal>
</template>
