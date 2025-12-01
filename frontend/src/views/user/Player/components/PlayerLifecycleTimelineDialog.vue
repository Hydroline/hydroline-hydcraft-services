<script setup lang="ts">
import dayjs from 'dayjs'

const props = defineProps<{
  open: boolean
  passwordEntries: Array<{
    id: string
    badge: { color: string; text: string }
    requestedAt: string | null
    serverName: string | null
    description: string
  }>
  forceLoginEntries: Array<{
    id: string
    badge: { color: string; text: string }
    requestedAt: string | null
    serverName: string | null
    description: string
  }>
  permissionEntries: Array<{
    id: string
    badge: { color: string; text: string }
    requestedAt: string | null
    serverName: string | null
    description: string
    targetGroup: string | null
  }>
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

function formatTimestamp(value: string | null) {
  if (!value) return '—'
  return dayjs(value).format('YYYY/MM/DD HH:mm:ss')
}
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="emit('update:open', $event)"
    :ui="{
      content:
        'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <UCard class="overflow-auto">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              账户操作日志
            </h3>

            <UButton
              color="neutral"
              variant="ghost"
              @click="emit('update:open', false)"
              icon="i-lucide-x"
            />
          </div>
        </template>

        <div class="space-y-6">
          <section>
            <header
              class="flex items-center justify-between border-b border-slate-200/70 px-2 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200"
            >
              <div>
                <p>密码重置</p>
                <p
                  class="text-xs font-normal text-slate-500 dark:text-slate-400"
                >
                  通过 /authme changepassword 下发的任务
                </p>
              </div>
            </header>
            <div
              v-if="passwordEntries.length === 0"
              class="px-2 py-3 text-xs text-slate-500 dark:text-slate-400"
            >
              暂无任务记录
            </div>
            <div v-else class="space-y-3 px-2 py-3">
              <div
                v-for="entry in passwordEntries"
                :key="entry.id"
                class="rounded-xl border border-slate-200/70 p-4 text-sm dark:border-slate-700/70"
              >
                <div class="flex items-center justify-between">
                  <UBadge :color="entry.badge.color" variant="soft" size="xs">
                    {{ entry.badge.text }}
                  </UBadge>
                  <span class="text-xs text-slate-400">
                    {{ formatTimestamp(entry.requestedAt) }}
                  </span>
                </div>
                <p class="mt-2 text-slate-700 dark:text-slate-200">
                  {{ entry.description }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  服务器：{{ entry.serverName || '未知' }}
                </p>
              </div>
            </div>
          </section>

          <section>
            <header
              class="flex items-center justify-between border-b border-slate-200/70 px-2 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200"
            >
              <div>
                <p>强制登录</p>
                <p
                  class="text-xs font-normal text-slate-500 dark:text-slate-400"
                >
                  通过 /authme forcelogin 下发的任务
                </p>
              </div>
            </header>
            <div
              v-if="forceLoginEntries.length === 0"
              class="px-2 py-3 text-xs text-slate-500 dark:text-slate-400"
            >
              暂无任务记录
            </div>
            <div v-else class="space-y-3 px-2 py-3">
              <div
                v-for="entry in forceLoginEntries"
                :key="entry.id"
                class="rounded-xl border border-slate-200/70 p-4 text-sm dark:border-slate-700/70"
              >
                <div class="flex items-center justify-between">
                  <UBadge :color="entry.badge.color" variant="soft" size="xs">
                    {{ entry.badge.text }}
                  </UBadge>
                  <span class="text-xs text-slate-400">
                    {{ formatTimestamp(entry.requestedAt) }}
                  </span>
                </div>
                <p class="mt-2 text-slate-700 dark:text-slate-200">
                  {{ entry.description }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  服务器：{{ entry.serverName || '未知' }}
                </p>
              </div>
            </div>
          </section>

          <section>
            <header
              class="flex items-center justify-between border-b border-slate-200/70 px-2 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200"
            >
              <div>
                <p>权限组调整</p>
                <p
                  class="text-xs font-normal text-slate-500 dark:text-slate-400"
                >
                  通过 /lp user parent set 下发的任务
                </p>
              </div>
            </header>
            <div
              v-if="permissionEntries.length === 0"
              class="px-2 py-3 text-xs text-slate-500 dark:text-slate-400"
            >
              暂无任务记录
            </div>
            <div v-else class="space-y-3 px-2 py-3">
              <div
                v-for="entry in permissionEntries"
                :key="entry.id"
                class="rounded-xl border border-slate-200/70 p-4 text-sm dark:border-slate-700/70"
              >
                <div class="flex items-center justify-between">
                  <UBadge :color="entry.badge.color" variant="soft" size="xs">
                    {{ entry.badge.text }}
                  </UBadge>
                  <span class="text-xs text-slate-400">
                    {{ formatTimestamp(entry.requestedAt) }}
                  </span>
                </div>
                <p class="mt-2 text-slate-700 dark:text-slate-200">
                  {{ entry.description }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  服务器：{{ entry.serverName || '未知' }} · 目标权限组：{{
                    entry.targetGroup || '未知'
                  }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </UCard>
    </template>
  </UModal>
</template>
