<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyApplicationForm from '@/components/company/CompanyApplicationForm.vue'
import CompanyTimeline from '@/components/company/CompanyTimeline.vue'
import CompanyManageDialog from '@/components/company/CompanyManageDialog.vue'
import CompanyJoinRequestsDialog from '@/components/company/CompanyJoinRequestsDialog.vue'
import CompanyMembersDialog from '@/components/company/CompanyMembersDialog.vue'
import type {
  CompanyModel,
  CompanyPermissionKey,
  CreateCompanyApplicationPayload,
  CompanyDeregistrationApplyPayload,
  UpdateCompanyPayload,
} from '@/types/company'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const router = useRouter()
const toast = useToast()

const applicationModalOpen = ref(false)
const registrationDialogOpen = ref(false)
const manageDialogOpen = ref(false)
const joinRequestsDialogOpen = ref(false)
const membersDialogOpen = ref(false)
const selectedCompanyId = ref<string | null>(null)
const profileSaving = ref(false)
const settingsSaving = ref(false)
const logoUploading = ref(false)
const joinActionLoading = ref(false)
const memberSaving = ref(false)
const deregistrationSubmitting = ref(false)

const page = ref(1)
const pageSize = ref(10)

const industries = computed(() => companyStore.meta?.industries ?? [])
const positions = computed(() => companyStore.meta?.positions ?? [])

const currentUserId = computed(() => authStore.user?.id ?? null)

function isOwned(company: CompanyModel) {
  if (!currentUserId.value) return false
  return company.members.some(
    (member) =>
      member.user?.id === currentUserId.value &&
      (member.role === 'OWNER' || member.role === 'LEGAL_PERSON'),
  )
}

const ownedCompanies = computed(() =>
  companyStore.dashboard.filter((company) => isOwned(company)),
)

const pageCount = computed(() =>
  Math.max(Math.ceil(ownedCompanies.value.length / pageSize.value), 1),
)

const pagedCompanies = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return ownedCompanies.value.slice(start, start + pageSize.value)
})

const selectedCompany = computed(() => {
  if (!selectedCompanyId.value) return pagedCompanies.value[0] ?? null
  return (
    ownedCompanies.value.find((item) => item.id === selectedCompanyId.value) ??
    null
  )
})

function goToPage(target: number) {
  const safePage = Math.max(1, Math.min(target, pageCount.value))
  page.value = safePage
}

function openCompanyDetail(company: CompanyModel) {
  selectedCompanyId.value = company.id
  manageDialogOpen.value = true
}

function openJoinRequests(company: CompanyModel) {
  selectedCompanyId.value = company.id
  joinRequestsDialogOpen.value = true
}

function openMembersDialog(company: CompanyModel) {
  selectedCompanyId.value = company.id
  membersDialogOpen.value = true
}

function openRegistrationDetail(company: CompanyModel) {
  selectedCompanyId.value = company.id
  registrationDialogOpen.value = true
}

async function handleApply(payload: CreateCompanyApplicationPayload) {
  if (!authStore.isAuthenticated) {
    toast.add({ title: '请先登录', color: 'warning' })
    return
  }
  try {
    const company = await companyStore.apply(payload)
    selectedCompanyId.value = company.id
    toast.add({ title: '申请已提交，等待审核', color: 'primary' })
    applicationModalOpen.value = false
  } catch (error) {
    toast.add({
      title: (error as Error).message || '提交失败',
      color: 'error',
    })
  }
}

async function handleDeregistrationApply(
  payload: CompanyDeregistrationApplyPayload,
) {
  if (!selectedCompany.value) return
  deregistrationSubmitting.value = true
  try {
    await companyStore.applyDeregistration(selectedCompany.value.id, payload)
    toast.add({ title: '注销申请已提交', color: 'primary' })
  } catch (error) {
    toast.add({
      title: (error as Error).message || '注销申请失败',
      color: 'error',
    })
  } finally {
    deregistrationSubmitting.value = false
  }
}

async function handleUpdate(payload: UpdateCompanyPayload) {
  if (!selectedCompany.value) return
  profileSaving.value = true
  try {
    await companyStore.update(selectedCompany.value.id, payload)
    toast.add({ title: '资料已保存', color: 'primary' })
  } catch (error) {
    toast.add({ title: (error as Error).message || '保存失败', color: 'error' })
  } finally {
    profileSaving.value = false
  }
}

async function handleSaveSettings(payload: {
  joinPolicy: 'AUTO' | 'REVIEW'
  positionPermissions: Record<string, CompanyPermissionKey[]>
}) {
  if (!selectedCompany.value) return
  settingsSaving.value = true
  try {
    await companyStore.updateSettings(selectedCompany.value.id, payload)
    toast.add({ title: '设置已更新', color: 'primary' })
  } catch (error) {
    toast.add({
      title: (error as Error).message || '设置更新失败',
      color: 'error',
    })
  } finally {
    settingsSaving.value = false
  }
}

async function handleUploadLogo(file: File) {
  if (!selectedCompany.value) return
  logoUploading.value = true
  try {
    await companyStore.uploadLogo(selectedCompany.value.id, file)
    toast.add({ title: 'Logo 已更新', color: 'primary' })
  } catch (error) {
    toast.add({
      title: (error as Error).message || 'Logo 上传失败',
      color: 'error',
    })
  } finally {
    logoUploading.value = false
  }
}

async function handleSelectLogoAttachment(attachmentId: string) {
  if (!selectedCompany.value) return
  try {
    await companyStore.setLogoAttachment(selectedCompany.value.id, attachmentId)
    toast.add({ title: 'Logo 已更新', color: 'primary' })
  } catch (error) {
    toast.add({
      title: (error as Error).message || 'Logo 更新失败',
      color: 'error',
    })
  }
}

async function handleApproveJoin(payload: {
  memberId: string
  positionCode?: string | null
  title?: string
}) {
  if (!selectedCompany.value) return
  joinActionLoading.value = true
  try {
    await companyStore.approveJoinRequest(selectedCompany.value.id, payload)
    toast.add({ title: '已通过入职申请', color: 'primary' })
  } catch (error) {
    toast.add({
      title: (error as Error).message || '操作失败',
      color: 'error',
    })
  } finally {
    joinActionLoading.value = false
  }
}

async function handleRejectJoin(payload: { memberId: string }) {
  if (!selectedCompany.value) return
  joinActionLoading.value = true
  try {
    await companyStore.rejectJoinRequest(selectedCompany.value.id, payload)
    toast.add({ title: '已驳回入职申请', color: 'primary' })
  } catch (error) {
    toast.add({
      title: (error as Error).message || '操作失败',
      color: 'error',
    })
  } finally {
    joinActionLoading.value = false
  }
}

async function handleSaveMember(payload: {
  memberId: string
  positionCode?: string | null
  title?: string
  permissions: CompanyPermissionKey[]
}) {
  if (!selectedCompany.value) return
  memberSaving.value = true
  try {
    await companyStore.updateMember(selectedCompany.value.id, payload)
    toast.add({ title: '成员信息已更新', color: 'primary' })
  } catch (error) {
    toast.add({
      title: (error as Error).message || '更新失败',
      color: 'error',
    })
  } finally {
    memberSaving.value = false
  }
}

onMounted(() => {
  void companyStore.fetchMeta()
  if (authStore.isAuthenticated) {
    void companyStore.fetchDashboard()
  }
})

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!authStore.isAuthenticated) return
  pollTimer = setInterval(() => {
    void companyStore.fetchDashboard()
  }, 10000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <UButton
        color="primary"
        variant="ghost"
        @click="router.push('/company/dashboard')"
      >
        <UIcon name="i-lucide-arrow-left" />
        返回仪表盘
      </UButton>

      <UButton
        color="primary"
        variant="soft"
        @click="applicationModalOpen = true"
      >
        提交注册申请
      </UButton>
    </div>

    <div
      class="mt-3 overflow-hidden rounded-xl border border-slate-200/70 bg-white dark:border-slate-800/70 dark:bg-slate-900"
    >
      <div class="overflow-x-auto">
        <table
          class="min-w-[960px] w-full text-left text-sm text-slate-600 dark:text-slate-300"
        >
          <thead
            class="bg-slate-50 text-xs uppercase tracking-wide whitespace-nowrap text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            <tr>
              <th class="px-4 py-3">公司</th>
              <th class="px-4 py-3">所属人</th>
              <th class="px-4 py-3">行业</th>
              <th class="px-4 py-3">状态</th>
              <th class="px-4 py-3">流程</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr
              v-for="company in pagedCompanies"
              :key="company.id"
              class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/60"
            >
              <td class="px-4 py-3">
                <div class="font-semibold text-slate-900">
                  {{ company.name }}
                </div>
                <p class="text-xs text-slate-500">
                  {{ company.type?.name || '未归类类型' }}
                </p>
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
                {{ company.industry?.name || '—' }}
              </td>
              <td class="px-4 py-3">
                <CompanyStatusBadge :status="company.status" />
              </td>
              <td class="px-4 py-3 text-slate-500">
                <div class="text-slate-900">
                  {{ company.workflow?.definitionName || '未绑定流程' }}
                </div>
                <p class="text-xs text-slate-400">
                  {{ company.workflow?.state || '—' }}
                </p>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex flex-wrap justify-end gap-2">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="openRegistrationDetail(company)"
                  >
                    注册详情
                  </UButton>
                  <UButton
                    size="xs"
                    color="primary"
                    variant="soft"
                    @click="openJoinRequests(company)"
                  >
                    入职申请
                  </UButton>
                  <UButton
                    size="xs"
                    color="primary"
                    variant="ghost"
                    @click="openMembersDialog(company)"
                  >
                    员工管理
                  </UButton>
                  <UButton
                    size="xs"
                    color="primary"
                    @click="openCompanyDetail(company)"
                  >
                    公司管理
                  </UButton>
                </div>
              </td>
            </tr>
            <tr v-if="pagedCompanies.length === 0">
              <td
                colspan="6"
                class="px-4 py-10 text-center text-sm text-slate-500"
              >
                暂无名下公司数据
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        class="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs text-slate-500 dark:border-slate-800"
      >
        <div>
          共 {{ ownedCompanies.length }} 条 · 第 {{ page }} / {{ pageCount }} 页
        </div>
        <div class="flex items-center gap-2">
          <UButton
            variant="ghost"
            size="sm"
            :disabled="page <= 1"
            @click="goToPage(page - 1)"
          >
            上一页
          </UButton>
          <UButton
            variant="ghost"
            size="sm"
            :disabled="page >= pageCount"
            @click="goToPage(page + 1)"
          >
            下一页
          </UButton>
        </div>
      </div>
    </div>
  </section>

  <UModal
    :open="registrationDialogOpen"
    @update:open="(value) => (registrationDialogOpen = value)"
    :ui="{ content: 'w-full max-w-3xl w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <header class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              注册详情
            </p>
            <h3 class="text-lg font-semibold text-slate-900">
              {{ selectedCompany?.name || '公司详情' }}
            </h3>
          </div>
          <CompanyStatusBadge
            v-if="selectedCompany"
            :status="selectedCompany.status"
          />
        </header>
        <div class="rounded-2xl border border-slate-200/70 bg-white/90 p-4">
          <CompanyTimeline v-if="selectedCompany" :company="selectedCompany" />
          <p v-else class="text-sm text-slate-500">暂无可展示的公司信息。</p>
        </div>
        <div class="flex justify-end">
          <UButton
            color="neutral"
            variant="ghost"
            @click="registrationDialogOpen = false"
          >
            关闭
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="applicationModalOpen"
    @update:open="(value) => (applicationModalOpen = value)"
    :ui="{ content: 'w-full max-w-lg w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="flex h-full max-h-[85vh] flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              自动入库申请
            </p>
            <h3 class="text-lg font-semibold text-slate-900">注册单位</h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="applicationModalOpen = false"
          />
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <CompanyApplicationForm
            :industries="industries"
            :types="companyStore.meta?.types ?? []"
            :submitting="companyStore.submitting"
            @submit="handleApply"
          />
        </div>
      </div>
    </template>
  </UModal>

  <CompanyManageDialog
    :model-value="manageDialogOpen"
    :company="selectedCompany"
    :industries="industries"
    :positions="positions"
    :saving="profileSaving"
    :settings-saving="settingsSaving"
    :logo-uploading="logoUploading"
    :deregistration-submitting="deregistrationSubmitting"
    @update:modelValue="(value) => (manageDialogOpen = value)"
    @save-profile="handleUpdate"
    @save-settings="handleSaveSettings"
    @upload-logo="handleUploadLogo"
    @select-logo-attachment="handleSelectLogoAttachment"
    @apply-deregistration="handleDeregistrationApply"
  />

  <CompanyJoinRequestsDialog
    :model-value="joinRequestsDialogOpen"
    :company="selectedCompany"
    :positions="positions"
    :loading="joinActionLoading"
    @update:modelValue="(value) => (joinRequestsDialogOpen = value)"
    @approve="handleApproveJoin"
    @reject="handleRejectJoin"
  />

  <CompanyMembersDialog
    :model-value="membersDialogOpen"
    :company="selectedCompany"
    :positions="positions"
    :loading="memberSaving"
    @update:modelValue="(value) => (membersDialogOpen = value)"
    @save="handleSaveMember"
  />
</template>
