<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminAttachmentsStore } from '@/stores/adminAttachments'
import { useUiStore } from '@/stores/ui'
import { getApiBaseUrl } from '@/utils/api'
import type { AdminAttachmentSummary } from '@/types/admin'

const uiStore = useUiStore()
const attachmentsStore = useAdminAttachmentsStore()

const includeDeleted = ref(attachmentsStore.filters.includeDeleted ?? false)
const backendBase = getApiBaseUrl()

const items = computed(() => attachmentsStore.items)

function toPublicUrl(item: (typeof items.value)[number]) {
  if (!item.publicUrl) return null
  return item.publicUrl.startsWith('http')
    ? item.publicUrl
    : `${backendBase}${item.publicUrl}`
}

function formatOwner(owner: AdminAttachmentSummary['owner']) {
  if (!owner) {
    return '已删除用户'
  }
  const name = owner.name?.trim()
  const email = owner.email?.trim()
  return name || email || '已删除用户'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function refresh() {
  uiStore.startLoading()
  try {
    await attachmentsStore.fetch({
      includeDeleted: includeDeleted.value,
    })
  } finally {
    uiStore.stopLoading()
  }
}

onMounted(async () => {
  if (items.value.length === 0) {
    await refresh()
  }
})
</script>

<template>
  <div class="space-y-6">
    <header
      class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          附件系统
        </h1>
      </div>
      <div class="flex items-center gap-3">
        <label
          class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
        >
          <UCheckbox v-model="includeDeleted" @change="refresh" size="sm" />
          显示已删除附件
        </label>
        <UButton color="primary" variant="link" @click="refresh">
          刷新
        </UButton>
      </div>
    </header>

    <div
      class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <table
        class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
      >
        <thead class="bg-slate-50/60 dark:bg-slate-900/60">
          <tr
            class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            <th class="px-4 py-3">附件</th>
            <th class="px-4 py-3">目录</th>
            <th class="px-4 py-3">标签</th>
            <th class="px-4 py-3">大小</th>
            <th class="px-4 py-3">状态</th>
            <th class="px-4 py-3">更新时间</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="item in items"
            :key="item.id"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3">
              <div class="flex flex-col">
                <span class="font-medium text-slate-900 dark:text-white">{{
                  item.name
                }}</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">{{
                  item.originalName
                }}</span>
                <span class="text-xs text-slate-400 dark:text-slate-500">
                  上传者：{{ formatOwner(item.owner) }}
                  <span
                    v-if="item.owner?.deleted"
                    class="ml-1 text-rose-500 dark:text-rose-400"
                  >
                    （账户已删除）
                  </span>
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ item.folder?.path ?? '根目录' }}
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="tag in item.tags"
                  :key="tag.id"
                  color="primary"
                  variant="outline"
                >
                  {{ tag.name }}
                </UBadge>
                <span
                  v-if="item.tags.length === 0"
                  class="text-xs text-slate-400 dark:text-slate-500"
                  >无标签</span
                >
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ formatSize(item.size) }}
            </td>
            <td class="px-4 py-3">
              <UBadge
                :color="item.isPublic ? 'success' : 'neutral'"
                variant="soft"
              >
                {{ item.isPublic ? '公开' : '私有' }}
              </UBadge>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ new Date(item.updatedAt).toLocaleString() }}
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <UButton
                  v-if="toPublicUrl(item)"
                  :href="toPublicUrl(item) ?? undefined"
                  target="_blank"
                  rel="noreferrer"
                  size="xs"
                  color="primary"
                  variant="soft"
                >
                  公开链接
                </UButton>
                <UTooltip text="待集成完整管理界面">
                  <UButton size="xs" color="neutral" variant="ghost" disabled>
                    管理
                  </UButton>
                </UTooltip>
              </div>
            </td>
          </tr>
          <tr v-if="items.length === 0">
            <td
              colspan="7"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无附件记录
            </td>
          </tr>
        </tbody>
      </table>
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
      >
        <span>共 {{ items.length }} 个附件</span>
      </div>
    </div>
  </div>
</template>
