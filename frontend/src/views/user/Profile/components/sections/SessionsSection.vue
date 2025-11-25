<script setup lang="ts">
import dayjs from 'dayjs'
import UAParser from 'ua-parser-js'

const props = defineProps<{
  sessions: Array<{
    id: string
    createdAt: string | Date
    updatedAt: string | Date
    ipAddress?: string | null
    ipLocation?: string | null
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
  return parsed.format('YYYY/MM/DD HH:mm:ss')
}

function parseUserAgent(value: string | null | undefined) {
  if (!value) {
    return {
      type: 'unknown' as const,
      typeLabel: '未知',
      os: '未知',
      display: '未知设备',
      icon: 'i-lucide-help-circle',
    }
  }
  const parser = new UAParser(value)
  const result = parser.getResult()
  const rawType = result.device.type || undefined
  let type: 'mobile' | 'tablet' | 'desktop' | 'unknown'
  if (rawType === 'mobile') type = 'mobile'
  else if (rawType === 'tablet') type = 'tablet'
  else type = 'desktop'
  const typeLabelMap: Record<string, string> = {
    mobile: '手机',
    tablet: '平板',
    desktop: '桌面',
    unknown: '未知',
  }
  const iconMap: Record<string, string> = {
    mobile: 'i-lucide-smartphone',
    tablet: 'i-lucide-tablet',
    desktop: 'i-lucide-monitor',
    unknown: 'i-lucide-help-circle',
  }
  const osName = result.os.name || '未知'
  const display = `${typeLabelMap[type]}/${osName}`
  return {
    type,
    typeLabel: typeLabelMap[type],
    os: osName,
    display,
    icon: iconMap[type],
  }
}

function deviceIcon(value: string | null | undefined) {
  return parseUserAgent(value).icon
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h3
        class="flex items-center gap-2 px-1 text-lg text-slate-600 dark:text-slate-300"
      >
        登录设备管理

        <span class="block" v-if="props.loading && props.sessions.length === 0">
          <UIcon name="i-lucide-loader-2" class="mr-2 h-4 w-4 animate-spin" />
        </span>
      </h3>
      <UButton size="sm" variant="ghost" @click="emit('refresh')">刷新</UButton>
    </div>

    <div
      v-if="props.error"
      class="rounded-xl border border-rose-200/50 bg-rose-50/70 px-4 py-3 text-sm text-rose-600 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-200"
    >
      {{ props.error }}
    </div>

    <div
      v-if="props.sessions.length === 0"
      class="rounded-xl flex justify-center items-center border border-slate-200/60 bg-white p-4 text-xs dark:border-slate-800/60 dark:bg-slate-700/60"
    >
      暂无活跃会话
    </div>

    <div v-else class="space-y-3">
      <article
        v-for="session in props.sessions"
        :key="session.id"
        class="rounded-xl p-4 bg-white dark:bg-slate-700/60 border border-slate-200/60 dark:border-slate-800/60"
        :class="{ 'outline-2 outline-primary-300': session.isCurrent }"
      >
        <div class="flex flex-col">
          <div class="space-y-2">
            <div
              class="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100 mb-0"
            >
              <div class="flex-1 flex items-center">
                <div class="flex items-center gap-1">
                  <span
                    class="text-lg"
                    :class="
                      session.ipAddress
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-slate-400 dark:text-slate-500'
                    "
                    >{{ session.ipAddress || '未知 IP' }}
                  </span>
                  <span
                    v-if="session.ipLocation"
                    class="text-xs text-slate-500 dark:text-slate-400"
                  >
                    （{{ session.ipLocation }}）
                  </span>
                </div>

                <UBadge
                  v-if="session.isCurrent"
                  color="primary"
                  variant="soft"
                  size="sm"
                  >当前设备</UBadge
                >
              </div>

              <div v-if="!session.isCurrent">
                <UTooltip text="终止会话">
                  <UButton
                    size="sm"
                    color="error"
                    variant="ghost"
                    :disabled="session.isCurrent"
                    :loading="props.revokingId === session.id"
                    icon="i-lucide-log-out"
                    aria-label="终止会话"
                    @click="emit('revoke', session.id)"
                  />
                </UTooltip>
              </div>
            </div>
            <div
              class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
            >
              <UIcon :name="deviceIcon(session.userAgent)" class="h-3" />
              <span class="leading-none">{{
                parseUserAgent(session.userAgent).display
              }}</span>
            </div>
            <div
              class="grid gap-1 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-2"
            >
              <div>
                <div class="text-xs text-slate-500 dark:text-slate-500">
                  创建时间
                </div>
                <div
                  class="text-base font-semibold text-slate-800 dark:text-slate-300"
                >
                  {{ formatDate(session.createdAt) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-slate-500 dark:text-slate-500">
                  最近活动
                </div>
                <div
                  class="text-base font-semibold text-slate-800 dark:text-slate-300"
                >
                  {{ formatDate(session.updatedAt) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
