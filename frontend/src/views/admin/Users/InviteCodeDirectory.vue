<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminInvitesStore } from '@/stores/admin/invites'
import { useUiStore } from '@/stores/shared/ui'
import type { AdminInviteEntry } from '@/types/admin'

const uiStore = useUiStore()
const invitesStore = useAdminInvitesStore()
const toast = useToast()

const keyword = ref(invitesStore.keyword)
const rows = computed(() => invitesStore.items)
const pagination = computed(() => invitesStore.pagination)
const safePageCount = computed(() =>
  Math.max(pagination.value?.pageCount ?? 1, 1),
)
const pageInput = ref<number | null>(null)
const inviteRequired = ref(invitesStore.inviteRequired)

let searchTimeout: ReturnType<typeof setTimeout> | null = null

function displayUser(user: AdminInviteEntry['createdBy'] | null) {
  if (!user) return '—'
  return user.profile?.displayName ?? user.name ?? user.email ?? '—'
}

function fmtDateTime(input?: string | null) {
  if (!input) return '—'
  try {
    return new Date(input).toLocaleString()
  } catch (error) {
    console.warn('[admin] datetime format error', error)
    return input
  }
}

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    refresh(1)
  }, 800)
}

watch(keyword, (value) => {
  invitesStore.keyword = value
  if (value === '') {
    if (searchTimeout) clearTimeout(searchTimeout)
    refresh(1)
  } else {
    debouncedSearch()
  }
})

watch(
  () => invitesStore.inviteRequired,
  (value) => {
    inviteRequired.value = value
  },
  { immediate: true },
)

watch(
  () => pagination.value.page,
  (page) => {
    pageInput.value = page ?? 1
  },
  { immediate: true },
)

async function refresh(page?: number) {
  uiStore.startLoading()
  try {
    await invitesStore.fetch({
      keyword: keyword.value,
      page: page ?? invitesStore.pagination.page,
    })
  } finally {
    uiStore.stopLoading()
  }
}

async function loadFeature() {
  try {
    await invitesStore.loadFeature()
  } catch (error) {
    toast.add({
      title: '加载失败',
      description:
        error instanceof Error ? error.message : '无法加载邀请码开关',
      color: 'error',
    })
  }
}

async function setInviteRequired(value: boolean) {
  inviteRequired.value = value
  try {
    await invitesStore.updateFeature(value)
    toast.add({
      title: '已更新',
      description: value ? '已开启邀请码模式' : '已关闭邀请码模式',
      color: 'success',
    })
  } catch (error) {
    inviteRequired.value = invitesStore.inviteRequired
    toast.add({
      title: '更新失败',
      description:
        error instanceof Error ? error.message : '无法更新邀请码开关',
      color: 'error',
    })
  }
}

async function createInvite() {
  uiStore.startLoading()
  try {
    const invite = await invitesStore.create()
    toast.add({
      title: '已生成邀请码',
      description: invite.code,
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: '生成失败',
      description: error instanceof Error ? error.message : '无法生成邀请码',
      color: 'error',
    })
  } finally {
    uiStore.stopLoading()
  }
}

async function deleteInvite(invite: AdminInviteEntry) {
  if (!confirm('确定删除此邀请码吗？')) return
  uiStore.startLoading()
  try {
    await invitesStore.delete(invite.id)
    toast.add({
      title: '已删除',
      description: invite.code,
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: '删除失败',
      description: error instanceof Error ? error.message : '无法删除邀请码',
      color: 'error',
    })
  } finally {
    uiStore.stopLoading()
  }
}

async function goToPage(page: number) {
  const target = Math.max(1, Math.min(page, safePageCount.value))
  await refresh(target)
}

function handlePageInput() {
  if (pageInput.value === null || Number.isNaN(pageInput.value)) {
    pageInput.value = pagination.value?.page ?? 1
    return
  }
  const normalized = Math.max(
    1,
    Math.min(Math.trunc(pageInput.value), safePageCount.value),
  )
  pageInput.value = normalized
  void goToPage(normalized)
}

onMounted(async () => {
  if (rows.value.length === 0) {
    await refresh(1)
  }
  await loadFeature()
})
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex gap-2 w-full max-w-lg items-center">
        <UIcon
          v-if="invitesStore.loading"
          name="i-lucide-loader-2"
          class="inline-block h-4 w-4 animate-spin"
        />
        <UInput
          v-model="keyword"
          type="search"
          placeholder="搜索邀请码或用户"
          class="flex-1"
        />
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-slate-600 dark:text-slate-300">邀请码模式</span>
          <USwitch
            :model-value="inviteRequired"
            :disabled="invitesStore.featureLoading"
            @update:model-value="setInviteRequired"
          />
        </div>
        <UButton color="primary" @click="createInvite">生成邀请码</UButton>
      </div>
    </header>

    <p class="text-xs text-slate-500 dark:text-slate-300">
      开启后注册必须填写邀请码，邀请码仅可使用一次。
    </p>

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
            <th class="px-4 py-3">邀请码</th>
            <th class="px-4 py-3">状态</th>
            <th class="px-4 py-3">创建时间</th>
            <th class="px-4 py-3">创建人</th>
            <th class="px-4 py-3">注册用户</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="invite in rows"
            :key="invite.id"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3 font-mono text-xs text-slate-700">
              {{ invite.code }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ invite.usedBy ? '已使用' : '未使用' }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ fmtDateTime(invite.createdAt) }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ displayUser(invite.createdBy) }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <div class="flex flex-col gap-1">
                <span>{{ displayUser(invite.usedBy) }}</span>
                <span class="text-[11px] text-slate-400">
                  {{ fmtDateTime(invite.usedAt) }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-right">
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                @click="deleteInvite(invite)"
              >
                删除
              </UButton>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td
              colspan="6"
              class="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无邀请码记录
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      class="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400"
    >
      <span>
        共 {{ pagination.total }} 条，当前第 {{ pagination.page }} /
        {{ safePageCount }} 页
      </span>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="(pagination.page ?? 1) <= 1 || invitesStore.loading"
          @click="goToPage(1)"
        >
          首页
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="(pagination.page ?? 1) <= 1 || invitesStore.loading"
          @click="goToPage((pagination.page ?? 1) - 1)"
        >
          上一页
        </UButton>
        <div class="flex items-center gap-1">
          <UInput
            v-model.number="pageInput"
            type="number"
            size="xs"
            class="w-16 text-center"
            :disabled="invitesStore.loading"
            min="1"
            :max="safePageCount"
            @keydown.enter.prevent="handlePageInput"
          />
          <span class="text-xs text-slate-500 dark:text-slate-400">
            / {{ safePageCount }}
          </span>
        </div>
        <UButton
          color="neutral"
          variant="soft"
          size="xs"
          :disabled="invitesStore.loading"
          @click="handlePageInput"
        >
          跳转
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="
            (pagination.page ?? 1) >= safePageCount || invitesStore.loading
          "
          @click="goToPage((pagination.page ?? 1) + 1)"
        >
          下一页
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="
            (pagination.page ?? 1) >= safePageCount || invitesStore.loading
          "
          @click="goToPage(pagination.pageCount)"
        >
          末页
        </UButton>
      </div>
    </div>
  </div>
</template>
