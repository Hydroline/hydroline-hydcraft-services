<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminUsersStore } from '@/stores/adminUsers'
import { useAdminRbacStore } from '@/stores/adminRbac'
import { useUiStore } from '@/stores/ui'
import type { AdminUserListItem } from '@/types/admin'

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
const piicReason = ref('')
const piicSubmitting = ref(false)

const maxMinecraftBadges = 3

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

async function handleSubmit() {
  await refresh({ page: 1 })
}

async function goToPage(page: number) {
  if (
    page === pagination.value.page ||
    page < 1 ||
    page > pagination.value.pageCount
  ) {
    return
  }
  await refresh({ page })
}

function toggleSort(field: string) {
  const nextOrder: SortOrder =
    sortField.value === field
      ? sortOrder.value === 'asc'
        ? 'desc'
        : 'asc'
      : 'desc'
  usersStore.setSort(field, nextOrder)
  void refresh({ page: 1, sortField: field, sortOrder: nextOrder })
}

function sortIcon(field: string) {
  if (sortField.value !== field) return 'i-lucide-arrow-up-down'
  return sortOrder.value === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'
}

function openPiicDialog(user: AdminUserListItem) {
  piicDialogUser.value = user
  piicReason.value = ''
  piicDialogOpen.value = true
}

function closePiicDialog() {
  piicDialogOpen.value = false
  piicDialogUser.value = null
  piicReason.value = ''
}

async function confirmPiicRegeneration() {
  if (!piicDialogUser.value) return
  piicSubmitting.value = true
  uiStore.startLoading()
  try {
    await usersStore.regeneratePiic(
      piicDialogUser.value.id,
      piicReason.value.trim() || undefined,
    )
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

function minecraftBadges(user: AdminUserListItem) {
  return (user.minecraftIds ?? []).map((profile) => ({
    id: profile.id,
    username: profile.authmeBinding?.authmeUsername ?? null,
    label:
      profile.authmeBinding?.authmeUsername ??
      profile.nickname ??
      profile.authmeBinding?.authmeRealname ??
      '未命名',
    isPrimary: profile.isPrimary,
  }))
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
</script>

<template>
  <div class="space-y-6">
    <header
      class="flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="space-y-1">
        <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
          站内用户
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          快速浏览账号资料、权限角色、PIIC 与 AuthMe/Minecraft
          绑定，支持就地调整。
        </p>
      </div>
      <form
        class="flex w-full gap-2 sm:max-w-xl"
        @submit.prevent="handleSubmit"
      >
        <UInput
          v-model="keyword"
          type="search"
          placeholder="搜索邮箱、显示名、用户名或 PIIC"
          class="flex-1"
        />
        <UButton type="submit" color="primary">搜索</UButton>
      </form>
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
                <span>Minecraft</span>
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
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-slate-900 dark:text-white">
                    {{ item.profile?.displayName ?? item.email }}
                  </span>
                  <UBadge
                    v-if="item.statusSnapshot?.status"
                    color="primary"
                    variant="soft"
                    class="text-[11px]"
                  >
                    {{ item.statusSnapshot.status }}
                  </UBadge>
                </div>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  {{ item.email }}
                </span>
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
                  class="h-6 w-6 rounded-full p-0"
                  icon="i-lucide-refresh-cw"
                  :disabled="usersStore.loading"
                  @click="openPiicDialog(item)"
                >
                  <span class="sr-only">重新生成 PIIC</span>
                </UButton>
              </div>
            </td>
            <td class="px-4 py-4 text-sm">
              <USelectMenu
                :model-value="roleKeysOf(item)"
                :items="roleOptions"
                multiple
                searchable
                size="xs"
                value-key="value"
                label-key="label"
                placeholder="选择角色"
                :disabled="roleUpdatingId === item.id || usersStore.loading"
                :loading="roleUpdatingId === item.id"
                @update:model-value="(value) => handleRolesChange(item, value)"
              />
              <div class="mt-2 flex flex-wrap gap-1">
                <UBadge
                  v-for="role in item.roles"
                  :key="role.id"
                  color="primary"
                  variant="soft"
                  class="text-[11px]"
                >
                  {{ role.role.name ?? role.role.key }}
                </UBadge>
                <span
                  v-if="item.roles.length === 0"
                  class="text-xs text-slate-400"
                >
                  未分配
                </span>
              </div>
            </td>
            <td class="px-4 py-4 text-sm">
              <USelectMenu
                :model-value="labelKeysOf(item)"
                :items="labelOptions"
                multiple
                searchable
                size="xs"
                value-key="value"
                label-key="label"
                placeholder="选择标签"
                :disabled="labelUpdatingId === item.id || usersStore.loading"
                :loading="labelUpdatingId === item.id"
                @update:model-value="(value) => handleLabelsChange(item, value)"
              />
              <div class="mt-2 flex flex-wrap gap-1">
                <UBadge
                  v-for="link in item.permissionLabels ?? []"
                  :key="link.id"
                  :style="
                    link.label.color
                      ? {
                          backgroundColor: link.label.color + '20',
                          color: link.label.color,
                        }
                      : undefined
                  "
                  color="neutral"
                  variant="soft"
                  class="text-[11px]"
                >
                  {{ link.label.name }}
                </UBadge>
                <span
                  v-if="(item.permissionLabels?.length ?? 0) === 0"
                  class="text-xs text-slate-400"
                >
                  未分配
                </span>
              </div>
            </td>
            <td class="px-4 py-4 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <RouterLink
                  v-for="badge in minecraftBadges(item).slice(
                    0,
                    maxMinecraftBadges,
                  )"
                  :key="badge.id"
                  :to="
                    badge.username
                      ? {
                          name: 'admin.players',
                          query: { keyword: badge.username },
                        }
                      : { name: 'admin.players' }
                  "
                >
                  <UBadge
                    color="neutral"
                    variant="soft"
                    class="cursor-pointer text-[11px]"
                  >
                    {{ badge.label }}
                    <span v-if="badge.isPrimary" class="ml-1 text-[10px]"
                      >主</span
                    >
                  </UBadge>
                </RouterLink>
                <UTooltip
                  v-if="(item.minecraftIds?.length ?? 0) > maxMinecraftBadges"
                  :text="
                    (item.minecraftIds ?? [])
                      .slice(maxMinecraftBadges)
                      .map(
                        (profile) =>
                          profile.authmeBinding?.authmeUsername ??
                          profile.nickname ??
                          '未命名',
                      )
                      .join('、')
                  "
                >
                  <UBadge color="neutral" variant="soft" class="text-[11px]">
                    +{{ (item.minecraftIds?.length ?? 0) - maxMinecraftBadges }}
                  </UBadge>
                </UTooltip>
                <span
                  v-if="!item.minecraftIds || item.minecraftIds.length === 0"
                  class="text-xs text-slate-400"
                >
                  未绑定
                </span>
              </div>
            </td>
            <td class="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
              {{ fmtDateTime(item.createdAt) }}
            </td>
            <td class="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="item.lastLoginAt">{{
                fmtDateTime(item.lastLoginAt)
              }}</span>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-4 text-right">
              <RouterLink
                :to="{
                  name: 'admin.users.detail',
                  params: { userId: item.id },
                }"
              >
                <UButton color="primary" size="xs" variant="soft">查看</UButton>
              </RouterLink>
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
    </div>

    <div
      class="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-600 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300"
    >
      <span
        >第 {{ pagination.page }} / {{ pagination.pageCount }} 页，共
        {{ pagination.total }} 人</span
      >
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="pagination.page <= 1 || usersStore.loading"
          @click="goToPage(pagination.page - 1)"
        >
          上一页
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="
            pagination.page >= pagination.pageCount || usersStore.loading
          "
          @click="goToPage(pagination.page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>

    <UModal v-model="piicDialogOpen">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">重新生成 PIIC</h2>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="closePiicDialog"
            />
          </div>
        </template>
        <div class="space-y-3">
          <p class="text-sm text-slate-600 dark:text-slate-300">
            将为用户重新生成 PIIC 编号，历史编号会作废。请填写备注以便审计记录。
          </p>
          <UFormGroup label="备注（可选）">
            <UTextarea
              v-model="piicReason"
              :rows="3"
              placeholder="说明原因或操作背景"
            />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closePiicDialog"
              >取消</UButton
            >
            <UButton
              color="primary"
              :loading="piicSubmitting"
              @click="confirmPiicRegeneration"
            >
              确认重新生成
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
