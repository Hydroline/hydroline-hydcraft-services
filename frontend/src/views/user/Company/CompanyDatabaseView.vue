<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useCompanyStore } from '@/stores/user/companies'
import { apiFetch } from '@/utils/http/api'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import type { CompanyModel } from '@/types/company'

const companyStore = useCompanyStore()
const toast = useToast()

const filters = reactive({
  typeId: undefined as string | undefined,
  industryId: undefined as string | undefined,
  search: '',
})

const directory = computed(() => companyStore.directory)
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailCompany = ref<CompanyModel | null>(null)

function ownerUser(company: CompanyModel | null | undefined) {
  if (!company) return null

  const user =
    company.members?.find(
      (member) => member.role === 'LEGAL_PERSON' && member.user,
    )?.user ||
    company.members?.find((member) => member.role === 'OWNER' && member.user)
      ?.user ||
    company.legalRepresentative ||
    company.legalPerson?.user ||
    company.owners?.find((member) => member.user)?.user ||
    company.members?.find((member) => member.user)?.user ||
    null

  if (!user) return null

  const displayName =
    user.displayName ||
    (user as any).profile?.displayName ||
    user.name ||
    '未知用户'

  let avatarUrl = user.avatarUrl
  if (!avatarUrl && user.id && company.members) {
    const sameUserInMembers = company.members.find(
      (m) => m.user?.id === user.id && m.user?.avatarUrl,
    )
    if (sameUserInMembers) {
      avatarUrl = sameUserInMembers.user!.avatarUrl
    }
  }

  return {
    ...user,
    displayName,
    avatarUrl,
  }
}

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

async function loadList(page = 1) {
  await companyStore.fetchDirectory({
    page,
    pageSize: directory.value.pageSize,
    typeId: filters.typeId,
    industryId: filters.industryId,
    search: filters.search.trim() || undefined,
  })
}

function applyFilters() {
  void loadList(1)
}

function goToPage(target: number) {
  const safePage = Math.max(1, Math.min(target, directory.value.pageCount))
  void loadList(safePage)
}

async function openDetail(companyId: string) {
  detailOpen.value = true
  detailLoading.value = true
  try {
    detailCompany.value = await apiFetch<CompanyModel>(
      `/companies/${companyId}`,
    )
  } catch (error) {
    toast.add({
      title: (error as Error).message || '无法加载公司详情',
      color: 'error',
    })
    detailOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => {
  void companyStore.fetchMeta()
  void loadList(1)
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          工商数据库
        </h2>
      </div>
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
              <th class="px-4 py-3">类型</th>
              <th class="px-4 py-3">状态</th>
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
                  {{ company.summary || '暂无简介' }}
                </p>
              </td>
              <td class="px-4 py-3 text-slate-500">
                <div class="flex items-center gap-2">
                  <img
                    v-if="ownerUser(company)?.avatarUrl"
                    :src="ownerUser(company)?.avatarUrl"
                    alt="所属人头像"
                    class="h-7 w-7 rounded-full object-cover"
                  />
                  <div
                    v-else
                    class="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400"
                  >
                    <UIcon name="i-lucide-user-round" class="h-4 w-4" />
                  </div>
                  <RouterLink
                    v-if="ownerUser(company)?.id"
                    :to="{
                      name: 'player',
                      params: { playerId: ownerUser(company)?.id },
                    }"
                    class="text-sm text-slate-600 hover:text-primary-500"
                  >
                    {{
                      ownerUser(company)?.displayName ||
                      ownerUser(company)?.name ||
                      '未知法人'
                    }}
                  </RouterLink>
                  <span v-else class="text-sm text-slate-500">—</span>
                </div>
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ company.industry?.name || '—' }}
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ company.type?.name || '—' }}
              </td>
              <td class="px-4 py-3">
                <CompanyStatusBadge :status="company.status" />
              </td>
              <td class="px-4 py-3 text-right">
                <UButton
                  size="xs"
                  color="primary"
                  variant="ghost"
                  @click="openDetail(company.id)"
                >
                  查看详情
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
    :open="detailOpen"
    @update:open="(value) => (detailOpen = value)"
    :ui="{ content: 'w-full max-w-3xl w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              工商数据库详情
            </p>
            <h3 class="text-lg font-semibold text-slate-900">
              {{ detailCompany?.name || '公司详情' }}
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="detailOpen = false"
          />
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div v-if="detailLoading" class="text-sm text-slate-500">
            加载中...
          </div>
          <div v-else-if="!detailCompany" class="text-sm text-slate-500">
            未找到公司信息。
          </div>
          <div v-else class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-slate-500">
                  {{ detailCompany.summary || '暂无简介' }}
                </p>
              </div>
              <CompanyStatusBadge :status="detailCompany.status" />
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-xl border border-slate-200/70 p-4 text-sm">
                <div>行业：{{ detailCompany.industry?.name || '未设置' }}</div>
                <div class="mt-2">
                  类型：{{ detailCompany.type?.name || '未设置' }}
                </div>
                <div class="mt-2">
                  注册时间：
                  {{
                    detailCompany.approvedAt
                      ? new Date(detailCompany.approvedAt).toLocaleString()
                      : '未注册'
                  }}
                </div>
              </div>
              <div class="rounded-xl border border-slate-200/70 p-4 text-sm">
                <div class="flex items-center gap-3">
                  <img
                    v-if="ownerUser(detailCompany)?.avatarUrl"
                    :src="ownerUser(detailCompany)?.avatarUrl"
                    alt="所属人头像"
                    class="h-10 w-10 rounded-full object-cover"
                  />
                  <div
                    v-else
                    class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"
                  >
                    <UIcon name="i-lucide-user-round" class="h-5 w-5" />
                  </div>
                  <div class="flex flex-col">
                    <span class="font-medium text-slate-900">
                      {{
                        ownerUser(detailCompany)?.displayName ||
                        ownerUser(detailCompany)?.name ||
                        '未知法人'
                      }}
                    </span>
                    <RouterLink
                      v-if="ownerUser(detailCompany)?.id"
                      :to="{
                        name: 'player',
                        params: { playerId: ownerUser(detailCompany)?.id },
                      }"
                      class="text-xs text-primary-500 hover:underline"
                    >
                      查看个人页面
                    </RouterLink>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200/70 p-4 text-sm">
              <div class="text-xs font-semibold text-slate-500">详细介绍</div>
              <p class="mt-2 text-slate-600">
                {{ detailCompany.description || '暂无详细介绍' }}
              </p>
            </div>
          </div>
        </div>
        <div class="border-t border-slate-200 px-6 py-4 flex justify-end">
          <UButton color="neutral" variant="ghost" @click="detailOpen = false">
            关闭
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
