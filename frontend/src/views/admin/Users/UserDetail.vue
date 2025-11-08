<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ApiError, apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { useAdminUsersStore } from '@/stores/adminUsers'
import { useAdminRbacStore } from '@/stores/adminRbac'
import type { AdminBindingHistoryEntry, AdminUserDetail } from '@/types/admin'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const usersStore = useAdminUsersStore()
const rbacStore = useAdminRbacStore()
const toast = useToast()

const userId = computed(() => route.params.userId as string)
const loading = ref(false)
const detail = ref<AdminUserDetail | null>(null)
const errorMsg = ref<string | null>(null)
const bindingHistory = ref<AdminBindingHistoryEntry[]>([])
const historyLoading = ref(false)
const resetResult = ref<string | null>(null)

const profileForm = reactive({
  displayName: '' as string | null,
  birthday: '' as string | null,
  gender: '' as string | null,
  motto: '' as string | null,
  timezone: '' as string | null,
  locale: '' as string | null,
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
const primaryMinecraft = computed(
  () => detail.value?.profile?.primaryMinecraft ?? null,
)
const minecraftProfiles = computed(() => detail.value?.minecraftIds ?? [])

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
    profileForm.displayName = data.profile?.displayName ?? ''
    profileForm.birthday = data.profile?.birthday ?? ''
    profileForm.gender = data.profile?.gender ?? ''
    profileForm.motto = data.profile?.motto ?? ''
    profileForm.timezone = data.profile?.timezone ?? ''
    profileForm.locale = data.profile?.locale ?? ''
    joinDateEditing.value = data.joinDate ?? ''
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
        displayName: profileForm.displayName || null,
        birthday: profileForm.birthday || null,
        gender: profileForm.gender || null,
        motto: profileForm.motto || null,
        timezone: profileForm.timezone || null,
        locale: profileForm.locale || null,
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

async function handleResetPassword() {
  if (!auth.token || !detail.value) return
  resetResult.value = null
  try {
    const result = await usersStore.resetPassword(detail.value.id)
    resetResult.value =
      result.temporaryPassword ??
      '密码已重置（使用指定密码）。请尽快通知用户修改。'
    toast.add({ title: '密码已重置', color: 'primary' })
  } catch (error) {
    console.warn('[admin] reset password failed', error)
    toast.add({ title: '密码重置失败', color: 'error' })
  }
}

async function handleDeleteUser() {
  if (!auth.token || !detail.value) return
  if (
    !window.confirm(
      `确定要删除 ${detail.value.profile?.displayName ?? detail.value.email ?? detail.value.id} 吗？该操作不可恢复。`,
    )
  ) {
    return
  }
  try {
    await usersStore.delete(detail.value.id)
    toast.add({ title: '用户已删除', color: 'primary' })
    await router.push({ name: 'admin.users' })
  } catch (error) {
    console.warn('[admin] delete user failed', error)
    toast.add({ title: '删除失败', color: 'error' })
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
  await fetchDetail()
})
</script>

<template>
  <div class="space-y-6">
    <UCard
      class="rounded-3xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <template #header>
        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
        >
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
                {{
                  detail?.profile?.displayName ?? detail?.email ?? '用户详情'
                }}
              </h1>
              <UBadge
                v-if="detail?.statusSnapshot?.status"
                color="primary"
                variant="soft"
              >
                {{ detail.statusSnapshot.status }}
              </UBadge>
            </div>
            <div
              class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span v-if="detail?.email">邮箱：{{ detail.email }}</span>
              <span v-if="detail?.name">用户名：{{ detail.name }}</span>
              <span>ID：{{ detail?.id ?? '—' }}</span>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="loading"
              @click="fetchDetail"
            >
              重新载入
            </UButton>
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              :disabled="loading"
              @click="handleResetPassword"
            >
              重置密码
            </UButton>
          </div>
        </div>
      </template>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="space-y-2">
          <p
            class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            PIIC
          </p>
          <div class="flex items-center gap-2">
            <span class="font-medium text-slate-900 dark:text-white">
              {{ detail?.profile?.piic ?? '—' }}
            </span>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              class="h-7 w-7 rounded-full p-0"
              icon="i-lucide-refresh-cw"
              :disabled="!detail || loading"
              @click="openPiicDialog"
            >
              <span class="sr-only">刷新 PIIC</span>
            </UButton>
          </div>
        </div>
        <div class="space-y-2">
          <p
            class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            加入时间
          </p>
          <div class="flex items-center gap-2">
            <UInput
              v-model="joinDateEditing"
              size="xs"
              class="max-w-40"
              placeholder="YYYY-MM-DD"
            />
            <UButton
              color="primary"
              size="xs"
              :loading="joinDateSaving"
              :disabled="!joinDateEditing"
              @click="saveJoinDate"
            >
              更新
            </UButton>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            注册于 {{ fmtDateTime(detail?.createdAt) }}
          </p>
        </div>
        <div class="space-y-2">
          <p
            class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            最近登录
          </p>
          <p class="font-medium text-slate-900 dark:text-white">
            {{ fmtDateTime(detail?.lastLoginAt) }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            IP：{{ detail?.lastLoginIp ?? '—' }}
          </p>
        </div>
        <div class="space-y-2">
          <p
            class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            主 Minecraft
          </p>
          <div v-if="primaryMinecraft" class="space-y-1 text-sm">
            <p class="font-medium text-slate-900 dark:text-white">
              {{
                primaryMinecraft.authmeBinding?.authmeUsername ??
                primaryMinecraft.nickname ??
                '—'
              }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              UUID：{{ primaryMinecraft.authmeUuid ?? primaryMinecraft.id }}
            </p>
          </div>
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">
            未绑定 Minecraft 账户。
          </p>
        </div>
      </div>
      <p
        v-if="resetResult"
        class="mt-4 rounded-2xl border border-emerald-200/50 bg-emerald-50/70 p-3 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/40 dark:text-emerald-200"
      >
        {{ resetResult }}
      </p>
      <p
        v-if="errorMsg"
        class="mt-4 rounded-2xl border border-red-200/60 bg-red-50/70 p-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/40 dark:text-red-200"
      >
        {{ errorMsg }}
      </p>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-base font-medium">权限配置</h2>
          <UBadge variant="soft" color="neutral" class="text-[11px]">
            RBAC
          </UBadge>
        </div>
      </template>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <p
            class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            角色
          </p>
          <USelectMenu
            :model-value="roleSelection"
            :items="roleOptions"
            multiple
            searchable
            size="sm"
            value-key="value"
            label-key="label"
            :disabled="roleSaving || loading"
            :loading="roleSaving || loading"
            placeholder="选择角色"
            @update:model-value="handleRolesUpdate"
          />
          <div class="mt-2 flex flex-wrap gap-1">
            <UBadge
              v-for="link in detail?.roles ?? []"
              :key="link.id"
              color="primary"
              variant="soft"
              class="text-[11px]"
            >
              {{ link.role.name ?? link.role.key }}
            </UBadge>
            <span
              v-if="(detail?.roles.length ?? 0) === 0"
              class="text-xs text-slate-400"
            >
              未分配
            </span>
          </div>
        </div>
        <div class="space-y-2">
          <p
            class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            标签
          </p>
          <USelectMenu
            :model-value="labelSelection"
            :items="labelOptions"
            multiple
            searchable
            size="sm"
            value-key="value"
            label-key="label"
            :disabled="labelSaving || loading"
            :loading="labelSaving || loading"
            placeholder="选择标签"
            @update:model-value="handleLabelsUpdate"
          />
          <div class="mt-2 flex flex-wrap gap-1">
            <UBadge
              v-for="link in detail?.permissionLabels ?? []"
              :key="link.id"
              :color="link.label.color ? 'primary' : 'neutral'"
              variant="soft"
              class="text-[11px]"
            >
              {{ link.label.name }}
            </UBadge>
            <span
              v-if="(detail?.permissionLabels?.length ?? 0) === 0"
              class="text-xs text-slate-400"
            >
              未分配
            </span>
          </div>
        </div>
      </div>
    </UCard>

    <div class="grid gap-6 xl:grid-cols-3">
      <UCard class="xl:col-span-2">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">基础资料</h2>
            <UButton
              :loading="profileSaving"
              color="primary"
              size="sm"
              @click="saveProfile"
            >
              保存资料
            </UButton>
          </div>
        </template>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormGroup label="显示名称">
            <UInput v-model="profileForm.displayName" placeholder="显示名称" />
          </UFormGroup>
          <UFormGroup label="语言">
            <USelect
              v-model="profileForm.locale"
              :options="[{ label: '中文（简体）', value: 'zh-CN' }]"
              placeholder="选择语言"
            />
          </UFormGroup>
          <UFormGroup label="时区">
            <UInput
              v-model="profileForm.timezone"
              placeholder="例如 Asia/Shanghai"
            />
          </UFormGroup>
          <UFormGroup label="性别">
            <USelect
              v-model="profileForm.gender"
              :options="[
                { label: '未指定', value: '' },
                { label: '男', value: 'MALE' },
                { label: '女', value: 'FEMALE' },
              ]"
              placeholder="选择性别"
            />
          </UFormGroup>
          <UFormGroup label="生日">
            <UInput v-model="profileForm.birthday" placeholder="YYYY-MM-DD" />
          </UFormGroup>
          <UFormGroup label="签名">
            <UTextarea
              v-model="profileForm.motto"
              :rows="3"
              placeholder="一句话介绍"
            />
          </UFormGroup>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-base font-medium">登录轨迹</h2>
        </template>
        <ul class="space-y-3">
          <li
            v-for="session in sessions"
            :key="session.id"
            class="rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-xs text-slate-600 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-slate-900 dark:text-white">
                {{ fmtDateTime(session.createdAt) }}
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                IP：{{ session.ipAddress ?? '—' }}
              </span>
            </div>
            <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              过期：{{ fmtDateTime(session.expiresAt) }}
            </p>
            <p
              class="mt-1 break-all text-[11px] text-slate-500 dark:text-slate-400"
            >
              UA：{{ session.userAgent ?? '—' }}
            </p>
          </li>
          <li
            v-if="sessions.length === 0"
            class="text-center text-sm text-slate-500 dark:text-slate-400"
          >
            暂无登录记录。
          </li>
        </ul>
      </UCard>
    </div>

    <div class="grid gap-6 xl:grid-cols-2">
      <UCard>
        <template #header>
          <h2 class="text-base font-medium">服务器账户</h2>
        </template>
        <div class="space-y-4">
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="profile in minecraftProfiles"
              :key="profile.id"
              :color="profile.isPrimary ? 'primary' : 'neutral'"
              variant="soft"
            >
              {{
                profile.authmeBinding?.authmeUsername ??
                profile.nickname ??
                '未命名'
              }}
            </UBadge>
            <span
              v-if="minecraftProfiles.length === 0"
              class="text-sm text-slate-500 dark:text-slate-400"
            >
              暂无 Minecraft 档案。
            </span>
          </div>
          <div class="divide-y divide-slate-200 dark:divide-slate-800">
            <div
              v-for="binding in detail?.authmeBindings ?? []"
              :key="binding.authmeUsername"
              class="py-3"
            >
              <div
                class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
              >
                <div class="space-y-1">
                  <p class="font-medium text-slate-900 dark:text-white">
                    {{ binding.authmeUsername }}
                    <span
                      v-if="binding.isPrimary"
                      class="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                    >
                      主账户
                    </span>
                  </p>
                  <div
                    class="grid gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-2"
                  >
                    <span>真实名：{{ binding.authmeRealname ?? '—' }}</span>
                    <span>绑定时间：{{ fmtDateTime(binding.boundAt) }}</span>
                    <span v-if="binding.lastlogin"
                      >上次登录：{{
                        fmtDateTime(
                          binding.lastlogin
                            ? dayjs(binding.lastlogin).toISOString()
                            : null,
                        )
                      }}</span
                    >
                    <span v-if="binding.regdate"
                      >注册时间：{{
                        fmtDateTime(
                          binding.regdate
                            ? dayjs(binding.regdate).toISOString()
                            : null,
                        )
                      }}</span
                    >
                    <span v-if="binding.ip">登录 IP：{{ binding.ip }}</span>
                    <span v-if="binding.regip"
                      >注册 IP：{{ binding.regip }}</span
                    >
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-if="binding.id"
                    size="xs"
                    color="primary"
                    variant="ghost"
                    @click="markPrimaryBinding(binding.id)"
                  >
                    设为主绑定
                  </UButton>
                  <UButton
                    v-if="binding.id"
                    size="xs"
                    color="error"
                    variant="soft"
                    @click="unbind(binding.id)"
                  >
                    解绑
                  </UButton>
                </div>
              </div>
            </div>
            <div
              v-if="(detail?.authmeBindings?.length ?? 0) === 0"
              class="py-6 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无绑定。
            </div>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">绑定流转记录</h2>
            <USkeleton v-if="historyLoading" class="h-4 w-24" />
          </div>
        </template>
        <ul class="space-y-3">
          <li
            v-for="entry in bindingHistory"
            :key="entry.id"
            class="rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-xs text-slate-600 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300"
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-900 dark:text-white">
                {{ entry.action }}
              </span>
              <span>{{ fmtDateTime(entry.createdAt) }}</span>
            </div>
            <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {{ entry.reason ?? '无备注' }}
            </p>
            <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              操作人：{{
                entry.operator?.profile?.displayName ??
                entry.operator?.email ??
                '系统'
              }}
            </p>
          </li>
          <li
            v-if="!historyLoading && bindingHistory.length === 0"
            class="text-center text-sm text-slate-500 dark:text-slate-400"
          >
            暂无流转记录。
          </li>
        </ul>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-base font-medium text-red-600 dark:text-red-400">
          危险操作
        </h2>
      </template>
      <div
        class="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300"
      >
        <p>删除用户会同时清除其会话、绑定与档案，且无法恢复。</p>
        <UButton
          color="error"
          variant="soft"
          size="sm"
          @click="handleDeleteUser"
        >
          删除该用户
        </UButton>
      </div>
    </UCard>

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
