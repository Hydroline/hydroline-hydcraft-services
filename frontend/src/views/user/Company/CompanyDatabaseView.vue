<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useCompanyStore } from '@/stores/user/companies'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'

const companyStore = useCompanyStore()
const router = useRouter()

const filters = reactive({
  typeId: undefined as string | undefined,
  industryId: undefined as string | undefined,
  search: '',
})

const directory = computed(() => companyStore.directory)

function ownerUser(company: (typeof directory.value.items)[number]) {
  return company.legalRepresentative || company.legalPerson?.user || null
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
  pageInput.value = directory.value.page
}

function applyFilters() {
  void loadList(1)
}

function goToPage(target: number) {
  const safePage = Math.max(1, Math.min(target, directory.value.pageCount))
  void loadList(safePage)
}

function openDetail(companyId: string) {
  router.push({ name: 'company.database.detail', params: { companyId } })
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
                  <UAvatar
                    v-if="ownerUser(company)?.avatarUrl"
                    :src="ownerUser(company)?.avatarUrl"
                    size="xs"
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
</template>
