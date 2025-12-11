<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAdminCompanyStore } from '@/stores/adminCompanies'
import { useCompanyStore } from '@/stores/companies'
import type {
  CompanyModel,
  CompanyStatus,
  CompanyVisibility,
} from '@/types/company'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyTimeline from '@/components/company/CompanyTimeline.vue'

const adminStore = useAdminCompanyStore()
const companyStore = useCompanyStore()
const toast = useToast()

const filters = reactive({
  status: undefined as CompanyStatus | undefined,
  typeId: undefined as string | undefined,
  industryId: undefined as string | undefined,
  search: '',
})

const selectedCompanyId = ref<string | null>(null)
const adminForm = reactive({
  status: undefined as CompanyStatus | undefined,
  visibility: undefined as CompanyVisibility | undefined,
  highlighted: false,
  recommendationScore: 0,
})
const adminSaving = ref(false)
const actionComment = ref('')
const actionLoading = ref<string | null>(null)

const statusOptions: { label: string; value: CompanyStatus }[] = [
  { label: '草稿', value: 'DRAFT' },
  { label: '待审核', value: 'PENDING_REVIEW' },
  { label: '审核中', value: 'UNDER_REVIEW' },
  { label: '待补件', value: 'NEEDS_REVISION' },
  { label: '已生效', value: 'ACTIVE' },
  { label: '已暂停', value: 'SUSPENDED' },
  { label: '已驳回', value: 'REJECTED' },
  { label: '已归档', value: 'ARCHIVED' },
]

const visibilityOptions: { label: string; value: CompanyVisibility }[] = [
  { label: '公开', value: 'PUBLIC' },
  { label: '仅成员', value: 'PRIVATE' },
  { label: '内部', value: 'INTERNAL' },
]

const industries = computed(() => companyStore.meta?.industries ?? [])
const types = computed(() => companyStore.meta?.types ?? [])

const selectedCompany = computed<CompanyModel | null>(() => {
  if (selectedCompanyId.value) {
    return (
      adminStore.items.find((item) => item.id === selectedCompanyId.value) ||
      adminStore.selected ||
      null
    )
  }
  return adminStore.selected ?? adminStore.items[0] ?? null
})

async function bootstrap() {
  await companyStore.fetchMeta()
  const list = await adminStore.fetchList()
  if (list.items.length > 0) {
    selectedCompanyId.value = list.items[0].id
    await adminStore.fetchDetail(list.items[0].id)
  }
}

onMounted(() => {
  void bootstrap()
})

watch(
  () => selectedCompany.value,
  (company) => {
    if (!company) return
    adminForm.status = company.status
    adminForm.visibility = company.visibility
    adminForm.highlighted = Boolean(company.highlighted)
    adminForm.recommendationScore = company.recommendationScore ?? 0
  },
  { immediate: true },
)

const applyFilters = async () => {
  await adminStore.fetchList({
    status: filters.status,
    typeId: filters.typeId,
    industryId: filters.industryId,
    search: filters.search,
  })
  if (adminStore.items.length > 0) {
    selectedCompanyId.value = adminStore.items[0].id
    await adminStore.fetchDetail(adminStore.items[0].id)
  }
}

const handleRowClick = async (company: CompanyModel) => {
  selectedCompanyId.value = company.id
  await adminStore.fetchDetail(company.id)
}

const handleAdminSave = async () => {
  if (!selectedCompany.value) return
  adminSaving.value = true
  try {
    await adminStore.updateCompany(selectedCompany.value.id, {
      status: adminForm.status,
      visibility: adminForm.visibility,
      highlighted: adminForm.highlighted,
      recommendationScore: adminForm.recommendationScore,
    })
    toast.add({ title: '公司信息已更新', color: 'primary' })
  } catch (error) {
    toast.add({ title: (error as Error).message || '更新失败', color: 'error' })
  } finally {
    adminSaving.value = false
  }
}

const handleAction = async (actionKey: string) => {
  if (!selectedCompany.value) return
  actionLoading.value = actionKey
  try {
    await adminStore.executeAction(selectedCompany.value.id, {
      actionKey,
      comment: actionComment.value,
    })
    actionComment.value = ''
    toast.add({ title: '流程已推进', color: 'primary' })
  } catch (error) {
    toast.add({ title: (error as Error).message || '操作失败', color: 'error' })
  } finally {
    actionLoading.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <USelectMenu
            v-model="filters.status"
            :options="statusOptions"
            clearable
            placeholder="全部状态"
          />
          <USelectMenu
            v-model="filters.typeId"
            :options="
              types.map((type) => ({ label: type.name, value: type.id }))
            "
            searchable
            clearable
            placeholder="公司类型"
          />
          <USelectMenu
            v-model="filters.industryId"
            :options="
              industries.map((item) => ({ label: item.name, value: item.id }))
            "
            searchable
            clearable
            placeholder="行业"
          />
          <UInput
            v-model="filters.search"
            placeholder="搜索公司"
            icon="i-lucide-search"
            @keyup.enter="applyFilters"
          />
          <UButton color="primary" @click="applyFilters"> 查询 </UButton>
        </div>
      </template>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr
              class="text-left text-xs uppercase tracking-wide text-slate-500"
            >
              <th class="px-4 py-2">名称</th>
              <th class="px-4 py-2">状态</th>
              <th class="px-4 py-2">类型</th>
              <th class="px-4 py-2">行业</th>
              <th class="px-4 py-2">评分</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="company in adminStore.items"
              :key="company.id"
              class="cursor-pointer transition-colors hover:bg-slate-50"
              :class="
                company.id === selectedCompanyId ? 'bg-primary-50/60' : ''
              "
              @click="handleRowClick(company)"
            >
              <td class="px-4 py-3">
                <div class="font-medium text-slate-900 dark:text-white">
                  {{ company.name }}
                </div>
                <p class="text-xs text-slate-500">
                  {{ company.summary || '暂无简介' }}
                </p>
              </td>
              <td class="px-4 py-3">
                <CompanyStatusBadge :status="company.status" />
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ company.type?.name || '—' }}
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ company.industry?.name || '—' }}
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ company.recommendationScore ?? 0 }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <div v-if="selectedCompany" class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ selectedCompany.name }}
              </h3>
              <p class="text-sm text-slate-500">后台编辑字段</p>
            </div>
            <CompanyStatusBadge :status="selectedCompany.status" />
          </div>
        </template>
        <form class="space-y-4" @submit.prevent="handleAdminSave">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormGroup label="状态">
              <USelectMenu
                v-model="adminForm.status"
                :options="statusOptions"
                placeholder="选择状态"
              />
            </UFormGroup>
            <UFormGroup label="可见性">
              <USelectMenu
                v-model="adminForm.visibility"
                :options="visibilityOptions"
                placeholder="选择可见性"
              />
            </UFormGroup>
            <UFormGroup label="推荐分">
              <UInput
                v-model.number="adminForm.recommendationScore"
                type="number"
                min="0"
                max="100"
              />
            </UFormGroup>
            <UFormGroup label="推荐显示">
              <USwitch v-model="adminForm.highlighted" />
            </UFormGroup>
          </div>
          <div class="flex justify-end">
            <UButton type="submit" color="primary" :loading="adminSaving">
              保存修改
            </UButton>
          </div>
        </form>
        <hr class="my-4 border-dashed border-slate-200" />
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-base font-semibold text-slate-900 dark:text-white">
              流程动作
            </h4>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-refresh-cw"
              @click="
                selectedCompanyId && adminStore.fetchDetail(selectedCompanyId)
              "
            />
          </div>
          <p class="text-xs text-slate-500">
            仅显示当前节点允许的操作，执行后将写入日志。
          </p>
          <UTextarea
            v-model="actionComment"
            rows="3"
            placeholder="审批备注（可选）"
          />
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="action in selectedCompany.availableActions"
              :key="action.key"
              color="primary"
              variant="soft"
              size="sm"
              :loading="actionLoading === action.key"
              @click="handleAction(action.key)"
            >
              {{ action.label }}
            </UButton>
            <p
              v-if="selectedCompany.availableActions.length === 0"
              class="text-xs text-slate-400"
            >
              当前节点没有可执行动作。
            </p>
          </div>
        </div>
      </UCard>
      <UCard>
        <CompanyTimeline :company="selectedCompany" />
      </UCard>
    </div>
  </div>
</template>
