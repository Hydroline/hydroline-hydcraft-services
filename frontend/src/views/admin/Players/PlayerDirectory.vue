<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useAdminPlayersStore } from '@/stores/admin/players'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/shared/ui'
import { useAdminUsersStore } from '@/stores/admin/users'
import { useAuthStore } from '@/stores/user/auth'
import PlayerDetailDialog from '@/views/admin/components/PlayerDetailDialog.vue'
import UserDetailDialog from '@/views/admin/components/UserDetailDialog.vue'
import type { AdminPlayerEntry } from '@/types/admin'
import type { PlayerMtrBalanceResponse } from '@/types/portal'

const uiStore = useUiStore()
const playersStore = useAdminPlayersStore()
const usersStore = useAdminUsersStore()
const authStore = useAuthStore()
const toast = useToast()

const keyword = ref(playersStore.keyword)
const rows = computed(() => playersStore.items)
const pagination = computed(() => playersStore.pagination)
const sortField = computed(() => playersStore.sortField)
const sortOrder = computed(() => playersStore.sortOrder)
const sourceStatus = computed(() => playersStore.sourceStatus)
const degradedMessage = computed(() => playersStore.error)
const safePageCount = computed(() =>
  Math.max(pagination.value?.pageCount ?? 1, 1),
)
const pageInput = ref<number | null>(null)
const serverOptions = ref<Array<{ id: string; displayName: string }>>([])
const mtrDialogOpen = ref(false)
const mtrForm = reactive({
  playerName: '',
  serverId: '',
  operation: 'set' as 'set' | 'add',
  amount: '',
})
const mtrSubmitting = ref(false)
const mtrOperationOptions = [
  { value: 'set', label: '直接设置余额' },
  { value: 'add', label: '按增减余额（可负）' },
] as const
const balanceLoading = ref(false)
const balanceError = ref<string | null>(null)
const balanceValue = ref<number | null>(null)
const numberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
})
const formattedBalance = computed(() => {
  if (balanceValue.value == null) {
    return '—'
  }
  return numberFormatter.format(balanceValue.value)
})

let searchTimeout: ReturnType<typeof setTimeout> | null = null

type SortOrder = 'asc' | 'desc'

async function refresh(
  page?: number,
  options: { sortField?: string; sortOrder?: SortOrder } = {},
) {
  uiStore.startLoading()
  try {
    await playersStore.fetch({
      keyword: keyword.value,
      page,
      sortField: options.sortField ?? sortField.value,
      sortOrder: options.sortOrder ?? sortOrder.value,
    })
  } finally {
    uiStore.stopLoading()
  }
}

async function loadServerOptions() {
  try {
    const response = await apiFetch<{
      servers: Array<{ id: string; displayName: string }>
    }>('/portal/header/minecraft-status')
    serverOptions.value = response.servers ?? []
  } catch (error) {
    console.warn('Failed to load server options', error)
  }
}

async function loadMtrBalance() {
  if (!mtrDialogOpen.value) return
  if (!mtrForm.playerName || !mtrForm.serverId) {
    balanceValue.value = null
    balanceError.value = null
    return
  }
  balanceLoading.value = true
  balanceError.value = null
  try {
    const params = new URLSearchParams({
      serverId: mtrForm.serverId,
      playerName: mtrForm.playerName,
    })
    const data = await apiFetch<PlayerMtrBalanceResponse>(
      `/player/mtr/balance?${params.toString()}`,
      { token: authStore.token ?? undefined },
    )
    balanceValue.value = data.balance
  } catch (error) {
    balanceValue.value = null
    balanceError.value = error instanceof Error ? error.message : '无法获取余额'
  } finally {
    balanceLoading.value = false
  }
}

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    refresh(1)
  }, 800)
}

function toggleSort(field: string) {
  const nextOrder: SortOrder =
    sortField.value === field
      ? sortOrder.value === 'asc'
        ? 'desc'
        : 'asc'
      : field === 'username'
        ? 'asc'
        : 'desc'
  playersStore.setSort(field, nextOrder)
  void refresh(1, { sortField: field, sortOrder: nextOrder })
}

function sortIcon(field: string) {
  if (sortField.value !== field) return 'i-lucide-arrow-up-down'
  return sortOrder.value === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'
}

// 监听关键词变化，自动搜索
watch(keyword, (newVal) => {
  if (newVal === '') {
    // 清空搜索框，立即还原到初始状态
    if (searchTimeout) clearTimeout(searchTimeout)
    refresh(1)
  } else {
    // 有内容则防抖搜索
    debouncedSearch()
  }
})

onMounted(async () => {
  if (rows.value.length === 0) {
    await refresh(1)
  }
  void loadServerOptions()
})

watch(
  () => pagination.value.page,
  (page) => {
    pageInput.value = page ?? 1
  },
  { immediate: true },
)

watch(serverOptions, (list) => {
  if (!mtrForm.serverId) {
    mtrForm.serverId = list[0]?.id ?? ''
  }
})

watch(
  () => mtrDialogOpen.value,
  (open) => {
    if (open) {
      void loadMtrBalance()
    } else {
      balanceValue.value = null
      balanceError.value = null
    }
  },
)

watch(
  () => mtrForm.serverId,
  (serverId) => {
    if (mtrDialogOpen.value && serverId) {
      void loadMtrBalance()
    }
  },
)

async function goToPage(page: number) {
  const target = Math.max(1, Math.min(page, safePageCount.value))
  await refresh(target)
}

function handlePageInput() {
  const currentPage = pagination.value.page ?? 1
  const pageCount = safePageCount.value
  if (pageInput.value === null || Number.isNaN(pageInput.value)) {
    pageInput.value = currentPage
    return
  }
  const normalized = Math.min(
    Math.max(Math.trunc(pageInput.value), 1),
    pageCount,
  )
  pageInput.value = normalized
  void goToPage(normalized)
}

function bindingUser(entry: (typeof rows.value)[number]['binding']) {
  if (!entry?.user) return '未关联'
  return entry.user.profile?.displayName ?? entry.user.email ?? entry.user.id
}

function resolvePlayerAvatarIdentifier(
  entry: AdminPlayerEntry | null | undefined,
) {
  if (!entry) return null
  const authmeRealname = entry.authme?.realname?.trim()
  if (authmeRealname) return authmeRealname
  const bindingRealname = entry.binding?.authmeRealname?.trim()
  if (bindingRealname) return bindingRealname
  const authmeUsername = entry.authme?.username?.trim()
  if (authmeUsername) return authmeUsername
  const bindingUsername = entry.binding?.authmeUsername?.trim()
  if (bindingUsername) return bindingUsername
  return null
}

function playerAvatarUrl(entry: AdminPlayerEntry | null | undefined) {
  const identifier = resolvePlayerAvatarIdentifier(entry) ?? 'Steve'
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(
    identifier,
  )}/64`
}

// ==== 行内操作：查看时间线、补录历史、绑定到用户 ====
const timelineOpen = ref(false)
import type { AdminBindingHistoryEntry } from '@/types/admin'
const timelineItems = ref<AdminBindingHistoryEntry[]>([])
const timelineTitle = ref('')
const timelineUsername = ref('')
const historyLoading = ref(false)
const timelineError = ref<string | null>(null)

async function openTimeline(username: string, displayName?: string) {
  timelineUsername.value = username
  timelineTitle.value = displayName?.trim() || username
  timelineOpen.value = true
  historyLoading.value = true
  timelineError.value = null
  timelineItems.value = []
  try {
    const res = await playersStore.fetchHistory(username, 1, 50)
    const items = Array.isArray(res?.items) ? res.items : []
    timelineItems.value = items.slice()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '无法加载流转记录，请稍后再试。'
    timelineError.value = message
  } finally {
    historyLoading.value = false
  }
}

const bindDialogOpen = ref(false)
const bindForm = reactive({ username: '', userId: '' })
const bindingSubmitting = ref(false)

async function openBindDialog(username: string) {
  bindForm.username = username
  bindForm.userId = ''
  bindDialogOpen.value = true
  if (usersStore.items.length === 0) {
    await usersStore.fetch({ page: 1 })
  }
}

async function submitBind() {
  if (!bindForm.username || !bindForm.userId) return
  bindingSubmitting.value = true
  try {
    await playersStore.bindToUser(bindForm.username, bindForm.userId)
    bindDialogOpen.value = false
    await refresh(pagination.value.page)
  } finally {
    bindingSubmitting.value = false
  }
}

const entryDialogOpen = ref(false)
const entryForm = reactive({
  username: '',
  action: 'MANUAL_ENTRY',
  reason: '',
  payload: '',
})
const entrySubmitting = ref(false)

const playerDetailDialogOpen = ref(false)
const playerDetailDialogUsername = ref<string | null>(null)
const playerDetailDialogInitial = ref<AdminPlayerEntry | null>(null)
const userDetailDialogOpen = ref(false)
const userDetailDialogUserId = ref<string | null>(null)
const userDetailDialogSummary = ref<{
  displayName?: string | null
  email?: string | null
} | null>(null)

const router = useRouter()

function openEntryDialog(username: string) {
  entryForm.username = username
  entryForm.action = 'MANUAL_ENTRY'
  entryForm.reason = ''
  entryForm.payload = ''
  entryDialogOpen.value = true
}

async function submitEntry() {
  entrySubmitting.value = true
  try {
    const payloadJson = entryForm.payload ? JSON.parse(entryForm.payload) : {}
    await playersStore.createHistory(entryForm.username, {
      action: entryForm.action,
      reason: entryForm.reason,
      payload: payloadJson,
    })
    entryDialogOpen.value = false
    if (timelineOpen.value && timelineUsername.value === entryForm.username) {
      await openTimeline(timelineUsername.value, timelineTitle.value)
    }
  } catch {
    // 忽略解析异常，交由后端校验并由后端返回错误提示
  } finally {
    entrySubmitting.value = false
  }
}

function resolvedPlayerUsername(player: AdminPlayerEntry | null) {
  return player?.authme?.username ?? player?.binding?.authmeUsername ?? null
}

function openPlayerDetail(player: AdminPlayerEntry) {
  const username = resolvedPlayerUsername(player)
  if (!username) return
  playerDetailDialogUsername.value = username
  playerDetailDialogInitial.value = player
  playerDetailDialogOpen.value = true
}

function openBoundUserDetail(player: AdminPlayerEntry) {
  const user = player.binding?.user
  if (!user?.id) return
  userDetailDialogUserId.value = user.id
  userDetailDialogSummary.value = {
    displayName: user.profile?.displayName ?? user.name ?? null,
    email: user.email ?? null,
  }
  userDetailDialogOpen.value = true
}

watch(playerDetailDialogOpen, (value) => {
  if (!value) {
    playerDetailDialogUsername.value = null
    playerDetailDialogInitial.value = null
  }
})

watch(userDetailDialogOpen, (value) => {
  if (!value) {
    userDetailDialogUserId.value = null
    userDetailDialogSummary.value = null
  }
})

function openUserDetailFromPlayerDialog(summary: {
  id: string
  email?: string | null
  displayName?: string | null
}) {
  if (!summary?.id) return
  playerDetailDialogOpen.value = false
  playerDetailDialogUsername.value = null
  playerDetailDialogInitial.value = null
  userDetailDialogUserId.value = summary.id
  userDetailDialogSummary.value = {
    displayName: summary.displayName ?? null,
    email: summary.email ?? null,
  }
  userDetailDialogOpen.value = true
}

async function handleUserDeletedFromDialog() {
  userDetailDialogOpen.value = false
  userDetailDialogUserId.value = null
  userDetailDialogSummary.value = null
  await refresh(pagination.value.page)
}

function openBeaconForPlayer(
  player: AdminPlayerEntry,
  target: 'mtr' | 'advancements' | 'stats',
) {
  const username =
    player.authme?.username ?? player.binding?.authmeUsername ?? ''
  if (!username) return
  const routeName =
    target === 'mtr'
      ? 'admin.beacon.mtr-logs'
      : target === 'advancements'
        ? 'admin.beacon.advancements'
        : 'admin.beacon.stats'
  void router.push({
    name: routeName,
    query: {
      playerName: username,
    },
  })
}

function openMtrBalanceDialog(player: AdminPlayerEntry) {
  const identifier = resolvePlayerAvatarIdentifier(player)
  if (!identifier) {
    toast.add({
      title: '无法识别玩家',
      description: '该玩家尚未绑定可用的 AuthMe 账户',
      color: 'warning',
    })
    return
  }
  mtrForm.playerName = identifier
  mtrForm.amount = ''
  mtrForm.operation = 'set'
  if (!mtrForm.serverId) {
    mtrForm.serverId = serverOptions.value[0]?.id ?? ''
  }
  mtrDialogOpen.value = true
  void loadMtrBalance()
}

async function submitMtrBalanceChange() {
  if (!mtrForm.serverId) {
    toast.add({ title: '请选择服务器', color: 'warning' })
    return
  }
  if (!mtrForm.playerName) {
    toast.add({ title: '玩家名称缺失', color: 'warning' })
    return
  }
  const raw = (mtrForm.amount ?? '').toString().trim()
  if (!raw.length) {
    toast.add({ title: '请输入金额', color: 'warning' })
    return
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    toast.add({ title: '请输入有效数字', color: 'warning' })
    return
  }
  mtrSubmitting.value = true
  try {
    const endpoint =
      mtrForm.operation === 'add' ? '/player/mtr/add' : '/player/mtr/set'
    await apiFetch<PlayerMtrBalanceResponse>(endpoint, {
      method: 'POST',
      token: authStore.token ?? undefined,
      body: {
        serverId: mtrForm.serverId,
        playerName: mtrForm.playerName,
        amount: value,
      },
    })
    toast.add({
      title:
        mtrForm.operation === 'add'
          ? '余额调整命令已发送'
          : '余额设置命令已发送',
      color: 'primary',
    })
    mtrForm.amount = ''
    await loadMtrBalance()
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: error instanceof Error ? error.message : '无法调整 MTR 余额',
      color: 'error',
    })
  } finally {
    mtrSubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 搜索框 -->
    <header class="flex justify-end w-full">
      <div class="flex gap-2 w-full max-w-lg items-center">
        <UIcon
          v-if="playersStore.loading"
          name="i-lucide-loader-2"
          class="inline-block h-4 w-4 animate-spin"
        />
        <UInput
          v-model="keyword"
          type="search"
          placeholder="搜索登录过服务器的玩家 ID"
          class="flex-1"
        />
      </div>
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
            <th class="px-4 py-3">玩家</th>
            <th class="px-4 py-3">绑定用户</th>
            <th class="px-4 py-3">最近事件</th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:underline"
                @click="toggleSort('regdate')"
              >
                注册时间
                <UIcon :name="sortIcon('regdate')" class="h-3 w-3" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:underline"
                @click="toggleSort('regip_region')"
              >
                注册 IP
                <UIcon :name="sortIcon('regip_region')" class="h-3 w-3" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:underline"
                @click="toggleSort('lastlogin')"
              >
                最近登录时间
                <UIcon :name="sortIcon('lastlogin')" class="h-3 w-3" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:underline"
                @click="toggleSort('ip_region')"
              >
                最近登录 IP
                <UIcon :name="sortIcon('ip_region')" class="h-3 w-3" />
              </button>
            </th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="(player, idx) in rows"
            :key="
              player.authme?.username ?? player.binding?.id ?? `fallback-${idx}`
            "
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3">
              <div
                class="flex flex-col cursor-pointer rounded-lg p-1 transition focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white hover:bg-slate-100/70 dark:focus-visible:ring-offset-slate-900 dark:hover:bg-slate-800/50"
                role="button"
                tabindex="0"
                @click="openPlayerDetail(player)"
                @keydown.enter.prevent="openPlayerDetail(player)"
                @keydown.space.prevent="openPlayerDetail(player)"
              >
                <span
                  class="flex items-center gap-2 font-medium text-slate-900 dark:text-white"
                >
                  <img
                    :src="playerAvatarUrl(player)"
                    :alt="resolvePlayerAvatarIdentifier(player) ?? 'MC Avatar'"
                    class="h-6 w-6 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                  />
                  {{
                    player.authme?.realname ??
                    player.binding?.authmeRealname ??
                    '—'
                  }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <template v-if="player.binding?.user">
                <UButton
                  size="xs"
                  variant="link"
                  class="px-0 text-xs font-medium"
                  @click="openBoundUserDetail(player)"
                >
                  {{ bindingUser(player.binding) }}
                </UButton>
              </template>
              <span v-else>未关联</span>
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
              <span v-if="player.authme?.regdate">
                {{ new Date(player.authme.regdate).toLocaleString() }}
              </span>
              <span v-else>—</span>
            </td>
            <td
              class="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 whitespace-pre-line"
            >
              <span v-if="player.authme?.regip">
                {{ player.authme.regip }}
                <span
                  class="block leading-tight"
                  v-if="
                    player.authme.regipLocation ||
                    player.authme.regip_location_display
                  "
                >
                  {{
                    player.authme.regipLocation ||
                    player.authme.regip_location_display
                  }}
                </span>
              </span>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="player.authme?.lastlogin">
                {{ new Date(player.authme.lastlogin).toLocaleString() }}
              </span>
              <span v-else>—</span>
            </td>
            <td
              class="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 whitespace-pre-line"
            >
              <span v-if="player.authme?.ip">
                {{ player.authme.ip }}
                <span
                  class="block leading-tight"
                  v-if="
                    player.authme.ipLocation ||
                    player.authme.ip_location_display
                  "
                >
                  {{
                    player.authme.ipLocation ||
                    player.authme.ip_location_display
                  }}
                </span>
              </span>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="
                    openTimeline(
                      player.authme?.username ??
                        player.binding?.authmeUsername ??
                        '',
                      player.authme?.realname ??
                        player.binding?.authmeRealname ??
                        '',
                    )
                  "
                  >时间线</UButton
                >
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  @click="
                    openEntryDialog(
                      player.authme?.username ??
                        player.binding?.authmeUsername ??
                        '',
                    )
                  "
                  >补录事件</UButton
                >
                <UButton
                  size="xs"
                  color="primary"
                  @click="
                    openBindDialog(
                      player.authme?.username ??
                        player.binding?.authmeUsername ??
                        '',
                    )
                  "
                  >绑定到用户</UButton
                >
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="openBeaconForPlayer(player, 'mtr')"
                >
                  Beacon
                </UButton>
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  @click="openMtrBalanceDialog(player)"
                >
                  MTR 余额
                </UButton>
              </div>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td
              colspan="8"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无玩家数据
            </td>
          </tr>
        </tbody>
      </table>
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
      >
        <span>
          第 {{ pagination.page }} / {{ pagination.pageCount }} 页，共
          {{ pagination.total }} 名玩家
        </span>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="(pagination.page ?? 1) <= 1 || playersStore.loading"
            @click="goToPage(1)"
          >
            首页
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="(pagination.page ?? 1) <= 1 || playersStore.loading"
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
              :disabled="playersStore.loading"
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
            :disabled="playersStore.loading"
            @click="handlePageInput"
          >
            跳转
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="
              (pagination.page ?? 1) >= safePageCount || playersStore.loading
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
              (pagination.page ?? 1) >= safePageCount || playersStore.loading
            "
            @click="goToPage(pagination.pageCount)"
          >
            末页
          </UButton>
        </div>
      </div>
    </div>
  </div>

  <!-- 时间线抽屉 -->
  <USlideover
    v-model:open="timelineOpen"
    :title="`玩家 ${timelineTitle} 绑定流转`"
    aria-describedby="timeline-history"
  >
    <template #body>
      <div v-if="timelineOpen" id="timeline-history" class="space-y-3">
        <USkeleton v-if="historyLoading" class="h-4 w-24" />
        <UAlert
          v-if="timelineError"
          color="error"
          variant="soft"
          class="rounded-xl"
        >
          {{ timelineError }}
        </UAlert>
        <ul class="space-y-2">
          <li
            v-for="e in timelineItems"
            :key="e.id"
            class="rounded-xl border border-slate-200/70 p-3 text-xs dark:border-slate-800/60"
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold">{{ e.action }}</span>
              <span>{{ new Date(e.createdAt).toLocaleString() }}</span>
            </div>
            <div class="mt-1 text-[11px] text-slate-500">
              {{ e.reason ?? '无备注' }}
            </div>
            <div class="mt-1 text-[11px] text-slate-500">
              操作人：{{
                e.operator?.profile?.displayName ?? e.operator?.email ?? '系统'
              }}
            </div>
          </li>
          <li
            v-if="!historyLoading && timelineItems.length === 0"
            class="text-center text-sm text-slate-500"
          >
            暂无记录
          </li>
        </ul>
      </div>
    </template>
  </USlideover>

  <!-- 绑定到用户对话框 -->
  <UModal
    :open="bindDialogOpen"
    @update:open="bindDialogOpen = $event"
    :ui="{
      content:
        'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <h3 class="text-lg font-semibold">绑定玩家到用户</h3>
        <p class="text-xs text-slate-500">玩家：{{ bindForm.username }}</p>
        <label class="flex flex-col gap-1">
          <span class="text-xs uppercase tracking-wide text-slate-500"
            >选择用户</span
          >
          <select
            v-model="bindForm.userId"
            class="rounded-lg border border-slate-200 p-2 dark:border-slate-800"
          >
            <option value="" disabled>请选择用户</option>
            <option v-for="u in usersStore.items" :key="u.id" :value="u.id">
              {{ u.profile?.displayName ?? u.email }}
            </option>
          </select>
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="bindDialogOpen = false"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="bindingSubmitting"
            @click="submitBind"
            >绑定</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="mtrDialogOpen"
    @update:open="mtrDialogOpen = $event"
    :ui="{ content: 'w-full max-w-md w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            MTR 余额调整
          </h3>
        </template>
        <form class="space-y-4" @submit.prevent="submitMtrBalanceChange">
          <div class="text-sm text-slate-600 dark:text-slate-300">
            {{ mtrForm.playerName }}
          </div>
          <div class="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            <span class="text-xs text-slate-500 dark:text-slate-500">
              当前余额
            </span>
            <div class="text-lg font-semibold text-slate-900 dark:text-white">
              <template v-if="balanceLoading">
                <UIcon
                  name="i-lucide-loader-2"
                  class="inline-block h-4 w-4 animate-spin"
                />
              </template>
              <template v-else>{{ formattedBalance }}</template>
            </div>
          </div>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              选择服务器
            </span>
            <USelectMenu
              v-model="mtrForm.serverId"
              :items="serverOptions"
              value-key="id"
              label-key="displayName"
              placeholder="请选择服务器"
              :disabled="serverOptions.length === 0"
            />
          </label>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              操作类型
            </span>
            <USelectMenu
              v-model="mtrForm.operation"
              :items="mtrOperationOptions"
              value-key="value"
              label-key="label"
            />
          </label>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="text-xs text-slate-500 dark:text-slate-500">
              金额
            </span>
            <UInput
              v-model="mtrForm.amount"
              type="number"
              placeholder="输入要设置或调整的数量"
            />
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              type="button"
              variant="ghost"
              @click="mtrDialogOpen = false"
            >
              取消
            </UButton>
            <UButton type="submit" color="primary" :loading="mtrSubmitting">
              发送命令
            </UButton>
          </div>
        </form>
      </UCard>
    </template>
  </UModal>

  <!-- 补录历史 -->
  <UModal
    :open="entryDialogOpen"
    @update:open="entryDialogOpen = $event"
    :ui="{
      content:
        'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <form class="space-y-4 p-6 text-sm" @submit.prevent="submitEntry">
        <h3 class="text-lg font-semibold">补录玩家事件</h3>
        <p class="text-xs text-slate-500">玩家：{{ entryForm.username }}</p>
        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500"
              >Action</span
            >
            <USelect
              v-model="entryForm.action"
              :items="[
                { label: 'MANUAL_ENTRY', value: 'MANUAL_ENTRY' },
                { label: 'BIND', value: 'BIND' },
                { label: 'UNBIND', value: 'UNBIND' },
                { label: 'TRANSFER', value: 'TRANSFER' },
              ]"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500"
              >备注</span
            >
            <UInput v-model="entryForm.reason" placeholder="原因（可选）" />
          </label>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-xs uppercase tracking-wide text-slate-500"
            >Payload JSON（可选）</span
          >
          <UTextarea v-model="entryForm.payload" :rows="6" />
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            @click="entryDialogOpen = false"
            >取消</UButton
          >
          <UButton type="submit" color="primary" :loading="entrySubmitting"
            >保存</UButton
          >
        </div>
      </form>
    </template>
  </UModal>

  <PlayerDetailDialog
    :open="playerDetailDialogOpen"
    :username="playerDetailDialogUsername"
    :initial-player="playerDetailDialogInitial"
    @update:open="
      (value) => {
        playerDetailDialogOpen = value
        if (!value) {
          playerDetailDialogUsername = null
          playerDetailDialogInitial = null
        }
      }
    "
    @open-user="openUserDetailFromPlayerDialog"
  />

  <UserDetailDialog
    :open="userDetailDialogOpen"
    :user-id="userDetailDialogUserId"
    :user-summary="userDetailDialogSummary"
    @update:open="
      (value) => {
        userDetailDialogOpen = value
        if (!value) {
          userDetailDialogUserId = null
          userDetailDialogSummary = null
        }
      }
    "
    @deleted="handleUserDeletedFromDialog"
  />
</template>
