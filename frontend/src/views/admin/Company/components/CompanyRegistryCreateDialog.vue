<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type {
  AdminCreateCompanyPayload,
  CompanyMemberUserRef,
  CompanyType,
  CompanyIndustry,
} from '@/types/company'

const props = defineProps<{
  modelValue: boolean
  types: CompanyType[]
  industries: CompanyIndustry[]
  searchUsers: (
    keyword: string,
    limit: number,
  ) => Promise<CompanyMemberUserRef[]>
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit', payload: AdminCreateCompanyPayload): void
}>()

const formState = reactive<AdminCreateCompanyPayload>({
  name: '',
  summary: '',
  description: '',
  typeId: undefined,
  industryId: undefined,
  isIndividualBusiness: false,
  legalRepresentativeId: undefined,
})

const searchKeyword = ref('')
const candidates = ref<CompanyMemberUserRef[]>([])
const selectedCandidateId = ref<string | null>(null)
let searchTimer: number | undefined

const typeOptions = computed(() =>
  props.types.map((type) => ({ value: type.id, label: type.name })),
)

const industryOptions = computed(() =>
  props.industries.map((industry) => ({
    value: industry.id,
    label: industry.name,
  })),
)

const candidateOptions = computed(() =>
  candidates.value.map((user) => ({
    value: user.id,
    label: user.displayName || user.name || user.email || '未知用户',
  })),
)

watch(
  () => searchKeyword.value,
  (value) => {
    if (!value.trim()) {
      candidates.value = []
      selectedCandidateId.value = null
      formState.legalRepresentativeId = undefined
      return
    }
    if (searchTimer) {
      window.clearTimeout(searchTimer)
    }
    searchTimer = window.setTimeout(async () => {
      try {
        candidates.value = await props.searchUsers(value, 8)
      } catch {
        candidates.value = []
      }
    }, 360)
  },
)

watch(
  () => selectedCandidateId.value,
  (value) => {
    formState.legalRepresentativeId = value ?? undefined
  },
)

function closeDialog() {
  emit('update:modelValue', false)
}

function handleSubmit() {
  emit('submit', { ...formState })
}
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="closeDialog"
    :ui="{ content: 'w-full max-w-3xl w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              直接入库
            </p>
            <h3 class="text-lg font-semibold text-slate-900">
              管理员新增公司/个体
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">名称</label>
              <UInput v-model="formState.name" />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">类型</label>
              <USelectMenu
                v-model="formState.typeId"
                :items="typeOptions"
                value-key="value"
                searchable
                placeholder="公司类型"
              />
            </div>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold text-slate-500">行业</label>
            <USelectMenu
              v-model="formState.industryId"
              :items="industryOptions"
              value-key="value"
              searchable
              placeholder="行业"
            />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold text-slate-500">描述</label>
            <UTextarea v-model="formState.description" rows="4" />
          </div>
          <div class="flex items-center justify-between">
            <p class="text-xs text-slate-500">是否为个体工商户</p>
            <USwitch v-model="formState.isIndividualBusiness" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold text-slate-500">搜索法人</label>
            <UInput v-model="searchKeyword" placeholder="用户名、邮箱、昵称" />
            <USelectMenu
              v-model="selectedCandidateId"
              :items="candidateOptions"
              value-key="value"
              placeholder="选择法人"
              :clearable="false"
              :disabled="candidateOptions.length === 0"
            />
          </div>
        </div>
        <div class="border-t border-slate-200 px-6 py-4 flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="closeDialog">
            取消
          </UButton>
          <UButton color="primary" :loading="saving" @click="handleSubmit">
            直接创建
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
