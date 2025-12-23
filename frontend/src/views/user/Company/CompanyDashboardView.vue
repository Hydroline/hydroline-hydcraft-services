<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import { useUiStore } from '@/stores/shared/ui'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import type { CompanyModel } from '@/types/company'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const router = useRouter()
const uiStore = useUiStore()

const stats = computed(() => companyStore.dashboardStats)
const currentUserId = computed(() => authStore.user?.id ?? null)

function hasOwnerRole(company: CompanyModel, userId: string | null) {
  if (!userId) return false
  return company.members.some(
    (member) =>
      member.user?.id === userId &&
      (member.role === 'OWNER' || member.role === 'LEGAL_PERSON'),
  )
}

function hasMemberRole(company: CompanyModel, userId: string | null) {
  if (!userId) return false
  return company.members.some((member) => member.user?.id === userId)
}

const ownedCompanies = computed(() =>
  companyStore.dashboard.filter((company) =>
    hasOwnerRole(company, currentUserId.value),
  ),
)

const joinedCompanies = computed(() =>
  companyStore.dashboard.filter(
    (company) =>
      hasMemberRole(company, currentUserId.value) &&
      !hasOwnerRole(company, currentUserId.value),
  ),
)

const joinableCompaniesPreview = computed(() =>
  companyStore.directory.items
    .filter((company) => !hasMemberRole(company, currentUserId.value))
    .slice(0, 5),
)

const ownedPreview = computed(() => ownedCompanies.value.slice(0, 5))
const joinedPreview = computed(() => joinedCompanies.value.slice(0, 5))

function requireLogin(target: string) {
  if (!authStore.isAuthenticated) {
    uiStore.openLoginDialog()
    return
  }
  router.push(target)
}

function handleRefresh() {
  if (!authStore.isAuthenticated) return
  void companyStore.fetchDashboard()
}

onMounted(() => {
  void companyStore.fetchMeta()
  if (authStore.isAuthenticated) {
    void companyStore.fetchDashboard()
  }
  void companyStore.fetchDirectory({ page: 1, pageSize: 5 })
})

watch(
  () => authStore.isAuthenticated,
  (value) => {
    if (value) {
      void companyStore.fetchDashboard()
    }
  },
)
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          工商仪表盘
        </h2>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :disabled="!authStore.isAuthenticated"
          @click="handleRefresh"
        />
        <UButton
          color="primary"
          variant="soft"
          @click="requireLogin('/company/dashboard/owned')"
        >
          名下公司
        </UButton>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="rounded-xl border border-slate-200 bg-white/90 px-5 py-4">
        <p
          class="text-xs font-semibold uppercase tracking-widest text-slate-500"
        >
          主体数量
        </p>
        <p class="text-3xl font-semibold text-slate-900">
          {{ stats.companyCount }}
        </p>
        <p class="text-xs text-slate-500">名下全部公司与个体工商。</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white/90 px-5 py-4">
        <p
          class="text-xs font-semibold uppercase tracking-widest text-slate-500"
        >
          个体工商
        </p>
        <p class="text-3xl font-semibold text-slate-900">
          {{ stats.individualBusinessCount }}
        </p>
        <p class="text-xs text-slate-500">登记为个体工商户的主体。</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white/90 px-5 py-4">
        <p
          class="text-xs font-semibold uppercase tracking-widest text-slate-500"
        >
          名下职员
        </p>
        <p class="text-3xl font-semibold text-slate-900">
          {{ stats.memberCount }}
        </p>
        <p class="text-xs text-slate-500">当前名下职员数量。</p>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="rounded-xl border border-slate-200/70 bg-white/90 px-6 py-5">
        <div class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              名下公司
            </p>
            <h3 class="text-lg font-semibold text-slate-900">前 5 概览</h3>
            <p class="text-sm text-slate-500">法人或所有者拥有的公司。</p>
          </div>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            @click="requireLogin('/company/dashboard/owned')"
          >
            查看详情
          </UButton>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-for="company in ownedPreview"
            :key="company.id"
            class="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600"
          >
            <div>
              <p class="font-semibold text-slate-900">{{ company.name }}</p>
              <p class="text-xs text-slate-500">
                {{ company.type?.name || '未归类类型' }} ·
                {{ company.industry?.name || '未归类行业' }}
              </p>
            </div>
            <CompanyStatusBadge :status="company.status" />
          </div>
          <div
            v-if="ownedPreview.length === 0"
            class="rounded-xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500"
          >
            暂无名下公司，先提交注册申请吧。
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200/70 bg-white/90 px-6 py-5">
        <div class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              入职公司
            </p>
            <h3 class="text-lg font-semibold text-slate-900">前 5 概览</h3>
            <p class="text-sm text-slate-500">已加入或可申请加入的主体。</p>
          </div>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            @click="requireLogin('/company/dashboard/join')"
          >
            查看详情
          </UButton>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-for="company in joinedPreview"
            :key="company.id"
            class="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600"
          >
            <div>
              <p class="font-semibold text-slate-900">{{ company.name }}</p>
              <p class="text-xs text-slate-500">
                {{ company.type?.name || '未归类类型' }} ·
                {{ company.industry?.name || '未归类行业' }}
              </p>
            </div>
            <CompanyStatusBadge :status="company.status" />
          </div>
          <div
            v-if="joinedPreview.length === 0 && joinableCompaniesPreview.length"
            class="rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600"
          >
            <div>
              <p class="font-semibold text-slate-900">
                {{ joinableCompaniesPreview[0]?.name }}
              </p>
              <p class="text-xs text-slate-500">
                {{ joinableCompaniesPreview[0]?.summary || '暂无简介' }}
              </p>
            </div>
          </div>
          <div
            v-if="
              joinedPreview.length === 0 && !joinableCompaniesPreview.length
            "
            class="rounded-xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500"
          >
            暂无入职记录，稍后可从入职公司列表申请加入。
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
