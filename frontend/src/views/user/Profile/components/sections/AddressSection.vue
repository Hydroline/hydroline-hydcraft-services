<script setup lang="ts">
const props = defineProps<{
  modelValue: {
    addressLine1: string
    addressLine2: string
    city: string
    state: string
    postalCode: string
    country: string
    phone: string
    region: {
      country: 'CN' | 'OTHER'
      province?: string | null
      city?: string | null
      district?: string | null
    }
  }
  isEditing: boolean
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
</script>

<template>
  <div class="space-y-4">
    <RegionSelector
      :model-value="props.modelValue.region"
      :disabled="!props.isEditing"
      @update:model-value="(v: any) => update('region', v)"
    />

    <div
      class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
    >
      <div
        class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
      >
        地址（行 1）
      </div>
      <div class="flex-1">
        <UInput
          v-if="isEditing"
          :model-value="props.modelValue.addressLine1"
          placeholder="街道、门牌号等"
          class="w-full"
          @update:model-value="(v: any) => update('addressLine1', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">
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
        地址（行 2）
      </div>
      <div class="flex-1">
        <UInput
          v-if="isEditing"
          :model-value="props.modelValue.addressLine2"
          placeholder="单元、楼层等补充信息"
          class="w-full"
          @update:model-value="(v: any) => update('addressLine2', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">
          {{ props.modelValue.addressLine2 || '未填写' }}
        </p>
      </div>
    </div>

    <div
      class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
    >
      <div
        class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
      >
        城市
      </div>
      <div class="flex-1">
        <UInput
          v-if="isEditing"
          :model-value="props.modelValue.city"
          placeholder="所在城市"
          class="w-full"
          @update:model-value="(v: any) => update('city', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">
          {{ props.modelValue.city || '未填写' }}
        </p>
      </div>
    </div>

    <div
      class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
    >
      <div
        class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
      >
        省 / 州
      </div>
      <div class="flex-1">
        <UInput
          v-if="isEditing"
          :model-value="props.modelValue.state"
          placeholder="所在省份或州"
          class="w-full"
          @update:model-value="(v: any) => update('state', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">
          {{ props.modelValue.state || '未填写' }}
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
        <UInput
          v-if="isEditing"
          :model-value="props.modelValue.postalCode"
          placeholder="邮编"
          class="w-full"
          @update:model-value="(v: any) => update('postalCode', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">
          {{ props.modelValue.postalCode || '未填写' }}
        </p>
      </div>
    </div>
    <div
      class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
    >
      <div
        class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
      >
        国家 / 地区（文本）
      </div>
      <div class="flex-1">
        <UInput
          v-if="isEditing"
          :model-value="props.modelValue.country"
          placeholder="例如：中国"
          class="w-full"
          @update:model-value="(v: any) => update('country', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">
          {{ props.modelValue.country || '未填写' }}
        </p>
      </div>
    </div>
    <div
      class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
    >
      <div
        class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
      >
        联系电话
      </div>
      <div class="flex-1">
        <UInput
          v-if="isEditing"
          :model-value="props.modelValue.phone"
          placeholder="用于紧急联系"
          class="w-full"
          @update:model-value="(v: any) => update('phone', v)"
        />
        <p v-else class="text-sm text-slate-900 dark:text-slate-100">
          {{ props.modelValue.phone || '未填写' }}
        </p>
      </div>
    </div>
  </div>
</template>
