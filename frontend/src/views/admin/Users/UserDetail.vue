<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ApiError, apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { useAdminUsersStore } from '@/stores/adminUsers'
import { useAdminRbacStore } from '@/stores/adminRbac'
import type { AdminBindingHistoryEntry, AdminUserDetail } from '@/types/admin'

type PasswordMode = 'temporary' | 'custom'

const props = defineProps<{ userId: string | null }>()
const emit = defineEmits<{ (event: 'deleted'): void }>()
const auth = useAuthStore()
const usersStore = useAdminUsersStore()
const rbacStore = useAdminRbacStore()
const toast = useToast()

const userId = computed(() => props.userId ?? null)
const loading = ref(false)
const detail = ref<AdminUserDetail | null>(null)
const errorMsg = ref<string | null>(null)
const bindingHistory = ref<AdminBindingHistoryEntry[]>([])
const historyLoading = ref(false)
const resetResult = ref<{
  temporaryPassword: string | null
  message: string
} | null>(null)

// 弹窗控制：原先内联显示的重置结果与错误信息改为弹窗
const resetResultDialogOpen = ref(false)
const errorDialogOpen = ref(false)

const passwordDialogOpen = ref(false)
const passwordMode = ref<PasswordMode>('temporary')
const customPassword = ref('')
const showCustomPassword = ref(false)
const passwordSubmitting = ref(false)
const deleteDialogOpen = ref(false)
const deleteSubmitting = ref(false)

const profileForm = reactive({
  displayName: '' as string | undefined,
  birthday: '' as string | undefined,
  gender: '' as string | undefined,
  motto: '' as string | undefined,
  timezone: '' as string | undefined,
  locale: '' as string | undefined,
})

const profileSaving = ref(false)
const joinDateEditing = ref<string | null>(null)
const joinDateSaving = ref(false)

const roleSelection = ref<string[]>([])
const labelSelection = ref<string[]>([])
const roleSaving = ref(false)
const labelSaving = ref(false)

const piicDialogOpen = ref(false)
const piicReason = ref('')
const piicSubmitting = ref(false)

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

const sessions = computed(() => detail.value?.sessions ?? [])

interface UIMinecraftProfile {
  id: string
  isPrimary?: boolean
  nickname: string | null
}

// 主 Minecraft 概览（将 UUID、Minecraft ID 与昵称区分开）
interface PrimaryMinecraftSummary {
  // Minecraft 账户的 UUID（来自 AuthMe 绑定的 authmeUuid）
  id: string
  // Minecraft ID（用户名/Realname）
  realname: string | null
  username: string | null
  // 平时使用的昵称（来自昵称表 nicknames 的主项）
  nickname: string | null
}

const primaryMinecraft = computed<PrimaryMinecraftSummary | null>(() => {
  const d = detail.value
  if (!d) return null
  const primaryBindId = d.profile?.primaryAuthmeBindingId
  if (!primaryBindId) return null
  const b = (d.authmeBindings ?? []).find((x) => x.id === primaryBindId)
  if (!b || !b.id) return null
  // 取主昵称（如果有）
  const primaryNick =
    (d.nicknames ?? []).find((n) => n.isPrimary)?.nickname ?? null
  return {
    // 使用 AuthMe 的 UUID 作为 id（用于显示 UUID）
    id: b.authmeUuid ?? '',
    // Minecraft ID（优先 Realname，否则 Username）
    realname: b.authmeRealname ?? null,
    username: b.authmeUsername ?? null,
    // 独立的昵称
    nickname: primaryNick,
  }
})

const minecraftProfiles = computed<UIMinecraftProfile[]>(() => {
  const list = detail.value?.nicknames ?? []
  return list.map((n) => ({
    id: n.id,
    isPrimary: n.isPrimary,
    nickname: n.nickname ?? null,
  }))
})

// === 联系方式管理（声明与加载渠道） ===
const contactDialogOpen = ref(false)
const contactEditingId = ref<string | null>(null)
const contactChannelId = ref<string | undefined>(undefined)
const contactValue = ref('')
const contactIsPrimary = ref(false)
const contactSubmitting = ref(false)
const contactChannels = ref<
  Array<{ id: string; key: string; displayName: string }>
>([])

async function ensureContactChannels() {
  if (!auth.token) return
  if (contactChannels.value.length > 0) return
  try {
    const data = await apiFetch<
      Array<{ id: string; key: string; displayName: string }>
    >('/auth/contact-channels', { token: auth.token })
    contactChannels.value = data
  } catch (error) {
    console.warn('[admin] fetch contact channels failed', error)
  }
}

function openCreateContactDialog() {
  contactEditingId.value = null
  contactChannelId.value = contactChannels.value[0]?.id ?? undefined
  contactValue.value = ''
  contactIsPrimary.value = false
  contactDialogOpen.value = true
  void ensureContactChannels()
}

function openEditContactDialog(entry: {
  id: string
  channelId: string
  value: string | null
  isPrimary?: boolean
}) {
  contactEditingId.value = entry.id
  contactChannelId.value = entry.channelId
  contactValue.value = entry.value ?? ''
  contactIsPrimary.value = entry.isPrimary ?? false
  contactDialogOpen.value = true
  void ensureContactChannels()
}

function closeContactDialog() {
  contactDialogOpen.value = false
  contactSubmitting.value = false
}

async function submitContact() {
  if (!auth.token || !detail.value) return
  if (!contactChannelId.value || !contactValue.value.trim()) {
    toast.add({ title: '请填写必要信息', color: 'warning' })
    return
  }
  contactSubmitting.value = true
  try {
    if (!contactEditingId.value) {
      await apiFetch(`/auth/users/${detail.value.id}/contacts`, {
        method: 'POST',
        token: auth.token,
        body: {
          channelId: contactChannelId.value,
          value: contactValue.value.trim(),
          isPrimary: contactIsPrimary.value,
        },
      })
    } else {
      await apiFetch(
        `/auth/users/${detail.value.id}/contacts/${contactEditingId.value}`,
        {
          method: 'PATCH',
          token: auth.token,
          body: {
            channelId: contactChannelId.value,
            value: contactValue.value.trim(),
            isPrimary: contactIsPrimary.value,
          },
        },
      )
    }
    toast.add({ title: '联系方式已保存', color: 'primary' })
    await fetchDetail()
    closeContactDialog()
  } catch (error) {
    console.warn('[admin] submit contact failed', error)
    toast.add({ title: '保存失败', color: 'error' })
  } finally {
    contactSubmitting.value = false
  }
}

async function deleteContact(contactId: string) {
  if (!auth.token || !detail.value) return
  if (!window.confirm('确定要删除该联系方式吗？')) return
  try {
    await apiFetch(`/auth/users/${detail.value.id}/contacts/${contactId}`, {
      method: 'DELETE',
      token: auth.token,
    })
    toast.add({ title: '已删除', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] delete contact failed', error)
    toast.add({ title: '删除失败', color: 'error' })
  }
}

// === 新增绑定 UI 状态 ===
const createBindingDialogOpen = ref(false)
const createBindingIdentifier = ref('')
const createBindingSetPrimary = ref(true)
const createBindingSubmitting = ref(false)

function openCreateBindingDialog() {
  createBindingIdentifier.value = ''
  createBindingSetPrimary.value = true
  createBindingDialogOpen.value = true
}

function closeCreateBindingDialog() {
  createBindingDialogOpen.value = false
  createBindingSubmitting.value = false
}

async function submitCreateBinding() {
  if (!auth.token || !detail.value) return
  const identifier = createBindingIdentifier.value.trim()
  if (!identifier) {
    toast.add({ title: '请输入要绑定的 AuthMe 标识', color: 'warning' })
    return
  }
  createBindingSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/bindings`, {
      method: 'POST',
      token: auth.token,
      body: { identifier, setPrimary: createBindingSetPrimary.value },
    })
    toast.add({ title: '绑定成功', color: 'primary' })
    closeCreateBindingDialog()
    await fetchDetail()
    await fetchBindingHistory()
  } catch (error) {
    console.warn('[admin] create binding failed', error)
    toast.add({ title: '绑定失败', color: 'error' })
  } finally {
    createBindingSubmitting.value = false
  }
}

// === Minecraft 昵称管理 ===
const minecraftProfileDialogOpen = ref(false)
const minecraftNicknameInput = ref('')
const minecraftPrimaryCheckbox = ref(false)
const minecraftSubmitting = ref(false)

function openMinecraftProfileDialog() {
  minecraftNicknameInput.value = ''
  minecraftPrimaryCheckbox.value = false
  minecraftProfileDialogOpen.value = true
}

function closeMinecraftProfileDialog() {
  minecraftProfileDialogOpen.value = false
  minecraftSubmitting.value = false
}

async function submitMinecraftProfile() {
  if (!auth.token || !detail.value) return
  const nickname = minecraftNicknameInput.value.trim()
  if (!nickname) {
    toast.add({ title: '请输入昵称', color: 'warning' })
    return
  }
  minecraftSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/minecraft-profiles`, {
      method: 'POST',
      token: auth.token,
      body: { nickname, isPrimary: minecraftPrimaryCheckbox.value },
    })
    toast.add({ title: '已添加昵称', color: 'primary' })
    closeMinecraftProfileDialog()
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] add minecraft profile failed', error)
    toast.add({ title: '添加失败', color: 'error' })
  } finally {
    minecraftSubmitting.value = false
  }
}

async function markPrimaryMinecraft(profileId: string) {
  if (!auth.token || !detail.value) return
  try {
    await apiFetch(
      `/auth/users/${detail.value.id}/minecraft-profiles/${profileId}`,
      {
        method: 'PATCH',
        token: auth.token,
        body: { isPrimary: true },
      },
    )
    toast.add({ title: '已设为主昵称', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] mark primary minecraft failed', error)
    toast.add({ title: '操作失败', color: 'error' })
  }
}

async function deleteMinecraftProfile(profileId: string) {
  if (!auth.token || !detail.value) return
  if (!window.confirm('确定要删除该昵称记录吗？')) return
  try {
    await apiFetch(
      `/auth/users/${detail.value.id}/minecraft-profiles/${profileId}`,
      {
        method: 'DELETE',
        token: auth.token,
      },
    )
    toast.add({ title: '已删除昵称', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] delete minecraft profile failed', error)
    toast.add({ title: '删除失败', color: 'error' })
  }
}

function fmtDateTime(ts?: string | null, format = 'YYYY-MM-DD HH:mm') {
  if (!ts) return '—'
  return dayjs(ts).format(format)
}

function hydratedRoleKeys(data: AdminUserDetail | null) {
  return data?.roles.map((link) => link.role.key).sort() ?? []
}

function hydratedLabelKeys(data: AdminUserDetail | null) {
  return data?.permissionLabels?.map((link) => link.label.key).sort() ?? []
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
  if (!input) {
    return []
  }
  if (typeof input === 'string') {
    return [input]
  }
  if (
    typeof input === 'object' &&
    'value' in (input as Record<string, unknown>)
  ) {
    const value = (input as Record<string, unknown>).value
    return typeof value === 'string' && value.length > 0 ? [value] : []
  }
  return []
}

async function fetchDetail() {
  if (!auth.token) return
  loading.value = true
  errorMsg.value = null
  try {
    const data = await apiFetch<AdminUserDetail>(
      `/auth/users/${userId.value}`,
      { token: auth.token },
    )
    detail.value = data
    profileForm.displayName = data.profile?.displayName ?? undefined
    // 转换 birthday 为 YYYY-MM-DD 格式
    profileForm.birthday = data.profile?.birthday
      ? dayjs(data.profile.birthday).format('YYYY-MM-DD')
      : undefined
    profileForm.gender = data.profile?.gender ?? undefined
    profileForm.motto = data.profile?.motto ?? undefined
    profileForm.timezone = data.profile?.timezone ?? undefined
    profileForm.locale = data.profile?.locale ?? undefined
    // 转换 joinDate 为 YYYY-MM-DD 格式
    joinDateEditing.value = data.joinDate
      ? dayjs(data.joinDate).format('YYYY-MM-DD')
      : null
    roleSelection.value = hydratedRoleKeys(data)
    labelSelection.value = hydratedLabelKeys(data)
    await fetchBindingHistory(data.id)
  } catch (error) {
    errorMsg.value =
      error instanceof ApiError ? error.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function fetchBindingHistory(targetId?: string) {
  if (!auth.token) return
  const id = targetId ?? detail.value?.id
  if (!id) return
  historyLoading.value = true
  try {
    const data = await apiFetch<{ items: AdminBindingHistoryEntry[] }>(
      `/auth/users/${id}/bindings/history?page=1&pageSize=50`,
      { token: auth.token },
    )
    bindingHistory.value = data.items
  } finally {
    historyLoading.value = false
  }
}

async function saveProfile() {
  if (!auth.token || !detail.value) return
  profileSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/profile`, {
      method: 'PATCH',
      token: auth.token,
      body: {
        displayName: profileForm.displayName || undefined,
        birthday: profileForm.birthday || undefined,
        gender: profileForm.gender || undefined,
        motto: profileForm.motto || undefined,
        timezone: profileForm.timezone || undefined,
        locale: profileForm.locale || undefined,
      },
    })
    toast.add({ title: '资料已更新', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] update profile failed', error)
    toast.add({ title: '资料更新失败', color: 'error' })
  } finally {
    profileSaving.value = false
  }
}

async function saveJoinDate() {
  if (!auth.token || !detail.value) return
  if (!joinDateEditing.value) {
    toast.add({ title: '请填写有效的日期', color: 'warning' })
    return
  }
  joinDateSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/join-date`, {
      method: 'PATCH',
      token: auth.token,
      body: { joinDate: joinDateEditing.value },
    })
    toast.add({ title: '入服日期已更新', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] update join date failed', error)
    toast.add({ title: '入服日期更新失败', color: 'error' })
  } finally {
    joinDateSaving.value = false
  }
}

async function handleRolesUpdate(nextValue: unknown) {
  if (!auth.token || !detail.value) return
  const sorted = normalizeSelection(nextValue).sort()
  const previous = [...roleSelection.value]
  if (sorted.length === 0) {
    toast.add({ title: '至少需要一个角色', color: 'warning' })
    roleSelection.value = hydratedRoleKeys(detail.value)
    return
  }
  if (JSON.stringify(sorted) === JSON.stringify([...previous].sort())) {
    return
  }
  roleSelection.value = sorted
  roleSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/roles`, {
      method: 'POST',
      token: auth.token,
      body: { roleKeys: sorted },
    })
    toast.add({ title: '角色已更新', color: 'primary' })
    await fetchDetail()
    await usersStore.fetch({ page: usersStore.pagination.page })
  } catch (error) {
    console.warn('[admin] assign roles failed', error)
    toast.add({ title: '角色更新失败', color: 'error' })
    roleSelection.value = previous
  } finally {
    roleSaving.value = false
  }
}

async function handleLabelsUpdate(nextValue: unknown) {
  if (!auth.token || !detail.value) return
  const sorted = normalizeSelection(nextValue).sort()
  const previous = [...labelSelection.value]
  if (JSON.stringify(sorted) === JSON.stringify([...previous].sort())) {
    return
  }
  labelSelection.value = sorted
  labelSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/permission-labels`, {
      method: 'POST',
      token: auth.token,
      body: { labelKeys: sorted },
    })
    toast.add({ title: '标签已更新', color: 'primary' })
    await fetchDetail()
    await usersStore.fetch({ page: usersStore.pagination.page })
  } catch (error) {
    console.warn('[admin] assign labels failed', error)
    toast.add({ title: '标签更新失败', color: 'error' })
    labelSelection.value = previous
  } finally {
    labelSaving.value = false
  }
}

function openPiicDialog() {
  if (!detail.value) return
  piicReason.value = ''
  piicDialogOpen.value = true
}

function closePiicDialog() {
  piicDialogOpen.value = false
  piicReason.value = ''
}

watch(piicDialogOpen, (value) => {
  if (!value) {
    piicReason.value = ''
  }
})

watch(passwordDialogOpen, (value) => {
  if (!value) {
    passwordMode.value = 'temporary'
    customPassword.value = ''
    showCustomPassword.value = false
  }
})

watch(deleteDialogOpen, (value) => {
  if (!value) {
    deleteSubmitting.value = false
  }
})

// 当出现重置结果时自动弹出结果对话框
watch(resetResult, (val) => {
  if (val) {
    resetResultDialogOpen.value = true
  }
})

// 当出现错误信息时自动弹出错误对话框
watch(errorMsg, (val) => {
  if (val) {
    errorDialogOpen.value = true
  }
})

async function confirmPiicRegeneration() {
  if (!auth.token || !detail.value) return
  piicSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/piic/regenerate`, {
      method: 'POST',
      token: auth.token,
      body: piicReason.value.trim() ? { reason: piicReason.value.trim() } : {},
    })
    toast.add({ title: 'PIIC 已重新生成', color: 'primary' })
    closePiicDialog()
    await fetchDetail()
    await usersStore.fetch({ page: usersStore.pagination.page })
  } catch (error) {
    console.warn('[admin] regenerate piic failed', error)
    toast.add({ title: 'PIIC 生成失败', color: 'error' })
  } finally {
    piicSubmitting.value = false
  }
}

function openResetPasswordDialog() {
  if (!detail.value) return
  passwordDialogOpen.value = true
}

function closeResetPasswordDialog() {
  passwordDialogOpen.value = false
}

function closeResetResultDialog() {
  resetResultDialogOpen.value = false
}

function closeErrorDialog() {
  errorDialogOpen.value = false
}

function copyTemporaryPassword() {
  const pwd = resetResult.value?.temporaryPassword
  if (pwd) {
    navigator.clipboard.writeText(pwd).catch(() => {})
    toast.add({ title: '已复制临时密码', color: 'primary' })
  }
}

async function confirmResetPassword() {
  if (!auth.token || !detail.value) return
  if (passwordMode.value === 'custom' && !customPassword.value.trim()) {
    toast.add({ title: '请填写要设置的密码', color: 'warning' })
    return
  }
  passwordSubmitting.value = true
  try {
    const result = await usersStore.resetPassword(
      detail.value.id,
      passwordMode.value === 'custom' ? customPassword.value : undefined,
    )
    resetResult.value = {
      temporaryPassword: result.temporaryPassword,
      message: result.temporaryPassword
        ? '已生成临时密码，请尽快通知用户并提示修改。'
        : '密码已重置，请尽快通知用户修改。',
    }
    toast.add({ title: '密码已重置', color: 'primary' })
    closeResetPasswordDialog()
  } catch (error) {
    console.warn('[admin] reset password failed', error)
    toast.add({ title: '密码重置失败', color: 'error' })
  } finally {
    passwordSubmitting.value = false
  }
}

function openDeleteDialog() {
  if (!detail.value) return
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  deleteDialogOpen.value = false
  deleteSubmitting.value = false
}

async function confirmDeleteUser() {
  if (!auth.token || !detail.value) return
  deleteSubmitting.value = true
  try {
    await usersStore.delete(detail.value.id)
    toast.add({ title: '用户已删除', color: 'primary' })
    closeDeleteDialog()
    emit('deleted')
  } catch (error) {
    console.warn('[admin] delete user failed', error)
    toast.add({ title: '删除失败', color: 'error' })
  } finally {
    deleteSubmitting.value = false
  }
}

async function markPrimaryBinding(bindingId: string) {
  if (!auth.token || !detail.value) return
  try {
    await apiFetch(
      `/auth/users/${detail.value.id}/bindings/${bindingId}/primary`,
      { method: 'PATCH', token: auth.token },
    )
    toast.add({ title: '已标记为主绑定', color: 'primary' })
    await fetchDetail()
    await fetchBindingHistory()
  } catch (error) {
    console.warn('[admin] mark primary binding failed', error)
    toast.add({ title: '操作失败', color: 'error' })
  }
}

async function unbind(bindingId: string) {
  if (!auth.token || !detail.value) return
  if (!window.confirm('确定要解绑该 AuthMe 账号吗？')) return
  try {
    await apiFetch(`/auth/users/${detail.value.id}/bindings/${bindingId}`, {
      method: 'DELETE',
      token: auth.token,
    })
    toast.add({ title: '已解绑', color: 'primary' })
    await fetchDetail()
    await fetchBindingHistory()
  } catch (error) {
    console.warn('[admin] unbind authme failed', error)
    toast.add({ title: '解绑失败', color: 'error' })
  }
}

onMounted(async () => {
  if (rbacStore.roles.length === 0) {
    await rbacStore.fetchRoles()
  }
  if (rbacStore.labels.length === 0) {
    await rbacStore.fetchLabels()
  }
})

watch(
  () => props.userId,
  async (next) => {
    if (!next) {
      detail.value = null
      bindingHistory.value = []
      joinDateEditing.value = null
      resetResult.value = null
      resetResultDialogOpen.value = false
      errorDialogOpen.value = false
      closeResetPasswordDialog()
      closePiicDialog()
      closeDeleteDialog()
      return
    }
    await fetchDetail()
  },
  { immediate: true },
)
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 text-sm">
    <section
      class="rounded-2xl p-6 border border-slate-200/70 dark:border-slate-800/70"
    >
      <div
        class="flex flex-col gap-4 relative md:flex-row md:items-start md:justify-between"
      >
        <div class="flex-1">
          <div>
            <UserAvatar
              :src="(detail?.profile as any)?.avatarUrl || undefined"
              :alt="detail?.profile?.displayName || detail?.email || '用户头像'"
              size="lg"
              class="mb-2"
            />
          </div>
          <div>
            <span
              class="line-clamp-1 truncate text-2xl font-semibold text-slate-900 dark:text-white"
            >
              {{ detail?.profile?.displayName ?? detail?.email ?? '用户详情' }}
            </span>
            <span class="text-sm">{{ detail?.id ?? '—' }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 md:absolute md:top-0 md:right-0">
          <UButton
            class="flex items-center justify-center leading-none"
            color="neutral"
            variant="soft"
            size="sm"
            :loading="loading"
            @click="fetchDetail"
          >
            重新载入
          </UButton>
          <UButton
            class="flex items-center justify-center leading-none"
            color="primary"
            variant="soft"
            size="sm"
            :disabled="loading || !detail"
            @click="openResetPasswordDialog"
          >
            重置密码
          </UButton>
          <UButton
            class="flex items-center justify-center leading-none"
            color="error"
            variant="soft"
            size="sm"
            :disabled="!detail"
            @click="openDeleteDialog"
          >
            删除该用户
          </UButton>
        </div>
      </div>

      <div class="mt-6 grid gap-2 sm:grid-cols-3">
        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">邮箱</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="detail?.email">{{ detail.email }}</template>
            <template v-else>
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">用户名</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="detail?.name">
              {{ detail.name }}
            </template>
            <template v-else>
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">状态</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="detail?.statusSnapshot?.status">
              {{ detail.statusSnapshot.status }}
            </template>
            <template v-else>
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">PIIC</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300 flex items-center gap-1"
          >
            <template v-if="detail?.profile?.piic"
              ><span>
                {{ detail?.profile?.piic ?? '—' }}
              </span>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                class="h-7 w-7 rounded-full p-0 flex justify-center items-center"
                icon="i-lucide-refresh-cw"
                :disabled="!detail || loading"
                @click="openPiicDialog"
              >
                <span class="sr-only">刷新 PIIC</span>
              </UButton>
            </template>
            <template v-else>
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">注册时间</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="detail?.createdAt">
              {{ fmtDateTime(detail.createdAt) }}
            </template>
            <template v-else>
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">入服时间</div>
          <div class="flex flex-col gap-1 sm:flex-row sm:items-center">
            <div class="flex-1">
              <UInput
                v-model="joinDateEditing"
                type="date"
                class="w-full"
                :disabled="!detail"
              />
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              class="h-7 w-7 rounded-full p-0 flex justify-center items-center"
              icon="i-lucide-refresh-cw"
              :loading="joinDateSaving"
              :disabled="!detail || !joinDateEditing"
              @click="saveJoinDate"
            >
              <span class="sr-only">更新</span>
            </UButton>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">
            主 Minecraft 昵称
          </div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="primaryMinecraft">
              {{ primaryMinecraft.nickname || '—' }}
            </template>
            <template v-else>
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">
            主 Minecraft ID
          </div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="primaryMinecraft">
              <span class="flex items-center gap-1">
                <img
                  :src="
                    'https://mc-heads.net/avatar/' + primaryMinecraft.username
                  "
                  class="block h-4 w-4 rounded-xs"
                />
                {{ primaryMinecraft.realname || '—' }}
              </span>
              <span
                class="block line-clamp-1 truncate font-medium text-xs text-slate-600 dark:text-slate-600"
                >{{ primaryMinecraft.id }}</span
              >
            </template>
            <template v-else>
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">
            最近登录时间
          </div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            {{ fmtDateTime(detail?.lastLoginAt) }}
            <span
              class="block line-clamp-1 truncate font-medium text-xs text-slate-600 dark:text-slate-600"
              >{{ detail?.lastLoginIp ?? '—' }}</span
            >
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">
            RBAC 角色
          </div>
          <div>
            <USelect
              class="w-full"
              :model-value="roleSelection"
              :items="roleOptions"
              multiple
              searchable
              value-key="value"
              label-key="label"
              :disabled="roleSaving || loading"
              :loading="roleSaving || loading"
              placeholder="选择角色"
              @update:model-value="handleRolesUpdate"
            />
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">
            RBAC 标签
          </div>
          <div>
            <USelect
              class="w-full"
              :model-value="labelSelection"
              :items="labelOptions"
              multiple
              searchable
              value-key="value"
              label-key="label"
              :disabled="labelSaving || loading"
              :loading="labelSaving || loading"
              placeholder="选择标签"
              @update:model-value="handleLabelsUpdate"
            />
          </div>
        </div>
      </div>
    </section>

    <section
      class="rounded-2xl p-6 border border-slate-200/70 dark:border-slate-800/70"
    >
      <div class="flex items-center justify-between">
        <div class="text-sm tracking-wide text-slate-500 dark:text-slate-400">
          基础资料
        </div>
        <UButton
          :loading="profileSaving"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="!detail"
          @click="saveProfile"
        >
          保存资料
        </UButton>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">显示名称</div>
          <UInput
            v-model="profileForm.displayName"
            placeholder="显示名称"
            class="w-full"
          />
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">语言</div>
          <USelect
            v-model="profileForm.locale"
            :items="[{ label: '中文（简体）', value: 'zh-CN' }]"
            placeholder="选择语言"
            class="w-full"
          />
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">时区</div>
          <UInput
            v-model="profileForm.timezone"
            placeholder="例如 Asia/Shanghai"
            class="w-full"
          />
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">性别</div>
          <USelect
            v-model="profileForm.gender"
            :items="[
              { label: '未指定', value: 'UNSPECIFIED' },
              { label: '男', value: 'MALE' },
              { label: '女', value: 'FEMALE' },
            ]"
            placeholder="选择性别"
            class="w-full"
          />
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">生日</div>
          <UInput v-model="profileForm.birthday" type="date" class="w-full" />
        </div>

        <div class="md:col-span-3">
          <div class="text-xs text-slate-500 dark:text-slate-500">签名</div>
          <UTextarea
            v-model="profileForm.motto"
            :rows="3"
            placeholder="个人签名或座右铭"
            class="w-full"
          />
        </div>
      </div>
    </section>

    <section
      class="rounded-2xl p-6 border border-slate-200/70 dark:border-slate-800/70"
    >
      <div class="flex gap-2 items-center justify-between">
        <div class="text-sm tracking-wide text-slate-500 dark:text-slate-400">
          服务器账户
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            :disabled="!detail"
            @click="openMinecraftProfileDialog"
          >
            添加昵称
          </UButton>
          <UButton
            size="sm"
            color="primary"
            variant="ghost"
            :disabled="!detail"
            @click="openCreateBindingDialog"
          >
            新增绑定
          </UButton>
        </div>
      </div>

      <div class="mt-2 flex flex-row gap-6 md:grid md:grid-cols-2">
        <!-- MC ID -->
        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">
            Minecraft ID
          </div>

          <ul class="space-y-2">
            <li
              v-for="binding in detail?.authmeBindings ?? []"
              :key="binding.id"
              class="rounded-lg bg-slate-50/80 px-4 py-3 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
            >
              <div class="flex items-center justify-between gap-2">
                <div>
                  <span class="font-medium text-slate-900 dark:text-white">{{
                    binding.authmeRealname ?? binding.authmeUsername ?? '未知'
                  }}</span>
                  <UBadge
                    v-if="
                      binding.id &&
                      binding.id === detail?.profile?.primaryAuthmeBindingId
                    "
                    variant="soft"
                    class="ml-2"
                    size="sm"
                    >主绑定</UBadge
                  >
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-if="
                      binding.id &&
                      binding.id !== detail?.profile?.primaryAuthmeBindingId
                    "
                    size="xs"
                    color="primary"
                    variant="link"
                    @click="markPrimaryBinding(binding.id)"
                    >设为主绑定</UButton
                  >
                  <UButton
                    v-if="binding.id"
                    size="xs"
                    color="error"
                    variant="link"
                    @click="unbind(binding.id)"
                    >解绑</UButton
                  >
                </div>
              </div>
              <div class="mt-2">
                <span class="text-xs font-semibold" v-if="binding.authmeUuid">{{
                  binding.authmeUuid
                }}</span>
              </div>
            </li>
            <li
              v-if="(detail?.authmeBindings?.length ?? 0) === 0"
              class="text-xs text-slate-500 dark:text-slate-400"
            >
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </li>
          </ul>
        </div>

        <!-- Minecraft 昵称列表 -->
        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">昵称</div>
          <ul class="space-y-2">
            <li
              v-for="p in minecraftProfiles"
              :key="p.id"
              class="rounded-lg bg-slate-100/60 px-4 py-2 text-[11px] text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
            >
              <div class="flex items-center justify-between gap-2">
                <div>
                  <span class="font-medium text-slate-900 dark:text-white">{{
                    p.nickname || '未命名'
                  }}</span>
                  <UBadge
                    v-if="p.isPrimary"
                    variant="soft"
                    class="ml-2"
                    size="sm"
                    >主称呼</UBadge
                  >
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-if="!p.isPrimary"
                    size="xs"
                    color="primary"
                    variant="link"
                    @click="markPrimaryMinecraft(p.id)"
                    >设为主</UButton
                  >
                  <UButton
                    size="xs"
                    color="error"
                    variant="link"
                    @click="deleteMinecraftProfile(p.id)"
                    >删除</UButton
                  >
                </div>
              </div>
            </li>
            <li
              v-if="minecraftProfiles.length === 0"
              class="text-xs text-slate-500 dark:text-slate-400"
            >
              <UIcon
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>

  <UModal
    :open="resetResultDialogOpen"
    @update:open="resetResultDialogOpen = $event"
    :ui="{ content: 'w-full max-w-md' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">密码重置结果</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeResetResultDialog"
          />
        </div>
        <p class="text-xs text-emerald-700 dark:text-emerald-200 font-medium">
          {{ resetResult?.message }}
        </p>
        <div
          v-if="resetResult?.temporaryPassword"
          class="rounded-lg border border-emerald-200/70 bg-white/80 px-4 py-3 font-mono text-sm tracking-wide text-emerald-700 shadow-sm dark:border-emerald-800/60 dark:bg-slate-900/70 dark:text-emerald-200"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="break-all">{{ resetResult?.temporaryPassword }}</span>
            <UButton
              color="primary"
              variant="ghost"
              size="xs"
              @click="copyTemporaryPassword"
              >复制</UButton
            >
          </div>
        </div>
        <div class="flex justify-end">
          <UButton
            color="primary"
            variant="soft"
            size="sm"
            @click="closeResetResultDialog"
            >关闭</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <!-- 错误信息弹窗 -->
  <UModal
    :open="errorDialogOpen"
    @update:open="errorDialogOpen = $event"
    :ui="{ content: 'w-full max-w-sm' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-red-600 dark:text-red-300">
            操作失败
          </h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeErrorDialog"
          />
        </div>
        <p
          class="rounded-lg border border-red-300/70 bg-red-50/90 px-4 py-3 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {{ errorMsg }}
        </p>
        <div class="flex justify-end">
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            @click="closeErrorDialog"
            >关闭</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="piicDialogOpen"
    @update:open="piicDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
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
          将为用户重新生成 PIIC 编号，历史编号会作废。请填写备注以便审计记录。
        </p>
        <div class="space-y-1">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            备注（可选）
          </label>
          <UTextarea
            v-model="piicReason"
            :rows="4"
            placeholder="说明原因或操作背景"
          />
        </div>
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

  <!-- 新增绑定对话框 -->
  <UModal
    :open="createBindingDialogOpen"
    @update:open="createBindingDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">新增 AuthMe 绑定</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeCreateBindingDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          输入 AuthMe 用户名或 Realname
          进行绑定，若已存在将更新信息；可选择设为当前用户主绑定。
        </p>
        <div class="space-y-1">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >标识</label
          >
          <UInput
            v-model="createBindingIdentifier"
            placeholder="AuthMe 用户名或 Realname"
            :disabled="createBindingSubmitting"
          />
        </div>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <input
            type="checkbox"
            v-model="createBindingSetPrimary"
            :disabled="createBindingSubmitting"
            class="h-4 w-4"
          />
          <span>设为主绑定</span>
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="createBindingSubmitting"
            @click="closeCreateBindingDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="createBindingSubmitting"
            @click="submitCreateBinding"
            >绑定</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <!-- 新增 Minecraft 昵称对话框 -->
  <UModal
    :open="minecraftProfileDialogOpen"
    @update:open="minecraftProfileDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">添加 Minecraft 昵称</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeMinecraftProfileDialog"
          />
        </div>
        <div class="space-y-1">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >昵称</label
          >
          <UInput
            v-model="minecraftNicknameInput"
            placeholder="输入昵称"
            :disabled="minecraftSubmitting"
          />
        </div>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <input
            type="checkbox"
            v-model="minecraftPrimaryCheckbox"
            :disabled="minecraftSubmitting"
            class="h-4 w-4"
          />
          <span>设为主昵称</span>
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="minecraftSubmitting"
            @click="closeMinecraftProfileDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="minecraftSubmitting"
            @click="submitMinecraftProfile"
            >保存</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <!-- 联系方式编辑/新增对话框 -->
  <UModal
    :open="contactDialogOpen"
    @update:open="contactDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            {{ contactEditingId ? '编辑联系方式' : '新增联系方式' }}
          </h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeContactDialog"
          />
        </div>
        <div class="space-y-3">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-600 dark:text-slate-300"
              >渠道</span
            >
            <USelect
              v-model="contactChannelId"
              :options="
                contactChannels.map((c) => ({
                  label: c.displayName || c.key,
                  value: c.id,
                }))
              "
              placeholder="选择渠道"
              :disabled="contactSubmitting"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-600 dark:text-slate-300"
              >内容</span
            >
            <UInput
              v-model="contactValue"
              :disabled="contactSubmitting"
              placeholder="例如: example@qq.com / Discord Tag / 电话"
            />
          </label>
          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
          >
            <input
              type="checkbox"
              v-model="contactIsPrimary"
              :disabled="contactSubmitting"
              class="h-4 w-4"
            />
            <span>设为该渠道主联系方式</span>
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="contactSubmitting"
            @click="closeContactDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="contactSubmitting"
            @click="submitContact"
            >保存</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="passwordDialogOpen"
    @update:open="passwordDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">重置密码</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeResetPasswordDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          请选择重置方式，可以生成临时密码或直接指定新密码。
        </p>
        <div class="space-y-3">
          <label
            class="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600"
          >
            <input
              v-model="passwordMode"
              class="mt-1 h-4 w-4"
              type="radio"
              value="temporary"
            />
            <div class="space-y-1">
              <p class="text-sm font-medium text-slate-900 dark:text-white">
                生成临时密码
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                系统将自动生成随机密码并显示给你，用户首次登录需修改。
              </p>
            </div>
          </label>

          <label
            class="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600"
          >
            <input
              v-model="passwordMode"
              class="mt-1 h-4 w-4"
              type="radio"
              value="custom"
            />
            <div class="flex-1 space-y-2">
              <div>
                <p class="text-sm font-medium text-slate-900 dark:text-white">
                  指定新密码
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  管理员自定义密码，系统不会额外生成临时密码。
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UInput
                  v-model="customPassword"
                  :disabled="passwordMode !== 'custom'"
                  :type="showCustomPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="输入要设置的新密码"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="passwordMode !== 'custom'"
                  @click="showCustomPassword = !showCustomPassword"
                >
                  <span v-if="showCustomPassword">隐藏</span>
                  <span v-else>显示</span>
                </UButton>
              </div>
            </div>
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="closeResetPasswordDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="passwordSubmitting"
            @click="confirmResetPassword"
          >
            确认重置
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="deleteDialogOpen"
    @update:open="deleteDialogOpen = $event"
    :ui="{ content: 'w-full max-w-md z-[1101]', overlay: 'z-[1100]' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            确认删除用户
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            删除后将无法恢复该用户的账号、会话与绑定记录，请谨慎操作。
          </p>
        </div>
        <div
          class="rounded-lg bg-slate-50/70 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
        >
          {{ detail?.profile?.displayName ?? detail?.email ?? detail?.id }}
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeDeleteDialog">
            取消
          </UButton>
          <UButton
            color="error"
            :loading="deleteSubmitting"
            @click="confirmDeleteUser"
          >
            确认删除
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
