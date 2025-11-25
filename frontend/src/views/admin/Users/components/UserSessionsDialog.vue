<script setup lang="ts">
import dayjs from 'dayjs'

interface SessionItem {
  id: string
  createdAt?: string | null
  updatedAt?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

const { open, sessions } = defineProps<{
  open: boolean
  sessions: SessionItem[]
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
    :ui="{ content: 'w-full max-w-2xl' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            登录轨迹
          </h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="emit('update:open', false)"
          />
        </div>
        <ul class="space-y-3">
          <li
            v-for="session in sessions"
            :key="session.id"
            class="rounded-lg bg-slate-100/60 px-3 py-2 text-[11px] text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-slate-900 dark:text-white">{{
                fmtDateTime(session.createdAt)
              }}</span>
              <span>IP：{{ session.ipAddress ?? '—' }}</span>
            </div>
            <p class="mt-1">最近：{{ fmtDateTime(session.updatedAt) }}</p>
            <p class="mt-1 break-all">UA：{{ session.userAgent ?? '—' }}</p>
          </li>
          <li
            v-if="sessions.length === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
          >
            暂无登录记录
          </li>
        </ul>
      </div>
    </template>
  </UModal>
</template>
