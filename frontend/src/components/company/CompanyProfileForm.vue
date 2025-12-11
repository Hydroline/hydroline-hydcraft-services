<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type {
  CompanyIndustry,
  CompanyModel,
  UpdateCompanyPayload,
} from '@/types/company'

const props = defineProps<{
  company: CompanyModel | null
  industries: CompanyIndustry[]
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'submit', payload: UpdateCompanyPayload): void
}>()

const formState = reactive<UpdateCompanyPayload>({
  summary: '',
  description: '',
  contactEmail: '',
  contactPhone: '',
  contactAddress: '',
  homepageUrl: '',
  industryId: undefined,
})

watch(
  () => props.company,
  (company) => {
    if (!company) return
    formState.summary = company.summary ?? ''
    formState.description = company.description ?? ''
    formState.contactEmail = company.contactEmail ?? ''
    formState.contactPhone = company.contactPhone ?? ''
    formState.contactAddress = company.contactAddress ?? ''
    formState.homepageUrl = company.homepageUrl ?? ''
    formState.industryId = company.industry?.id
  },
  { immediate: true },
)

const industryOptions = computed(() =>
  props.industries.map((industry) => ({
    value: industry.id,
    label: industry.name,
  })),
)

const isDisabled = computed(() => !props.company)

const handleSubmit = () => {
  if (!props.company) return
  emit('submit', {
    summary: formState.summary,
    description: formState.description,
    contactEmail: formState.contactEmail,
    contactPhone: formState.contactPhone,
    contactAddress: formState.contactAddress,
    homepageUrl: formState.homepageUrl,
    industryId: formState.industryId,
  })
}
</script>

<template>
  <UForm :state="formState" class="space-y-4" @submit.prevent="handleSubmit">
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <UFormGroup label="公司概要" name="summary">
        <UInput
          v-model="formState.summary"
          placeholder="一句话说明公司定位"
          :disabled="isDisabled"
        />
      </UFormGroup>
      <UFormGroup label="行业分类" name="industryId">
        <USelectMenu
          v-model="formState.industryId"
          :options="industryOptions"
          searchable
          placeholder="选择行业"
          :disabled="isDisabled"
        />
      </UFormGroup>
    </div>
    <UFormGroup label="详细介绍" name="description">
      <UTextarea
        v-model="formState.description"
        :rows="4"
        placeholder="记录公司制度、简介、业务范围"
        :disabled="isDisabled"
      />
    </UFormGroup>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormGroup label="联系邮箱" name="contactEmail">
        <UInput
          v-model="formState.contactEmail"
          type="email"
          placeholder="例如: hello@hydcraft.cn"
          :disabled="isDisabled"
        />
      </UFormGroup>
      <UFormGroup label="联系电话" name="contactPhone">
        <UInput
          v-model="formState.contactPhone"
          placeholder="可留空"
          :disabled="isDisabled"
        />
      </UFormGroup>
      <UFormGroup label="联系地址" name="contactAddress">
        <UInput
          v-model="formState.contactAddress"
          placeholder="可输入省市区 + 详细地址"
          :disabled="isDisabled"
        />
      </UFormGroup>
      <UFormGroup label="官网链接" name="homepageUrl">
        <UInput
          v-model="formState.homepageUrl"
          placeholder="https://example.com"
          :disabled="isDisabled"
        />
      </UFormGroup>
    </div>
    <div class="flex justify-end">
      <UButton
        type="submit"
        color="primary"
        :loading="saving"
        :disabled="isDisabled"
      >
        保存资料
      </UButton>
    </div>
  </UForm>
</template>
