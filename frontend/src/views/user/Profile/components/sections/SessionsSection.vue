<script setup lang="ts">
import dayjs from 'dayjs'

const props = defineProps<{
  sessions: Array<{
    id: string
    createdAt: string | Date
    updatedAt: string | Date
    expiresAt: string | Date
    ipAddress?: string | null
    userAgent?: string | null
    isCurrent?: boolean
  }>
  loading: boolean
  error?: string
  revokingId?: string | null
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'revoke', id: string): void
}>()

function formatDate(value: string | Date | null | undefined) {
  if (!value) return '未知'
  const parsed = dayjs(value)
  if (!parsed.isValid()) return '未知'
  return parsed.format('YYYY年MM月DD日 HH:mm')
}

function formatUserAgent(value: string | null | undefined) {
  if (!value) return '未知设备'
  return value.length > 160 ? `${value.slice(0, 157)}...` : value
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">活跃会话</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400">管理常用的登录设备，必要时可远程退出。</p>
      </div>
      <UButton size="sm" variant="soft" :loading="props.loading" @click="emit('refresh')">
        刷新
      </UButton>
    </div>

    <div v-if="props.error" class="rounded-xl border border-rose-200/50 bg-rose-50/70 px-4 py-3 text-sm text-rose-600 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-200">
      {{ props.error }}
    </div>

    <div v-if="props.loading && props.sessions.length === 0" class="rounded-xl border border-slate-200/70 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800/70 dark:text-slate-400">
      正在获取活跃会话...
    </div>

    <div v-else-if="props.sessions.length === 0" class="rounded-xl border border-dashed border-slate-200/70 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800/70 dark:text-slate-400">
      暂无活跃会话。
    </div>

    <div v-else class="space-y-4">
      <article v-for="session in props.sessions" :key="session.id" class="rounded-xl border border-slate-200/70 px-4 py-4 dark:border-slate-800/70">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span>{{ session.ipAddress || '未知 IP' }}</span>
              <UBadge v-if="session.isCurrent" color="primary" variant="soft">当前设备</UBadge>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ formatUserAgent(session.userAgent) }}</p>
            <div class="grid gap-1 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-2">
              <span>创建于：{{ formatDate(session.createdAt) }}</span>
              <span>最近活动：{{ formatDate(session.updatedAt) }}</span>
              <span>过期时间：{{ formatDate(session.expiresAt) }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 self-end md:self-start">
            <UButton
              size="sm"
              color="error"
              variant="outline"
              :disabled="session.isCurrent"
              :loading="props.revokingId === session.id"
              @click="emit('revoke', session.id)"
            >
              终止会话
            </UButton>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
