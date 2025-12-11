<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useCompanyStore } from '@/stores/companies'
import type {
  CompanyIndustry,
  CompanyType,
  CompanyMemberUserRef,
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

const companyStore = useCompanyStore()
const formState = reactive<CreateCompanyApplicationPayload>({
  name: '',
  summary: '',
  description: '',
  typeId: undefined,
  industryId: undefined,
  isIndividualBusiness: false,
  legalRepresentativeId: undefined,
})
const legalSearch = ref('')
const legalCandidates = ref<CompanyMemberUserRef[]>([])
const legalRepresentativeId = ref<string | null>(null)
let searchTimer: number | undefined

watch(
  () => legalRepresentativeId.value,
  (value) => {
    formState.legalRepresentativeId = value ?? undefined
  },
)

watch(
  () => legalSearch.value,
  (value) => {
    if (!value.trim()) {
      legalCandidates.value = []
      legalRepresentativeId.value = null
      return
    }
    if (searchTimer) {
      window.clearTimeout(searchTimer)
    }
    searchTimer = window.setTimeout(async () => {
      try {
        legalCandidates.value = await companyStore.searchUsers(value, 8)
      } catch {
        legalCandidates.value = []
      }
    }, 360)
  },
)

onBeforeUnmount(() => {
  if (searchTimer) {
    window.clearTimeout(searchTimer)
  }
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

const legalOptions = computed(() =>
  legalCandidates.value.map((user) => ({
    value: user.id,
    label: user.displayName || user.name || user.email || '未知用户',
  })),
)

const handleSubmit = () => {
  if (!formState.legalRepresentativeId) {
    return
  }
  emit('submit', { ...formState })
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500">
          公司名称
        </label>
        <UInput v-model="formState.name" placeholder="例如：Hydroline 科技" />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500">类型</label>
        <USelectMenu
          v-model="formState.typeId"
          :options="typeOptions"
          searchable
          placeholder="选择公司类型"
        />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500">行业</label>
        <USelectMenu
          v-model="formState.industryId"
          :options="industryOptions"
          searchable
          placeholder="选择所属行业"
        />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500">
          一句话简介（可选）
        </label>
        <UInput v-model="formState.summary" placeholder="概括业务/定位" />
      </div>
    </div>
    <div class="space-y-2">
      <label class="block text-xs font-semibold text-slate-500">详细介绍</label>
      <UTextarea
        v-model="formState.description"
        :rows="4"
        placeholder="填写背景、制度设计、主要业务等"
      />
    </div>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500">
          搜索法人用户
        </label>
        <UInput v-model="legalSearch" placeholder="输入用户名、邮箱或昵称" />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500">
          选择法人
        </label>
        <USelectMenu
          v-model="legalRepresentativeId"
          :options="legalOptions"
          searchable
          placeholder="请选择法人"
          :disabled="legalOptions.length === 0"
          :clearable="false"
        />
      </div>
    </div>
    <div class="flex items-center justify-between">
      <p class="text-xs text-slate-500">选择主体类型（个体工商户可简化流程）</p>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500">个体工商户</span>
        <USwitch v-model="formState.isIndividualBusiness" />
      </div>
    </div>
    <div class="flex justify-end">
      <UButton
        type="submit"
        color="primary"
        :loading="submitting"
        :disabled="!formState.legalRepresentativeId"
      >
        提交注册申请
      </UButton>
    </div>
  </form>
</template>
