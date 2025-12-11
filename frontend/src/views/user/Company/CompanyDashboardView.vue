<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useCompanyStore } from '@/stores/companies'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyApplicationForm from '@/components/company/CompanyApplicationForm.vue'
import CompanyProfileForm from '@/components/company/CompanyProfileForm.vue'
import CompanyTimeline from '@/components/company/CompanyTimeline.vue'
import type {
  CreateCompanyApplicationPayload,
  UpdateCompanyPayload,
} from '@/types/company'

const companyStore = useCompanyStore()
const toast = useToast()
const selectedCompanyId = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([companyStore.fetchMeta(), companyStore.fetchDashboard()])
  if (companyStore.dashboard.length > 0) {
    selectedCompanyId.value = companyStore.dashboard[0]?.id ?? null
  }
})

watch(
  () => companyStore.dashboard.length,
  (length) => {
    if (length > 0 && !selectedCompanyId.value) {
      selectedCompanyId.value = companyStore.dashboard[0]?.id ?? null
    }
  },
)

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
  try {
    const company = await companyStore.apply(payload)
    selectedCompanyId.value = company.id
    toast.add({ title: '申请已提交，等待审核', color: 'primary' })
  } catch (error) {
    const message = (error as Error).message || '提交失败'
    toast.add({ title: message, color: 'error' })
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
</script>

<template>
  <section class="space-y-6 mx-auto w-full max-w-6xl p-6">
    <div
      class="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/70 p-6 dark:border-slate-800 dark:bg-slate-900/70 mt-2"
    >
      <div
        class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <p class="text-sm font-medium text-primary-500">公司工作台</p>
          <h1 class="text-2xl font-bold text-slate-900 dark:text-white">
            管理我的公司与制度
          </h1>
          <p class="text-sm text-slate-500">
            只有公司法人/持有者可以编辑，管理员可在后台管理所有主体。
          </p>
        </div>
        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" to="/company">
            返回概览
          </UButton>
        </div>
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
              @click="companyStore.fetchDashboard()"
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

      <UCard>
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              提交注册申请
            </h3>
            <p class="text-sm text-slate-500">成功后管理员会在后台审批。</p>
          </div>
        </template>
        <CompanyApplicationForm
          :industries="industries"
          :types="types"
          :submitting="companyStore.submitting"
          @submit="handleApply"
        />
      </UCard>
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
  </section>
</template>
