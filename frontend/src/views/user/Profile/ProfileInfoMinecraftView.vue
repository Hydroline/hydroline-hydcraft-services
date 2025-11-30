<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, reactive, ref, watch } from 'vue'
import MinecraftSection from './components/sections/MinecraftSection.vue'
import NicknameSection from './components/sections/NicknameSection.vue'
import BindingHistorySection from './components/sections/BindingHistorySection.vue'
import AuthmeBindDialog from './components/AuthmeBindDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'
import { useUiStore } from '@/stores/ui'
import { ApiError, apiFetch } from '@/utils/api'
import { normalizeLuckpermsBindings } from '@/utils/luckperms'
import type { UserBindingHistoryEntry } from '@/types/profile'
const auth = useAuthStore()
const ui = useUiStore()
const featureStore = useFeatureStore()
const toast = useToast()

const bindingLoading = ref(false)
const bindingError = ref('')
const showBindDialog = ref(false)
const unbindLoading = ref(false)
const unbindError = ref('')
const showUnbindDialog = ref(false)
const authmeUnbindForm = ref({ username: '', password: '' })
const authmeBindingForm = ref({ authmeId: '', password: '' })
const primaryBindingLoading = ref<string | null>(null)

type BindingHistoryResponse = {
  items: UserBindingHistoryEntry[]
  pagination: {
    total: number
    page: number
    pageSize: number
    pageCount: number
  }
}

const HISTORY_PAGE_SIZE = 10
const historyLatestItems = ref<UserBindingHistoryEntry[]>([])
const historyLatestLoading = ref(false)
const historyDialogItems = ref<UserBindingHistoryEntry[]>([])
const historyDialogOpen = ref(false)
const historyDialogLoading = ref(false)
const historyPagination = ref<BindingHistoryResponse['pagination']>({
  total: 0,
  page: 1,
  pageSize: HISTORY_PAGE_SIZE,
  pageCount: 1,
})
const historyPageCount = computed(() =>
  Math.max(historyPagination.value.pageCount ?? 1, 1),
)

const isAuthenticated = computed(() => auth.isAuthenticated)
const bindingEnabled = computed(() => featureStore.flags.authmeBindingEnabled)
const primaryBindingId = computed(
  () => auth.user?.profile?.primaryAuthmeBindingId ?? null,
)

const nicknameProfiles = computed<NicknameProfile[]>(() => {
  const source = ((auth.user as Record<string, any> | null)?.nicknames ??
    []) as any[]
  if (!Array.isArray(source) || source.length === 0) return []
  return source.map((entry) => {
    const nickname =
      typeof entry?.nickname === 'string' ? entry.nickname.trim() : ''
    return {
      id: typeof entry?.id === 'string' ? entry.id : null,
      nickname,
      isPrimary: Boolean(entry?.isPrimary),
      source:
        typeof entry?.source === 'string' && entry.source.trim().length > 0
          ? entry.source.trim()
          : null,
      createdAt: entry?.createdAt ?? null,
      updatedAt: entry?.updatedAt ?? null,
    }
  })
})

const nicknameLoading = computed(() => auth.loading)

type NicknameProfile = {
  id: string | null
  nickname: string
  isPrimary: boolean
  source?: string | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
}

const nicknameDialogOpen = ref(false)
const nicknameDialogSubmitting = ref(false)
const nicknameDialogError = ref('')
const nicknameDeleteDialogOpen = ref(false)
const nicknameDeleteSubmitting = ref(false)
const nicknameDeleteTarget = ref<NicknameProfile | null>(null)
const nicknamePrimaryLoadingId = ref<string | null>(null)
const nicknameForm = reactive<{
  id: string | null
  nickname: string
  isPrimary: boolean
}>({
  id: null,
  nickname: '',
  isPrimary: false,
})

function getObjectValue(source: unknown, key: string): unknown {
  if (!source || typeof source !== 'object') return null
  return (source as Record<string, unknown>)[key] ?? null
}

function normalizeUsername(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value).trim()
  return ''
}

function usernameKey(value: unknown): string {
  const username = normalizeUsername(value)
  return username ? username.toLowerCase() : ''
}

const rawAuthmeBindings = computed<Record<string, unknown>[]>(() => {
  const user = auth.user as unknown
  const many = getObjectValue(user, 'authmeBindings')
  if (Array.isArray(many) && many.length > 0) {
    return many.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === 'object',
    )
  }
  const single = getObjectValue(user, 'authmeBinding')
  if (single && typeof single === 'object')
    return [single as Record<string, unknown>]
  return []
})

const luckpermsSnapshotMap = computed(() => {
  const user = auth.user as unknown
  const map = new Map<string, Record<string, unknown> | null>()
  const raw = getObjectValue(user, 'luckperms')
  if (!Array.isArray(raw)) return map
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const key = usernameKey(
      (record as any).authmeUsername ??
        (record as any).username ??
        (record as any)['authme_username'] ??
        null,
    )
    if (!key) continue
    map.set(key, record)
  }
  return map
})

const normalizedBindings = computed(() => {
  if (rawAuthmeBindings.value.length === 0) return []
  return normalizeLuckpermsBindings(rawAuthmeBindings.value, {
    luckpermsMap: luckpermsSnapshotMap.value,
  })
})

const normalizedBindingMap = computed(() => {
  const map = new Map<string, any>()
  for (const binding of normalizedBindings.value) {
    const key = usernameKey(binding.username)
    if (key) map.set(key, binding)
  }
  return map
})

function normalizeLocationText(value: string | null | undefined) {
  if (!value || typeof value !== 'string') return null
  const replaced = value.replace(/\s*·\s*/g, ' ').replace(/\|/g, ' ')
  const cleaned = replaced.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

const authmeBindings = computed(() => {
  if (rawAuthmeBindings.value.length === 0) return []
  const normalizedMap = normalizedBindingMap.value
  const result: any[] = []
  for (const entry of rawAuthmeBindings.value) {
    const bindingId =
      typeof (entry as any).id === 'string' ? (entry as any).id : null
    const username = normalizeUsername(
      (entry as any).authmeUsername ?? (entry as any).username ?? null,
    )
    if (!username) continue
    const key = username.toLowerCase()
    const normalized = normalizedMap.get(key)
    const rawRealname =
      (entry as any).authmeRealname ?? (entry as any).realname ?? null
    const realname =
      typeof rawRealname === 'string' && rawRealname.trim().length > 0
        ? rawRealname.trim()
        : (normalized?.realname ?? null)
    const permissions =
      normalized && (normalized.primaryGroup || normalized.groups.length)
        ? {
            primaryGroup: normalized.primaryGroup,
            primaryGroupDisplayName: normalized.primaryGroupDisplayName,
            groups: normalized.groups,
          }
        : null
    result.push({
      id: bindingId,
      username,
      realname,
      boundAt: ((entry as any).boundAt ?? (entry as any).bound_at ?? null) as
        | string
        | Date
        | null,
      ip: typeof (entry as any).ip === 'string' ? (entry as any).ip : null,
      ipLocation: normalizeLocationText(
        ((entry as any).ip_location ?? (entry as any).ipLocation ?? null) as
          | string
          | null,
      ),
      regip:
        typeof (entry as any).regip === 'string' ? (entry as any).regip : null,
      regipLocation: normalizeLocationText(
        ((entry as any).regip_location ??
          (entry as any).regipLocation ??
          null) as string | null,
      ),
      lastlogin:
        typeof (entry as any).lastlogin === 'number'
          ? (entry as any).lastlogin
          : null,
      regdate:
        typeof (entry as any).regdate === 'number'
          ? (entry as any).regdate
          : null,
      permissions,
      isPrimary: bindingId ? bindingId === primaryBindingId.value : false,
    })
  }
  return result
})

function resetHistoryState() {
  historyLatestItems.value = []
  historyLatestLoading.value = false
  historyDialogItems.value = []
  historyDialogLoading.value = false
  historyPagination.value = {
    total: 0,
    page: 1,
    pageSize: HISTORY_PAGE_SIZE,
    pageCount: 1,
  }
  historyDialogOpen.value = false
}

async function requestHistoryPage(page: number) {
  if (!isAuthenticated.value || !auth.user?.id) {
    throw new Error('NOT_AUTHENTICATED')
  }
  const params = new URLSearchParams({
    page: String(Math.max(page, 1)),
    pageSize: String(HISTORY_PAGE_SIZE),
  })
  return apiFetch<BindingHistoryResponse>(
    `/auth/me/bindings/history?${params.toString()}`,
    {
      token: auth.token ?? undefined,
    },
  )
}

async function fetchLatestHistory() {
  if (!isAuthenticated.value || !auth.user?.id) return
  historyLatestLoading.value = true
  try {
    const data = await requestHistoryPage(1)
    historyLatestItems.value = data.items ?? []
    historyDialogItems.value = data.items ?? []
    historyPagination.value = data.pagination
  } catch (error) {
    console.warn('[profile] load latest binding history failed', error)
    toast.add({ title: '加载流转记录失败', color: 'error' })
  } finally {
    historyLatestLoading.value = false
  }
}

async function fetchHistoryForDialog(page: number) {
  if (!isAuthenticated.value || !auth.user?.id) return
  historyDialogLoading.value = true
  try {
    const data = await requestHistoryPage(page)
    historyDialogItems.value = data.items ?? []
    historyPagination.value = data.pagination
    if (page === 1) {
      historyLatestItems.value = data.items ?? []
    }
  } catch (error) {
    console.warn('[profile] load binding history page failed', error)
    toast.add({ title: '加载流转记录失败', color: 'error' })
  } finally {
    historyDialogLoading.value = false
  }
}

function openHistoryDialog() {
  if (!isAuthenticated.value) {
    ui.openLoginDialog()
    return
  }
  historyDialogOpen.value = true
  void fetchHistoryForDialog(1)
}

function closeHistoryDialog() {
  historyDialogOpen.value = false
}

async function goToHistoryPage(page: number) {
  if (historyDialogLoading.value) return
  const totalPages = Math.max(historyPagination.value.pageCount ?? 1, 1)
  const target = Math.min(Math.max(page, 1), totalPages)
  if (target === historyPagination.value.page) return
  await fetchHistoryForDialog(target)
}

watch(showBindDialog, (open) => {
  if (!open) bindingError.value = ''
})

watch(
  () => isAuthenticated.value,
  (loggedIn) => {
    if (loggedIn) void fetchLatestHistory()
    else resetHistoryState()
  },
  { immediate: true },
)

async function submitAuthmeBinding() {
  if (!bindingEnabled.value) {
    bindingError.value = '当前未开放绑定功能'
    return
  }
  bindingError.value = ''
  bindingLoading.value = true
  try {
    await auth.bindAuthme({
      authmeId: authmeBindingForm.value.authmeId,
      password: authmeBindingForm.value.password,
    })
    authmeBindingForm.value.authmeId = ''
    authmeBindingForm.value.password = ''
    showBindDialog.value = false
    toast.add({ title: '绑定成功', color: 'success' })
  } catch (error) {
    if (error instanceof ApiError) bindingError.value = error.message
    else bindingError.value = '绑定失败，请稍后再试'
  } finally {
    bindingLoading.value = false
  }
}

function requestUnbindAuthme(payload: {
  username: string
  realname?: string | null
}) {
  authmeUnbindForm.value.username = payload.username
  authmeUnbindForm.value.password = ''
  unbindError.value = ''
  showUnbindDialog.value = true
}

function ensureAuthenticated(action: () => void) {
  if (!isAuthenticated.value) {
    ui.openLoginDialog()
    return
  }
  action()
}

function handleAddNickname() {
  ensureAuthenticated(() => openNicknameDialog())
}

function handleEditNickname(target: NicknameProfile) {
  ensureAuthenticated(() => openNicknameDialog(target))
}

function handleDeleteNickname(target: NicknameProfile) {
  ensureAuthenticated(() => openDeleteNickname(target))
}

function handleSetPrimaryNickname(target: NicknameProfile) {
  ensureAuthenticated(() => void setPrimaryNickname(target))
}

function resetNicknameForm() {
  nicknameForm.id = null
  nicknameForm.nickname = ''
  nicknameForm.isPrimary = false
}

function openNicknameDialog(target?: NicknameProfile | null) {
  if (target) {
    nicknameForm.id = target.id
    nicknameForm.nickname = target.nickname
    nicknameForm.isPrimary = target.isPrimary
  } else {
    resetNicknameForm()
  }
  nicknameDialogError.value = ''
  nicknameDialogOpen.value = true
}

function closeNicknameDialog(force = false) {
  if (nicknameDialogSubmitting.value && !force) return
  nicknameDialogOpen.value = false
  nicknameDialogError.value = ''
  if (!nicknameDialogSubmitting.value || force) {
    resetNicknameForm()
  }
}

async function submitNicknameDialog() {
  const value = nicknameForm.nickname.trim()
  if (!value) {
    nicknameDialogError.value = '请输入昵称'
    return
  }
  nicknameDialogError.value = ''
  nicknameDialogSubmitting.value = true
  try {
    if (nicknameForm.id) {
      await auth.updateMinecraftNickname(nicknameForm.id, {
        nickname: value,
        isPrimary: nicknameForm.isPrimary,
      })
      toast.add({ title: '昵称已更新', color: 'success' })
    } else {
      await auth.addMinecraftNickname({
        nickname: value,
        isPrimary: nicknameForm.isPrimary,
      })
      toast.add({ title: '昵称已新增', color: 'success' })
    }
    closeNicknameDialog(true)
  } catch (error) {
    nicknameDialogError.value =
      error instanceof ApiError ? error.message : '保存失败，请稍后重试'
  } finally {
    nicknameDialogSubmitting.value = false
  }
}

function openDeleteNickname(target: NicknameProfile) {
  nicknameDeleteTarget.value = target
  nicknameDeleteDialogOpen.value = true
}

function closeDeleteNickname(force = false) {
  if (nicknameDeleteSubmitting.value && !force) return
  nicknameDeleteDialogOpen.value = false
  if (!nicknameDeleteSubmitting.value || force) {
    nicknameDeleteTarget.value = null
  }
}

async function confirmDeleteNickname() {
  const target = nicknameDeleteTarget.value
  if (!target?.id) {
    closeDeleteNickname(true)
    return
  }
  nicknameDeleteSubmitting.value = true
  try {
    await auth.removeMinecraftNickname(target.id)
    toast.add({ title: '昵称已删除', color: 'warning' })
    closeDeleteNickname(true)
  } catch (error) {
    toast.add({
      title: '删除失败',
      description:
        error instanceof ApiError ? error.message : '删除失败，请稍后重试',
      color: 'error',
    })
  } finally {
    nicknameDeleteSubmitting.value = false
  }
}

async function setPrimaryNickname(target: NicknameProfile) {
  if (!target.id || target.isPrimary) return
  nicknamePrimaryLoadingId.value = target.id
  try {
    await auth.updateMinecraftNickname(target.id, { isPrimary: true })
    toast.add({ title: '已设为主昵称', color: 'success' })
  } catch (error) {
    toast.add({
      title: '设置失败',
      description:
        error instanceof ApiError ? error.message : '设置失败，请稍后重试',
      color: 'error',
    })
  } finally {
    nicknamePrimaryLoadingId.value = null
  }
}

async function submitUnbindAuthme() {
  if (!authmeUnbindForm.value.password.trim()) {
    unbindError.value = '请输入 AuthMe 密码'
    return
  }
  unbindError.value = ''
  unbindLoading.value = true
  try {
    await auth.unbindAuthme({
      username: authmeUnbindForm.value.username || undefined,
      password: authmeUnbindForm.value.password,
    })
    handleCloseUnbindDialog(true)
    toast.add({ title: '已解除绑定', color: 'warning' })
  } catch (error) {
    if (error instanceof ApiError) unbindError.value = error.message
    else unbindError.value = '解绑失败，请稍后再试'
  } finally {
    unbindLoading.value = false
  }
}

function handleCloseUnbindDialog(force = false) {
  if (unbindLoading.value && !force) return
  showUnbindDialog.value = false
  authmeUnbindForm.value.password = ''
  if (force || !unbindLoading.value) authmeUnbindForm.value.username = ''
  unbindError.value = ''
}

function openLoginDialog() {
  ui.openLoginDialog()
}

async function setPrimaryBinding(bindingId: string | null) {
  if (!bindingId || bindingId === primaryBindingId.value) return
  primaryBindingLoading.value = bindingId
  try {
    await auth.setPrimaryAuthmeBinding(bindingId)
    toast.add({ title: '已设为主账号', color: 'success' })
  } catch (error) {
    toast.add({
      title: '设置失败',
      description: error instanceof ApiError ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    primaryBindingLoading.value = null
  }
}
</script>

<template>
  <div v-if="isAuthenticated" class="space-y-6">
    <NicknameSection
      :nicknames="nicknameProfiles"
      :loading="nicknameLoading"
      :primary-loading-id="nicknamePrimaryLoadingId"
      @add="handleAddNickname"
      @edit="handleEditNickname"
      @delete="handleDeleteNickname"
      @set-primary="handleSetPrimaryNickname"
    />

    <MinecraftSection
      :bindings="authmeBindings"
      :is-editing="false"
      :loading="bindingLoading"
      :primary-loading-id="primaryBindingLoading"
      @add="showBindDialog = true"
      @unbind="requestUnbindAuthme"
      @set-primary="(payload) => setPrimaryBinding(payload.id)"
    />

    <BindingHistorySection
      :entries="historyLatestItems"
      :loading="historyLatestLoading"
      @view-all="openHistoryDialog"
    />

    <AuthmeBindDialog
      :open="showBindDialog"
      :loading="bindingLoading"
      :error="bindingError"
      @close="showBindDialog = false"
      @submit="
        (p) => {
          authmeBindingForm.authmeId = p.authmeId
          authmeBindingForm.password = p.password
          submitAuthmeBinding()
        }
      "
    />

    <UModal
      :open="historyDialogOpen"
      @update:open="
        (value: boolean) => {
          if (!value) closeHistoryDialog()
        }
      "
      :ui="{
        content:
          'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="text-base font-semibold">流转记录</div>
              <div
                class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
              >
                <span v-if="historyPagination.total">
                  共 {{ historyPagination.total }} 条记录
                </span>
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  size="xs"
                  @click="closeHistoryDialog()"
                />
              </div>
            </div>
          </template>
          <div class="space-y-3">
            <div v-if="historyDialogLoading" class="space-y-3">
              <div
                v-for="n in 3"
                :key="`history-modal-skeleton-${n}`"
                class="rounded-xl border border-slate-200/60 bg-white/80 p-4 dark:border-slate-800/60 dark:bg-slate-800/60"
              >
                <div class="flex items-center justify-between">
                  <USkeleton class="h-4 w-32" animated />
                  <USkeleton class="h-4 w-24" animated />
                </div>
                <div class="mt-3 space-y-2">
                  <USkeleton class="h-3 w-full" animated />
                  <USkeleton class="h-3 w-3/4" animated />
                </div>
              </div>
            </div>
            <div
              v-else-if="historyDialogItems.length === 0"
              class="rounded-xl border border-dashed border-slate-200/70 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
            >
              暂无流转记录
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="entry in historyDialogItems"
                :key="entry.id"
                class="rounded-xl border border-slate-200/60 bg-white p-4 text-sm text-slate-600 dark:border-slate-800/60 dark:bg-slate-700/60 dark:text-slate-200"
              >
                <div
                  class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div
                    class="text-base font-semibold text-slate-900 dark:text-white"
                  >
                    {{ entry.action || '未知操作' }}
                  </div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">
                    {{ new Date(entry.createdAt).toLocaleString() }}
                  </div>
                </div>
                <p class="mt-2 text-slate-600 dark:text-slate-300">
                  {{ entry.reason || '无备注' }}
                </p>
                <div class="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <div class="text-slate-500 dark:text-slate-400">
                      关联账号
                    </div>
                    <div
                      class="text-base font-semibold text-slate-800 dark:text-slate-100"
                    >
                      {{
                        entry.binding?.authmeRealname ||
                        entry.binding?.authmeUsername ||
                        '—'
                      }}
                    </div>
                  </div>
                  <div>
                    <div class="text-slate-500 dark:text-slate-400">操作人</div>
                    <div
                      class="text-base font-semibold text-slate-800 dark:text-slate-100"
                    >
                      {{
                        entry.operator?.profile?.displayName ||
                        entry.operator?.email ||
                        '系统'
                      }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <template #footer>
            <div
              class="flex flex-col gap-3 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                第 {{ historyPagination.page }} / {{ historyPageCount }} 页 · 共
                {{ historyPagination.total }} 条
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  size="sm"
                  variant="ghost"
                  icon="i-lucide-chevrons-left"
                  :disabled="
                    historyPagination.page <= 1 || historyDialogLoading
                  "
                  @click="goToHistoryPage(1)"
                />
                <UButton
                  size="sm"
                  variant="ghost"
                  icon="i-lucide-chevron-left"
                  :disabled="
                    historyPagination.page <= 1 || historyDialogLoading
                  "
                  @click="goToHistoryPage(historyPagination.page - 1)"
                />
                <UButton
                  size="sm"
                  variant="ghost"
                  icon="i-lucide-chevron-right"
                  :disabled="
                    historyPagination.page >= historyPageCount ||
                    historyDialogLoading
                  "
                  @click="goToHistoryPage(historyPagination.page + 1)"
                />
                <UButton
                  size="sm"
                  variant="ghost"
                  icon="i-lucide-chevrons-right"
                  :disabled="
                    historyPagination.page >= historyPageCount ||
                    historyDialogLoading
                  "
                  @click="goToHistoryPage(historyPageCount)"
                />
              </div>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      :open="showUnbindDialog"
      @update:open="
        (value: boolean) => {
          if (!value) handleCloseUnbindDialog()
        }
      "
      :ui="{ content: 'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="text-base font-semibold">解除 AuthMe 绑定</div>
          </template>
          <div class="space-y-4">
            <p class="text-sm text-slate-500 dark:text-slate-400">
              请输入对应 AuthMe 密码以确认解除绑定操作。
            </p>
            <UAlert
              icon="i-lucide-link-2-off"
              color="warning"
              variant="soft"
              title="目标账户"
              :description="authmeUnbindForm.username || '未知账号'"
            />
            <div class="space-y-2">
              <label
                class="block text-sm font-medium text-slate-600 dark:text-slate-300"
                >AuthMe 密码</label
              >
              <UInput
                v-model="authmeUnbindForm.password"
                type="password"
                placeholder="请输入 AuthMe 密码"
                autocomplete="current-password"
                :disabled="unbindLoading"
                @keyup.enter="submitUnbindAuthme()"
              />
            </div>
            <p v-if="unbindError" class="text-sm text-rose-500">
              {{ unbindError }}
            </p>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                :disabled="unbindLoading"
                @click="handleCloseUnbindDialog()"
                >取消</UButton
              >
              <UButton
                color="warning"
                :loading="unbindLoading"
                @click="submitUnbindAuthme"
                >确认解除</UButton
              >
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      :open="nicknameDialogOpen"
      @update:open="
        (value: boolean) => {
          if (!value) closeNicknameDialog()
        }
      "
      :ui="{ content: 'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="text-base font-semibold">
              {{ nicknameForm.id ? '编辑昵称' : '新增昵称' }}
            </div>
          </template>
          <div class="space-y-4">
            <div class="space-y-2">
              <label
                class="block text-sm font-medium text-slate-600 dark:text-slate-300"
                >昵称</label
              >
              <UInput
                class="w-full"
                v-model="nicknameForm.nickname"
                placeholder="请输入常用昵称"
                :disabled="nicknameDialogSubmitting"
                @keyup.enter="submitNicknameDialog"
              />
            </div>
            <div
              class="flex items-center justify-between rounded-lg border border-slate-200/60 px-3 py-2 text-sm dark:border-slate-700/60"
            >
              <div>
                <p class="font-medium text-slate-700 dark:text-slate-200">
                  设为主昵称
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  保存后在站内优先展示该昵称
                </p>
              </div>
              <USwitch
                v-model="nicknameForm.isPrimary"
                :disabled="nicknameDialogSubmitting"
              />
            </div>
            <p v-if="nicknameDialogError" class="text-sm text-rose-500">
              {{ nicknameDialogError }}
            </p>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                :disabled="nicknameDialogSubmitting"
                @click="closeNicknameDialog()"
                >取消</UButton
              >
              <UButton
                color="primary"
                :loading="nicknameDialogSubmitting"
                @click="submitNicknameDialog"
                >保存</UButton
              >
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      :open="nicknameDeleteDialogOpen"
      @update:open="
        (value: boolean) => {
          if (!value) closeDeleteNickname()
        }
      "
      :ui="{ content: 'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="text-base font-semibold">删除昵称</div>
          </template>
          <div class="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p>
              确认删除「{{
                nicknameDeleteTarget?.nickname || '未命名'
              }}」？该操作不可撤销。
            </p>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                :disabled="nicknameDeleteSubmitting"
                @click="closeDeleteNickname()"
                >取消</UButton
              >
              <UButton
                color="error"
                :loading="nicknameDeleteSubmitting"
                @click="confirmDeleteNickname"
                >删除</UButton
              >
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>

  <UCard
    v-else
    class="flex flex-col items-center gap-4 bg-white/85 py-12 text-center shadow-sm backdrop-blur-sm dark:bg-slate-900/65"
  >
    <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
      需要登录
    </h2>
    <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">
      登录后可查看与管理 Minecraft 绑定。
    </p>
    <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
  </UCard>
</template>

<style scoped></style>
