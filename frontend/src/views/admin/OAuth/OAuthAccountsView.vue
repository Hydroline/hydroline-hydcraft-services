<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useOAuthStore } from '@/stores/oauth'
import { ApiError } from '@/utils/api'

const oauthStore = useOAuthStore()
const { providers } = storeToRefs(oauthStore)

type AccountRecord = {
  id: string
  provider: string
  providerAccountId: string
  userId: string
  createdAt: string
  user?: { id: string; email?: string | null; name?: string | null }
}

const records = ref<AccountRecord[]>([])
const loading = ref(false)
const pagination = ref({
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
})
const errorMessage = ref('')
const filters = reactive({
  providerKey: '',
  email: '',
  page: 1,
})

async function fetchAccounts() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await oauthStore.listAccounts({
      providerKey: filters.providerKey || undefined,
      email: filters.email || undefined,
      page: filters.page,
    })
    records.value = result.items as AccountRecord[]
    pagination.value = result.pagination
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : '加载失败，请稍后再试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!oauthStore.providersLoaded) {
    void oauthStore.fetchProviders()
  }
  void fetchAccounts()
})

async function handleRemove(accountId: string) {
  if (!window.confirm('确定要解除该绑定吗？')) return
  await oauthStore.removeAccount(accountId)
  records.value = records.value.filter((item) => item.id !== accountId)
}

function goTo(page: number) {
  if (page < 1 || page > pagination.value.pageCount) return
  filters.page = page
  void fetchAccounts()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-end gap-2">
      <USelect
        v-model="filters.providerKey"
        :items="
          providers.map((item) => ({
            label: item.name,
            value: item.key,
          }))
        "
        placeholder="全部 Provider"
      />
      <UInput
        v-model="filters.email"
        placeholder="按邮箱模糊搜索"
        icon="i-lucide-search"
      />
      <UButton
        color="primary"
        @click="
          () => {
            filters.page = 1
            fetchAccounts()
          }
        "
      >
        应用筛选
      </UButton>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="fetchAccounts"
      >
        刷新
      </UButton>
    </div>

    <!-- 错误提示与表格容器（与 LuckPerms 一致） -->
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      :title="'加载失败'"
      :description="errorMessage"
    />

    <div
      class="rounded-3xl overflow-hidden border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <div class="overflow-x-auto">
        <table
          class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
        >
          <thead
            class="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"
          >
            <tr>
              <th class="px-3 py-2 text-left">Provider</th>
              <th class="px-3 py-2 text-left">绑定账号</th>
              <th class="px-3 py-2 text-left">用户</th>
              <th class="px-3 py-2 text-left">创建时间</th>
              <th class="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>

          <tbody
            v-if="!loading && records.length > 0"
            class="divide-y divide-slate-100 dark:divide-slate-800/70"
          >
            <tr
              v-for="item in records"
              :key="item.id"
              class="transition hover:bg-slate-50/60 dark:hover:bg-slate-900/50"
            >
              <td class="px-3 py-3 font-semibold uppercase text-xs">
                {{ item.provider }}
              </td>
              <td class="px-3 py-3 font-mono text-xs text-slate-500">
                {{ item.providerAccountId }}
              </td>
              <td class="px-3 py-3">
                <div class="text-sm font-medium">
                  {{ item.user?.name ?? item.user?.email ?? '未知用户' }}
                </div>
                <div class="text-xs text-slate-500">
                  {{ item.user?.email ?? 'ID: ' + item.userId }}
                </div>
              </td>
              <td class="px-3 py-3 text-xs text-slate-500">
                {{ new Date(item.createdAt).toLocaleString() }}
              </td>
              <td class="px-3 py-3 text-right">
                <UButton
                  color="error"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-link-2-off"
                  @click="handleRemove(item.id)"
                >
                  解除
                </UButton>
              </td>
            </tr>
          </tbody>

          <tbody v-else-if="loading">
            <tr>
              <td colspan="5" class="p-6 text-center text-slate-500">
                加载中...
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr>
              <td colspan="5" class="p-8 text-center text-slate-500">
                暂无符合条件的绑定记录
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="pagination.pageCount > 1"
      class="mt-6 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400"
    >
      <span>
        共 {{ pagination.total }} 条，{{ pagination.page }}/{{
          pagination.pageCount
        }}
        页
      </span>
      <div class="space-x-2">
        <UButton
          size="xs"
          :disabled="filters.page <= 1"
          @click="goTo(filters.page - 1)"
        >
          上一页
        </UButton>
        <UButton
          size="xs"
          :disabled="filters.page >= pagination.pageCount"
          @click="goTo(filters.page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>
  </div>
</template>
