<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GenderType } from '@/stores/auth'
import RegionSelector from '../RegionSelector.vue'
import { countries } from '../region-data'

const phoneRegions = [
  { code: 'CN', name: '中国大陆 +86', dial: '+86' },
  { code: 'HK', name: '中国香港 +852', dial: '+852' },
  { code: 'MO', name: '中国澳门 +853', dial: '+853' },
  { code: 'TW', name: '中国台湾 +886', dial: '+886' },
] as const

type PhoneCountry = (typeof phoneRegions)[number]['code']

const props = defineProps<{
  modelValue: {
    name: string
    displayName: string
    piic: string
    email: string
    gender: GenderType
    birthday: string
    motto: string
    timezone: string
    locale: string
    phone: string
    phoneCountry: PhoneCountry
    region: {
      country: 'CN' | 'OTHER'
      province?: string | null
      city?: string | null
      district?: string | null
    }
    addressLine1: string
    postalCode: string
  }
  // 卡片内保存按钮 loading
  saving?: boolean
  // 外部强制退出编辑的信号（值变化即可触发）
  resetSignal?: number
  genderOptions: Array<{ label: string; value: GenderType }>
  timezoneOptions: Array<{ label: string; value: string }>
  languageOptions: Array<{ label: string; value: string }>
  meta?: {
    lastSyncedText?: string
    registeredText?: string
    joinedText?: string
    lastLoginText?: string
    lastLoginIp?: string | null
    lastLoginIpDisplay?: string | null
    roleNames?: string[]
  }
  contactSummary?: {
    email?: {
      value: string
      isPrimary: boolean
      verified: boolean
    } | null
    phone?: {
      value: string
      dialCode: string
      number: string
      display: string
      isPrimary: boolean
      verified: boolean
    } | null
  }
  phoneVerificationEnabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: typeof props.modelValue): void
  (e: 'editing-change', editing: boolean): void
  (e: 'request-save'): void
  (e: 'request-reset'): void
  (e: 'editing-guard', target: 'basic' | 'region'): void
}>()

function update<K extends keyof typeof props.modelValue>(
  key: K,
  value: (typeof props.modelValue)[K],
) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

const genderLabel = computed(
  () =>
    props.genderOptions.find((g) => g.value === props.modelValue.gender)
      ?.label || '未指定',
)

// 由 RegionSelector 内部处理更新
const countryName = computed(() => {
  const code = props.modelValue.region?.country || 'OTHER'
  return countries.find((c) => c.code === code)?.name || '未填写'
})

const languageLabel = computed(() => {
  const value = props.modelValue.locale
  return (
    props.languageOptions.find((opt) => opt.value === value)?.label ||
    value ||
    '未填写'
  )
})

const emailContact = computed(() => props.contactSummary?.email ?? null)
const emailDisplay = computed(() => {
  const preferred = normalizeString(emailContact.value?.value)
  if (preferred) return preferred
  return normalizeString(props.modelValue.email)
})

const phoneContact = computed(() => props.contactSummary?.phone ?? null)
const fallbackDial = computed(() => {
  const entry = phoneRegions.find(
    (region) => region.code === props.modelValue.phoneCountry,
  )
  return entry?.dial ?? ''
})
const fallbackPhoneDisplay = computed(() => {
  const dial = fallbackDial.value
  const number = normalizeString(props.modelValue.phone)
  if (!dial) return number
  return number ? `${dial} ${number}` : dial
})
const phoneDisplay = computed(() => {
  const preferred = normalizeString(phoneContact.value?.display)
  if (preferred) return preferred
  return fallbackPhoneDisplay.value
})
const phoneVerificationActive = computed(
  () => Boolean(props.phoneVerificationEnabled),
)

const editingBasic = ref(false)
const editingRegion = ref(false)
const basicSnapshot = ref<string | null>(null)
const regionSnapshot = ref<string | null>(null)

function basicPayload() {
  const source = props.modelValue
  return {
    name: source.name ?? '',
    displayName: source.displayName ?? '',
    email: source.email ?? '',
    gender: source.gender ?? 'UNSPECIFIED',
    birthday: source.birthday ?? '',
    motto: source.motto ?? '',
    timezone: source.timezone ?? '',
    locale: source.locale ?? '',
  }
}

function regionPayload() {
  const source = props.modelValue
  const region = source.region ?? {}
  return {
    phone: source.phone ?? '',
    phoneCountry: source.phoneCountry ?? 'CN',
    country: region.country ?? 'CN',
    province: region.province ?? '',
    city: region.city ?? '',
    district: region.district ?? '',
    addressLine1: source.addressLine1 ?? '',
    postalCode: source.postalCode ?? '',
  }
}

function hasBasicChanges() {
  if (!basicSnapshot.value) return false
  return basicSnapshot.value !== JSON.stringify(basicPayload())
}

function hasRegionChanges() {
  if (!regionSnapshot.value) return false
  return regionSnapshot.value !== JSON.stringify(regionPayload())
}

function captureSnapshot(which: 'basic' | 'region') {
  if (which === 'basic') {
    basicSnapshot.value = JSON.stringify(basicPayload())
  } else {
    regionSnapshot.value = JSON.stringify(regionPayload())
  }
}

function clearSnapshot(which: 'basic' | 'region') {
  if (which === 'basic') {
    basicSnapshot.value = null
  } else {
    regionSnapshot.value = null
  }
}

function setEditing(which: 'basic' | 'region', value: boolean, force = false) {
  if (!force) {
    if (which === 'basic' && editingBasic.value === value) return
    if (which === 'region' && editingRegion.value === value) return
  }
  if (value) {
    if (which === 'basic') {
      if (!force && editingRegion.value) {
        if (hasRegionChanges()) {
          emit('editing-guard', 'basic')
          return
        }
        editingRegion.value = false
        clearSnapshot('region')
      }
      editingBasic.value = true
      captureSnapshot('basic')
    } else {
      if (!force && editingBasic.value) {
        if (hasBasicChanges()) {
          emit('editing-guard', 'region')
          return
        }
        editingBasic.value = false
        clearSnapshot('basic')
      }
      editingRegion.value = true
      captureSnapshot('region')
    }
  } else {
    if (which === 'basic') {
      editingBasic.value = false
      clearSnapshot('basic')
    } else {
      editingRegion.value = false
      clearSnapshot('region')
    }
  }
  emit('editing-change', editingBasic.value || editingRegion.value)
}

watch(
  () => props.resetSignal,
  () => {
    editingBasic.value = false
    editingRegion.value = false
    basicSnapshot.value = null
    regionSnapshot.value = null
    emit('editing-change', false)
  },
)

function saveBasic() {
  // 请求父组件保存（父负责实际提交）
  emit('request-save')
  setEditing('basic', false, true)
}

function cancelBasic() {
  if (hasBasicChanges()) {
    emit('request-reset')
  }
  setEditing('basic', false, true)
}

function saveRegion() {
  emit('request-save')
  setEditing('region', false, true)
}

function cancelRegion() {
  if (hasRegionChanges()) {
    emit('request-reset')
  }
  setEditing('region', false, true)
}

function forceEdit(which: 'basic' | 'region') {
  setEditing(which, true, true)
}

defineExpose({ forceEdit })
</script>

<template>
  <div class="space-y-8">
    <!-- 基础信息 -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">
          基础信息
        </h3>
        <div>
          <template v-if="!editingBasic">
            <UButton
              size="sm"
              variant="ghost"
              @click="setEditing('basic', true)"
              >编辑</UButton
            >
          </template>
          <template v-else>
            <UButton
              size="sm"
              variant="solid"
              color="primary"
              :loading="props.saving"
              @click="saveBasic"
              >保存</UButton
            >
            <UButton size="sm" variant="ghost" class="ml-2" @click="cancelBasic"
              >取消</UButton
            >
          </template>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          PIIC
          <UTooltip text="玩家身份标识编码">
            <button
              type="button"
              class="text-slate-400 transition hover:text-slate-600 focus:outline-none dark:text-slate-500 dark:hover:text-slate-300"
            >
              <UIcon name="i-lucide-info" class="h-4 w-4" />
              <span class="sr-only">玩家身份标识编码</span>
            </button>
          </UTooltip>
        </div>
        <div class="flex-1">
          <p class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.modelValue.piic }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          名称
        </div>
        <div class="flex-1">
          <UInput
            v-if="editingBasic"
            :model-value="props.modelValue.displayName"
            placeholder="用于站内展示的名字"
            class="w-full"
            @update:model-value="(v: any) => update('displayName', v)"
          />
          <p
            v-else
            class="text-sm"
            :class="
              props.modelValue.displayName
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.modelValue.displayName || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          用户名
          <UTooltip text="用户名每30天仅可修改一次">
            <button
              type="button"
              class="text-slate-400 transition hover:text-slate-600 focus:outline-none dark:text-slate-500 dark:hover:text-slate-300"
            >
              <UIcon name="i-lucide-info" class="h-4 w-4" />
              <span class="sr-only">用户名修改限制说明</span>
            </button>
          </UTooltip>
        </div>
        <div class="flex-1">
          <UInput
            v-if="editingBasic"
            :model-value="props.modelValue.name"
            placeholder="例如：aurora"
            class="w-full"
            @update:model-value="(v: any) => update('name', v)"
          />
          <p
            v-else
            class="text-sm"
            :class="
              props.modelValue.name
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.modelValue.name || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          权限组
        </div>
        <div class="flex-1">
          <div
            v-if="props.meta?.roleNames && props.meta.roleNames.length > 0"
            class="flex flex-wrap gap-2"
          >
            <UBadge
              v-for="role in props.meta.roleNames"
              :key="role"
              variant="soft"
              class="text-xs"
            >
              {{ role }}
            </UBadge>
          </div>
          <p v-else class="text-sm text-slate-400 dark:text-slate-500">
            暂无权限组
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          邮箱
        </div>
        <div class="flex-1">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span
              :class="
                emailDisplay
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-400 dark:text-slate-500'
              "
            >
              {{ emailDisplay || '未填写' }}
            </span>
            <template v-if="emailContact">
              <UBadge
                size="sm"
                variant="soft"
                :color="emailContact.isPrimary ? 'primary' : 'neutral'"
              >
                {{ emailContact.isPrimary ? '主邮箱' : '辅助' }}
              </UBadge>
              <UBadge
                size="sm"
                variant="soft"
                :color="emailContact.verified ? 'success' : 'warning'"
              >
                {{ emailContact.verified ? '已验证' : '未验证' }}
              </UBadge>
            </template>
          </div>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          性别
        </div>
        <div class="flex-1">
          <USelect
            v-if="editingBasic"
            :model-value="props.modelValue.gender"
            :items="props.genderOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            @update:model-value="(v: any) => update('gender', v)"
          />
          <p
            v-else
            class="text-sm"
            :class="
              props.modelValue.gender !== 'UNSPECIFIED'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ genderLabel }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          生日
        </div>
        <div class="flex-1">
          <UInput
            v-if="editingBasic"
            :model-value="props.modelValue.birthday"
            type="date"
            class="w-full"
            @update:model-value="(v: string) => update('birthday', v)"
          />
          <p
            v-else
            class="text-sm"
            :class="
              props.modelValue.birthday
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.modelValue.birthday || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          时区
        </div>
        <div class="flex-1">
          <USelect
            v-if="editingBasic"
            :model-value="props.modelValue.timezone"
            :items="props.timezoneOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            :filter-fields="['label', 'value']"
            @update:model-value="(v: any) => update('timezone', v)"
          />
          <p
            v-else
            class="text-sm"
            :class="
              props.modelValue.timezone
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.modelValue.timezone || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          语言
        </div>
        <div class="flex-1">
          <USelect
            v-if="editingBasic"
            :model-value="props.modelValue.locale"
            :items="props.languageOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            @update:model-value="(v: any) => update('locale', v)"
          />
          <p
            v-else
            class="flex items-center text-sm"
            :class="
              props.modelValue.locale
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ languageLabel }}
            <UBadge
              v-if="props.modelValue.locale"
              class="leading-none text-[9px] w-fit h-fit px-1 py-0.5"
              variant="soft"
            >
              {{ props.modelValue.locale }}
            </UBadge>
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          个性签名
        </div>
        <div class="flex-1">
          <UTextarea
            v-if="editingBasic"
            :model-value="props.modelValue.motto"
            :rows="3"
            placeholder="向社区介绍你自己，保持简洁有力。"
            class="w-full"
            @update:model-value="(v: any) => update('motto', v)"
          />
          <p
            v-else
            class="text-sm whitespace-pre-line"
            :class="
              props.modelValue.motto
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.modelValue.motto || '未填写' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 地区 -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">地区</h3>
        <div>
          <template v-if="!editingRegion">
            <UButton
              size="sm"
              variant="ghost"
              @click="setEditing('region', true)"
              >编辑</UButton
            >
          </template>
          <template v-else>
            <UButton
              size="sm"
              variant="solid"
              color="primary"
              :loading="props.saving"
              @click="saveRegion"
              >保存</UButton
            >
            <UButton
              size="sm"
              variant="ghost"
              class="ml-2"
              @click="cancelRegion"
              >取消</UButton
            >
          </template>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          手机号
        </div>
        <div class="flex-1">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span
              :class="
                phoneDisplay
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-400 dark:text-slate-500'
              "
            >
              {{ phoneDisplay || '未填写' }}
            </span>
            <template v-if="phoneContact">
              <UBadge
                size="sm"
                variant="soft"
                :color="phoneContact.isPrimary ? 'primary' : 'neutral'"
              >
                {{ phoneContact.isPrimary ? '主手机号' : '辅助' }}
              </UBadge>
              <UBadge
                v-if="phoneVerificationActive"
                size="sm"
                variant="soft"
                :color="phoneContact.verified ? 'success' : 'warning'"
              >
                {{ phoneContact.verified ? '已验证' : '未验证' }}
              </UBadge>
            </template>
          </div>
        </div>
      </div>

      <!-- 中国式地址选择（编辑时显示下拉，不编辑显示文本） -->
      <template v-if="editingRegion">
        <RegionSelector
          :model-value="props.modelValue.region"
          :disabled="!editingRegion"
          @update:model-value="(v: any) => update('region', v)"
        />
      </template>
      <template v-else>
        <div
          class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
        >
          <div
            class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
          >
            常驻地区
          </div>
          <div class="flex-1">
            <div class="text-sm space-x-2">
              <span
                :class="
                  countryName !== '未填写'
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-400 dark:text-slate-500'
                "
                >{{ countryName }}</span
              >
              <span
                v-if="props.modelValue.region?.province"
                :class="
                  props.modelValue.region?.province !== '未填写'
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-400 dark:text-slate-500'
                "
                >{{ props.modelValue.region?.province || '未填写' }}</span
              >
              <span
                v-if="props.modelValue.region?.city"
                :class="
                  props.modelValue.region?.city !== '未填写'
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-400 dark:text-slate-500'
                "
                >{{ props.modelValue.region?.city || '未填写' }}</span
              >
              <span
                v-if="props.modelValue.region?.district"
                :class="
                  props.modelValue.region?.district !== '未填写'
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-400 dark:text-slate-500'
                "
                >{{ props.modelValue.region?.district || '未填写' }}</span
              >
            </div>
          </div>
        </div>
      </template>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          详细地址
        </div>
        <div class="flex-1">
          <div
            v-if="editingRegion"
            class="grid grid-cols-1 gap-2 sm:grid-cols-[140px,1fr]"
          >
            <div class="hidden sm:block"></div>
            <UInput
              :model-value="props.modelValue.addressLine1"
              placeholder="街道、门牌号、小区/楼栋等"
              class="w-full"
              @update:model-value="(v: any) => update('addressLine1', v)"
            />
          </div>
          <p
            v-else
            class="text-sm"
            :class="
              props.modelValue.addressLine1
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.modelValue.addressLine1 || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          邮政编码
        </div>
        <div class="flex-1">
          <div
            v-if="editingRegion"
            class="grid grid-cols-1 gap-2 sm:grid-cols-[140px,1fr]"
          >
            <div class="hidden sm:block"></div>
            <UInput
              :model-value="props.modelValue.postalCode"
              placeholder="邮编"
              class="w-full"
              @update:model-value="(v: any) => update('postalCode', v)"
            />
          </div>
          <p
            v-else
            class="text-sm"
            :class="
              props.modelValue.postalCode
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.modelValue.postalCode || '未填写' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 账号活动（只读） -->
    <div class="space-y-3">
      <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">账号活动</h3>
      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          最近同步时间

          <UTooltip text="用户资料最近一次的更新时间">
            <button
              type="button"
              class="text-slate-400 transition hover:text-slate-600 focus:outline-none dark:text-slate-500 dark:hover:text-slate-300"
            >
              <UIcon name="i-lucide-info" class="h-4 w-4" />
            </button>
          </UTooltip>
        </div>
        <div class="flex-1">
          <p
            class="text-sm"
            :class="
              props.meta?.lastSyncedText &&
              props.meta.lastSyncedText !== '尚未同步'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.meta?.lastSyncedText || '尚未同步' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          注册时间
        </div>
        <div class="flex-1">
          <p
            class="text-sm"
            :class="
              props.meta?.registeredText && props.meta.registeredText !== '未知'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.meta?.registeredText || '未知' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          入服时间

          <UTooltip text="新用户默认为注册时间，老用户由管理员根据入群时间设置">
            <button
              type="button"
              class="text-slate-400 transition hover:text-slate-600 focus:outline-none dark:text-slate-500 dark:hover:text-slate-300"
            >
              <UIcon name="i-lucide-info" class="h-4 w-4" />
            </button>
          </UTooltip>
        </div>
        <div class="flex-1">
          <p
            class="text-sm"
            :class="
              props.meta?.joinedText && props.meta.joinedText !== '未知'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.meta?.joinedText || '未知' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          最近登录
        </div>
        <div class="flex-1">
          <p
            class="text-sm"
            :class="
              props.meta?.lastLoginText && props.meta.lastLoginText !== '未知'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{ props.meta?.lastLoginText || '未知' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          最近登录 IP
        </div>
        <div class="flex-1">
          <p
            class="text-sm"
            :class="
              (props.meta?.lastLoginIpDisplay || props.meta?.lastLoginIp) &&
              (props.meta?.lastLoginIpDisplay || props.meta?.lastLoginIp) !==
                '未知'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            "
          >
            {{
              props.meta?.lastLoginIpDisplay ||
              props.meta?.lastLoginIp ||
              '未知'
            }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
