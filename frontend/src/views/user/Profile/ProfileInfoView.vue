<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import UserAvatar from '@/components/common/UserAvatar.vue'
import ProfileHeader from './components/ProfileHeader.vue'
import EditBanner from './components/EditBanner.vue'
import ProfileSidebar from './components/ProfileSidebar.vue'
import BasicSection from './components/sections/BasicSection.vue'
import AddressSection from './components/sections/AddressSection.vue'
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
  regionCountry?: string
  regionProvince?: string
  regionCity?: string
  regionDistrict?: string
}

type SectionKey = 'basic' | 'address' | 'minecraft' | 'sessions'

type FieldDefinition = {
  key: keyof FormState
  label: string
  inputType?: 'text' | 'email' | 'date' | 'tel'
  component?: 'textarea' | 'select'
  placeholder?: string
  readonly?: boolean
}

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
const activeSection = ref<SectionKey>('basic')
const isEditing = ref(false)
const sessions = ref<SessionItem[]>([])
const sessionsLoading = ref(false)
const sessionsLoaded = ref(false)
const sessionsError = ref('')
const revokingSessionId = ref<string | null>(null)

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
    id: 'address',
    label: '地址信息',
  },
  {
    id: 'minecraft',
    label: '服务器账户',
  },
  {
    id: 'sessions',
    label: '会话管理',
  },
]

const basicFields: FieldDefinition[] = [
  {
    key: 'displayName',
    label: '显示名称',
    placeholder: '用于站内展示的名字',
  },
  {
    key: 'name',
    label: '真实姓名',
    placeholder: '例如：陈嘉禾',
  },
  {
    key: 'email',
    label: '邮箱',
    inputType: 'email',
    readonly: true,
  },
  {
    key: 'gender',
    label: '性别',
    component: 'select',
  },
  {
    key: 'birthday',
    label: '生日',
    inputType: 'date',
  },
  {
    key: 'timezone',
    label: '时区',
    placeholder: '例如：Asia/Shanghai',
  },
  {
    key: 'locale',
    label: '语言',
    placeholder: '例如：zh-CN',
  },
  {
    key: 'motto',
    label: '个性签名',
    component: 'textarea',
    placeholder: '向社区介绍你自己，保持简洁有力。',
  },
]

const addressFieldDefinitions: FieldDefinition[] = [
  {
    key: 'addressLine1',
    label: '地址（行 1）',
    placeholder: '街道、门牌号等',
  },
  {
    key: 'addressLine2',
    label: '地址（行 2）',
    placeholder: '单元、楼层等补充信息',
  },
  {
    key: 'city',
    label: '城市',
    placeholder: '所在城市',
  },
  {
    key: 'state',
    label: '省 / 州',
    placeholder: '所在省份或州',
  },
  {
    key: 'postalCode',
    label: '邮政编码',
    placeholder: '邮编',
  },
  {
    key: 'country',
    label: '国家 / 地区',
    placeholder: '例如：中国',
  },
  {
    key: 'phone',
    label: '联系电话',
    inputType: 'tel',
    placeholder: '用于紧急联系',
  },
]

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
  regionCountry: '',
  regionProvince: '',
  regionCity: '',
  regionDistrict: '',
})

const authmeBindingForm = reactive({
  authmeId: '',
  password: '',
})

const timezoneOptions = ref<string[]>(getTimezones())
const languageOptions = ref([{ label: '中文（简体）', value: 'zh-CN' }])
const showBindDialog = ref(false)

const hasChanges = computed(() => serializeForm() !== initialSnapshot.value)
const canSubmit = computed(
  () =>
    isAuthenticated.value &&
    hasChanges.value &&
    !saving.value &&
    !loading.value,
)

const currentSection = computed(
  () =>
    sections.find((section) => section.id === activeSection.value) ??
    sections[0],
)

const bindingEnabled = computed(() => featureStore.flags.authmeBindingEnabled)
const authmeBindings = computed(() => {
  const user = auth.user as Record<string, any> | null
  const single = (user as any)?.authmeBinding ?? null
  const many = (user as any)?.authmeBindings ?? null
  if (Array.isArray(many)) {
    return many.map((b: any) => ({
      username: b.authmeUsername,
      realname: b.authmeRealname ?? null,
      boundAt: b.boundAt ?? null,
      ip: b.ip ?? null,
      ipLocation: b.ip_location ?? b.ipLocation ?? null,
      regip: b.regip ?? null,
      regipLocation: b.regip_location ?? b.regipLocation ?? null,
      lastlogin: b.lastlogin ?? null,
      regdate: b.regdate ?? null,
    }))
  }
  if (single) {
    return [
      {
        username: single.authmeUsername,
        realname: single.authmeRealname ?? null,
        boundAt: single.boundAt ?? null,
        ip: single.ip ?? null,
        ipLocation: single.ip_location ?? single.ipLocation ?? null,
        regip: single.regip ?? null,
        regipLocation: single.regip_location ?? single.regipLocation ?? null,
        lastlogin: single.lastlogin ?? null,
        regdate: single.regdate ?? null,
      },
    ]
  }
  return []
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

const genderLabelMap = computed(() =>
  genderOptions.reduce<Record<GenderType, string>>(
    (acc, option) => {
      acc[option.value] = option.label
      return acc
    },
    {
      UNSPECIFIED: '未指定',
      MALE: '男性',
      FEMALE: '女性',
      NON_BINARY: '非二元',
      OTHER: '其他',
    },
  ),
)

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

watch(isEditing, (value) => {
  if (!value) {
    bindingError.value = ''
    authmeBindingForm.authmeId = ''
    authmeBindingForm.password = ''
  }
})

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
  lastSyncedAt.value = null
  initialSnapshot.value = serializeForm()
  isEditing.value = false
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
  // region in extra.region
  const region =
    extra && typeof (extra['region'] as any) === 'object'
      ? (extra['region'] as Record<string, any>)
      : null
  form.regionCountry = (region?.country as string) || ''
  form.regionProvince = (region?.province as string) || ''
  form.regionCity = (region?.city as string) || ''
  form.regionDistrict = (region?.district as string) || ''
  lastSyncedAt.value = user.updatedAt ?? null
  initialSnapshot.value = serializeForm()
}

function startEditing() {
  if (!isAuthenticated.value) {
    openLoginDialog()
    return
  }
  isEditing.value = true
}

function cancelEditing() {
  handleReset(false)
  isEditing.value = false
  authmeBindingForm.authmeId = ''
  authmeBindingForm.password = ''
}

function isFieldEditable(field: FieldDefinition) {
  return isEditing.value && !field.readonly
}

function formatFieldValue(field: FieldDefinition) {
  const value = form[field.key]
  if (field.key === 'gender') {
    return genderLabelMap.value[value as GenderType] ?? '未指定'
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  return '未填写'
}

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

async function handleUnbindAuthme(_username?: string) {
  bindingError.value = ''
  bindingLoading.value = true
  try {
    await auth.unbindAuthme(_username)
    toast.add({ title: '已解除绑定', color: 'warning' })
  } catch (error) {
    if (error instanceof ApiError) {
      bindingError.value = error.message
    } else {
      bindingError.value = '解绑失败，请稍后再试'
    }
  } finally {
    bindingLoading.value = false
  }
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
    const list = Array.isArray(response?.sessions)
      ? response.sessions
      : []
    sessions.value = list.map((entry: any) => ({
      id: entry.id as string,
      createdAt: entry.createdAt as string,
      updatedAt: entry.updatedAt as string,
      expiresAt: entry.expiresAt as string,
      ipAddress: (entry.ipAddress as string | null | undefined) ?? null,
      ipLocation: (entry.ipLocation as string | null | undefined) ?? null,
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
      error instanceof ApiError
        ? error.message
        : '无法终止会话，请稍后再试'
    toast.add({
      title: '终止会话失败',
      description,
      color: 'error',
    })
  } finally {
    revokingSessionId.value = null
  }
}

function serializeForm() {
  return JSON.stringify({
    name: form.name.trim(),
    displayName: form.displayName.trim(),
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
  // region
  const regionExisting = (existingExtra['region'] ?? {}) as Record<string, string>
  const regionPayload = {
    country: form.regionCountry || undefined,
    province: form.regionProvince || undefined,
    city: form.regionCity || undefined,
    district: form.regionDistrict || undefined,
  }
  const regionChanged = (
    (regionExisting?.country ?? '') !== (regionPayload.country ?? '') ||
    (regionExisting?.province ?? '') !== (regionPayload.province ?? '') ||
    (regionExisting?.city ?? '') !== (regionPayload.city ?? '') ||
    (regionExisting?.district ?? '') !== (regionPayload.district ?? '')
  )
  const hasRegion = !!(regionPayload.country || regionPayload.province || regionPayload.city || regionPayload.district)
  if (regionChanged || hasRegion) {
    extraChanged = true
    ;(extraPayload as any).region = regionPayload
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
    isEditing.value = false
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
</script>

<template>
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8">
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

      <form id="profile-form" class="flex flex-col gap-6 transition-opacity" :class="{ 'pointer-events-none opacity-60': loading && !saving }" @submit.prevent="handleSave">
        <Transition name="fade">
          <EditBanner v-if="isEditing" :has-changes="hasChanges" :saving="saving" @cancel="cancelEditing" @save="handleSave" />
        </Transition>

        <div class="flex flex-col gap-6 lg:flex-row">
          <ProfileSidebar :items="sections" :active-id="activeSection" @update:active-id="(id:string)=>activeSection = id as any" />

          <div class="flex-1 rounded-2xl border border-slate-200/70 bg-white/85 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-900/60">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-6 py-5 dark:border-slate-800/70">
              <div>
                <h2 class="text-lg font-semibold text-slate-900 dark:text-white">{{ currentSection.label }}</h2>
              </div>
              <UButton v-if="!isEditing" type="button" color="primary" variant="soft" :disabled="loading" @click="startEditing">编辑</UButton>
            </div>

            <div class="px-6 py-6">
              <BasicSection
                v-if="activeSection === 'basic'"
                :model-value="{ name: form.name, displayName: form.displayName, email: form.email, gender: form.gender, birthday: form.birthday, motto: form.motto, timezone: form.timezone, locale: form.locale }"
                :is-editing="isEditing"
                :gender-options="genderOptions"
                :timezone-options="timezoneOptions"
                :language-options="languageOptions"
                :meta="{ lastSyncedText: lastSyncedText, registeredText: registeredText, joinedText: joinedText, lastLoginText: lastLoginText, lastLoginIp: lastLoginIp }"
                @update:model-value="(v:any)=>{ form.name=v.name; form.displayName=v.displayName; form.gender=v.gender; form.birthday=v.birthday; form.motto=v.motto; form.timezone=v.timezone; form.locale=v.locale }"
              />

              <AddressSection
                v-else-if="activeSection === 'address'"
                :model-value="{ addressLine1: form.addressLine1, addressLine2: form.addressLine2, city: form.city, state: form.state, postalCode: form.postalCode, country: form.country, phone: form.phone, region: { country: (form.regionCountry as any) || 'OTHER', province: form.regionProvince, city: form.regionCity, district: form.regionDistrict } }"
                :is-editing="isEditing"
                @update:model-value="(v:any)=>{ form.addressLine1=v.addressLine1; form.addressLine2=v.addressLine2; form.city=v.city; form.state=v.state; form.postalCode=v.postalCode; form.country=v.country; form.phone=v.phone; form.regionCountry=v.region.country; form.regionProvince=v.region.province; form.regionCity=v.region.city; form.regionDistrict=v.region.district }"
              />

              <MinecraftSection
                v-else-if="activeSection === 'minecraft'"
                :bindings="authmeBindings"
                :is-editing="isEditing"
                :loading="bindingLoading"
                @add="showBindDialog = true"
                @unbind="handleUnbindAuthme"
              />

              <SessionsSection
                v-else
                :sessions="sessions"
                :loading="sessionsLoading"
                :error="sessionsError"
                :revoking-id="revokingSessionId"
                @refresh="refreshSessions"
                @revoke="handleRevokeSession"
              />
            </div>
          </div>
        </div>

        <AuthmeBindDialog :open="showBindDialog" :loading="bindingLoading" :error="bindingError" @close="showBindDialog = false" @submit="(p)=>{ authmeBindingForm.authmeId = p.authmeId; authmeBindingForm.password = p.password; submitAuthmeBinding() }" />
      </form>
    </div>

    <UCard v-else class="flex flex-col items-center gap-4 bg-white/85 py-12 text-center shadow-sm backdrop-blur-sm dark:bg-slate-900/65">
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white">需要登录</h2>
      <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">登录后即可完善个人资料与联系地址，确保服务体验与通知准确触达。</p>
      <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
    </UCard>
  </section>
</template>
