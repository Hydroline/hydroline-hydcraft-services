<script setup lang="ts">
import { computed } from 'vue'
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
  isEditing: boolean
  genderOptions: Array<{ label: string; value: GenderType }>
  timezoneOptions: Array<{ label: string; value: string }>
  languageOptions: Array<{ label: string; value: string }>
  meta?: {
    lastSyncedText?: string
    registeredText?: string
    joinedText?: string
    lastLoginText?: string
    lastLoginIp?: string | null
  }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: typeof props.modelValue): void
}>()

function update<K extends keyof typeof props.modelValue>(
  key: K,
  value: (typeof props.modelValue)[K],
) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
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
</script>

<template>
  <div class="space-y-8">
    <!-- 基础信息 -->
    <div class="space-y-4">
      <h3 class="px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        基础信息
      </h3>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          显示名称
        </div>
        <div class="flex-1">
          <UInput
            v-if="isEditing"
            v-model="props.modelValue.displayName"
            placeholder="用于站内展示的名字"
            class="w-full"
          />
          <p v-else class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.modelValue.displayName || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          用户名
        </div>
        <div class="flex-1">
          <UInput
            v-if="isEditing"
            :model-value="props.modelValue.name"
            placeholder="例如：aurora"
            class="w-full"
            @update:model-value="(v: any) => update('name', v)"
          />
          <p v-else class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.modelValue.name || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          邮箱
        </div>
        <div class="flex-1">
          <UInput
            v-if="isEditing"
            :model-value="props.modelValue.email"
            type="email"
            class="w-full"
            @update:model-value="(v: any) => update('email', v)"
          />
          <p v-else class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.modelValue.email || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          性别
        </div>
        <div class="flex-1">
          <USelectMenu
            v-if="isEditing"
            :model-value="props.modelValue.gender"
            :items="props.genderOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            @update:model-value="(v: any) => update('gender', v)"
          />
          <p v-else class="text-sm text-slate-900 dark:text-slate-100">
            {{ genderLabel }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          生日
        </div>
        <div class="flex-1">
          <UInput
            v-if="isEditing"
            :model-value="props.modelValue.birthday"
            type="date"
            class="w-full"
            @update:model-value="(v: any) => update('birthday', v)"
          />
          <p v-else class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.modelValue.birthday || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          时区
        </div>
        <div class="flex-1">
          <USelectMenu
            v-if="isEditing"
            :model-value="props.modelValue.timezone"
            :items="props.timezoneOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            :filter-fields="['label', 'value']"
            @update:model-value="(v: any) => update('timezone', v)"
          />
          <p v-else class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.modelValue.timezone || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          语言
        </div>
        <div class="flex-1">
          <USelectMenu
            v-if="isEditing"
            :model-value="props.modelValue.locale"
            :items="props.languageOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            @update:model-value="(v: any) => update('locale', v)"
          />
          <p v-else class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.modelValue.locale || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          个性签名
        </div>
        <div class="flex-1">
          <UTextarea
            v-if="isEditing"
            :model-value="props.modelValue.motto"
            :rows="3"
            placeholder="向社区介绍你自己，保持简洁有力。"
            class="w-full"
            @update:model-value="(v: any) => update('motto', v)"
          />
          <p
            v-else
            class="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-line"
          >
            {{ props.modelValue.motto || '未填写' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 地区 -->
    <div class="space-y-4">
      <h3 class="px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        地区
      </h3>

      <div
        class="flex flex-col gap-3 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          手机号
        </div>
        <div class="flex-1 flex gap-2">
          <USelectMenu
            v-if="isEditing"
            :model-value="props.modelValue.phoneCountry"
            :items="[...phoneRegions]"
            value-key="code"
            label-key="name"
            class="w-40"
            @update:model-value="(v: any) => update('phoneCountry', v)"
          />
          <template v-else>
            <p class="text-sm text-slate-900 dark:text-slate-100">
              {{
                phoneRegions.find(
                  (r) => r.code === props.modelValue.phoneCountry,
                )?.dial || ''
              }}
            </p>
          </template>
          <div class="flex-1">
            <UInput
              v-if="isEditing"
              :model-value="props.modelValue.phone"
              type="tel"
              placeholder="请输入手机号"
              class="w-full"
              @update:model-value="(v: any) => update('phone', v)"
            />
            <p v-else class="text-sm text-slate-900 dark:text-slate-100">
              {{ props.modelValue.phone || '未填写' }}
            </p>
          </div>
        </div>
      </div>

      <!-- 中国式地址选择（编辑时显示下拉，不编辑显示文本） -->
      <template v-if="isEditing">
        <div class="rounded-xl px-4 py-3">
          <RegionSelector
            :model-value="props.modelValue.region"
            :disabled="!isEditing"
            @update:model-value="(v: any) => update('region', v)"
          />
        </div>
      </template>
      <template v-else>
        <div
          class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
        >
          <div
            class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
          >
            国家 / 地区
          </div>
          <div class="flex-1">
            <p class="text-sm text-slate-900 dark:text-slate-100">
              {{ countryName }}
            </p>
          </div>
        </div>
        <div
          class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
        >
          <div
            class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
          >
            省 / 直辖市
          </div>
          <div class="flex-1">
            <p class="text-sm text-slate-900 dark:text-slate-100">
              {{ props.modelValue.region?.province || '未填写' }}
            </p>
          </div>
        </div>
        <div
          class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
        >
          <div
            class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
          >
            城市
          </div>
          <div class="flex-1">
            <p class="text-sm text-slate-900 dark:text-slate-100">
              {{ props.modelValue.region?.city || '未填写' }}
            </p>
          </div>
        </div>
        <div
          class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
        >
          <div
            class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
          >
            区 / 县
          </div>
          <div class="flex-1">
            <p class="text-sm text-slate-900 dark:text-slate-100">
              {{ props.modelValue.region?.district || '未填写' }}
            </p>
          </div>
        </div>
      </template>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          详细地址
        </div>
        <div class="flex-1">
          <div
            v-if="isEditing"
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
          <p v-else class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.modelValue.addressLine1 || '未填写' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          邮政编码
        </div>
        <div class="flex-1">
          <div
            v-if="isEditing"
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
          <p v-else class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.modelValue.postalCode || '未填写' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 账号活动（只读） -->
    <div class="space-y-4">
      <h3 class="px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        账号活动
      </h3>
      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          最后同步
        </div>
        <div class="flex-1">
          <p class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.meta?.lastSyncedText || '尚未同步' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          注册于
        </div>
        <div class="flex-1">
          <p class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.meta?.registeredText || '未知' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          加入于
        </div>
        <div class="flex-1">
          <p class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.meta?.joinedText || '未知' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          最近登录
        </div>
        <div class="flex-1">
          <p class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.meta?.lastLoginText || '未知' }}
          </p>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6"
      >
        <div
          class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
        >
          最近登录 IP
        </div>
        <div class="flex-1">
          <p class="text-sm text-slate-900 dark:text-slate-100">
            {{ props.meta?.lastLoginIp || '未知' }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
