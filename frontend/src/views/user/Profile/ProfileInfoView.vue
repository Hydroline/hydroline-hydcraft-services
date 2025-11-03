<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { useAuthStore, type GenderType, type UpdateCurrentUserPayload } from '@/stores/auth'
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
}

const auth = useAuthStore()
const ui = useUiStore()
const toast = useToast()

const isAuthenticated = computed(() => auth.isAuthenticated)
const loading = ref(false)
const saving = ref(false)
const lastSyncedAt = ref<string | null>(null)
const initialSnapshot = ref('')

const genderOptions: Array<{ label: string; value: GenderType }> = [
  { label: '未指定', value: 'UNSPECIFIED' },
  { label: '男性', value: 'MALE' },
  { label: '女性', value: 'FEMALE' },
  { label: '非二元', value: 'NON_BINARY' },
  { label: '其他', value: 'OTHER' },
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
})

const hasChanges = computed(() => serializeForm() !== initialSnapshot.value)
const canSubmit = computed(
  () => isAuthenticated.value && hasChanges.value && !saving.value && !loading.value,
)

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

const joinedText = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user?.createdAt) return ''
  return dayjs(user.createdAt).format('YYYY年M月D日')
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
      void loadUser()
    } else {
      resetForm()
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
  const extra =
    user.profile?.extra && typeof user.profile.extra === 'object'
      ? (user.profile.extra as Record<string, unknown>)
      : {}
  for (const key of addressFields) {
    const value = extra && typeof extra[key] === 'string' ? (extra[key] as string) : ''
    form[key] = value
  }
  lastSyncedAt.value = user.updatedAt ?? null
  initialSnapshot.value = serializeForm()
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
      typeof existingExtra[key] === 'string' ? (existingExtra[key] as string).trim() : ''
    if (newValue !== currentValue) {
      extraChanged = true
    }
    if (newValue) {
      extraPayload[key] = newValue
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

function handleReset() {
  if (!auth.user) {
    resetForm()
    return
  }
  populateForm(auth.user)
  toast.add({
    title: '已还原修改',
    description: '表单内容已恢复为最新的服务器数据。',
    color: 'info',
  })
}

function openLoginDialog() {
  ui.openLoginDialog()
}

function handleError(error: unknown, fallback: string) {
  const description =
    error instanceof ApiError ? error.message : '请稍后重试，若问题持续请联系管理员。'
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
    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">用户信息</h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        更新账户基础信息、个性化偏好与联系地址，让我们在需要联系您时更加顺畅。
      </p>
    </header>

    <div v-if="isAuthenticated" class="space-y-6">
      <div
        class="rounded-3xl border border-slate-200/70 bg-gradient-to-r from-white/90 via-white/85 to-white/90 p-[1px] shadow-2xl backdrop-blur dark:border-slate-800/70 dark:from-slate-900/80 dark:via-slate-900/85 dark:to-slate-900/80"
      >
        <div
          class="rounded-[calc(1.5rem-1px)] bg-white/95 p-6 dark:bg-slate-950/80 md:p-8"
        >
          <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div class="flex items-center gap-4">
              <UserAvatar
                :src="avatarUrl"
                :name="auth.displayName ?? auth.user?.email"
                size="lg"
              />
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-primary-500">
                  Hydroline 账户
                </p>
                <h2 class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                  {{ (auth.displayName ?? form.email) || '用户' }}
                </h2>
                <p class="text-sm text-slate-600 dark:text-slate-300">
                  {{ form.email }}
                </p>
              </div>
            </div>
            <div class="flex flex-col items-start gap-3 text-sm text-slate-500 md:items-end">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-history" class="h-4 w-4" />
                <span>最后同步：{{ lastSyncedText }}</span>
              </div>
              <div v-if="joinedText" class="flex items-center gap-2">
                <UIcon name="i-lucide-calendar" class="h-4 w-4" />
                <span>加入于 {{ joinedText }}</span>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  variant="ghost"
                  size="xs"
                  :disabled="loading"
                  icon="i-lucide-refresh-cw"
                  @click="loadUser"
                >
                  重新同步
                </UButton>
                <UBadge
                  v-if="saving"
                  color="primary"
                  variant="soft"
                  class="animate-pulse"
                >
                  正在保存…
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <form
        class="space-y-6 transition-opacity"
        :class="{ 'pointer-events-none opacity-60': loading && !saving }"
        @submit.prevent="handleSave"
      >
        <div class="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <UCard class="bg-white/85 shadow-sm backdrop-blur-sm dark:bg-slate-900/60">
            <template #header>
              <div class="flex flex-col gap-1">
                <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                  基础资料
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  这些信息将用于识别与个性化体验，可随时更新。
                </p>
              </div>
            </template>

            <div class="grid gap-4 md:grid-cols-2">
              <label class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">显示名称</span>
                <UInput
                  v-model="form.displayName"
                  placeholder="用于站内展示的名字"
                />
              </label>
              <label class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">真实姓名</span>
                <UInput v-model="form.name" placeholder="例如：陈嘉禾" />
              </label>
              <label class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">邮箱</span>
                <UInput v-model="form.email" type="email" disabled />
              </label>
              <div class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">性别</span>
                <USelectMenu
                  v-model="form.gender"
                  :options="genderOptions"
                  value-attribute="value"
                  option-attribute="label"
                  class="w-full"
                  :popper="{ placement: 'bottom-start' }"
                />
              </div>
              <label class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">生日</span>
                <UInput v-model="form.birthday" type="date" />
              </label>
              <label class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">时区</span>
                <UInput v-model="form.timezone" placeholder="例如：Asia/Shanghai" />
              </label>
              <label class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">语言</span>
                <UInput
                  v-model="form.locale"
                  placeholder="例如：zh-CN"
                  maxlength="32"
                />
              </label>
            </div>

            <label class="mt-4 flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
              <span class="font-medium text-slate-700 dark:text-slate-200">个性签名</span>
              <UTextarea
                v-model="form.motto"
                :rows="3"
                placeholder="向社区介绍你自己，保持简洁有力。"
              />
            </label>
          </UCard>

          <UCard class="bg-white/85 shadow-sm backdrop-blur-sm dark:bg-slate-900/60">
            <template #header>
              <div class="flex flex-col gap-1">
                <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                  联系与地址
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  这些信息仅用于必要的联系和服务交付，不会对外公开。
                </p>
              </div>
            </template>

            <div class="grid gap-4">
              <label class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">地址（行 1）</span>
                <UInput v-model="form.addressLine1" placeholder="街道、门牌号等" />
              </label>
              <label class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">地址（行 2）</span>
                <UInput v-model="form.addressLine2" placeholder="单元、楼层等补充信息" />
              </label>
              <div class="grid gap-4 md:grid-cols-2">
                <label
                  class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span class="font-medium text-slate-700 dark:text-slate-200">城市</span>
                  <UInput v-model="form.city" placeholder="所在城市" />
                </label>
                <label
                  class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span class="font-medium text-slate-700 dark:text-slate-200">省 / 州</span>
                  <UInput v-model="form.state" placeholder="所在省份或州" />
                </label>
              </div>
              <div class="grid gap-4 md:grid-cols-2">
                <label
                  class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span class="font-medium text-slate-700 dark:text-slate-200">邮政编码</span>
                  <UInput v-model="form.postalCode" placeholder="邮编" />
                </label>
                <label
                  class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span class="font-medium text-slate-700 dark:text-slate-200">国家 / 地区</span>
                  <UInput v-model="form.country" placeholder="例如：中国" />
                </label>
              </div>
              <label class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-700 dark:text-slate-200">联系电话</span>
                <UInput v-model="form.phone" placeholder="用于紧急联系" />
              </label>
            </div>
          </UCard>
        </div>

        <div class="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/85 p-4 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-900/60 md:flex-row md:items-center md:justify-between md:p-5">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-slate-800 dark:text-slate-200">
              {{ hasChanges ? '检测到未保存的修改' : '所有信息均已同步' }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              修改将立刻同步至账户配置，用于未来的服务体验与通知。
            </p>
          </div>
          <div class="flex items-center gap-3">
            <UButton
              type="button"
              variant="ghost"
              :disabled="!hasChanges || saving || loading"
              @click="handleReset"
            >
              恢复
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="saving"
              :disabled="!canSubmit"
            >
              保存更改
            </UButton>
          </div>
        </div>
      </form>
    </div>

    <UCard
      v-else
      class="flex flex-col items-center gap-4 bg-white/85 py-12 text-center shadow-sm backdrop-blur-sm dark:bg-slate-900/65"
    >
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white">需要登录</h2>
      <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">
        登录后即可完善个人资料与联系地址，确保服务体验与通知准确触达。
      </p>
      <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
    </UCard>
  </section>
</template>
