<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminPlayersStore } from '@/stores/adminPlayers'
import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()
const playersStore = useAdminPlayersStore()

const keyword = ref(playersStore.keyword)
const rows = computed(() => playersStore.items)
const pagination = computed(() => playersStore.pagination)
const sourceStatus = computed(() => playersStore.sourceStatus)
const degradedMessage = computed(() => playersStore.error)

async function refresh(page?: number) {
  uiStore.startLoading()
  try {
    await playersStore.fetch({
      keyword: keyword.value,
      page,
    })
  } finally {
    uiStore.stopLoading()
  }
}

onMounted(async () => {
  if (rows.value.length === 0) {
    await refresh(1)
  }
})

async function handleSubmit() {
  await refresh(1)
}

async function goToPage(page: number) {
  if (
    page === pagination.value.page ||
    page < 1 ||
    page > pagination.value.pageCount
  )
    return
  await refresh(page)
}

function bindingUser(entry: typeof rows.value[number]['binding']) {
  if (!entry?.user) return '未关联'
  return entry.user.profile?.displayName ?? entry.user.email ?? entry.user.id
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">AuthMe 玩家列表</h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          从 AuthMe 数据库拉取的玩家数据，包含当前绑定的站内用户与绑定流转摘要。
        </p>
      </div>
      <form class="flex w-full max-w-md gap-2" @submit.prevent="handleSubmit">
        <UInput v-model="keyword" type="search" placeholder="搜索 AuthMe 用户名 / Realname" class="flex-1" />
        <UButton type="submit" color="primary">搜索</UButton>
      </form>
    </header>

    <UAlert
      v-if="sourceStatus === 'degraded'"
      color="warning"
      variant="soft"
      title="AuthMe 数据源暂不可用"
      class="rounded-2xl"
    >
      将展示最近缓存的绑定数据。{{ degradedMessage ?? '请稍后重试连接。' }}
    </UAlert>

    <div class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
      <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <thead class="bg-slate-50/60 dark:bg-slate-900/60">
          <tr class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th class="px-4 py-3">玩家</th>
            <th class="px-4 py-3">绑定用户</th>
            <th class="px-4 py-3">最近事件</th>
            <th class="px-4 py-3">上次登录</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="(player, idx) in rows"
            :key="player.authme?.username ?? player.binding?.id ?? `fallback-${idx}`"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3">
              <div class="flex flex-col">
                <span class="font-medium text-slate-900 dark:text-white">
                  {{ player.authme?.username ?? player.binding?.authmeUsername ?? '未知玩家' }}
                </span>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  Realname：{{ player.authme?.realname ?? player.binding?.authmeRealname ?? '—' }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ bindingUser(player.binding) }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <div v-if="player.history.length > 0" class="space-y-0.5">
                <div class="font-medium text-slate-900 dark:text-white">
                  {{ player.history[0].action }}
                </div>
                <div class="text-[11px] text-slate-500">
                  {{ player.history[0].reason ?? '无原因' }} ·
                  {{ new Date(player.history[0].createdAt).toLocaleString() }}
                </div>
              </div>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="player.authme?.lastlogin">
                {{ new Date(player.authme.lastlogin).toLocaleString() }}
              </span>
              <span v-else>—</span>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="4" class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              暂无玩家数据。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-600 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
      <span>
        第 {{ pagination.page }} / {{ pagination.pageCount }} 页，共 {{ pagination.total }} 名玩家
      </span>
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="pagination.page <= 1 || playersStore.loading"
          @click="goToPage(pagination.page - 1)"
        >
          上一页
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="pagination.page >= pagination.pageCount || playersStore.loading"
          @click="goToPage(pagination.page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>
  </div>
</template>
