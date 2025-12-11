<script setup lang="ts">
import { computed, reactive } from 'vue'
import type {
  CompanyIndustry,
  CompanyType,
  CreateCompanyApplicationPayload,
} from '@/types/company'

const props = defineProps<{
  industries: CompanyIndustry[]
  types: CompanyType[]
  submitting?: boolean
}>()

const emit = defineEmits<{
  (event: 'submit', payload: CreateCompanyApplicationPayload): void
}>()

const formState = reactive<CreateCompanyApplicationPayload>({
  name: '',
  summary: '',
  description: '',
  typeId: undefined,
  industryId: undefined,
  legalRepresentativeName: '',
  legalRepresentativeCode: '',
  contactEmail: '',
  contactPhone: '',
})

const typeOptions = computed(() =>
  props.types.map((type) => ({ value: type.id, label: type.name })),
)

const industryOptions = computed(() =>
  props.industries.map((industry) => ({
    value: industry.id,
    label: industry.name,
  })),
)

const handleSubmit = () => {
  emit('submit', { ...formState })
}
</script>

<template>
  <UForm :state="formState" class="space-y-4" @submit.prevent="handleSubmit">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormGroup label="公司名称" name="name" required>
        <UInput v-model="formState.name" placeholder="例如：Hydroline 科技" />
      </UFormGroup>
      <UFormGroup label="类型" name="typeId">
        <USelectMenu
          v-model="formState.typeId"
          :options="typeOptions"
          searchable
          placeholder="选择公司类型"
        />
      </UFormGroup>
      <UFormGroup label="行业" name="industryId">
        <USelectMenu
          v-model="formState.industryId"
          :options="industryOptions"
          searchable
          placeholder="选择所属行业"
        />
      </UFormGroup>
      <UFormGroup label="一句话简介" name="summary">
        <UInput v-model="formState.summary" placeholder="概括业务/定位" />
      </UFormGroup>
    </div>
    <UFormGroup label="详细介绍" name="description">
      <UTextarea
        v-model="formState.description"
        :rows="4"
        placeholder="填写背景、制度设计、主要业务等"
      />
    </UFormGroup>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormGroup label="法人姓名" name="legalRepresentativeName">
        <UInput v-model="formState.legalRepresentativeName" />
      </UFormGroup>
      <UFormGroup label="法人证件编号" name="legalRepresentativeCode">
        <UInput v-model="formState.legalRepresentativeCode" />
      </UFormGroup>
      <UFormGroup label="联系邮箱" name="contactEmail">
        <UInput v-model="formState.contactEmail" type="email" />
      </UFormGroup>
      <UFormGroup label="联系电话" name="contactPhone">
        <UInput v-model="formState.contactPhone" />
      </UFormGroup>
    </div>
    <div class="flex justify-end">
      <UButton type="submit" color="primary" :loading="submitting">
        提交注册申请
      </UButton>
    </div>
  </UForm>
</template>
