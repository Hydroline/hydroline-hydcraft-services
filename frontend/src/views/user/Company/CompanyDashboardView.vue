<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyApplicationForm from '@/components/company/CompanyApplicationForm.vue'
import CompanyProfileForm from '@/components/company/CompanyProfileForm.vue'
import CompanyTimeline from '@/components/company/CompanyTimeline.vue'
import type {
  CompanyMemberUserRef,
  CompanyModel,
  CreateCompanyApplicationPayload,
  UpdateCompanyPayload,
} from '@/types/company'

const companyStore = useCompanyStore()
const authStore = useAuthStore()
const toast = useToast()
const selectedCompanyId = ref<string | null>(null)
const canManage = computed(() => authStore.isAuthenticated)

const refreshDashboard = async () => {
  if (!authStore.isAuthenticated) return
  await companyStore.fetchDashboard()
  if (!selectedCompanyId.value && companyStore.dashboard.length > 0) {
    selectedCompanyId.value = companyStore.dashboard[0]?.id ?? null
  }
}

const selectedCompany = computed(() => {
  if (!selectedCompanyId.value) {
    return companyStore.dashboard[0] ?? null
  }
  return (
    companyStore.dashboard.find(
      (company) => company.id === selectedCompanyId.value,
    ) ?? null
  )
})

const industries = computed(() => companyStore.meta?.industries ?? [])
const types = computed(() => companyStore.meta?.types ?? [])

const handleApply = async (payload: CreateCompanyApplicationPayload) => {
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
    const message = (error as Error).message || '提交失败'
    toast.add({ title: message, color: 'error' })
  }
}

const applicationModalOpen = ref(false)
const inviteModalOpen = ref(false)
const joinModalOpen = ref(false)
const inviteKeyword = ref('')
const inviteCandidates = ref<CompanyMemberUserRef[]>([])
const inviteCandidateId = ref<string | null>(null)
const inviteTitle = ref('')
const invitePositionCode = ref<string | null>(null)
const inviteLoading = ref(false)
const joinTargetCompany = ref<CompanyModel | null>(null)
const joinPositionCode = ref<string | null>(null)
const joinTitle = ref('')
const joinLoading = ref(false)
const stats = computed(() => companyStore.dashboardStats)
const metaPositions = computed(() => companyStore.meta?.positions ?? [])
const recommendedJoinTargets = computed(
  () => companyStore.recommendations.active,
)
const selectedInvitePosition = computed(
  () =>
    metaPositions.value.find(
      (position) => position.code === invitePositionCode.value,
    ) ?? null,
)
const selectedJoinPosition = computed(
  () =>
    metaPositions.value.find(
      (position) => position.code === joinPositionCode.value,
    ) ?? null,
)
const inviteOptions = computed(() =>
  inviteCandidates.value.map((user) => ({
    value: user.id,
    label: user.displayName || user.name || user.email || '未知玩家',
  })),
)
const positionOptions = computed(() =>
  metaPositions.value.map((position) => ({
    value: position.code,
    label: `${position.name} · ${position.description || '权责岗位'}`,
  })),
)
let inviteSearchTimer: number | undefined

watch(
  () => companyStore.dashboard.length,
  (length) => {
    if (length > 0 && !selectedCompanyId.value) {
      selectedCompanyId.value = companyStore.dashboard[0]?.id ?? null
    }
  },
)

watch(
  () => inviteKeyword.value,
  (value) => {
    if (!value.trim()) {
      inviteCandidates.value = []
      inviteCandidateId.value = null
      return
    }
    if (inviteSearchTimer) {
      window.clearTimeout(inviteSearchTimer)
    }
    inviteSearchTimer = window.setTimeout(async () => {
      try {
        inviteCandidates.value = await companyStore.searchUsers(value, 8)
      } catch (error) {
        toast.add({
          title: (error as Error).message || '搜索失败',
          color: 'error',
        })
      }
    }, 360)
  },
)

const openInviteModal = () => {
  inviteCandidateId.value = null
  inviteKeyword.value = ''
  inviteCandidates.value = []
  invitePositionCode.value = metaPositions.value[0]?.code ?? null
  inviteTitle.value = ''
  inviteModalOpen.value = true
}

const openJoinModal = (company: CompanyModel) => {
  joinTargetCompany.value = company
  joinPositionCode.value = metaPositions.value[0]?.code ?? null
  joinTitle.value = ''
  joinModalOpen.value = true
}

const handleInvite = async () => {
  if (!selectedCompany.value || !inviteCandidateId.value) return
  inviteLoading.value = true
  try {
    await companyStore.inviteMember(selectedCompany.value.id, {
      userId: inviteCandidateId.value,
      role: selectedInvitePosition.value?.role,
      positionCode: selectedInvitePosition.value?.code,
      title: inviteTitle.value || selectedInvitePosition.value?.name,
    })
    toast.add({ title: '已发出邀请', color: 'primary' })
    inviteModalOpen.value = false
  } catch (error) {
    toast.add({
      title: (error as Error).message || '邀请失败',
      color: 'error',
    })
  } finally {
    inviteLoading.value = false
  }
}

const handleJoin = async () => {
  if (!joinTargetCompany.value) return
  joinLoading.value = true
  try {
    await companyStore.joinCompany(joinTargetCompany.value.id, {
      title: joinTitle.value,
      positionCode: selectedJoinPosition.value?.code,
    })
    toast.add({ title: '申请加入已提交', color: 'primary' })
    joinModalOpen.value = false
    joinTargetCompany.value = null
  } catch (error) {
    toast.add({
      title: (error as Error).message || '加入失败',
      color: 'error',
    })
  } finally {
    joinLoading.value = false
  }
}

const saving = ref(false)

const handleUpdate = async (payload: UpdateCompanyPayload) => {
  if (!selectedCompany.value) return
  saving.value = true
  try {
    await companyStore.update(selectedCompany.value.id, payload)
    toast.add({ title: '资料已保存', color: 'primary' })
  } catch (error) {
    toast.add({ title: (error as Error).message || '保存失败', color: 'error' })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await companyStore.fetchMeta()
  await refreshDashboard()
  companyStore.fetchRecommendations('recent')
  companyStore.fetchRecommendations('active')
})

watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      void refreshDashboard()
    }
  },
)

watch(
  () => companyStore.dashboard.length,
  (length) => {
    if (length > 0 && !selectedCompanyId.value) {
      selectedCompanyId.value = companyStore.dashboard[0]?.id ?? null
    }
  },
)

watch(
  () => inviteKeyword.value,
  (value) => {
    if (!value.trim()) {
      inviteCandidates.value = []
      inviteCandidateId.value = null
      return
    }
    if (inviteSearchTimer) {
      window.clearTimeout(inviteSearchTimer)
    }
    inviteSearchTimer = window.setTimeout(async () => {
      try {
        inviteCandidates.value = await companyStore.searchUsers(value, 8)
      } catch (error) {
        toast.add({
          title: (error as Error).message || '搜索失败',
          color: 'error',
        })
      }
    }, 360)
  },
)

onBeforeUnmount(() => {
  if (inviteSearchTimer) {
    window.clearTimeout(inviteSearchTimer)
  }
})
</script>

<template>
  <section class="space-y-6 mx-auto w-full max-w-6xl p-6">
    <div class="flex">
      <UButton color="primary" variant="ghost" to="/company">
        <UIcon name="i-lucide-arrow-left" />
        返回概览
      </UButton>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="rounded-3xl border border-slate-200 bg-white/90 px-5 py-4">
        <p
          class="text-xs font-semibold uppercase tracking-widest text-slate-500"
        >
          我的主体数量
        </p>
        <p class="text-3xl font-semibold text-slate-900">
          {{ stats.companyCount }}
        </p>
        <p class="text-xs text-slate-500">跨公司、个体工商等主体数量总和。</p>
      </div>
      <div class="rounded-3xl border border-slate-200 bg-white/90 px-5 py-4">
        <p
          class="text-xs font-semibold uppercase tracking-widest text-slate-500"
        >
          个体工商数量
        </p>
        <p class="text-3xl font-semibold text-slate-900">
          {{ stats.individualBusinessCount }}
        </p>
        <p class="text-xs text-slate-500">登记为个体工商户的条目。</p>
      </div>
      <div class="rounded-3xl border border-slate-200 bg-white/90 px-5 py-4">
        <p
          class="text-xs font-semibold uppercase tracking-widest text-slate-500"
        >
          已加入职员数
        </p>
        <p class="text-3xl font-semibold text-slate-900">
          {{ stats.memberCount }}
        </p>
        <p class="text-xs text-slate-500">当前拥有的职员（含法人/高管）。</p>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                我的公司
              </h2>
              <p class="text-sm text-slate-500">
                点击卡片可查看详情与流程状态。
              </p>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              :loading="companyStore.dashboardLoading"
              :disabled="!canManage"
              @click="refreshDashboard()"
            />
          </div>
        </template>
        <div class="grid gap-4 md:grid-cols-2">
          <button
            v-for="company in companyStore.dashboard"
            :key="company.id"
            type="button"
            class="rounded-2xl border p-4 text-left transition-all"
            :class="[
              company.id === selectedCompanyId
                ? 'border-primary-200 bg-primary-50/70 dark:border-primary-800/50 dark:bg-primary-950/30'
                : 'border-slate-200 hover:border-primary-200 dark:border-slate-800',
            ]"
            @click="selectedCompanyId = company.id"
          >
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-slate-900 dark:text-white">
                {{ company.name }}
              </p>
              <CompanyStatusBadge :status="company.status" />
            </div>
            <p class="mt-1 text-xs text-slate-500">
              {{ company.summary || '暂无简介' }}
            </p>
            <p class="mt-2 text-xs text-slate-400">
              流程：{{ company.workflow?.state || '无' }}
            </p>
          </button>
          <div
            v-if="companyStore.dashboard.length === 0"
            class="col-span-full rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800"
          >
            还没有公司，先在右侧提交申请吧。
          </div>
        </div>
      </UCard>

      <div
        class="rounded-3xl border border-slate-200/70 bg-white/90 p-6 text-slate-600 dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <div>
          <p
            class="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            公司注册
          </p>
          <h3 class="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            新主体申请
          </h3>
          <p class="mt-2 text-sm text-slate-500">
            仅需填写名称/类型/行业/法人即可立案，系统会将信息发布至后台审批。
          </p>
        </div>
        <div class="mt-6 flex justify-end">
          <UButton color="primary" @click="applicationModalOpen = true">
            提交注册申请
          </UButton>
        </div>
      </div>
    </div>

    <div v-if="selectedCompany" class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ selectedCompany.name }} · 资料编辑
              </h3>
              <p class="text-sm text-slate-500">更新基本信息、联系方式等。</p>
            </div>
            <CompanyStatusBadge :status="selectedCompany.status" />
          </div>
        </template>
        <CompanyProfileForm
          :company="selectedCompany"
          :industries="industries"
          :saving="saving"
          @submit="handleUpdate"
        />
        <div
          class="mt-6 border-t border-dashed border-slate-200/70 pt-5 dark:border-slate-800/60"
        >
          <div class="flex items-center justify-between">
            <div>
              <p
                class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                当前职员
              </p>
              <h4 class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ selectedCompany.members.length }} 位成员
              </h4>
            </div>
            <UButton
              size="sm"
              color="primary"
              variant="soft"
              :disabled="!selectedCompany.permissions.canManageMembers"
              @click="openInviteModal"
            >
              邀请职员
            </UButton>
          </div>
          <div class="mt-4 space-y-3">
            <div
              v-for="member in selectedCompany.members"
              :key="member.id"
              class="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300"
            >
              <div>
                <p class="font-semibold text-slate-900 dark:text-white">
                  {{
                    member.user?.profile?.displayName ||
                    member.user?.name ||
                    '未知用户'
                  }}
                </p>
                <p class="text-xs text-slate-500">
                  {{ member.position?.name || member.role }}
                  <span v-if="member.title"> · {{ member.title }}</span>
                </p>
              </div>
              <span
                class="text-xs font-semibold text-slate-500 dark:text-slate-400"
                >{{ member.role }}</span
              >
            </div>
            <div
              v-if="selectedCompany.members.length === 0"
              class="rounded-2xl border border-dashed border-slate-200/70 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800/60"
            >
              暂无职员数据，邀请成员或申请加入即可扩充团队。
            </div>
          </div>
        </div>
      </UCard>
      <UCard>
        <CompanyTimeline :company="selectedCompany" />
        <div class="mt-4 border-t border-dashed border-slate-200 pt-4">
          <h4 class="text-sm font-semibold text-slate-900 dark:text-white">
            内部制度
          </h4>
          <div class="mt-2 space-y-2 text-sm">
            <div
              v-for="policy in selectedCompany.policies"
              :key="policy.id"
              class="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800"
            >
              <div
                class="flex items-center justify-between text-xs text-slate-500"
              >
                <span>v{{ policy.version }}</span>
                <span>{{
                  new Date(policy.updatedAt).toLocaleDateString()
                }}</span>
              </div>
              <p class="text-slate-900 dark:text-white">
                {{ policy.title }}
              </p>
              <p class="text-xs text-slate-500">
                {{ policy.summary || '暂无摘要' }}
              </p>
            </div>
            <p
              v-if="selectedCompany.policies.length === 0"
              class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500"
            >
              暂无制度文档，稍后可在后台创建。
            </p>
          </div>
        </div>
      </UCard>
    </div>
    <div class="space-y-6">
      <div
        class="rounded-3xl border border-slate-200/70 bg-white/90 px-6 py-5 dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <div class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              加入申请
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              其他可加入的主体
            </h3>
            <p class="text-sm text-slate-500">
              可快速发起入职申请，与法人建立联系。
            </p>
          </div>
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click="companyStore.fetchRecommendations('active')"
          >
            刷新
          </UButton>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-for="company in recommendedJoinTargets"
            :key="company.id"
            class="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
          >
            <div class="max-w-[70%]">
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ company.name }}
              </p>
              <p class="text-xs text-slate-500">
                {{ company.summary || '暂无简介' }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <CompanyStatusBadge :status="company.status" />
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                @click="openJoinModal(company)"
              >
                申请加入
              </UButton>
            </div>
          </div>
          <div
            v-if="recommendedJoinTargets.length === 0"
            class="rounded-2xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800/60"
          >
            暂无可申请的推荐主体，稍后再来。
          </div>
        </div>
      </div>
    </div>
  </section>

  <UModal
    :open="applicationModalOpen"
    @update:open="(value) => (applicationModalOpen = value)"
    :ui="{
      content:
        'w-full max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="flex h-full max-h-[85vh] flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800"
        >
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              自动入库申请
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              注册公司 / 个体工商户
            </h3>
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
          <div :initial="{ opacity: 0, y: 16 }" :enter="{ opacity: 1, y: 0 }">
            <CompanyApplicationForm
              :industries="industries"
              :types="types"
              :submitting="companyStore.submitting"
              @submit="handleApply"
            />
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="inviteModalOpen"
    @update:open="(value) => (inviteModalOpen = value)"
    :ui="{
      content: 'w-full max-w-xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
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
              邀请职员
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              选择用户并指定职位
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="inviteModalOpen = false"
          />
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div class="space-y-4">
            <UInput v-model="inviteKeyword" placeholder="搜索用户名 / 邮箱" />
            <USelectMenu
              v-model="inviteCandidateId"
              :options="inviteOptions"
              placeholder="选择邀请的玩家"
              :clearable="false"
            />
            <USelectMenu
              v-model="invitePositionCode"
              :options="positionOptions"
              placeholder="选择职位"
            />
            <UInput v-model="inviteTitle" placeholder="职位称谓（可选）" />
          </div>
        </div>
        <div class="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <div class="flex justify-end">
            <UButton
              color="primary"
              :loading="inviteLoading"
              @click="handleInvite"
            >
              发送邀请
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    v-if="joinTargetCompany"
    :open="joinModalOpen"
    @update:open="(value) => (joinModalOpen = value)"
    :ui="{
      content: 'w-full max-w-lg w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
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
              申请加入
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ joinTargetCompany.name }}
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="joinModalOpen = false"
          />
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            {{ joinTargetCompany.summary || '暂无简介' }}
          </p>
          <div class="mt-4 space-y-4">
            <USelectMenu
              v-model="joinPositionCode"
              :options="positionOptions"
              placeholder="选择职位"
            />
            <UInput v-model="joinTitle" placeholder="期望岗位称谓（可选）" />
          </div>
        </div>
        <div class="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="joinModalOpen = false"
            >
              取消
            </UButton>
            <UButton color="primary" :loading="joinLoading" @click="handleJoin">
              确认申请
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
