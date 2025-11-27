<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import BasicSection from './components/sections/BasicSection.vue'
import {
  getTimezoneOptionsZh,
  languageOptions as commonLanguageOptions,
} from '@/constants/profile'
import {
  useAuthStore,
  type GenderType,
  type UpdateCurrentUserPayload,
} from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useFeatureStore } from '@/stores/feature'
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
  postalCode: string
  phone: string
  phoneCountry?: 'CN' | 'HK' | 'MO' | 'TW'
  regionCountry?: string
  regionProvince?: string
  regionCity?: string
  regionDistrict?: string
}

const auth = useAuthStore()
const ui = useUiStore()
const feature = useFeatureStore()
const toast = useToast()

const phoneVerificationEnabled = computed(
  () => feature.phoneVerificationEnabled,
)

function isContactVerified(contact: any) {
  if (!contact || typeof contact !== 'object') return false
  if (contact.verification === 'VERIFIED') return true
  return Boolean(contact.verifiedAt)
}

function extractDialCode(contact: any) {
  if (!contact || typeof contact !== 'object') return null
  const metadata = contact.metadata
  if (metadata && typeof metadata === 'object') {
    const dial = (metadata as Record<string, unknown>).dialCode
    if (typeof dial === 'string' && dial.startsWith('+')) {
      return dial
    }
  }
  const value = typeof contact.value === 'string' ? contact.value : ''
  const match = value.match(/^\+\d{2,6}/)
  return match ? match[0] : null
}

function buildPhoneSummary(contact: any) {
  if (!contact || typeof contact !== 'object') return null
  const rawValue = typeof contact.value === 'string' ? contact.value.trim() : ''
  if (!rawValue) {
    return {
      value: '',
      dialCode: '',
      number: '',
      display: '',
      isPrimary: Boolean(contact?.isPrimary),
      verified: isContactVerified(contact),
    }
  }
  const dial = extractDialCode(contact) ?? ''
  const number =
    dial && rawValue.startsWith(dial) ? rawValue.slice(dial.length) : rawValue
  const normalizedNumber = number.replace(/\s+/g, '')
  return {
    value: rawValue,
    dialCode: dial,
    number: normalizedNumber,
    display: dial ? `${dial} ${normalizedNumber}`.trim() : normalizedNumber,
    isPrimary: Boolean(contact?.isPrimary),
    verified: isContactVerified(contact),
  }
}

const contactSummary = computed(() => {
  const user = auth.user as Record<string, any> | null
  const contactsRaw = Array.isArray((user as any)?.contacts)
    ? ((user as any).contacts as any[])
    : []

  const emailContacts = contactsRaw.filter(
    (entry) => entry?.channel?.key === 'email',
  )
  const phoneContacts = contactsRaw.filter(
    (entry) => entry?.channel?.key === 'phone',
  )

  const pickPrimary = (list: any[]) =>
    list.find((item: any) => item?.isPrimary) ?? list[0] ?? null

  const primaryEmail = pickPrimary(emailContacts)
  const primaryPhone = pickPrimary(phoneContacts)

  const emailInfo = primaryEmail
    ? {
        value: String(primaryEmail.value ?? ''),
        isPrimary: Boolean(primaryEmail.isPrimary),
        verified: isContactVerified(primaryEmail),
      }
    : null

  const phoneInfo = primaryPhone ? buildPhoneSummary(primaryPhone) : null

  return {
    email: emailInfo,
    phone: phoneInfo,
  }
})

const isAuthenticated = computed(() => auth.isAuthenticated)
const loading = ref(false)
const saving = ref(false)
const lastSyncedAt = ref<string | null>(null)
const initialSnapshot = ref('')
const isEditingAny = ref(false)
const resetSignal = ref(0)
const basicSectionRef = ref<InstanceType<typeof BasicSection> | null>(null)

const genderOptions: Array<{ label: string; value: GenderType }> = [
  { label: '未指定', value: 'UNSPECIFIED' },
  { label: '男性', value: 'MALE' },
  { label: '女性', value: 'FEMALE' },
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
  postalCode: '',
  phone: '',
  phoneCountry: 'CN',
  regionCountry: '',
  regionProvince: '',
  regionCity: '',
  regionDistrict: '',
})

const timezoneOptions = ref(getTimezoneOptionsZh())
const languageOptions = ref([...commonLanguageOptions])

const hasChanges = computed(() => serializeForm() !== initialSnapshot.value)

watch(
  () => auth.user,
  (user) => {
    if (!user) {
      resetForm()
      return
    }
    populateForm(user as any)
  },
  { immediate: true },
)

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
    postalCode: form.postalCode.trim(),
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
  if ((user.name ?? '') !== form.name.trim()) payload.name = form.name.trim()
  if ((user.email ?? '') !== form.email.trim())
    payload.email = form.email.trim()
  if ((user.profile?.displayName ?? '') !== form.displayName.trim())
    payload.displayName = form.displayName.trim()
  const currentGender =
    (user.profile?.gender as GenderType | undefined) ?? 'UNSPECIFIED'
  if (currentGender !== form.gender) payload.gender = form.gender
  const currentBirthday = user.profile?.birthday
    ? String(user.profile.birthday).slice(0, 10)
    : ''
  if (form.birthday !== currentBirthday && form.birthday)
    payload.birthday = form.birthday
  if ((user.profile?.motto ?? '') !== form.motto.trim())
    payload.motto = form.motto.trim()
  if ((user.profile?.timezone ?? '') !== form.timezone.trim())
    payload.timezone = form.timezone.trim()
  if ((user.profile?.locale ?? '') !== form.locale.trim())
    payload.locale = form.locale.trim()
  const existingExtra =
    user.profile?.extra && typeof user.profile.extra === 'object'
      ? (user.profile.extra as Record<string, unknown>)
      : {}
  const extraPayload: Record<string, string> = {}
  let extraChanged = false
  const addressKeys = ['addressLine1', 'postalCode'] as const
  for (const k of addressKeys) {
    const newValue = (form as any)[k].trim()
    const currentValue =
      typeof existingExtra[k] === 'string'
        ? String(existingExtra[k]).trim()
        : ''
    if (newValue !== currentValue) extraChanged = true
    if (newValue) (extraPayload as any)[k] = newValue
  }
  const flatKeys = [
    'phoneCountry',
    'regionCountry',
    'regionProvince',
    'regionCity',
    'regionDistrict',
    'phone',
  ] as const
  for (const k of flatKeys) {
    const newValue = String((form as any)[k] ?? '').trim()
    const currentValue =
      typeof existingExtra[k] === 'string'
        ? String(existingExtra[k]).trim()
        : ''
    if (newValue !== currentValue) extraChanged = true
    if (newValue) (extraPayload as any)[k] = newValue
  }
  if (extraChanged) payload.extra = extraPayload
  return payload
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
  form.addressLine1 = ''
  form.postalCode = ''
  form.phone = ''
  form.phoneCountry = 'CN'
  form.regionCountry = ''
  form.regionProvince = ''
  form.regionCity = ''
  form.regionDistrict = ''
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
  form.addressLine1 =
    typeof extra['addressLine1'] === 'string'
      ? (extra['addressLine1'] as string)
      : ''
  form.postalCode =
    typeof extra['postalCode'] === 'string'
      ? (extra['postalCode'] as string)
      : ''
  form.phone =
    typeof extra['phone'] === 'string' ? (extra['phone'] as string) : ''
  form.phoneCountry = (extra['phoneCountry'] as any) || 'CN'
  form.regionCountry = (extra['regionCountry'] as any) || ''
  form.regionProvince = (extra['regionProvince'] as any) || ''
  form.regionCity = (extra['regionCity'] as any) || ''
  form.regionDistrict = (extra['regionDistrict'] as any) || ''
  lastSyncedAt.value = user.updatedAt ?? null
  initialSnapshot.value = serializeForm()
}

async function loadUser() {
  if (!auth.token || loading.value) return
  loading.value = true
  ui.startLoading()
  try {
    await auth.fetchCurrentUser()
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
  populateForm(auth.user as any)
  if (showToast) {
    toast.add({
      title: '已还原修改',
      description: '表单内容已恢复为最新的服务器数据。',
      color: 'info',
    })
  }
}

function handleError(error: unknown, fallback: string) {
  const description =
    error instanceof ApiError
      ? error.message
      : '请稍后重试，若问题持续请联系管理员。'
  toast.add({ title: fallback, description, color: 'error' })
  console.error('[profile-info-basic]', error)
}

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
  const location = ((user as any)?.lastLoginIpLocation ??
    (user as any)?.lastLoginIpLocationRaw ??
    null) as string | null
  if (!location) return null
  const cleaned = location
    .replace(/\s*·\s*/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > 0 ? cleaned : null
})

const roleNames = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user?.roles || !Array.isArray(user.roles)) return []
  const names = user.roles
    .map((entry: any) => {
      const role = entry?.role
      if (!role) return null
      const name =
        typeof role.name === 'string' && role.name.trim().length > 0
          ? role.name.trim()
          : null
      if (name) return name
      const key =
        typeof role.key === 'string' && role.key.trim().length > 0
          ? role.key.trim()
          : null
      return key
    })
    .filter((value): value is string => Boolean(value))
  return Array.from(new Set(names))
})

const lastLoginIpDisplay = computed(() => {
  const ip = lastLoginIp.value
  if (!ip) return ''
  const location = lastLoginIpLocation.value
  return location ? `${ip}（${location}）` : ip
})

const avatarUrl = computed(() => {
  const user = auth.user as Record<string, any> | null
  const url = (user as any)?.avatarUrl as string | null | undefined
  if (typeof url === 'string' && url.trim().length > 0) {
    return url.trim()
  }
  return null
})
const avatarUploading = ref(false)
const avatarUploadProgress = ref(0)
const avatarFileInput = ref<HTMLInputElement | null>(null)
let avatarProgressTimer: number | null = null

function triggerAvatarSelect() {
  if (!isAuthenticated.value) {
    ui.openLoginDialog()
    return
  }
  avatarFileInput.value?.click()
}

async function handleAvatarFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return
  if (!auth.token) {
    ui.openLoginDialog()
    return
  }
  avatarUploading.value = true
  avatarUploadProgress.value = 0

  if (avatarProgressTimer !== null) {
    window.clearInterval(avatarProgressTimer)
  }
  avatarProgressTimer = window.setInterval(() => {
    if (avatarUploadProgress.value < 90) {
      avatarUploadProgress.value += 5
    }
  }, 200)

  ui.startLoading()
  try {
    await auth.uploadAvatar(file)
    avatarUploadProgress.value = 100
    toast.add({
      title: '头像已更新',
      description: '您的头像已成功上传并更新。',
      color: 'success',
    })
  } catch (error) {
    handleError(error, '上传头像失败')
  } finally {
    if (avatarProgressTimer !== null) {
      window.clearInterval(avatarProgressTimer)
      avatarProgressTimer = null
    }
    avatarUploading.value = false
    ui.stopLoading()
    if (target) {
      target.value = ''
    }
  }
}

watch(
  () => auth.isAuthenticated,
  (value) => {
    if (value) void loadUser()
    else resetForm()
  },
)
</script>

<template>
  <form
    id="profile-form-basic"
    class="flex flex-col gap-6 transition-opacity"
    :class="{ 'pointer-events-none opacity-60': loading && !saving }"
    @submit.prevent="handleSave"
  >
    <input
      ref="avatarFileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleAvatarFileChange"
    />

    <BasicSection
      ref="basicSectionRef"
      :model-value="{
        name: form.name,
        displayName: form.displayName,
        piic: (auth.user as any)?.profile?.piic ?? '',
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
      :avatar-url="avatarUrl"
      :avatar-uploading="avatarUploading"
      :avatar-upload-progress="avatarUploadProgress"
      :on-avatar-click="triggerAvatarSelect"
      :gender-options="genderOptions"
      :timezone-options="timezoneOptions"
      :language-options="languageOptions"
      :meta="{
        lastSyncedText: lastSyncedAt
          ? dayjs(lastSyncedAt).format('YYYY年MM月DD日 HH:mm')
          : '尚未同步',
        registeredText: registeredText,
        joinedText: joinedText,
        lastLoginText: lastLoginText,
        lastLoginIp: lastLoginIp,
        lastLoginIpDisplay: lastLoginIpDisplay,
        roleNames: roleNames,
      }"
      :saving="saving"
      :reset-signal="resetSignal"
      @editing-change="(v: boolean) => (isEditingAny = v)"
      @request-save="handleSave"
      @request-reset="handleReset"
      :contact-summary="contactSummary"
      :phone-verification-enabled="phoneVerificationEnabled"
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
  </form>
</template>

<style scoped></style>
