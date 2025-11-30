<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminUsersStore } from '@/stores/adminUsers'
import { useAdminRbacStore } from '@/stores/adminRbac'
import { useUiStore } from '@/stores/ui'
import type { AdminUserListItem } from '@/types/admin'
import UserDetailDialog from '@/views/admin/components/UserDetailDialog.vue'
import PlayerDetailDialog from '@/views/admin/components/PlayerDetailDialog.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'

type SortOrder = 'asc' | 'desc'
type RefreshOptions = {
  page?: number
  sortField?: string
  sortOrder?: SortOrder
}

const uiStore = useUiStore()
const usersStore = useAdminUsersStore()
const rbacStore = useAdminRbacStore()
const toast = useToast()

const keyword = ref(usersStore.keyword)
const rows = computed(() => usersStore.items)
const pagination = computed(() => usersStore.pagination)
const sortField = computed(() => usersStore.sortField)
const sortOrder = computed(() => usersStore.sortOrder)
const safePageCount = computed(() =>
  Math.max(pagination.value?.pageCount ?? 1, 1),
)
const pageInput = ref<number | null>(null)

const roleOptions = computed(() =>
  rbacStore.roles.map((role) => ({ label: role.name, value: role.key })),
)
const labelOptions = computed(() =>
  rbacStore.labels.map((label) => ({
    label: label.name,
    value: label.key,
    color: label.color ?? undefined,
  })),
)

const roleUpdatingId = ref<string | null>(null)
const labelUpdatingId = ref<string | null>(null)

const piicDialogOpen = ref(false)
const piicDialogUser = ref<AdminUserListItem | null>(null)
const piicSubmitting = ref(false)

const detailDialogOpen = ref(false)
const detailDialogUserId = ref<string | null>(null)
const detailDialogSummary = ref<{
  displayName?: string | null
  email?: string | null
} | null>(null)
const detailDialogEmailToken = ref(0)
const playerDialogOpen = ref(false)
const playerDialogUsername = ref<string | null>(null)
type PlayerUserSummary = {
  id: string
  email?: string | null
  displayName?: string | null
}

const maxMinecraftAvatars = 3

function userDisplayName(item: AdminUserListItem) {
  return item.profile?.displayName ?? item.name ?? item.email ?? '用户'
}

function userAvatarUrl(item: AdminUserListItem) {
  const profileAvatar = item.profile?.avatarUrl
  if (typeof profileAvatar === 'string' && profileAvatar.length > 0) {
    return profileAvatar
  }
  const rootAvatar = item.avatarUrl
  return typeof rootAvatar === 'string' && rootAvatar.length > 0
    ? rootAvatar
    : null
}

function fmtDateTime(
  input?: string | null,
  formatOptions?: Intl.DateTimeFormatOptions,
) {
  if (!input) return '—'
  try {
    return new Date(input).toLocaleString(undefined, formatOptions)
  } catch (error) {
    console.warn('[admin] datetime format error', error)
    return input
  }
}

function roleKeysOf(user: AdminUserListItem) {
  return [...(user.roles?.map((link) => link.role.key) ?? [])].sort()
}

function labelKeysOf(user: AdminUserListItem) {
  return [
    ...(user.permissionLabels?.map((link) => link.label.key) ?? []),
  ].sort()
}

function normalizeSelection(input: unknown): string[] {
  if (Array.isArray(input)) {
    if (input.every((item) => typeof item === 'string')) {
      return [...(input as string[])]
    }
    return (input as Array<{ value?: string | null }>)
      .map((item) => item?.value ?? null)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      )
  }
  if (!input) return []
  if (typeof input === 'string') return [input]
  if (typeof input === 'object' && input !== null) {
    const candidate = input as { value?: unknown }
    if (typeof candidate.value === 'string' && candidate.value.length > 0) {
      return [candidate.value]
    }
  }
  return []
}

async function refresh(options: RefreshOptions = {}) {
  uiStore.startLoading()
  try {
    await usersStore.fetch({
      keyword: keyword.value,
      page: options.page ?? usersStore.pagination.page,
      sortField: options.sortField ?? usersStore.sortField,
      sortOrder: options.sortOrder ?? usersStore.sortOrder,
    })
  } finally {
    uiStore.stopLoading()
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    refresh({ page: 1 })
  }, 800)
}

// 监听关键词变化，自动搜索
watch(keyword, (newVal) => {
  usersStore.keyword = newVal
  debouncedSearch()
})

function sortIcon(field: string) {
  if (sortField.value !== field) return 'i-lucide-arrow-up-down'
  return sortOrder.value === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'
}

function toggleSort(field: string) {
  const currentField = usersStore.sortField
  const currentOrder = usersStore.sortOrder
  const nextOrder: SortOrder =
    currentField === field && currentOrder === 'asc' ? 'desc' : 'asc'
  usersStore.sortField = field
  usersStore.sortOrder = nextOrder
  refresh({ sortField: field, sortOrder: nextOrder, page: 1 })
}

function openPiicDialog(user: AdminUserListItem) {
  piicDialogUser.value = user
  piicDialogOpen.value = true
}

function closePiicDialog() {
  piicDialogOpen.value = false
  piicDialogUser.value = null
}

watch(piicDialogOpen, (value) => {
  if (!value) {
    piicDialogUser.value = null
  }
})

type DetailDialogOptions = {
  openEmail?: boolean
}

function openDetailDialog(
  user: AdminUserListItem,
  options: DetailDialogOptions = {},
) {
  detailDialogUserId.value = user.id
  detailDialogSummary.value = {
    displayName: user.profile?.displayName ?? user.name ?? null,
    email: user.email ?? null,
  }
  detailDialogOpen.value = true
  if (options.openEmail) {
    detailDialogEmailToken.value += 1
  }
}

watch(detailDialogOpen, (value) => {
  if (!value) {
    detailDialogUserId.value = null
    detailDialogSummary.value = null
  }
})

function openPlayerDialog(username: string | null | undefined) {
  if (!username) return
  playerDialogUsername.value = username
  playerDialogOpen.value = true
}

watch(playerDialogOpen, (value) => {
  if (!value) {
    playerDialogUsername.value = null
  }
})

function openUserDetailFromPlayer(summary: PlayerUserSummary | null) {
  if (!summary?.id) return
  playerDialogOpen.value = false
  playerDialogUsername.value = null
  detailDialogUserId.value = summary.id
  detailDialogSummary.value = {
    displayName: summary.displayName ?? null,
    email: summary.email ?? null,
  }
  detailDialogOpen.value = true
}

async function handleUserDeleted() {
  detailDialogOpen.value = false
  detailDialogUserId.value = null
  detailDialogSummary.value = null
  await refresh({ page: pagination.value.page })
}

async function confirmPiicRegeneration() {
  if (!piicDialogUser.value) return
  piicSubmitting.value = true
  uiStore.startLoading()
  try {
    await usersStore.regeneratePiic(piicDialogUser.value.id)
    toast.add({ title: '已重新生成 PIIC', color: 'primary' })
    closePiicDialog()
  } catch (error) {
    console.warn('[admin] regenerate piic failed', error)
    toast.add({ title: 'PIIC 生成失败', color: 'error' })
  } finally {
    piicSubmitting.value = false
    uiStore.stopLoading()
  }
}

async function handleRolesChange(user: AdminUserListItem, value: unknown) {
  const nextKeys = normalizeSelection(value).sort()
  const currentKeys = roleKeysOf(user)
  if (JSON.stringify(nextKeys) === JSON.stringify(currentKeys)) return
  if (nextKeys.length === 0) {
    toast.add({ title: '至少选择一个角色', color: 'warning' })
    await refresh()
    return
  }
  roleUpdatingId.value = user.id
  uiStore.startLoading()
  try {
    await usersStore.assignRoles(user.id, nextKeys)
    toast.add({ title: '角色已更新', color: 'primary' })
  } catch (error) {
    console.warn('[admin] assign roles failed', error)
    toast.add({ title: '更新角色失败', color: 'error' })
  } finally {
    roleUpdatingId.value = null
    uiStore.stopLoading()
  }
}

async function handleLabelsChange(user: AdminUserListItem, value: unknown) {
  const nextKeys = normalizeSelection(value).sort()
  const currentKeys = labelKeysOf(user)
  if (JSON.stringify(nextKeys) === JSON.stringify(currentKeys)) return
  labelUpdatingId.value = user.id
  uiStore.startLoading()
  try {
    await usersStore.assignPermissionLabels(user.id, nextKeys)
    toast.add({ title: '标签已更新', color: 'primary' })
  } catch (error) {
    console.warn('[admin] assign labels failed', error)
    toast.add({ title: '更新标签失败', color: 'error' })
  } finally {
    labelUpdatingId.value = null
    uiStore.stopLoading()
  }
}

watch(
  () => pagination.value?.page,
  (page) => {
    pageInput.value = page ?? 1
  },
  { immediate: true },
)

async function goToPage(page: number) {
  const target = Math.max(1, Math.min(page, safePageCount.value))
  await refresh({ page: target })
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

type AdminUserAuthmeBinding = {
  id?: string | null
  authmeUsername?: string | null
  authmeRealname?: string | null
  isPrimary?: boolean | null
}

function minecraftBindings(user: AdminUserListItem) {
  // 优先使用后端提供的 authmeBindings（若列表接口已扩展）
  const anyUser = user as unknown as {
    authmeBindings?: AdminUserAuthmeBinding[]
  }
  const raw: AdminUserAuthmeBinding[] = Array.isArray(anyUser.authmeBindings)
    ? anyUser.authmeBindings.filter((x): x is AdminUserAuthmeBinding =>
        Boolean(x),
      )
    : []

  if (raw.length > 0) {
    return raw.map((b) => ({
      id: b.id ?? null,
      username:
        typeof b.authmeUsername === 'string' ? b.authmeUsername.trim() : null,
      realname:
        typeof b.authmeRealname === 'string' ? b.authmeRealname.trim() : null,
      isPrimary: Boolean(b.isPrimary),
    }))
  }

  // 兜底：从 nicknames 推导（仅用于占位显示，无 realname）
  const fallback = (
    user as unknown as {
      nicknames?: Array<{
        id: string
        nickname?: string | null
        isPrimary?: boolean
      }>
    }
  ).nicknames
  return (fallback ?? []).map((n) => ({
    id: n.id,
    username: n.nickname ?? null,
    realname: null as string | null,
    isPrimary: Boolean(n.isPrimary),
  }))
}

const avatarPreviewOpen = ref(false)
const avatarPreviewUser = ref<AdminUserListItem | null>(null)

function openAvatarPreview(user: AdminUserListItem) {
  avatarPreviewUser.value = user
  avatarPreviewOpen.value = true
}

function closeAvatarPreview() {
  avatarPreviewOpen.value = false
  avatarPreviewUser.value = null
}

function resolveMinecraftBindingIdentifier(binding: {
  username?: string | null
  realname?: string | null
}) {
  const realname = binding.realname?.trim()
  if (realname) return realname
  const username = binding.username?.trim()
  if (username) return username
  return null
}

function mcAvatarUrl(identifier: string | null | undefined) {
  const normalized =
    typeof identifier === 'string' && identifier.trim().length > 0
      ? identifier.trim()
      : 'Steve'
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(normalized)}`
}

function onAvatarError(ev: Event) {
  const img = ev.target as HTMLImageElement | null
  if (!img) return
  // 避免循环触发
  const ds: DOMStringMap | undefined = (img as HTMLImageElement).dataset
  if (ds && ds.fallback === '1') return
  if (ds) ds.fallback = '1'
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#0f172a"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" fill="#ffffff">MC</text>
  </svg>`
  const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
  img.src = url
}

onMounted(async () => {
  if (rows.value.length === 0) {
    await refresh({ page: 1 })
  }
  if (rbacStore.roles.length === 0) {
    await rbacStore.fetchRoles()
  }
  if (rbacStore.labels.length === 0) {
    await rbacStore.fetchLabels()
  }
})

type SimpleEmailContact = {
  id: string
  value: string
  isPrimary?: boolean
  verification?: string | null
  verifiedAt?: string | null
}

function getEmailContacts(user: AdminUserListItem): SimpleEmailContact[] {
  const maybe = (user as unknown as { contacts?: SimpleEmailContact[] })
    .contacts
  return Array.isArray(maybe) ? maybe : []
}

function extraEmails(user: AdminUserListItem) {
  const list = getEmailContacts(user)
  return list.filter(
    (c) => c && c.value && !c.isPrimary && c.value !== user.email,
  )
}
</script>

<template>
  <div class="space-y-6">
    <!-- 搜索框 -->
    <header class="flex justify-end w-full">
      <div class="flex gap-2 w-full max-w-lg items-center">
        <UIcon
          v-if="usersStore.loading"
          name="i-lucide-loader-2"
          class="inline-block h-4 w-4 animate-spin"
        />
        <UInput
          v-model="keyword"
          type="search"
          placeholder="搜索邮箱、显示名、用户名或 PIIC"
          class="flex-1"
        />
      </div>
    </header>

    <div
      class="overflow-x-auto rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <table
        class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
      >
        <thead class="bg-slate-50/70 dark:bg-slate-900/60">
          <tr
            class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('displayName')"
              >
                <span>用户</span>
                <UIcon :name="sortIcon('displayName')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('piic')"
              >
                <span>PIIC</span>
                <UIcon :name="sortIcon('piic')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('roles')"
              >
                <span>角色</span>
                <UIcon :name="sortIcon('roles')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('labels')"
              >
                <span>标签</span>
                <UIcon :name="sortIcon('labels')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('minecraft')"
              >
                <span>服务器档案</span>
                <UIcon :name="sortIcon('minecraft')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('createdAt')"
              >
                <span>注册时间</span>
                <UIcon :name="sortIcon('createdAt')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('lastLoginAt')"
              >
                <span>上次登录</span>
                <UIcon :name="sortIcon('lastLoginAt')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="item in rows"
            :key="item.id"
            class="align-top transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-4">
              <div class="flex items-start gap-3">
                <UserAvatar
                  :name="userDisplayName(item)"
                  :src="userAvatarUrl(item)"
                  size="sm"
                />
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-slate-900 dark:text-white">
                      {{ userDisplayName(item) }}
                    </span>
                    <UBadge
                      v-if="item.statusSnapshot?.status"
                      color="primary"
                      size="xs"
                      variant="soft"
                      class="text-[11px]"
                    >
                      {{ item.statusSnapshot.status }}
                    </UBadge>
                  </div>
                  <div
                    class="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-300"
                  >
                    <span class="font-mono">{{ item.email }}</span>
                    <UBadge
                      v-for="mail in extraEmails(item)"
                      :key="mail.id"
                      :color="
                        mail.verification === 'VERIFIED' ? 'success' : 'warning'
                      "
                      size="xs"
                      variant="soft"
                      class="ml-1"
                      >{{ mail.value }}</UBadge
                    >
                  </div>
                </div>
              </div>
            </td>
            <td class="px-4 py-4 text-sm">
              <div class="flex items-center gap-2">
                <span class="text-slate-700 dark:text-slate-200">
                  {{ item.profile?.piic ?? '—' }}
                </span>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="h-6 w-6 rounded-full p-0 flex justify-center items-center"
                  icon="i-lucide-refresh-cw"
                  :disabled="usersStore.loading"
                  @click="openPiicDialog(item)"
                >
                  <span class="sr-only">重新生成 PIIC</span>
                </UButton>
              </div>
            </td>
            <td class="px-4 py-4 text-sm">
              <USelect
                :model-value="roleKeysOf(item)"
                :items="roleOptions"
                multiple
                searchable
                size="sm"
                class="w-full"
                value-key="value"
                label-key="label"
                placeholder="选择角色"
                :disabled="roleUpdatingId === item.id || usersStore.loading"
                :loading="roleUpdatingId === item.id"
                @update:model-value="(value) => handleRolesChange(item, value)"
              />
            </td>
            <td class="px-4 py-4 text-sm">
              <USelect
                :model-value="labelKeysOf(item)"
                :items="labelOptions"
                multiple
                searchable
                size="sm"
                class="w-full"
                value-key="value"
                label-key="label"
                placeholder="选择标签"
                :disabled="labelUpdatingId === item.id || usersStore.loading"
                :loading="labelUpdatingId === item.id"
                @update:model-value="(value) => handleLabelsChange(item, value)"
              />
            </td>
            <td class="px-4 py-4 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <template v-if="minecraftBindings(item).length">
                  <UTooltip
                    v-for="bind in minecraftBindings(item).slice(
                      0,
                      maxMinecraftAvatars,
                    )"
                    :key="bind.id || bind.username || 'unknown'"
                    :text="bind.realname || bind.username || '—'"
                  >
                    <div
                      class="relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                      role="button"
                      tabindex="0"
                      @click="openPlayerDialog(bind.username ?? bind.realname)"
                      @keydown.enter.prevent="
                        openPlayerDialog(bind.username ?? bind.realname)
                      "
                      @keydown.space.prevent="
                        openPlayerDialog(bind.username ?? bind.realname)
                      "
                    >
                      <img
                        :src="
                          mcAvatarUrl(resolveMinecraftBindingIdentifier(bind))
                        "
                        :alt="
                          resolveMinecraftBindingIdentifier(bind) ||
                          'minecraft avatar'
                        "
                        class="h-6 w-6 rounded-md border border-slate-200 dark:border-slate-700"
                        loading="lazy"
                        @error="onAvatarError"
                      />
                      <span
                        v-if="bind.isPrimary"
                        class="absolute -bottom-1 -right-1 rounded bg-primary-500 px-[3px] text-[9px] leading-3 text-white"
                        >主</span
                      >
                    </div>
                  </UTooltip>
                  <UButton
                    v-if="minecraftBindings(item).length > maxMinecraftAvatars"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    class="h-7 w-7 p-0 rounded-full flex items-center justify-center"
                    icon="i-lucide-ellipsis"
                    @click="openAvatarPreview(item)"
                  >
                    <span class="sr-only">查看更多绑定</span>
                  </UButton>
                </template>
                <span v-else class="text-xs text-slate-400">无绑定</span>
              </div>
            </td>
            <td class="px-4 py-4 text-slate-500 dark:text-slate-400">
              {{ fmtDateTime(item.createdAt) }}
            </td>
            <td class="px-4 py-4 text-slate-500 dark:text-slate-400">
              <span v-if="item.lastLoginAt">{{
                fmtDateTime(item.lastLoginAt)
              }}</span>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-4 text-right">
              <div class="flex justify-end gap-2">
                <UButton
                  color="primary"
                  size="xs"
                  variant="soft"
                  @click="openDetailDialog(item)"
                >
                  查看
                </UButton>
              </div>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td
              colspan="8"
              class="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              未查询到符合条件的用户。
            </td>
          </tr>
        </tbody>
      </table>
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
      >
        <span>
          第 {{ pagination.page }} / {{ pagination.pageCount }} 页，共
          {{ pagination.total }} 人
        </span>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="(pagination.page ?? 1) <= 1 || usersStore.loading"
            @click="goToPage(1)"
          >
            首页
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="(pagination.page ?? 1) <= 1 || usersStore.loading"
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
              :disabled="usersStore.loading"
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
            :disabled="usersStore.loading"
            @click="handlePageInput"
          >
            跳转
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="
              (pagination.page ?? 1) >= safePageCount || usersStore.loading
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
              (pagination.page ?? 1) >= safePageCount || usersStore.loading
            "
            @click="goToPage(pagination.pageCount)"
          >
            末页
          </UButton>
        </div>
      </div>
    </div>

    <UserDetailDialog
      :open="detailDialogOpen"
      :user-id="detailDialogUserId"
      :user-summary="detailDialogSummary"
      :email-token="detailDialogEmailToken"
      @update:open="
        (value) => {
          detailDialogOpen = value
          if (!value) {
            detailDialogUserId = null
            detailDialogSummary = null
          }
        }
      "
      @deleted="handleUserDeleted"
    />

    <UModal
      :open="piicDialogOpen"
      @update:open="piicDialogOpen = $event"
      :ui="{
        content:
          'w-full max-w-lg w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">重新生成 PIIC</h3>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="closePiicDialog"
            />
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            将为用户重新生成 PIIC 编号，历史编号会作废。
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closePiicDialog"
              >取消</UButton
            >
            <UButton
              color="primary"
              :loading="piicSubmitting"
              @click="confirmPiicRegeneration"
              >确认重新生成</UButton
            >
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="avatarPreviewOpen"
      @update:open="avatarPreviewOpen = $event"
      :ui="{
        content:
          'w-full max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="p-6 space-y-4 text-sm">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">全部 Minecraft 绑定</h3>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="closeAvatarPreview"
            />
          </div>
          <div v-if="avatarPreviewUser" class="space-y-3">
            <div class="flex flex-wrap gap-3">
              <template
                v-for="bind in minecraftBindings(avatarPreviewUser)"
                :key="bind.id || bind.username || 'row'"
              >
                <div class="flex flex-col items-center gap-1 w-16">
                  <img
                    :src="mcAvatarUrl(resolveMinecraftBindingIdentifier(bind))"
                    :alt="
                      resolveMinecraftBindingIdentifier(bind) ||
                      'minecraft avatar'
                    "
                    class="h-12 w-12 rounded border border-slate-200 dark:border-slate-700 shadow"
                    loading="lazy"
                    @error="onAvatarError"
                  />
                  <span
                    class="text-[11px] font-medium line-clamp-1 w-full text-center"
                    :title="bind.username || '—'"
                  >
                    {{ bind.username || '—' }}
                  </span>
                  <span
                    class="text-[10px] text-slate-500 line-clamp-1 w-full text-center"
                    :title="bind.realname || bind.username || '—'"
                  >
                    {{ bind.realname || bind.username || '—' }}
                    <span
                      v-if="bind.isPrimary"
                      class="ml-1 text-primary-600 font-semibold"
                      >主</span
                    >
                  </span>
                </div>
              </template>
            </div>
          </div>
          <div v-else class="text-xs text-slate-500 dark:text-slate-400">
            未选择用户。
          </div>
          <div class="flex justify-end">
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              @click="closeAvatarPreview"
              >关闭</UButton
            >
          </div>
        </div>
      </template>
    </UModal>

    <PlayerDetailDialog
      :open="playerDialogOpen"
      :username="playerDialogUsername"
      @update:open="
        (value) => {
          playerDialogOpen = value
          if (!value) {
            playerDialogUsername = null
          }
        }
      "
      @open-user="openUserDetailFromPlayer"
    />
  </div>
</template>
