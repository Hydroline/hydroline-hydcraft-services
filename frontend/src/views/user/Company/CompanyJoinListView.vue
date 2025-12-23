<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import type { CompanyModel, CompanyPosition } from '@/types/company'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const router = useRouter()
const toast = useToast()
const currentUserId = computed(() => authStore.user?.id ?? null)

const filters = reactive({
  typeId: undefined as string | undefined,
  industryId: undefined as string | undefined,
  search: '',
})

const joinModalOpen = ref(false)
const joinTargetCompany = ref<CompanyModel | null>(null)
const joinPositionCode = ref<string | null>(null)
const joinTitle = ref('')
const joinLoading = ref(false)

const positions = computed<CompanyPosition[]>(
  () => companyStore.meta?.positions ?? [],
)
const positionOptions = computed(() =>
  positions.value.map((position) => ({
    value: position.code,
    label: `${position.name} · ${position.description || '岗位'}`,
  })),
)

const typeOptions = computed(() =>
  (companyStore.meta?.types ?? []).map((type) => ({
    value: type.id,
    label: type.name,
  })),
)

const industryOptions = computed(() =>
  (companyStore.meta?.industries ?? []).map((industry) => ({
    value: industry.id,
    label: industry.name,
  })),
)

const directory = computed(() => companyStore.directory)

function isOwnedCompany(company: CompanyModel | null) {
  if (!company) return false
  if (!currentUserId.value) return false
  return company.members.some(
    (member) =>
      member.user?.id === currentUserId.value &&
      (member.role === 'OWNER' || member.role === 'LEGAL_PERSON'),
  )
}

function openJoinModal(company: CompanyModel) {
  if (isOwnedCompany(company)) {
    toast.add({ title: '不能申请加入自己的公司', color: 'warning' })
    return
  }
  joinTargetCompany.value = company
  joinPositionCode.value = positions.value[0]?.code ?? null
  joinTitle.value = ''
  joinModalOpen.value = true
}

async function loadList(page = 1) {
  await companyStore.fetchDirectory({
    page,
    pageSize: directory.value.pageSize,
    typeId: filters.typeId,
    industryId: filters.industryId,
    search: filters.search.trim() || undefined,
  })
  pageInput.value = directory.value.page
}

function applyFilters() {
  void loadList(1)
}

function goToPage(target: number) {
  const safePage = Math.max(1, Math.min(target, directory.value.pageCount))
  void loadList(safePage)
}

async function handleJoin() {
  if (!joinTargetCompany.value) return
  if (isOwnedCompany(joinTargetCompany.value)) {
    toast.add({ title: '不能申请加入自己的公司', color: 'warning' })
    return
  }
  joinLoading.value = true
  try {
    await companyStore.joinCompany(joinTargetCompany.value.id, {
      title: joinTitle.value || undefined,
      positionCode: joinPositionCode.value ?? undefined,
    })
    toast.add({ title: '申请已提交', color: 'primary' })
    joinModalOpen.value = false
  } catch (error) {
    toast.add({
      title: (error as Error).message || '加入失败',
      color: 'error',
    })
  } finally {
    joinLoading.value = false
  }
}

onMounted(() => {
  void companyStore.fetchMeta()
  if (authStore.isAuthenticated) {
    void companyStore.fetchDashboard()
  }
  void loadList(1)
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
      <div class="flex flex-wrap items-center gap-3">
        <USelectMenu
          v-model="filters.typeId"
          :items="typeOptions"
          value-key="value"
          clearable
          placeholder="公司类型"
        />
        <USelectMenu
          v-model="filters.industryId"
          :items="industryOptions"
          value-key="value"
          clearable
          placeholder="行业"
        />
        <UInput
          v-model="filters.search"
          placeholder="搜索公司"
          icon="i-lucide-search"
          @keyup.enter="applyFilters"
        />
        <UButton color="primary" @click="applyFilters">查询</UButton>
      </div>
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
              <th class="px-4 py-3">入职方式</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr
              v-for="company in directory.items"
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
                {{ company.joinPolicy === 'AUTO' ? '自动通过' : '需审核' }}
              </td>
              <td class="px-4 py-3 text-right">
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  :disabled="
                    !authStore.isAuthenticated || isOwnedCompany(company)
                  "
                  @click="openJoinModal(company)"
                >
                  申请入职
                </UButton>
              </td>
            </tr>
            <tr v-if="directory.items.length === 0">
              <td
                colspan="6"
                class="px-4 py-10 text-center text-sm text-slate-500"
              >
                暂无匹配的公司
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        class="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs text-slate-500 dark:border-slate-800"
      >
        <div>
          共 {{ directory.total }} 条 · 第 {{ directory.page }} /
          {{ directory.pageCount }} 页
        </div>
        <div class="flex items-center gap-2">
          <UButton
            variant="ghost"
            size="sm"
            :disabled="directory.page <= 1"
            @click="goToPage(directory.page - 1)"
          >
            上一页
          </UButton>
          <UButton
            variant="ghost"
            size="sm"
            :disabled="directory.page >= directory.pageCount"
            @click="goToPage(directory.page + 1)"
          >
            下一页
          </UButton>
        </div>
      </div>
    </div>
  </section>

  <UModal
    v-if="joinTargetCompany"
    :open="joinModalOpen"
    @update:open="(value) => (joinModalOpen = value)"
    :ui="{ content: 'w-full max-w-lg w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              申请入职
            </p>
            <h3 class="text-lg font-semibold text-slate-900">
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
          <p class="text-sm text-slate-500">
            {{ joinTargetCompany.summary || '暂无简介' }}
          </p>
          <p
            v-if="isOwnedCompany(joinTargetCompany)"
            class="mt-2 text-xs text-rose-500"
          >
            不能申请加入自己的公司。
          </p>
          <div class="mt-4 space-y-4">
            <USelectMenu
              v-model="joinPositionCode"
              :items="positionOptions"
              value-key="value"
              placeholder="选择期望岗位（可选）"
              :disabled="isOwnedCompany(joinTargetCompany)"
            />
            <UInput
              v-model="joinTitle"
              placeholder="期望岗位称谓（可选）"
              :disabled="isOwnedCompany(joinTargetCompany)"
            />
          </div>
          <div
            class="mt-4 rounded-xl border border-slate-200/70 p-3 text-xs text-slate-500"
          >
            入职方式：{{
              joinTargetCompany.joinPolicy === 'AUTO' ? '自动通过' : '需审核'
            }}
          </div>
        </div>
        <div class="border-t border-slate-200 px-6 py-4">
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="joinModalOpen = false"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              :loading="joinLoading"
              :disabled="isOwnedCompany(joinTargetCompany)"
              @click="handleJoin"
            >
              提交申请
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
