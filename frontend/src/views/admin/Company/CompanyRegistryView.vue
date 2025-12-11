<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminCompanyStore } from '@/stores/adminCompanies'
import { useCompanyStore } from '@/stores/companies'
import type {
  AdminCreateCompanyPayload,
  CompanyMemberUserRef,
  CompanyModel,
  CompanyStatus,
  CompanyVisibility,
} from '@/types/company'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyTimeline from '@/components/company/CompanyTimeline.vue'

const adminStore = useAdminCompanyStore()
const companyStore = useCompanyStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const filters = reactive({
  status: undefined as CompanyStatus | undefined,
  typeId: undefined as string | undefined,
  industryId: undefined as string | undefined,
  search: '',
  isIndividualBusiness: undefined as boolean | undefined,
})

const adminCreateModalOpen = ref(false)
const adminCreateForm = reactive<AdminCreateCompanyPayload>({
  name: '',
  summary: '',
  description: '',
  typeId: undefined,
  industryId: undefined,
  isIndividualBusiness: false,
  legalRepresentativeId: undefined,
})
const adminSearch = ref('')
const adminCandidates = ref<CompanyMemberUserRef[]>([])
const adminCandidateId = ref<string | null>(null)
const adminCreating = ref(false)
let adminSearchTimer: number | undefined

const adminLegalOptions = computed(() =>
  adminCandidates.value.map((user) => ({
    value: user.id,
    label: user.displayName || user.name || user.email || '未知用户',
  })),
)

watch(
  () => adminSearch.value,
  (value) => {
    if (!value.trim()) {
      adminCandidates.value = []
      adminCandidateId.value = null
      adminCreateForm.legalRepresentativeId = undefined
      return
    }
    if (adminSearchTimer) {
      window.clearTimeout(adminSearchTimer)
    }
    adminSearchTimer = window.setTimeout(async () => {
      try {
        adminCandidates.value = await companyStore.searchUsers(value, 8)
      } catch {
        adminCandidates.value = []
      }
    }, 360)
  },
)

watch(
  () => adminCandidateId.value,
  (value) => {
    adminCreateForm.legalRepresentativeId = value ?? undefined
  },
)

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
const pageInput = ref(adminStore.page)

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

const isIndividualOptions: { label: string; value: boolean | undefined }[] = [
  { label: '全部主体', value: undefined },
  { label: '企业', value: false },
  { label: '个体工商', value: true },
]

const industries = computed(() => companyStore.meta?.industries ?? [])
const types = computed(() => companyStore.meta?.types ?? [])
const pageCount = computed(() =>
  Math.max(Math.ceil(adminStore.total / adminStore.pageSize), 1),
)
const safePageCount = computed(() => Math.max(pageCount.value, 1))
const routeCompanyId = computed<string | null>(() => {
  const candidate = route.query.companyId
  if (!candidate) {
    return null
  }
  return Array.isArray(candidate) ? candidate[0] : candidate
})

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

const fetchCompanies = async (page = 1) => {
  await adminStore.fetchList({
    status: filters.status,
    typeId: filters.typeId,
    industryId: filters.industryId,
    isIndividualBusiness: filters.isIndividualBusiness,
    search: filters.search,
    page,
  })
  pageInput.value = adminStore.page
}

const loadCompanyDetail = async (companyId: string) => {
  if (
    selectedCompanyId.value === companyId &&
    adminStore.selected?.id === companyId
  ) {
    return
  }
  selectedCompanyId.value = companyId
  await adminStore.fetchDetail(companyId)
}

const ensureSelectionAfterFetch = async () => {
  if (adminStore.items.length === 0) {
    selectedCompanyId.value = null
    return
  }
  const targetId = routeCompanyId.value
  if (targetId) {
    const match = adminStore.items.find((item) => item.id === targetId)
    if (match) {
      await loadCompanyDetail(targetId)
      return
    }
  }
  if (selectedCompanyId.value) {
    const stillPresent = adminStore.items.some(
      (item) => item.id === selectedCompanyId.value,
    )
    if (stillPresent) {
      await loadCompanyDetail(selectedCompanyId.value)
      return
    }
  }
  const first = adminStore.items[0]
  if (first) {
    await loadCompanyDetail(first.id)
  }
}

const applyFilters = async () => {
  pageInput.value = 1
  await fetchCompanies(1)
  await ensureSelectionAfterFetch()
}

const goToPage = async (target: number) => {
  const normalized = Math.max(1, Math.min(target, safePageCount.value))
  if (normalized === adminStore.page) {
    pageInput.value = normalized
    return
  }
  await fetchCompanies(normalized)
  await ensureSelectionAfterFetch()
}

const handlePageInput = async () => {
  if (!pageInput.value) return
  await goToPage(pageInput.value)
}

const handleRowClick = async (company: CompanyModel) => {
  await loadCompanyDetail(company.id)
  void router.replace({
    query: {
      ...route.query,
      companyId: company.id,
    },
  })
}

const bootstrap = async () => {
  await companyStore.fetchMeta()
  await fetchCompanies(1)
  await ensureSelectionAfterFetch()
}

onMounted(() => {
  void bootstrap()
})

onBeforeUnmount(() => {
  if (adminSearchTimer) {
    window.clearTimeout(adminSearchTimer)
  }
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

watch(
  () => routeCompanyId.value,
  async (companyId) => {
    if (!companyId) return
    if (adminStore.items.length === 0) return
    if (companyId === selectedCompanyId.value) return
    const exists = adminStore.items.find((item) => item.id === companyId)
    if (exists) {
      await loadCompanyDetail(companyId)
    }
  },
)

watch(
  () => adminStore.page,
  (page) => {
    pageInput.value = page
  },
  { immediate: true },
)

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

const handleAdminCreate = async () => {
  if (!adminCreateForm.name || !adminCreateForm.legalRepresentativeId) {
    toast.add({ title: '姓名与法人必填', color: 'warning' })
    return
  }
  adminCreating.value = true
  try {
    const company = await adminStore.createCompany(adminCreateForm)
    toast.add({ title: '创建成功，已加入列表', color: 'primary' })
    adminCreateModalOpen.value = false
    await fetchCompanies(1)
    await loadCompanyDetail(company.id)
  } catch (error) {
    toast.add({
      title: (error as Error).message || '创建失败',
      color: 'error',
    })
  } finally {
    adminCreating.value = false
  }
}
</script>

<template>
  <section class="space-y-8">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="w-full flex flex-wrap justify-between items-center">
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          公司管理
        </h1>

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
          <USelectMenu
            v-model="filters.isIndividualBusiness"
            :options="isIndividualOptions"
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
            @click="adminCreateModalOpen = true"
          >
            新增主体
          </UButton>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <div
        class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <div class="overflow-x-auto">
          <table
            class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
          >
            <thead class="bg-slate-50/60 dark:bg-slate-900/60">
              <tr
                class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                <th class="px-4 py-3">名称</th>
                <th class="px-4 py-3">状态</th>
                <th class="px-4 py-3">类型</th>
                <th class="px-4 py-3">行业</th>
                <th class="px-4 py-3">法人</th>
                <th class="px-4 py-3">流程</th>
                <th class="px-4 py-3 text-right">评分</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
              <tr
                v-for="company in adminStore.items"
                :key="company.id"
                class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
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
                  {{
                    company.legalPerson?.user?.profile?.displayName ||
                    company.legalPerson?.user?.name ||
                    '—'
                  }}
                </td>
                <td class="px-4 py-3 text-slate-500">
                  <div class="font-medium text-slate-900 dark:text-white">
                    {{ company.workflow?.definitionName || '未绑定流程' }}
                  </div>
                  <p class="text-xs text-slate-500">
                    {{ company.workflow?.state || '—' }}
                  </p>
                </td>
                <td class="px-4 py-3 text-right text-slate-500">
                  {{ company.recommendationScore ?? 0 }}
                </td>
              </tr>
              <tr v-if="adminStore.items.length === 0">
                <td
                  colspan="7"
                  class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  暂无公司数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
        >
          <span>
            第 {{ adminStore.page }} / {{ safePageCount }} 页，共
            {{ adminStore.total }} 条
          </span>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="(adminStore.page ?? 1) <= 1 || adminStore.loading"
              @click="goToPage(1)"
            >
              首页
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="(adminStore.page ?? 1) <= 1 || adminStore.loading"
              @click="goToPage((adminStore.page ?? 1) - 1)"
            >
              上一页
            </UButton>
            <div class="flex items-center gap-1">
              <UInput
                v-model.number="pageInput"
                type="number"
                size="xs"
                class="w-16 text-center"
                :disabled="adminStore.loading"
                min="1"
                :max="safePageCount"
                @keydown.enter.prevent="handlePageInput"
              />
              <span class="text-xs text-slate-500 dark:text-slate-400">
                / {{ safePageCount }}
              </span>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              size="xs"
              :disabled="adminStore.loading"
              @click="handlePageInput"
            >
              跳转
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="adminStore.loading"
              @click="goToPage(safePageCount)"
            >
              末页
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="adminStore.loading || adminStore.page >= safePageCount"
              @click="goToPage((adminStore.page ?? 1) + 1)"
            >
              下一页
            </UButton>
          </div>
        </div>
      </div>
    </div>
    <div v-if="selectedCompany" class="grid gap-6 lg:grid-cols-2">
      <div
        class="rounded-3xl border border-slate-200/70 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <div
          class="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800/50"
        >
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ selectedCompany.name }}
            </h3>
            <p class="text-sm text-slate-500">后台编辑字段</p>
          </div>
          <CompanyStatusBadge :status="selectedCompany.status" />
        </div>
        <form class="space-y-5 px-6 py-6" @submit.prevent="handleAdminSave">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div class="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">状态</label>
              <USelectMenu
                v-model="adminForm.status"
                :options="statusOptions"
                placeholder="选择状态"
              />
            </div>
            <div class="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">可见性</label>
              <USelectMenu
                v-model="adminForm.visibility"
                :options="visibilityOptions"
                placeholder="选择可见性"
              />
            </div>
            <div class="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">推荐分</label>
              <UInput
                v-model.number="adminForm.recommendationScore"
                type="number"
                min="0"
                max="100"
              />
            </div>
            <div class="flex items-center justify-end">
              <label class="text-xs font-semibold text-slate-500 mr-2">
                推荐显示
              </label>
              <USwitch v-model="adminForm.highlighted" />
            </div>
          </div>
          <div class="flex justify-end">
            <UButton type="submit" color="primary" :loading="adminSaving">
              保存修改
            </UButton>
          </div>
        </form>
        <div
          class="border-t border-dashed border-slate-200 px-6 py-5 dark:border-slate-800/60"
        >
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
      </div>
      <div
        class="rounded-3xl border border-slate-200/70 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <div class="px-6 py-5">
          <CompanyTimeline :company="selectedCompany" />
        </div>
      </div>
    </div>

    <UModal
      :open="adminCreateModalOpen"
      @update:open="(value) => (adminCreateModalOpen = value)"
      :ui="{
        content:
          'w-full max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="flex h-full flex-col">
          <div
            class="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800"
          >
            <div>
              <p
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                直接入库
              </p>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                管理员新增公司/个体
              </h3>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="adminCreateModalOpen = false"
            />
          </div>
          <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs font-semibold text-slate-500">名称</label>
                <UInput v-model="adminCreateForm.name" />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-semibold text-slate-500">类型</label>
                <USelectMenu
                  v-model="adminCreateForm.typeId"
                  :options="
                    types.map((type) => ({ label: type.name, value: type.id }))
                  "
                  searchable
                  placeholder="公司类型"
                />
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">行业</label>
              <USelectMenu
                v-model="adminCreateForm.industryId"
                :options="
                  industries.map((industry) => ({
                    label: industry.name,
                    value: industry.id,
                  }))
                "
                searchable
                placeholder="行业"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">描述</label>
              <UTextarea v-model="adminCreateForm.description" rows="4" />
            </div>
            <div class="flex items-center justify-between">
              <p class="text-xs text-slate-500">是否为个体工商户</p>
              <USwitch v-model="adminCreateForm.isIndividualBusiness" />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">
                搜索法人
              </label>
              <UInput v-model="adminSearch" placeholder="用户名、邮箱、昵称" />
              <USelectMenu
                v-model="adminCandidateId"
                :options="adminLegalOptions"
                placeholder="选择法人"
                :clearable="false"
                :disabled="adminLegalOptions.length === 0"
              />
            </div>
          </div>
          <div
            class="border-t border-slate-200 px-6 py-4 dark:border-slate-800 flex justify-end gap-2"
          >
            <UButton
              variant="ghost"
              color="neutral"
              @click="adminCreateModalOpen = false"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              :loading="adminCreating"
              @click="handleAdminCreate"
            >
              直接创建
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
