<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { useRouter, useRoute } from 'vue-router'
import ProfileHeader from './components/ProfileHeader.vue'
import ProfileSidebar from './components/ProfileSidebar.vue'
import BasicSection from './components/sections/BasicSection.vue'
import { getTimezones } from '@/utils/timezones'
import { useAuthStore, type GenderType, type UpdateCurrentUserPayload } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { ApiError } from '@/utils/api'

type SectionKey = 'basic' | 'minecraft' | 'sessions'

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
const router = useRouter()
const route = useRoute()
const toast = useToast()

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

const timezoneOptions = ref(getTimezones().map((tz) => ({ label: tz, value: tz })))
const languageOptions = ref([{ label: '中文（简体）', value: 'zh-CN' }])

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
  if ((user.email ?? '') !== form.email.trim()) payload.email = form.email.trim()
  if ((user.profile?.displayName ?? '') !== form.displayName.trim()) payload.displayName = form.displayName.trim()
  const currentGender = (user.profile?.gender as GenderType | undefined) ?? 'UNSPECIFIED'
  if (currentGender !== form.gender) payload.gender = form.gender
  const currentBirthday = user.profile?.birthday ? String(user.profile.birthday).slice(0, 10) : ''
  if (form.birthday !== currentBirthday && form.birthday) payload.birthday = form.birthday
  if ((user.profile?.motto ?? '') !== form.motto.trim()) payload.motto = form.motto.trim()
  if ((user.profile?.timezone ?? '') !== form.timezone.trim()) payload.timezone = form.timezone.trim()
  if ((user.profile?.locale ?? '') !== form.locale.trim()) payload.locale = form.locale.trim()
  const existingExtra = user.profile?.extra && typeof user.profile.extra === 'object' ? (user.profile.extra as Record<string, unknown>) : {}
  const extraPayload: Record<string, string> = {}
  let extraChanged = false
  const addressKeys = ['addressLine1', 'postalCode'] as const
  for (const k of addressKeys) {
    const newValue = (form as any)[k].trim()
    const currentValue = typeof existingExtra[k] === 'string' ? String(existingExtra[k]).trim() : ''
    if (newValue !== currentValue) extraChanged = true
    if (newValue) (extraPayload as any)[k] = newValue
  }
  const flatKeys = ['phoneCountry', 'regionCountry', 'regionProvince', 'regionCity', 'regionDistrict', 'phone'] as const
  for (const k of flatKeys) {
    const newValue = String((form as any)[k] ?? '').trim()
    const currentValue = typeof existingExtra[k] === 'string' ? String(existingExtra[k]).trim() : ''
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
  form.gender = (user.profile?.gender as GenderType | undefined) ?? 'UNSPECIFIED'
  form.birthday = user.profile?.birthday ? String(user.profile.birthday).slice(0, 10) : ''
  form.motto = user.profile?.motto ?? ''
  form.timezone = user.profile?.timezone ?? ''
  form.locale = user.profile?.locale ?? ''
  const extra = user.profile?.extra && typeof user.profile.extra === 'object' ? (user.profile.extra as Record<string, unknown>) : {}
  form.addressLine1 = typeof extra['addressLine1'] === 'string' ? (extra['addressLine1'] as string) : ''
  form.postalCode = typeof extra['postalCode'] === 'string' ? (extra['postalCode'] as string) : ''
  form.phone = typeof extra['phone'] === 'string' ? (extra['phone'] as string) : ''
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
    toast.add({ title: '没有检测到改动', description: '您尚未修改任何字段。', color: 'neutral' })
    return
  }
  const payload = buildPayload()
  if (Object.keys(payload).length === 0) {
    toast.add({ title: '无法保存', description: '请检查填写的内容是否有效。', color: 'warning' })
    return
  }
  saving.value = true
  ui.startLoading()
  try {
    const updated = await auth.updateCurrentUser(payload)
    lastSyncedAt.value = updated.updatedAt ?? lastSyncedAt.value
    initialSnapshot.value = serializeForm()
    toast.add({ title: '资料已更新', description: '您的账户信息已成功保存。', color: 'success' })
  } catch (error) {
    handleError(error, '保存失败')
  } finally {
    saving.value = false
    ui.stopLoading()
  }
}

function handleReset(showToast = true) {
  if (!auth.user) {
    resetForm(); return
  }
  populateForm(auth.user as any)
  if (showToast) {
    toast.add({ title: '已还原修改', description: '表单内容已恢复为最新的服务器数据。', color: 'info' })
  }
}

function handleError(error: unknown, fallback: string) {
  const description = error instanceof ApiError ? error.message : '请稍后重试，若问题持续请联系管理员。'
  toast.add({ title: fallback, description, color: 'error' })
  console.error('[profile-info-basic]', error)
}

const avatarUrl = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user) return null
  if (user.profile?.avatarUrl) return user.profile.avatarUrl as string
  if (user.image) return user.image as string
  return null
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
  const location = ((user as any)?.lastLoginIpLocation ?? (user as any)?.lastLoginIpLocationRaw ?? null) as string | null
  if (!location) return null
  const cleaned = location.replace(/\s*·\s*/g, ' ').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
})
const lastLoginIpDisplay = computed(() => {
  const ip = lastLoginIp.value
  if (!ip) return ''
  const location = lastLoginIpLocation.value
  return location ? `${ip}（${location}）` : ip
})

watch(() => auth.isAuthenticated, (value) => { if (value) void loadUser(); else resetForm() })

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

</script>

<template>
  <section class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-8">
    <div v-if="isAuthenticated" class="space-y-6">
      <ProfileHeader
        :avatar-url="avatarUrl"
        :display-name="auth.displayName ?? form.email"
        :email="form.email"
        :last-synced-text="lastSyncedAt ? dayjs(lastSyncedAt).format('YYYY年MM月DD日 HH:mm') : '尚未同步'"
        :joined-text="joinedText"
        :registered-text="registeredText"
        :last-login-text="lastLoginText"
        :last-login-ip="lastLoginIp"
        :loading="loading"
        @refresh="loadUser"
      />
      <form id="profile-form-basic" class="flex flex-col gap-6 transition-opacity" :class="{ 'pointer-events-none opacity-60': loading && !saving }" @submit.prevent="handleSave">
        <div class="flex flex-col gap-2 relative xl:flex-row xl:gap-6">
          <ProfileSidebar :items="sections" :active-id="activeId" :editing="isEditingAny" @update:active-id="(id: string) => gotoSection(id as SectionKey)" />
          <div class="flex-1 space-y-6">
            <BasicSection
              ref="basicSectionRef"
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
              :meta="{ lastSyncedText: lastSyncedAt ? dayjs(lastSyncedAt).format('YYYY年MM月DD日 HH:mm') : '尚未同步', registeredText: registeredText, joinedText: joinedText, lastLoginText: lastLoginText, lastLoginIp: lastLoginIp, lastLoginIpDisplay: lastLoginIpDisplay }"
              :saving="saving"
              :reset-signal="resetSignal"
              @editing-change="(v: boolean) => (isEditingAny = v)"
              @request-save="handleSave"
              @request-reset="handleReset"
              @update:model-value="(v: any) => { form.name = v.name; form.displayName = v.displayName; form.email = v.email; form.gender = v.gender; form.birthday = v.birthday; form.motto = v.motto; form.timezone = v.timezone; form.locale = v.locale; form.phone = v.phone; form.phoneCountry = v.phoneCountry; form.regionCountry = v.region.country; form.regionProvince = v.region.province; form.regionCity = v.region.city; form.regionDistrict = v.region.district; form.addressLine1 = v.addressLine1; form.postalCode = v.postalCode }"
            />
          </div>
        </div>
      </form>
    </div>
    <UCard v-else class="flex flex-col items-center gap-4 bg-white/85 py-12 text-center shadow-sm backdrop-blur-sm dark:bg-slate-900/65">
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white">需要登录</h2>
      <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">登录后即可完善个人资料与联系地址，确保服务体验与通知准确触达。</p>
      <UButton color="primary" @click="ui.openLoginDialog()">立即登录</UButton>
    </UCard>
  </section>
</template>

<style scoped></style>
