<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { apiFetch, ApiError } from '@/utils/api'
import type { AdminBindingHistoryEntry, AdminUserDetail } from '@/types/admin'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const userId = computed(() => route.params.userId as string)
const loading = ref(false)
const saving = ref(false)
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

const joinDateEditing = ref<string | null>(null)

function fmt(ts?: string | null) {
  if (!ts) return '—'
  return dayjs(ts).format('YYYY-MM-DD HH:mm')
}

async function fetchDetail() {
  if (!auth.token) return
  loading.value = true
  errorMsg.value = null
  try {
    const data = await apiFetch<AdminUserDetail>(`/auth/users/${userId.value}`, { token: auth.token })
    detail.value = data
    // hydrate forms
    profileForm.displayName = data.profile?.displayName ?? ''
    profileForm.birthday = data.profile?.birthday ?? ''
    profileForm.gender = (data.profile as any)?.gender ?? ''
    profileForm.motto = data.profile?.motto ?? ''
    profileForm.timezone = data.profile?.timezone ?? ''
    profileForm.locale = data.profile?.locale ?? ''
    joinDateEditing.value = data.joinDate ?? ''
    await fetchBindingHistory()
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function fetchBindingHistory() {
  if (!auth.token || !detail.value) return
  historyLoading.value = true
  try {
    const data = await apiFetch<{ items: AdminBindingHistoryEntry[] }>(
      `/auth/users/${detail.value.id}/bindings/history?page=1&pageSize=20`,
      { token: auth.token },
    )
    bindingHistory.value = data.items
  } finally {
    historyLoading.value = false
  }
}

async function saveProfile() {
  if (!auth.token || !detail.value) return
  saving.value = true
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
    await fetchDetail()
  } finally {
    saving.value = false
  }
}

async function saveJoinDate() {
  if (!auth.token || !detail.value) return
  if (!joinDateEditing.value) return
  saving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/join-date`, {
      method: 'PATCH',
      token: auth.token,
      body: { joinDate: joinDateEditing.value },
    })
    await fetchDetail()
  } finally {
    saving.value = false
  }
}

onMounted(fetchDetail)

async function handleResetPassword() {
  if (!auth.token || !detail.value) return
  resetResult.value = null
  const result = await apiFetch<{ temporaryPassword: string | null }>(
    `/auth/users/${detail.value.id}/reset-password`,
    {
      method: 'POST',
      token: auth.token,
    },
  )
  resetResult.value =
    result.temporaryPassword ??
    '已重置密码（使用指定密码），请通知用户及时修改。'
}

async function handleDeleteUser() {
  if (!auth.token || !detail.value) return
  if (
    !window.confirm(
      `确定要删除 ${detail.value.email ?? detail.value.id} 吗？该操作不可恢复。`,
    )
  ) {
    return
  }
  await apiFetch(`/auth/users/${detail.value.id}`, {
    method: 'DELETE',
    token: auth.token,
  })
  await router.push({ name: 'admin.users' })
}

async function markPrimaryBinding(bindingId: string) {
  if (!auth.token || !detail.value) return
  await apiFetch(
    `/auth/users/${detail.value.id}/bindings/${bindingId}/primary`,
    { method: 'PATCH', token: auth.token },
  )
  await Promise.all([fetchDetail(), fetchBindingHistory()])
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="flex items-baseline gap-3">
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          {{ detail?.profile?.displayName ?? detail?.email ?? '用户详情' }}
        </h1>
        <span v-if="detail?.email" class="text-sm text-slate-500 dark:text-slate-400">{{ detail.email }}</span>
      </div>
      <div class="text-xs text-slate-600 dark:text-slate-300">
        <span class="mr-4">注册于：{{ fmt(detail?.createdAt) }}</span>
        <span class="mr-4">加入于：{{ fmt(detail?.joinDate) }}</span>
        <span class="mr-4">上次登录：{{ fmt(detail?.lastLoginAt) }}</span>
        <span>上次登录 IP：{{ detail?.lastLoginIp ?? '—' }}</span>
      </div>
      <div class="flex gap-2">
        <UButton color="primary" variant="soft" size="xs" @click="handleResetPassword">重置密码</UButton>
        <UButton color="red" variant="soft" size="xs" @click="handleDeleteUser">删除用户</UButton>
      </div>
    </header>
    <p v-if="resetResult" class="text-xs text-emerald-600 dark:text-emerald-400">
      {{ resetResult }}
    </p>
    <p v-if="errorMsg" class="text-sm text-red-500">{{ errorMsg }}</p>

    <div class="grid gap-6 md:grid-cols-2">
      <!-- 基础资料编辑 -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">基础资料</h2>
            <UButton :loading="saving" color="primary" size="xs" @click="saveProfile">保存</UButton>
          </div>
        </template>
        <div class="grid gap-4">
          <UFormGroup label="显示名称">
            <UInput v-model="profileForm.displayName" placeholder="显示名称" />
          </UFormGroup>
          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="语言">
              <USelect v-model="profileForm.locale" :options="[{ label: '中文（简体）', value: 'zh-CN' }]"/>
            </UFormGroup>
            <UFormGroup label="时区">
              <UInput v-model="profileForm.timezone" placeholder="例如 Asia/Shanghai" />
            </UFormGroup>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="性别">
              <USelect v-model="profileForm.gender" :options="[
                { label: '未指定', value: 'UNSPECIFIED' },
                { label: '男', value: 'MALE' },
                { label: '女', value: 'FEMALE' },
              ]"/>
            </UFormGroup>
            <UFormGroup label="生日">
              <UInput v-model="profileForm.birthday" placeholder="YYYY-MM-DD" />
            </UFormGroup>
          </div>
          <UFormGroup label="签名">
            <UTextarea v-model="profileForm.motto" :rows="3" placeholder="一句话介绍"/>
          </UFormGroup>
        </div>
      </UCard>

      <!-- 入服日期 -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">入服信息</h2>
            <UButton :loading="saving" color="primary" size="xs" @click="saveJoinDate">保存</UButton>
          </div>
        </template>
        <div class="grid gap-4">
          <UFormGroup label="入服日期">
            <UInput v-model="joinDateEditing" placeholder="YYYY-MM-DD" />
            <p class="mt-1 text-xs text-slate-500">默认等于注册时间，可由管理员调整。</p>
          </UFormGroup>
        </div>
      </UCard>
    </div>

    <!-- Minecraft 绑定信息 -->
    <UCard>
      <template #header>
        <h2 class="text-base font-medium">服务器账户</h2>
      </template>
      <div class="divide-y divide-slate-200 dark:divide-slate-800">
        <div
          v-for="b in detail?.authmeBindings ?? []"
          :key="b.authmeUsername"
          class="py-3"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="font-medium text-slate-900 dark:text-white">{{ b.authmeUsername }}</div>
              <div class="mt-1 grid grid-cols-1 gap-1 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-2 md:grid-cols-3">
                <div>真实名：{{ b.authmeRealname ?? '—' }}</div>
                <div>绑定时间：{{ fmt(b.boundAt) }}</div>
                <div v-if="b.lastlogin">上次登录：{{ new Date(b.lastlogin).toLocaleString() }}</div>
                <div v-if="b.regdate">注册时间：{{ new Date(b.regdate).toLocaleString() }}</div>
                <div v-if="b.ip">上次登录 IP：{{ b.ip }}</div>
                <div v-if="b.regip">注册 IP：{{ b.regip }}</div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UBadge color="neutral" variant="soft">AuthMe</UBadge>
              <UButton
                v-if="b.id"
                size="xs"
                color="primary"
                variant="ghost"
                @click="markPrimaryBinding(b.id)"
              >
                设为主绑定
              </UButton>
            </div>
          </div>
        </div>
        <div v-if="(detail?.authmeBindings?.length ?? 0) === 0" class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          暂无绑定。
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-base font-medium">权限标签</h2>
      </template>
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="link in detail?.permissionLabels ?? []"
          :key="link.id"
          :color="link.label.color ? 'primary' : 'neutral'"
          variant="soft"
        >
          {{ link.label.name }}
        </UBadge>
        <span v-if="(detail?.permissionLabels?.length ?? 0) === 0" class="text-sm text-slate-500 dark:text-slate-400">
          尚未分配权限标签。
        </span>
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
            <span class="font-semibold text-slate-900 dark:text-white">{{ entry.action }}</span>
            <span>{{ new Date(entry.createdAt).toLocaleString() }}</span>
          </div>
          <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {{ entry.reason ?? '无备注' }}
          </p>
          <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            操作人：{{ entry.operator?.profile?.displayName ?? entry.operator?.email ?? '系统' }}
          </p>
        </li>
        <li v-if="!historyLoading && bindingHistory.length === 0" class="text-center text-sm text-slate-500 dark:text-slate-400">
          暂无流转记录。
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-base font-medium text-red-600 dark:text-red-400">危险操作</h2>
      </template>
      <div class="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
        <p>删除用户会同时清除其会话、绑定与档案，且无法恢复。</p>
        <UButton color="red" variant="soft" size="sm" @click="handleDeleteUser">
          删除该用户
        </UButton>
      </div>
    </UCard>
  </div>
</template>
