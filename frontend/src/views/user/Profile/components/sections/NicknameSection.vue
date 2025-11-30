<script setup lang="ts">
import { computed } from 'vue'

type NicknameEntry = {
  id?: string | null
  nickname?: string | null
  isPrimary?: boolean
  source?: string | null
  verifiedAt?: string | Date | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
}

const props = defineProps<{
  nicknames: NicknameEntry[]
  loading?: boolean
  primaryLoadingId?: string | null
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'edit', payload: NicknameEntry): void
  (e: 'delete', payload: NicknameEntry): void
  (e: 'set-primary', payload: NicknameEntry): void
}>()

const emptyState = computed(
  () => !props.loading && props.nicknames.length === 0,
)

function formatDate(value: string | Date | null | undefined) {
  if (!value) return '--'
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString()
    }
    return value
  }
  if (value instanceof Date) {
    return value.toLocaleString()
  }
  return '--'
}

function sourceLabel(source: string | null | undefined) {
  if (!source) return '手动维护'
  switch (source) {
    case 'AUTHME':
      return 'AuthMe 同步'
    case 'SYNC':
      return '数据同步'
    case 'MANUAL':
      return '手动维护'
    default:
      return source
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3
        class="flex itemsd-center gap-1 px-1 text-lg text-slate-600 dark:text-slate-300"
      >
        惯用昵称
        <UTooltip
          text="在交流群、社区内广泛使用的昵称，昵称会作为玩家在正式场合的称呼使用"
        >
          <button
            type="button"
            class="text-slate-400 transition hover:text-slate-600 focus:outline-none dark:text-slate-500 dark:hover:text-slate-300"
          >
            <UIcon name="i-lucide-info" class="h-4 w-4" />
            <span class="sr-only">惯用昵称</span>
          </button>
        </UTooltip>
      </h3>
      <UButton
        size="sm"
        variant="ghost"
        :loading="props.loading"
        @click="emit('add')"
      >
        新增昵称
      </UButton>
    </div>

    <div v-if="props.loading" class="space-y-3">
      <div
        v-for="n in 2"
        :key="`nick-skeleton-${n}`"
        class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-700/60"
      >
        <div class="flex items-center justify-between">
          <USkeleton class="h-5 w-32" animated />
          <USkeleton class="h-8 w-32" animated />
        </div>
        <div class="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <USkeleton
            v-for="m in 2"
            :key="`nick-meta-${n}-${m}`"
            class="h-3 w-full"
            animated
          />
        </div>
      </div>
    </div>

    <div v-else class="space-y-3">
      <div
        v-if="emptyState"
        class="rounded-xl flex justify-center items-center border border-slate-200/60 bg-white p-4 text-xs dark:border-slate-800/60 dark:bg-slate-700/60"
      >
        暂无记录
      </div>

      <div
        v-for="item in props.nicknames"
        :key="item.id ?? item.nickname ?? Math.random().toString(36)"
        class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-700/60"
      >
        <div
          class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
        >
          <div class="flex-1 flex flex-col">
            <div
              class="flex items-center gap-2 text-lg font-medium text-slate-700 dark:text-slate-200"
            >
              <span>{{ item.nickname || '未命名' }}</span>
              <UBadge
                v-if="item.isPrimary"
                size="xs"
                color="primary"
                variant="soft"
              >
                主昵称
              </UBadge>
            </div>
            <div class="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div>
                <div class="text-xs text-slate-500 dark:text-slate-500">
                  来源
                </div>
                <div
                  class="text-base font-semibold text-slate-800 dark:text-slate-300"
                >
                  {{ sourceLabel(item.source ?? null) }}
                </div>
              </div>

              <div>
                <div class="text-xs text-slate-500 dark:text-slate-500">
                  最近更新
                </div>
                <div
                  class="text-base font-semibold text-slate-800 dark:text-slate-300"
                >
                  {{ formatDate(item.updatedAt ?? item.createdAt ?? null) }}
                </div>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UTooltip v-if="!item.isPrimary" text="设为主昵称">
              <UButton
                type="button"
                color="primary"
                variant="ghost"
                icon="i-lucide-star"
                :loading="props.primaryLoadingId === item.id"
                @click="emit('set-primary', item)"
              />
            </UTooltip>
            <UTooltip text="编辑昵称">
              <UButton
                type="button"
                variant="ghost"
                icon="i-lucide-edit"
                @click="emit('edit', item)"
              />
            </UTooltip>
            <UTooltip text="删除昵称">
              <UButton
                type="button"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                @click="emit('delete', item)"
              />
            </UTooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
