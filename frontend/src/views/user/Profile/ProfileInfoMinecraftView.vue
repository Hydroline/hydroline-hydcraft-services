<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import ProfileHeader from './components/ProfileHeader.vue'
import ProfileSidebar from './components/ProfileSidebar.vue'
import MinecraftSection from './components/sections/MinecraftSection.vue'
import AuthmeBindDialog from './components/AuthmeBindDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'
import { useUiStore } from '@/stores/ui'
import { ApiError } from '@/utils/api'
import { normalizeLuckpermsBindings } from '@/utils/luckperms'

type SectionKey = 'basic' | 'minecraft' | 'sessions'

const auth = useAuthStore()
const ui = useUiStore()
const featureStore = useFeatureStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const bindingLoading = ref(false)
const bindingError = ref('')
const showBindDialog = ref(false)
const unbindLoading = ref(false)
const unbindError = ref('')
const showUnbindDialog = ref(false)
const authmeUnbindForm = ref({ username: '', password: '' })
const authmeBindingForm = ref({ authmeId: '', password: '' })

const isAuthenticated = computed(() => auth.isAuthenticated)
const bindingEnabled = computed(() => featureStore.flags.authmeBindingEnabled)

const sections: Array<{ id: SectionKey; label: string }> = [
  { id: 'basic', label: '基础资料' },
  { id: 'minecraft', label: '服务器账户' },
  { id: 'sessions', label: '会话管理' },
]

const activeId = computed<SectionKey>(() => {
  if (route.name === 'profile.info.sessions') return 'sessions'
  if (route.name === 'profile.info.minecraft') return 'minecraft'
  return 'basic'
})

function gotoSection(id: SectionKey) {
  if (id === 'basic') router.push({ name: 'profile.info.basic' })
  else if (id === 'minecraft') router.push({ name: 'profile.info.minecraft' })
  else router.push({ name: 'profile.info.sessions' })
}

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
    return many.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
  }
  const single = getObjectValue(user, 'authmeBinding')
  if (single && typeof single === 'object') return [single as Record<string, unknown>]
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
      (record as any).authmeUsername ?? (record as any).username ?? (record as any)['authme_username'] ?? null,
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
    const username = normalizeUsername((entry as any).authmeUsername ?? (entry as any).username ?? null)
    if (!username) continue
    const key = username.toLowerCase()
    const normalized = normalizedMap.get(key)
    const rawRealname = (entry as any).authmeRealname ?? (entry as any).realname ?? null
    const realname = typeof rawRealname === 'string' && rawRealname.trim().length > 0 ? rawRealname.trim() : normalized?.realname ?? null
    const permissions =
      normalized && (normalized.primaryGroup || normalized.groups.length)
        ? {
            primaryGroup: normalized.primaryGroup,
            primaryGroupDisplayName: normalized.primaryGroupDisplayName,
            groups: normalized.groups,
          }
        : null
    result.push({
      username,
      realname,
      boundAt: ((entry as any).boundAt ?? (entry as any).bound_at ?? null) as string | Date | null,
      ip: typeof (entry as any).ip === 'string' ? (entry as any).ip : null,
      ipLocation: normalizeLocationText(((entry as any).ip_location ?? (entry as any).ipLocation ?? null) as string | null),
      regip: typeof (entry as any).regip === 'string' ? (entry as any).regip : null,
      regipLocation: normalizeLocationText(((entry as any).regip_location ?? (entry as any).regipLocation ?? null) as string | null),
      lastlogin: typeof (entry as any).lastlogin === 'number' ? (entry as any).lastlogin : null,
      regdate: typeof (entry as any).regdate === 'number' ? (entry as any).regdate : null,
      permissions,
    })
  }
  return result
})

watch(showBindDialog, (open) => {
  if (!open) bindingError.value = ''
})

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

function requestUnbindAuthme(payload: { username: string; realname?: string | null }) {
  authmeUnbindForm.value.username = payload.username
  authmeUnbindForm.value.password = ''
  unbindError.value = ''
  showUnbindDialog.value = true
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

function openLoginDialog() { ui.openLoginDialog() }

const avatarUrl = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user) return null
  if (user.profile?.avatarUrl) return user.profile.avatarUrl as string
  if (user.image) return user.image as string
  return null
})
</script>

<template>
  <section class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-8">
    <div v-if="isAuthenticated" class="space-y-6">
      <ProfileHeader
        :avatar-url="avatarUrl"
        :display-name="auth.displayName ?? auth.user?.email ?? ''"
        :email="auth.user?.email ?? ''"
        :last-synced-text="''"
        :joined-text="''"
        :registered-text="''"
        :last-login-text="''"
        :last-login-ip="null"
        :loading="false"
        @refresh="() => {}"
      />
      <div class="flex flex-col gap-2 relative xl:flex-row xl:gap-6">
        <ProfileSidebar
          :items="sections"
          :active-id="activeId"
          :editing="false"
          @update:active-id="(id: string) => gotoSection(id as SectionKey)"
        />
        <div class="flex-1 space-y-6">
          <MinecraftSection
            :bindings="authmeBindings"
            :is-editing="false"
            :loading="bindingLoading"
            @add="showBindDialog = true"
            @unbind="requestUnbindAuthme"
          />
        </div>
      </div>

      <AuthmeBindDialog
        :open="showBindDialog"
        :loading="bindingLoading"
        :error="bindingError"
        @close="showBindDialog = false"
        @submit="(p) => { authmeBindingForm.authmeId = p.authmeId; authmeBindingForm.password = p.password; submitAuthmeBinding() }"
      />

      <!-- AuthMe 解绑 -->
      <UModal
        :open="showUnbindDialog"
        @update:open="(value: boolean) => { if (!value) handleCloseUnbindDialog() }"
      >
        <template #content>
          <UCard>
            <template #header>
              <div class="text-base font-semibold">解除 AuthMe 绑定</div>
            </template>
            <div class="space-y-4">
              <p class="text-sm text-slate-500 dark:text-slate-400">请输入对应 AuthMe 密码以确认解除绑定操作。</p>
              <UAlert icon="i-lucide-link-2-off" color="warning" variant="soft" title="目标账户" :description="authmeUnbindForm.username || '未知账号'" />
              <div class="space-y-2">
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300">AuthMe 密码</label>
                <UInput v-model="authmeUnbindForm.password" type="password" placeholder="请输入 AuthMe 密码" autocomplete="current-password" :disabled="unbindLoading" @keyup.enter="submitUnbindAuthme()" />
              </div>
              <p v-if="unbindError" class="text-sm text-rose-500">{{ unbindError }}</p>
            </div>
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton variant="ghost" :disabled="unbindLoading" @click="handleCloseUnbindDialog()">取消</UButton>
                <UButton color="warning" :loading="unbindLoading" @click="submitUnbindAuthme">确认解除</UButton>
              </div>
            </template>
          </UCard>
        </template>
      </UModal>
    </div>

    <UCard v-else class="flex flex-col items-center gap-4 bg-white/85 py-12 text-center shadow-sm backdrop-blur-sm dark:bg-slate-900/65">
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white">需要登录</h2>
      <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">登录后可查看与管理 Minecraft 绑定。</p>
      <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
    </UCard>
  </section>
</template>

<style scoped></style>
