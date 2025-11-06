<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
// UserAvatar 不再在本视图中直接使用
import ProfileHeader from './components/ProfileHeader.vue'
// 顶部整体编辑横幅已移除，改为卡片内编辑
import ProfileSidebar from './components/ProfileSidebar.vue'
import BasicSection from './components/sections/BasicSection.vue'
import MinecraftSection from './components/sections/MinecraftSection.vue'
import SessionsSection from './components/sections/SessionsSection.vue'
import AuthmeBindDialog from './components/AuthmeBindDialog.vue'
import { getTimezones } from '@/utils/timezones'
import {
  useAuthStore,
  type GenderType,
  type UpdateCurrentUserPayload,
} from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'
import { useUiStore } from '@/stores/ui'
import { ApiError } from '@/utils/api'
import {
  normalizeLuckpermsBindings,
  type NormalizedLuckpermsBinding,
} from '@/utils/luckperms'

type FormState = {
  name: string
  displayName: string
  email: string
  gender: GenderType
  birthday: string
  motto: string
  timezone: string
  locale: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  phone: string
  phoneCountry?: 'CN' | 'HK' | 'MO' | 'TW'
  regionCountry?: string
  regionProvince?: string
  regionCity?: string
  regionDistrict?: string
}

type SectionKey = 'basic' | 'minecraft' | 'sessions'

// 旧的字段定义移除

type SessionItem = {
  id: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  ipAddress: string | null
  ipLocation: string | null
  userAgent: string | null
  isCurrent: boolean
}

const auth = useAuthStore()
const ui = useUiStore()
const featureStore = useFeatureStore()
const toast = useToast()

const isAuthenticated = computed(() => auth.isAuthenticated)
const loading = ref(false)
const saving = ref(false)
const lastSyncedAt = ref<string | null>(null)
const initialSnapshot = ref('')
const bindingLoading = ref(false)
const bindingError = ref('')
const unbindLoading = ref(false)
const unbindError = ref('')
const activeSection = ref<SectionKey>('basic')
// 任一卡片正在编辑
const isEditingAny = ref(false)
// 侧边栏切换拦截
const showLeaveConfirm = ref(false)
type PendingAction =
  | { kind: 'sidebar'; target: SectionKey }
  | { kind: 'card'; target: 'basic' | 'region' }
const pendingAction = ref<PendingAction | null>(null)
const leaveConfirmDescription = computed(() =>
  pendingAction.value?.kind === 'card'
    ? '切换卡片将放弃当前修改，是否确认？'
    : '切换菜单将放弃本次编辑，是否确认？',
)
// 子组件重置编辑状态用
const resetSignal = ref(0)
const sessions = ref<SessionItem[]>([])
const sessionsLoading = ref(false)
const sessionsLoaded = ref(false)
const sessionsError = ref('')
const revokingSessionId = ref<string | null>(null)
const basicSectionRef = ref<InstanceType<typeof BasicSection> | null>(null)
// 解绑 / 终止会话确认弹窗
const showUnbindDialog = ref(false)
const showRevokeConfirm = ref(false)
const revokeTargetId = ref<string | null>(null)
const authmeUnbindForm = reactive({ username: '', password: '' })

const genderOptions: Array<{ label: string; value: GenderType }> = [
  { label: '未指定', value: 'UNSPECIFIED' },
  { label: '男性', value: 'MALE' },
  { label: '女性', value: 'FEMALE' },
]

const addressFields = [
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'phone',
] as const satisfies readonly (keyof FormState)[]

const sections: Array<{
  id: SectionKey
  label: string
}> = [
  {
    id: 'basic',
    label: '基础资料',
  },
  {
    id: 'minecraft',
    label: '玩家绑定信息',
  },
  {
    id: 'sessions',
    label: '会话管理',
  },
]

function normalizeLocationText(value: string | null | undefined) {
  if (!value || typeof value !== 'string') {
    return null
  }
  const replaced = value.replace(/\s*·\s*/g, ' ').replace(/\|/g, ' ')
  const cleaned = replaced.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

const form = reactive<FormState>({
  name: '',
  displayName: '',
  email: '',
  gender: 'UNSPECIFIED',
  birthday: '',
  motto: '',
  timezone: '',
  locale: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  phone: '',
  phoneCountry: 'CN',
  regionCountry: '',
  regionProvince: '',
  regionCity: '',
  regionDistrict: '',
})

const authmeBindingForm = reactive({
  authmeId: '',
  password: '',
})

const timezoneOptions = ref(
  getTimezones().map((tz) => ({ label: tz, value: tz })),
)
const languageOptions = ref([{ label: '中文（简体）', value: 'zh-CN' }])
const showBindDialog = ref(false)

const hasChanges = computed(() => serializeForm() !== initialSnapshot.value)

// 顶部标题已移除，无需 currentSection

const bindingEnabled = computed(() => featureStore.flags.authmeBindingEnabled)

function getObjectValue(source: unknown, key: string): unknown {
  if (!source || typeof source !== 'object') {
    return null
  }
  return (source as Record<string, unknown>)[key] ?? null
}

function normalizeUsername(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : ''
  }
  if (typeof value === 'number') {
    const converted = String(value).trim()
    return converted.length > 0 ? converted : ''
  }
  return ''
}

function usernameKey(value: unknown): string {
  const username = normalizeUsername(value)
  return username ? username.toLowerCase() : ''
}

type BindingViewModel = {
  username: string
  realname: string | null
  boundAt: string | Date | null
  ip: string | null
  ipLocation: string | null
  regip: string | null
  regipLocation: string | null
  lastlogin: number | null
  regdate: number | null
  permissions: {
    primaryGroup: string | null
    groups: NormalizedLuckpermsBinding['groups']
  } | null
}
const rawAuthmeBindings = computed<Record<string, unknown>[]>(() => {
  const user = auth.user as unknown
  const many = getObjectValue(user, 'authmeBindings')
  if (Array.isArray(many) && many.length > 0) {
    return many.filter((entry): entry is Record<string, unknown> => {
      return Boolean(entry) && typeof entry === 'object'
    })
  }
  const single = getObjectValue(user, 'authmeBinding')
  if (single && typeof single === 'object') {
    return [single as Record<string, unknown>]
  }
  return []
})

const luckpermsSnapshotMap = computed(() => {
  const user = auth.user as unknown
  const map = new Map<string, Record<string, unknown> | null>()
  const raw = getObjectValue(user, 'luckperms')
  if (!Array.isArray(raw)) {
    return map
  }
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const key = usernameKey(
      record.authmeUsername ?? record.username ?? record['authme_username'] ?? null,
    )
    if (!key) continue
    map.set(key, record)
  }
  return map
})

const normalizedBindings = computed(() => {
  if (rawAuthmeBindings.value.length === 0) {
    return [] as NormalizedLuckpermsBinding[]
  }
  return normalizeLuckpermsBindings(rawAuthmeBindings.value, {
    luckpermsMap: luckpermsSnapshotMap.value,
  })
})

const normalizedBindingMap = computed(() => {
  const map = new Map<string, NormalizedLuckpermsBinding>()
  for (const binding of normalizedBindings.value) {
    const key = usernameKey(binding.username)
    if (key) {
      map.set(key, binding)
    }
  }
  return map
})

const authmeBindings = computed<BindingViewModel[]>(() => {
  if (rawAuthmeBindings.value.length === 0) {
    return []
  }
  const normalizedMap = normalizedBindingMap.value
  const result: BindingViewModel[] = []
  for (const entry of rawAuthmeBindings.value) {
    const username = normalizeUsername(entry.authmeUsername ?? entry.username ?? null)
    if (!username) {
      continue
    }
    const key = username.toLowerCase()
    const normalized = normalizedMap.get(key)
    const rawRealname = entry.authmeRealname ?? entry.realname ?? null
    const realname =
      typeof rawRealname === 'string' && rawRealname.trim().length > 0
        ? rawRealname.trim()
        : normalized?.realname ?? null

    const permissions =
      normalized && (normalized.primaryGroup || normalized.groups.length)
        ? {
            primaryGroup: normalized.primaryGroup,
            groups: normalized.groups,
          }
        : null

    result.push({
      username,
      realname,
      boundAt: (entry.boundAt ?? entry.bound_at ?? null) as string | Date | null,
      ip: typeof entry.ip === 'string' ? entry.ip : null,
      ipLocation: normalizeLocationText(
        (entry.ip_location ?? entry.ipLocation ?? null) as string | null,
      ),
      regip: typeof entry.regip === 'string' ? entry.regip : null,
      regipLocation: normalizeLocationText(
        (entry.regip_location ?? entry.regipLocation ?? null) as string | null,
      ),
      lastlogin: typeof entry.lastlogin === 'number' ? entry.lastlogin : null,
      regdate: typeof entry.regdate === 'number' ? entry.regdate : null,
      permissions,
    })
  }
  return result
})

const avatarUrl = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user) return null
  if (user.profile?.avatarUrl) return user.profile.avatarUrl as string
  if (user.image) return user.image as string
  return null
})

const lastSyncedText = computed(() => {
  if (!lastSyncedAt.value) return '尚未同步'
  return dayjs(lastSyncedAt.value).format('YYYY年MM月DD日 HH:mm')
})

const registeredText = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user?.createdAt) return ''
  return dayjs(user.createdAt).format('YYYY年M月D日 HH:mm')
})

const joinedText = computed(() => {
  const user = auth.user as Record<string, any> | null
  const joinDate = (user as any)?.joinDate ?? user?.createdAt
  if (!joinDate) return ''
  return dayjs(joinDate).format('YYYY年M月D日')
})

const lastLoginText = computed(() => {
  const user = auth.user as Record<string, any> | null
  const t = (user as any)?.lastLoginAt
  if (!t) return ''
  return dayjs(t).format('YYYY年MM月DD日 HH:mm')
})

const lastLoginIp = computed(() => {
  const user = auth.user as Record<string, any> | null
  return ((user as any)?.lastLoginIp as string | null) ?? null
})

const lastLoginIpLocation = computed(() => {
  const user = auth.user as Record<string, any> | null
  const location =
    ((user as any)?.lastLoginIpLocation ??
      (user as any)?.lastLoginIpLocationRaw ??
      null) as string | null
  return normalizeLocationText(location)
})

const lastLoginIpDisplay = computed(() => {
  const ip = lastLoginIp.value
  if (!ip) return ''
  const location = lastLoginIpLocation.value
  return location ? `${ip}（${location}）` : ip
})

watch(
  () => auth.user,
  (user) => {
    if (!user) {
      resetForm()
      return
    }
    populateForm(user)
  },
  { immediate: true },
)

watch(
  () => auth.isAuthenticated,
  (value) => {
    if (value) {
      sessionsLoaded.value = false
      sessionsError.value = ''
      void loadUser()
    } else {
      resetForm()
      sessions.value = []
      sessionsLoaded.value = false
      sessionsError.value = ''
      revokingSessionId.value = null
    }
  },
)

// 卡片级编辑由子组件管理

watch(showBindDialog, (open) => {
  if (!open) {
    bindingError.value = ''
  }
})

watch(
  () => activeSection.value,
  (section) => {
    if (section === 'sessions') {
      void loadSessions()
    }
  },
)

onMounted(() => {
  if (auth.isAuthenticated) {
    void loadUser()
  }
})

function handleSidebarBlocked(id: string) {
  if (id === activeSection.value) {
    return
  }
  // 若没有任何改动，直接切换且重置编辑状态，无需弹窗
  if (!hasChanges.value) {
    resetSignal.value++
    isEditingAny.value = false
    activeSection.value = id as SectionKey
    return
  }
  pendingAction.value = { kind: 'sidebar', target: id as SectionKey }
  showLeaveConfirm.value = true
}

function handleCardGuard(target: 'basic' | 'region') {
  pendingAction.value = { kind: 'card', target }
  showLeaveConfirm.value = true
}

function resetForm() {
  form.name = ''
  form.displayName = ''
  form.email = ''
  form.gender = 'UNSPECIFIED'
  form.birthday = ''
  form.motto = ''
  form.timezone = ''
  form.locale = ''
  for (const key of addressFields) {
    form[key] = ''
  }
  form.phoneCountry = 'CN'
  lastSyncedAt.value = null
  initialSnapshot.value = serializeForm()
}

function populateForm(user: Record<string, any>) {
  form.name = user.name ?? ''
  form.displayName = user.profile?.displayName ?? ''
  form.email = user.email ?? ''
  form.gender =
    (user.profile?.gender as GenderType | undefined) ?? 'UNSPECIFIED'
  form.birthday = user.profile?.birthday
    ? String(user.profile.birthday).slice(0, 10)
    : ''
  form.motto = user.profile?.motto ?? ''
  form.timezone = user.profile?.timezone ?? ''
  form.locale = user.profile?.locale ?? ''
  const extra =
    user.profile?.extra && typeof user.profile.extra === 'object'
      ? (user.profile.extra as Record<string, unknown>)
      : {}
  for (const key of addressFields) {
    const value =
      extra && typeof extra[key] === 'string' ? (extra[key] as string) : ''
    form[key] = value
  }
  // region fields are stored flat in extra
  form.phoneCountry = (extra['phoneCountry'] as any) || 'CN'
  form.regionCountry = (extra['regionCountry'] as any) || ''
  form.regionProvince = (extra['regionProvince'] as any) || ''
  form.regionCity = (extra['regionCity'] as any) || ''
  form.regionDistrict = (extra['regionDistrict'] as any) || ''
  lastSyncedAt.value = user.updatedAt ?? null
  initialSnapshot.value = serializeForm()
}

// 顶层不再提供整体编辑入口

async function submitAuthmeBinding() {
  if (!bindingEnabled.value) {
    bindingError.value = '当前未开放绑定功能'
    return
  }
  bindingError.value = ''
  bindingLoading.value = true
  try {
    await auth.bindAuthme({
      authmeId: authmeBindingForm.authmeId,
      password: authmeBindingForm.password,
    })
    authmeBindingForm.authmeId = ''
    authmeBindingForm.password = ''
    showBindDialog.value = false
    toast.add({ title: '绑定成功', color: 'success' })
  } catch (error) {
    if (error instanceof ApiError) {
      bindingError.value = error.message
    } else {
      bindingError.value = '绑定失败，请稍后再试'
    }
  } finally {
    bindingLoading.value = false
  }
}

function requestUnbindAuthme(payload: { username: string; realname?: string | null }) {
  authmeUnbindForm.username = payload.username
  authmeUnbindForm.password = ''
  unbindError.value = ''
  showUnbindDialog.value = true
}

async function submitUnbindAuthme() {
  if (!authmeUnbindForm.password.trim()) {
    unbindError.value = '请输入 AuthMe 密码'
    return
  }
  unbindError.value = ''
  unbindLoading.value = true
  try {
    await auth.unbindAuthme({
      username: authmeUnbindForm.username || undefined,
      password: authmeUnbindForm.password,
    })
    handleCloseUnbindDialog(true)
    toast.add({ title: '已解除绑定', color: 'warning' })
  } catch (error) {
    if (error instanceof ApiError) {
      unbindError.value = error.message
    } else {
      unbindError.value = '解绑失败，请稍后再试'
    }
  } finally {
    unbindLoading.value = false
  }
}

function handleCloseUnbindDialog(force = false) {
  if (unbindLoading.value && !force) {
    return
  }
  showUnbindDialog.value = false
  authmeUnbindForm.password = ''
  if (force || !unbindLoading.value) {
    authmeUnbindForm.username = ''
  }
  unbindError.value = ''
}

async function loadSessions(force = false) {
  if (!auth.token) {
    sessions.value = []
    sessionsLoaded.value = false
    sessionsError.value = ''
    return
  }
  if (sessionsLoading.value) {
    return
  }
  if (!force && sessionsLoaded.value) {
    return
  }
  sessionsError.value = ''
  sessionsLoading.value = true
  try {
    const response = await auth.listSessions()
    const list = Array.isArray(response?.sessions) ? response.sessions : []
    sessions.value = list.map((entry: any) => ({
      id: entry.id as string,
      createdAt: entry.createdAt as string,
      updatedAt: entry.updatedAt as string,
      expiresAt: entry.expiresAt as string,
      ipAddress: (entry.ipAddress as string | null | undefined) ?? null,
      ipLocation: normalizeLocationText(
        (entry.ipLocation as string | null | undefined) ?? null,
      ),
      userAgent: (entry.userAgent as string | null | undefined) ?? null,
      isCurrent: Boolean(entry.isCurrent),
    }))
    sessionsLoaded.value = true
  } catch (error) {
    if (error instanceof ApiError) {
      sessionsError.value = error.message
    } else {
      sessionsError.value = '无法加载会话列表，请稍后再试'
    }
  } finally {
    sessionsLoading.value = false
  }
}

function refreshSessions() {
  void loadSessions(true)
}

async function handleRevokeSession(sessionId: string) {
  if (!auth.token) {
    openLoginDialog()
    return
  }
  revokingSessionId.value = sessionId
  try {
    const result = await auth.revokeSession(sessionId)
    if (result?.current) {
      toast.add({
        title: '当前会话已注销',
        description: '您已在此设备退出，需要重新登录。',
        color: 'warning',
      })
      auth.clear()
      sessions.value = []
      sessionsLoaded.value = false
      ui.openLoginDialog()
      return
    }
    toast.add({
      title: '已终止会话',
      description: '该设备已退出登录。',
      color: 'success',
    })
    await loadSessions(true)
  } catch (error) {
    const description =
      error instanceof ApiError ? error.message : '无法终止会话，请稍后再试'
    toast.add({
      title: '终止会话失败',
      description,
      color: 'error',
    })
  } finally {
    revokingSessionId.value = null
  }
}

function askRevoke(id: string) {
  revokeTargetId.value = id
  showRevokeConfirm.value = true
}

function confirmRevoke() {
  if (revokeTargetId.value) {
    void handleRevokeSession(revokeTargetId.value)
  }
  showRevokeConfirm.value = false
  revokeTargetId.value = null
}

function serializeForm() {
  return JSON.stringify({
    name: form.name.trim(),
    displayName: form.displayName.trim(),
    email: form.email.trim(),
    gender: form.gender,
    birthday: form.birthday,
    motto: form.motto.trim(),
    timezone: form.timezone.trim(),
    locale: form.locale.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    postalCode: form.postalCode.trim(),
    country: form.country.trim(),
    phone: form.phone.trim(),
    phoneCountry: form.phoneCountry ?? 'CN',
    regionCountry: form.regionCountry?.trim() ?? '',
    regionProvince: form.regionProvince?.trim() ?? '',
    regionCity: form.regionCity?.trim() ?? '',
    regionDistrict: form.regionDistrict?.trim() ?? '',
  })
}

function buildPayload(): UpdateCurrentUserPayload {
  const payload: UpdateCurrentUserPayload = {}
  const user = auth.user as Record<string, any> | null
  if (!user) return payload

  const trimmedName = form.name.trim()
  if ((user.name ?? '') !== trimmedName) {
    payload.name = trimmedName
  }

  const trimmedEmail = form.email.trim()
  if ((user.email ?? '') !== trimmedEmail) {
    payload.email = trimmedEmail
  }

  const trimmedDisplayName = form.displayName.trim()
  if ((user.profile?.displayName ?? '') !== trimmedDisplayName) {
    payload.displayName = trimmedDisplayName
  }

  const newGender = form.gender ?? 'UNSPECIFIED'
  if ((user.profile?.gender ?? 'UNSPECIFIED') !== newGender) {
    payload.gender = newGender
  }

  const newBirthday = form.birthday.trim()
  const currentBirthday = user.profile?.birthday
    ? String(user.profile.birthday).slice(0, 10)
    : ''
  if (newBirthday !== currentBirthday) {
    if (newBirthday) {
      payload.birthday = newBirthday
    }
  }

  const trimmedMotto = form.motto.trim()
  if ((user.profile?.motto ?? '') !== trimmedMotto) {
    payload.motto = trimmedMotto
  }

  const trimmedTimezone = form.timezone.trim()
  if ((user.profile?.timezone ?? '') !== trimmedTimezone) {
    payload.timezone = trimmedTimezone
  }

  const trimmedLocale = form.locale.trim()
  if ((user.profile?.locale ?? '') !== trimmedLocale) {
    payload.locale = trimmedLocale
  }

  const existingExtra =
    user.profile?.extra && typeof user.profile.extra === 'object'
      ? (user.profile.extra as Record<string, unknown>)
      : {}

  const extraPayload: Record<string, string> = {}
  let extraChanged = false
  for (const key of addressFields) {
    const newValue = form[key].trim()
    const currentValue =
      typeof existingExtra[key] === 'string'
        ? (existingExtra[key] as string).trim()
        : ''
    if (newValue !== currentValue) {
      extraChanged = true
    }
    if (newValue) {
      extraPayload[key] = newValue
    }
  }
  // phone country and region fields (flat)
  const flatKeys = [
    'phoneCountry',
    'regionCountry',
    'regionProvince',
    'regionCity',
    'regionDistrict',
  ] as const
  for (const k of flatKeys) {
    const newValue = String((form as any)[k] ?? '').trim()
    const currentValue =
      typeof existingExtra[k] === 'string'
        ? String(existingExtra[k]).trim()
        : ''
    if (newValue !== currentValue) {
      extraChanged = true
    }
    if (newValue) {
      ;(extraPayload as any)[k] = newValue
    }
  }
  if (extraChanged) {
    payload.extra = extraPayload
  }

  return payload
}

async function loadUser() {
  if (!auth.token || loading.value) {
    return
  }
  loading.value = true
  ui.startLoading()
  try {
    await auth.fetchCurrentUser()
    sessionsLoaded.value = false
    if (activeSection.value === 'sessions') {
      await loadSessions(true)
    }
  } catch (error) {
    handleError(error, '无法加载用户信息')
  } finally {
    loading.value = false
    ui.stopLoading()
  }
}

async function handleSave() {
  if (!isAuthenticated.value) {
    ui.openLoginDialog()
    return
  }
  if (!hasChanges.value) {
    toast.add({
      title: '没有检测到改动',
      description: '您尚未修改任何字段。',
      color: 'neutral',
    })
    return
  }
  const payload = buildPayload()
  if (Object.keys(payload).length === 0) {
    toast.add({
      title: '无法保存',
      description: '请检查填写的内容是否有效。',
      color: 'warning',
    })
    return
  }
  saving.value = true
  ui.startLoading()
  try {
    const updated = await auth.updateCurrentUser(payload)
    lastSyncedAt.value = updated.updatedAt ?? lastSyncedAt.value
    initialSnapshot.value = serializeForm()
    toast.add({
      title: '资料已更新',
      description: '您的账户信息已成功保存。',
      color: 'success',
    })
  } catch (error) {
    handleError(error, '保存失败')
  } finally {
    saving.value = false
    ui.stopLoading()
  }
}

function handleReset(showToast = true) {
  if (!auth.user) {
    resetForm()
    return
  }
  populateForm(auth.user)
  if (showToast) {
    toast.add({
      title: '已还原修改',
      description: '表单内容已恢复为最新的服务器数据。',
      color: 'info',
    })
  }
}

function openLoginDialog() {
  ui.openLoginDialog()
}

function handleError(error: unknown, fallback: string) {
  const description =
    error instanceof ApiError
      ? error.message
      : '请稍后重试，若问题持续请联系管理员。'
  toast.add({
    title: fallback,
    description,
    color: 'error',
  })
  console.error('[profile-info]', error)
}

function confirmLeave() {
  // 放弃当前编辑并执行待操作
  const action = pendingAction.value
  handleReset(false)
  resetSignal.value++
  isEditingAny.value = false
  if (action?.kind === 'sidebar') {
    activeSection.value = action.target
  } else if (action?.kind === 'card') {
    void nextTick(() => {
      basicSectionRef.value?.forceEdit(action.target)
    })
  }
  pendingAction.value = null
  showLeaveConfirm.value = false
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-8">
    <div v-if="isAuthenticated" class="space-y-6">
      <ProfileHeader
        :avatar-url="avatarUrl"
        :display-name="auth.displayName ?? form.email"
        :email="form.email"
        :last-synced-text="lastSyncedText"
        :joined-text="joinedText"
        :registered-text="registeredText"
        :last-login-text="lastLoginText"
        :last-login-ip="lastLoginIp"
        :loading="loading"
        @refresh="loadUser"
      />

      <form
        id="profile-form"
        class="flex flex-col gap-6 transition-opacity"
        :class="{ 'pointer-events-none opacity-60': loading && !saving }"
        @submit.prevent="handleSave"
      >
        <div class="flex flex-col gap-2 relative xl:flex-row xl:gap-6">
          <ProfileSidebar
            :items="sections"
            :active-id="activeSection"
            :editing="isEditingAny"
            @update:active-id="(id: string) => (activeSection = id as any)"
            @blocked="handleSidebarBlocked"
          />

          <div class="flex-1 space-y-6">
            <BasicSection
              ref="basicSectionRef"
              v-if="activeSection === 'basic'"
              :model-value="{
                name: form.name,
                displayName: form.displayName,
                email: form.email,
                gender: form.gender,
                birthday: form.birthday,
                motto: form.motto,
                timezone: form.timezone,
                locale: form.locale,
                phone: form.phone,
                phoneCountry: (form.phoneCountry as any) || 'CN',
                region: {
                  country: (form.regionCountry as any) || 'CN',
                  province: form.regionProvince,
                  city: form.regionCity,
                  district: form.regionDistrict,
                },
                addressLine1: form.addressLine1,
                postalCode: form.postalCode,
              }"
              :gender-options="genderOptions"
              :timezone-options="timezoneOptions"
              :language-options="languageOptions"
              :meta="{
                lastSyncedText: lastSyncedText,
                registeredText: registeredText,
                joinedText: joinedText,
                lastLoginText: lastLoginText,
                lastLoginIp: lastLoginIp,
                lastLoginIpDisplay: lastLoginIpDisplay,
              }"
              :saving="saving"
              :reset-signal="resetSignal"
              @editing-change="(v: boolean) => (isEditingAny = v)"
              @request-save="handleSave"
              @request-reset="handleReset"
              @editing-guard="handleCardGuard"
              @update:model-value="
                (v: any) => {
                  form.name = v.name
                  form.displayName = v.displayName
                  form.email = v.email
                  form.gender = v.gender
                  form.birthday = v.birthday
                  form.motto = v.motto
                  form.timezone = v.timezone
                  form.locale = v.locale
                  form.phone = v.phone
                  form.phoneCountry = v.phoneCountry
                  form.regionCountry = v.region.country
                  form.regionProvince = v.region.province
                  form.regionCity = v.region.city
                  form.regionDistrict = v.region.district
                  form.addressLine1 = v.addressLine1
                  form.postalCode = v.postalCode
                }
              "
            />

            <MinecraftSection
              v-else-if="activeSection === 'minecraft'"
              :bindings="authmeBindings"
              :is-editing="false"
              :loading="bindingLoading"
              @add="showBindDialog = true"
              @unbind="requestUnbindAuthme"
            />

            <SessionsSection
              v-else
              :sessions="sessions"
              :loading="sessionsLoading"
              :error="sessionsError"
              :revoking-id="revokingSessionId"
              @refresh="refreshSessions"
              @revoke="askRevoke"
            />
          </div>
        </div>

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
      </form>

      <!-- 离开编辑确认 -->
      <UModal
        :open="showLeaveConfirm"
        @update:open="
          (value: boolean) => {
            showLeaveConfirm = value
            if (!value) pendingAction = null
          }
        "
      >
        <template #content>
          <UCard>
            <template #header>
              <div class="text-base font-semibold">退出编辑？</div>
            </template>
            <UAlert
              icon="i-lucide-alert-triangle"
              color="warning"
              variant="soft"
              title="当前有未保存的修改"
              :description="leaveConfirmDescription"
              class="mb-4"
            />
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showLeaveConfirm = false"
                >继续编辑</UButton
              >
              <UButton color="warning" :loading="saving" @click="confirmLeave"
                >放弃并切换</UButton
              >
            </div>
          </UCard>
        </template>
      </UModal>

      <!-- AuthMe 解绑 -->
      <UModal
        :open="showUnbindDialog"
        @update:open="
          (value: boolean) => {
            if (!value) handleCloseUnbindDialog()
          }
        "
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
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300">
                  AuthMe 密码
                </label>
                <UInput
                  v-model="authmeUnbindForm.password"
                  type="password"
                  placeholder="请输入 AuthMe 密码"
                  autocomplete="current-password"
                  :disabled="unbindLoading"
                  @keyup.enter="submitUnbindAuthme()"
                />
              </div>
              <p v-if="unbindError" class="text-sm text-rose-500">{{ unbindError }}</p>
            </div>
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton variant="ghost" :disabled="unbindLoading" @click="handleCloseUnbindDialog()"
                  >取消</UButton
                >
                <UButton color="warning" :loading="unbindLoading" @click="submitUnbindAuthme"
                  >确认解除</UButton
                >
              </div>
            </template>
          </UCard>
        </template>
      </UModal>

      <!-- 终止会话确认 -->
      <UModal
        :open="showRevokeConfirm"
        @update:open="
          (value: boolean) => {
            showRevokeConfirm = value
            if (!value) revokeTargetId = null
          }
        "
      >
        <template #content>
          <UCard>
            <template #header>
              <div class="text-base font-semibold">终止会话？</div>
            </template>
            <UAlert
              icon="i-lucide-log-out"
              color="error"
              variant="soft"
              title="该设备将退出登录"
              description="操作不可撤销，确认要终止该会话吗？"
              class="mb-4"
            />
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showRevokeConfirm = false"
                >取消</UButton
              >
              <UButton
                color="error"
                :loading="revokingSessionId === revokeTargetId"
                @click="confirmRevoke"
                >确认终止</UButton
              >
            </div>
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
        登录后即可完善个人资料与联系地址，确保服务体验与通知准确触达。
      </p>
      <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
    </UCard>
  </section>
</template>
