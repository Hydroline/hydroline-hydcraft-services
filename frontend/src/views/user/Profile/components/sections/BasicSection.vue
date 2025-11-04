<script setup lang="ts">
import { computed } from 'vue'
import type { GenderType } from '@/stores/auth'

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
  }
  isEditing: boolean
  genderOptions: Array<{ label: string; value: GenderType }>
  timezoneOptions: string[]
  languageOptions: Array<{ label: string; value: string }>
  meta?: {
    lastSyncedText?: string
    registeredText?: string
    joinedText?: string
    lastLoginText?: string
    lastLoginIp?: string | null
  }
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: typeof props.modelValue): void }>()

function update<K extends keyof typeof props.modelValue>(key: K, value: (typeof props.modelValue)[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

const genderLabel = computed(() =>
  (props.genderOptions.find((g) => g.value === props.modelValue.gender)?.label) || '未指定',
)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">
        显示名称
      </div>
      <div class="flex-1">
        <UInput v-if="isEditing" v-model="props.modelValue.displayName" placeholder="用于站内展示的名字" class="w-full" />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">{{ props.modelValue.displayName || '未填写' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">
        用户名
      </div>
      <div class="flex-1">
        <UInput
          v-if="isEditing"
          :model-value="props.modelValue.name"
          placeholder="例如：aurora"
          class="w-full"
          @update:model-value="(v:any)=>update('name', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">{{ props.modelValue.name || '未填写' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">邮箱</div>
      <div class="flex-1">
        <UInput v-if="isEditing" :model-value="props.modelValue.email" type="email" disabled class="w-full" />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">{{ props.modelValue.email || '未填写' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">性别</div>
      <div class="flex-1">
        <USelectMenu
          v-if="isEditing"
          :model-value="props.modelValue.gender"
          :options="props.genderOptions"
          class="w-full"
          :popper="{ placement: 'bottom-start' }"
          @update:model-value="(v:any)=>update('gender', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">{{ genderLabel }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">生日</div>
      <div class="flex-1">
        <UInput v-if="isEditing" :model-value="props.modelValue.birthday" type="date" class="w-full" @update:model-value="(v:any)=>update('birthday', v)" />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">{{ props.modelValue.birthday || '未填写' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">时区</div>
      <div class="flex-1">
        <USelectMenu
          v-if="isEditing"
          :model-value="props.modelValue.timezone"
          :options="props.timezoneOptions"
          class="w-full"
          :searchable="true"
          :popper="{ placement: 'bottom-start' }"
          @update:model-value="(v:any)=>update('timezone', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">{{ props.modelValue.timezone || '未填写' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">语言</div>
      <div class="flex-1">
        <USelectMenu
          v-if="isEditing"
          :model-value="props.modelValue.locale"
          :options="props.languageOptions"
          class="w-full"
          @update:model-value="(v:any)=>update('locale', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">{{ props.modelValue.locale || '未填写' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">个性签名</div>
      <div class="flex-1">
        <UTextarea v-if="isEditing" :model-value="props.modelValue.motto" :rows="3" placeholder="向社区介绍你自己，保持简洁有力。" class="w-full" @update:model-value="(v:any)=>update('motto', v)" />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-line">{{ props.modelValue.motto || '未填写' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">最后同步</div>
      <div class="flex-1">
        <p class="text-sm text-slate-900 dark:text-slate-100">{{ props.meta?.lastSyncedText || '尚未同步' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">注册于</div>
      <div class="flex-1">
        <p class="text-sm text-slate-900 dark:text-slate-100">{{ props.meta?.registeredText || '未知' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">加入于</div>
      <div class="flex-1">
        <p class="text-sm text-slate-900 dark:text-slate-100">{{ props.meta?.joinedText || '未知' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">最近登录</div>
      <div class="flex-1">
        <p class="text-sm text-slate-900 dark:text-slate-100">{{ props.meta?.lastLoginText || '未知' }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-xl px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none">最近登录 IP</div>
      <div class="flex-1">
        <p class="text-sm text-slate-900 dark:text-slate-100">{{ props.meta?.lastLoginIp || '未知' }}</p>
      </div>
    </div>
  </div>
</template>
