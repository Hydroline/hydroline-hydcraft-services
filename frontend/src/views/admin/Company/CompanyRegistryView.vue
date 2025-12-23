<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAdminCompanyStore } from '@/stores/admin/companies'
import { useCompanyStore } from '@/stores/user/companies'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyRegistryManageDialog from './components/CompanyRegistryManageDialog.vue'
import CompanyRegistryWorkflowDialog from './components/CompanyRegistryWorkflowDialog.vue'
import CompanyRegistryCreateDialog from './components/CompanyRegistryCreateDialog.vue'
import type { CompanyModel, CompanyStatus } from '@/types/company'

const adminStore = useAdminCompanyStore()
const companyStore = useCompanyStore()
const toast = useToast()

const filters = reactive({
  status: undefined as CompanyStatus | undefined,
  typeId: undefined as string | undefined,
  industryId: undefined as string | undefined,
  search: '',
  isIndividualBusiness: undefined as boolean | undefined,
})

const createDialogOpen = ref(false)
const manageDialogOpen = ref(false)
const workflowDialogOpen = ref(false)
const selectedCompanyId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const deleteConfirmOpen = ref(false)
const deleteTarget = ref<CompanyModel | null>(null)

const industries = computed(() => companyStore.meta?.industries ?? [])
const types = computed(() => companyStore.meta?.types ?? [])

const statusOptions: { label: string; value: CompanyStatus | undefined }[] = [
  { label: '全部状态', value: undefined },
  { label: '草稿', value: 'DRAFT' },
  { label: '待审核', value: 'PENDING_REVIEW' },
  { label: '审核中', value: 'UNDER_REVIEW' },
  { label: '待补件', value: 'NEEDS_REVISION' },
  { label: '已注册', value: 'ACTIVE' },
  { label: '暂停营业', value: 'SUSPENDED' },
  { label: '已驳回', value: 'REJECTED' },
  { label: '注销', value: 'ARCHIVED' },
]

const isIndividualOptions = [
  { label: '全部主体', value: undefined },
  { label: '企业', value: false },
  { label: '个体工商', value: true },
]

const pageCount = computed(() =>
  Math.max(Math.ceil(adminStore.total / adminStore.pageSize), 1),
)

const selectedCompany = computed<CompanyModel | null>(() =>
  selectedCompanyId.value
    ? adminStore.items.find((item) => item.id === selectedCompanyId.value) ||
      adminStore.selected
    : adminStore.selected,
)

async function fetchCompanies(page = 1) {
  await adminStore.fetchList({
    status: filters.status,
    typeId: filters.typeId,
    industryId: filters.industryId,
    isIndividualBusiness: filters.isIndividualBusiness,
    search: filters.search,
    page,
  })
}

async function applyFilters() {
  await fetchCompanies(1)
}

async function goToPage(target: number) {
  const safePage = Math.max(1, Math.min(target, pageCount.value))
  await fetchCompanies(safePage)
}

async function openManageDialog(company: CompanyModel) {
  selectedCompanyId.value = company.id
  await adminStore.fetchDetail(company.id)
  manageDialogOpen.value = true
}

async function openWorkflowDialog(company: CompanyModel) {
  selectedCompanyId.value = company.id
  await adminStore.fetchDetail(company.id)
  workflowDialogOpen.value = true
}

async function handleSaveAdmin(payload: Record<string, unknown>) {
  if (!selectedCompany.value) return
  try {
    await adminStore.updateCompany(selectedCompany.value.id, payload)
    toast.add({ title: '公司信息已更新', color: 'primary' })
  } catch (error) {
    toast.add({ title: (error as Error).message || '更新失败', color: 'error' })
  }
}

function openDeleteConfirm(company: CompanyModel) {
  deleteTarget.value = company
  deleteConfirmOpen.value = true
}

async function handleDeleteConfirm() {
  if (!deleteTarget.value) return
  deletingId.value = deleteTarget.value.id
  try {
    await adminStore.deleteCompany(deleteTarget.value.id)
    toast.add({ title: '公司已删除', color: 'primary' })
    await fetchCompanies(adminStore.page)
  } catch (error) {
    toast.add({ title: (error as Error).message || '删除失败', color: 'error' })
  } finally {
    deletingId.value = null
    deleteConfirmOpen.value = false
    deleteTarget.value = null
  }
}

async function handleAdminCreate(payload: Record<string, unknown>) {
  try {
    const company = await adminStore.createCompany(payload as any)
    toast.add({ title: '创建成功，已加入列表', color: 'primary' })
    createDialogOpen.value = false
    selectedCompanyId.value = company.id
    await fetchCompanies(1)
  } catch (error) {
    toast.add({ title: (error as Error).message || '创建失败', color: 'error' })
  }
}

onMounted(() => {
  void companyStore.fetchMeta()
  void fetchCompanies(1)
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="w-full flex flex-wrap justify-between items-center">
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          公司管理
        </h1>

        <div class="flex flex-wrap items-center gap-3">
          <USelectMenu
            v-model="filters.status"
            :items="statusOptions"
            value-key="value"
            clearable
            placeholder="全部状态"
          />
          <USelectMenu
            v-model="filters.typeId"
            :items="types.map((type) => ({ label: type.name, value: type.id }))"
            value-key="value"
            searchable
            clearable
            placeholder="公司类型"
          />
          <USelectMenu
            v-model="filters.industryId"
            :items="
              industries.map((item) => ({ label: item.name, value: item.id }))
            "
            value-key="value"
            searchable
            clearable
            placeholder="行业"
          />
          <USelectMenu
            v-model="filters.isIndividualBusiness"
            :items="isIndividualOptions"
            clearable
            placeholder="主体类型"
          />
          <UInput
            v-model="filters.search"
            placeholder="搜索公司"
            icon="i-lucide-search"
            @keyup.enter="applyFilters"
          />
          <UButton color="primary" @click="applyFilters"> 查询 </UButton>
          <UButton
            color="primary"
            variant="soft"
            @click="createDialogOpen = true"
          >
            新增主体
          </UButton>
        </div>
      </div>
    </div>

    <div
      class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80"
    >
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50/60">
            <tr
              class="text-left text-xs uppercase tracking-wide text-slate-500"
            >
              <th class="px-4 py-3">名称</th>
              <th class="px-4 py-3">状态</th>
              <th class="px-4 py-3">类型</th>
              <th class="px-4 py-3">行业</th>
              <th class="px-4 py-3">法人</th>
              <th class="px-4 py-3">流程</th>
              <th class="px-4 py-3">注册时间</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="company in adminStore.items"
              :key="company.id"
              class="transition hover:bg-slate-50/80"
            >
              <td class="px-4 py-3">
                <div class="font-medium text-slate-900">
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
                {{
                  company.legalPerson?.user?.displayName ||
                  company.legalPerson?.user?.name ||
                  company.legalRepresentative?.displayName ||
                  company.legalRepresentative?.name ||
                  '—'
                }}
              </td>
              <td class="px-4 py-3 text-slate-500">
                <div class="font-medium text-slate-900">
                  {{ company.workflow?.definitionName || '未绑定流程' }}
                </div>
                <p class="text-xs text-slate-500">
                  {{ company.workflow?.state || '—' }}
                </p>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500">
                <span v-if="company.approvedAt">
                  {{ new Date(company.approvedAt).toLocaleString() }}
                </span>
                <span v-else>未注册</span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex flex-wrap justify-end gap-2">
                  <UButton
                    size="xs"
                    color="primary"
                    variant="soft"
                    @click="openManageDialog(company)"
                  >
                    公司管理
                  </UButton>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="openWorkflowDialog(company)"
                  >
                    流程信息
                  </UButton>
                  <UButton
                    size="xs"
                    color="rose"
                    variant="ghost"
                    :loading="deletingId === company.id"
                    @click="openDeleteConfirm(company)"
                  >
                    删除
                  </UButton>
                </div>
              </td>
            </tr>
            <tr v-if="adminStore.items.length === 0">
              <td
                colspan="8"
                class="px-4 py-10 text-center text-sm text-slate-500"
              >
                暂无公司数据
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600"
      >
        <span>
          第 {{ adminStore.page }} / {{ pageCount }} 页，共
          {{ adminStore.total }} 条
        </span>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="adminStore.page <= 1 || adminStore.loading"
            @click="goToPage(1)"
          >
            首页
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="adminStore.page <= 1 || adminStore.loading"
            @click="goToPage(adminStore.page - 1)"
          >
            上一页
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="adminStore.loading || adminStore.page >= pageCount"
            @click="goToPage(adminStore.page + 1)"
          >
            下一页
          </UButton>
        </div>
      </div>
    </div>

    <CompanyRegistryCreateDialog
      :model-value="createDialogOpen"
      :types="types"
      :industries="industries"
      :search-users="companyStore.searchUsers"
      :saving="adminStore.loading"
      @update:modelValue="(value) => (createDialogOpen = value)"
      @submit="handleAdminCreate"
    />

    <CompanyRegistryManageDialog
      :model-value="manageDialogOpen"
      :company="selectedCompany"
      :types="types"
      :industries="industries"
      :saving="adminStore.detailLoading"
      @update:modelValue="(value) => (manageDialogOpen = value)"
      @save="handleSaveAdmin"
    />

    <CompanyRegistryWorkflowDialog
      :model-value="workflowDialogOpen"
      :company="selectedCompany"
      @update:modelValue="(value) => (workflowDialogOpen = value)"
    />

    <UModal
      v-model:open="deleteConfirmOpen"
      :ui="{ content: 'w-full max-w-md w-[calc(100vw-2rem)]' }"
    >
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <header class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900">删除公司</h3>
          </header>
          <p class="text-sm text-slate-600">
            确定删除 {{ deleteTarget?.name || '该公司' }} 吗？该操作无法撤销。
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="deleteConfirmOpen = false"
            >
              取消
            </UButton>
            <UButton
              color="error"
              :loading="deletingId === deleteTarget?.id"
              @click="handleDeleteConfirm"
            >
              确认删除
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
