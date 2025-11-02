<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { usePortalStore } from '@/stores/portal'
import { useUiStore } from '@/stores/ui'
import { getApiBaseUrl } from '@/utils/api'

const portalStore = usePortalStore()
const uiStore = useUiStore()

const { admin } = storeToRefs(portalStore)

const users = computed(() => admin.value?.users ?? [])
const backendBase = getApiBaseUrl()

const attachments = computed(() =>
  (admin.value?.attachments.recent ?? []).map((item) => ({
    ...item,
    fullUrl: item.publicUrl
      ? item.publicUrl.startsWith('http')
        ? item.publicUrl
        : `${backendBase}${item.publicUrl}`
      : null,
  })),
)
const unlinked = computed(() => admin.value?.unlinkedPlayers ?? [])

const recentUsers = computed(() => users.value.slice(0, 5))
const recentAttachments = computed(() => attachments.value.slice(0, 4))

const totalUsers = computed(() => users.value.length)
const uniqueRoleCount = computed(() => {
  const keys = new Set<string>()
  for (const user of users.value) {
    for (const role of user.roles ?? []) {
      if (role.name) {
        keys.add(role.name)
      }
    }
  }
  return keys.size
})
const totalAttachments = computed(() => admin.value?.attachments.total ?? 0)
const publicAttachments = computed(
  () => attachments.value.filter((item) => item.isPublic).length,
)
const unlinkedCount = computed(() => unlinked.value.length)

onMounted(async () => {
  if (!admin.value) {
    uiStore.startLoading()
    try {
      await portalStore.fetchAdminOverview()
    } finally {
      uiStore.stopLoading()
    }
  }
})

function formatDate(value: string | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}
</script>

<template>
  <div class="space-y-10">
    <section class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
      <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 dark:text-white">关键指标</h2>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            快速掌握当前账户、角色和附件的总体情况。
          </p>
        </div>
        <UBadge color="primary" variant="soft">实时数据</UBadge>
      </header>

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <div class="rounded-2xl border border-slate-200/70 bg-white/60 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">用户总数</p>
          <p class="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{{ totalUsers }}</p>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">覆盖 {{ uniqueRoleCount }} 个角色</p>
          <UButton to="/admin/users" color="primary" variant="soft" size="xs" class="mt-4">
            打开用户与玩家管理
          </UButton>
        </div>
        <div class="rounded-2xl border border-slate-200/70 bg-white/60 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">附件存量</p>
          <p class="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{{ totalAttachments }}</p>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">公开资源 {{ publicAttachments }}</p>
          <UButton to="/admin/attachments" color="primary" variant="soft" size="xs" class="mt-4">
            打开附件系统
          </UButton>
        </div>
        <div class="rounded-2xl border border-slate-200/70 bg-white/60 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">待绑定玩家</p>
          <p class="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{{ unlinkedCount }}</p>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">请跟进资料补充和账号绑定</p>
          <UButton to="/admin/users" color="primary" variant="soft" size="xs" class="mt-4">
            去处理绑定任务
          </UButton>
        </div>
      </div>
    </section>

    <section class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
      <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 dark:text-white">运营快照</h2>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            关注最新的用户动态、附件更新与待处理玩家。
          </p>
        </div>
        <UButton to="/admin/users" color="neutral" variant="ghost" size="xs">
          查看全部用户
        </UButton>
      </header>

      <div class="mt-6 grid gap-6 md:grid-cols-3">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white">最新用户</h3>
            <RouterLink class="text-xs text-primary-600 hover:underline dark:text-primary-300" to="/admin/users">
              管理
            </RouterLink>
          </div>
          <ul class="space-y-3">
            <li v-for="user in recentUsers" :key="user.id" class="rounded-xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60">
              <p class="text-sm font-medium text-slate-900 dark:text-white">{{ user.profile?.displayName ?? user.email }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ user.email }}</p>
              <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">注册于 {{ formatDate(user.createdAt) }}</p>
            </li>
            <li v-if="recentUsers.length === 0" class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              暂无用户数据
            </li>
          </ul>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white">近期附件</h3>
            <RouterLink class="text-xs text-primary-600 hover:underline dark:text-primary-300" to="/admin/attachments">
              管理
            </RouterLink>
          </div>
          <ul class="space-y-3">
            <li
              v-for="attachment in recentAttachments"
              :key="attachment.id"
              class="rounded-xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-medium text-slate-900 dark:text-white">{{ attachment.name }}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ attachment.folder?.path ?? '根目录' }}
                  </p>
                </div>
                <UBadge :color="attachment.isPublic ? 'success' : 'neutral'" variant="soft">
                  {{ attachment.isPublic ? '公开' : '私有' }}
                </UBadge>
              </div>
              <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
                上传者：{{ attachment.owner.name ?? attachment.owner.email }}
              </p>
              <p class="text-xs text-slate-400 dark:text-slate-500">时间：{{ formatDate(attachment.createdAt) }}</p>
            </li>
            <li v-if="recentAttachments.length === 0" class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              暂无附件记录
            </li>
          </ul>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white">待绑定玩家</h3>
            <RouterLink class="text-xs text-primary-600 hover:underline dark:text-primary-300" to="/admin/users">
              去绑定
            </RouterLink>
          </div>
          <ul class="space-y-3">
            <li
              v-for="player in unlinked.slice(0, 6)"
              :key="player.id"
              class="rounded-xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <p class="text-sm font-medium text-slate-900 dark:text-white">{{ player.minecraftId }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ player.nickname ?? '待同步昵称' }}</p>
            </li>
            <li v-if="unlinkedCount === 0" class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              没有未绑定的玩家
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
