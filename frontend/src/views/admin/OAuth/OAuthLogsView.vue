<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useOAuthStore } from '@/stores/shared/oauth'
import { ApiError } from '@/utils/http/api'

const oauthStore = useOAuthStore()
const { providers } = storeToRefs(oauthStore)

type LogRecord = {
  id: string
  providerKey: string
  providerType: string
  action: string
  status: string
  message?: string | null
  user?: { id: string; email?: string | null; name?: string | null }
  createdAt: string
  metadata?: Record<string, unknown> | null
}

const logs = ref<LogRecord[]>([])
const loading = ref(false)
const errorMessage = ref('')
const pagination = ref({
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
})

const filters = reactive({
  providerKey: '',
  action: '',
  status: '',
  userId: '',
  search: '',
  page: 1,
})

const actionOptions = [
  { label: 'Authorize', value: 'AUTHORIZE' },
  { label: 'Token Exchange', value: 'TOKEN' },
  { label: '登录', value: 'LOGIN' },
  { label: '注册', value: 'REGISTER' },
  { label: '绑定', value: 'BIND' },
  { label: '解绑', value: 'UNBIND' },
  { label: '错误', value: 'ERROR' },
]

const statusOptions = [
  { label: '成功', value: 'SUCCESS' },
  { label: '失败', value: 'FAILURE' },
]

async function fetchLogs() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await oauthStore.listLogs({
      providerKey: filters.providerKey || undefined,
      action: filters.action || undefined,
      status: filters.status || undefined,
      userId: filters.userId || undefined,
      search: filters.search || undefined,
      page: filters.page,
    })
    logs.value = result.items as LogRecord[]
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
  void fetchLogs()
})

function goTo(page: number) {
  if (page < 1 || page > pagination.value.pageCount) return
  filters.page = page
  void fetchLogs()
}

const providerOptions = computed(() =>
  providers.value.map((item) => ({ label: item.name, value: item.key })),
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-end gap-2">
      <USelect
        v-model="filters.providerKey"
        :items="providerOptions"
        placeholder="全部 Provider"
      />
      <USelect
        v-model="filters.action"
        :items="actionOptions"
        placeholder="全部动作"
      />
      <USelect
        v-model="filters.status"
        :items="statusOptions"
        placeholder="全部状态"
      />
      <UInput
        v-model="filters.search"
        placeholder="关键词"
        icon="i-lucide-search"
      />
      <UButton
        color="primary"
        variant="soft"
        @click="
          () => {
            filters.page = 1
            fetchLogs()
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
        @click="fetchLogs"
      >
        刷新
      </UButton>
    </div>

    <!-- 错误提示 -->
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      :title="'加载失败'"
      :description="errorMessage"
    />

    <!-- 表格容器（与 LuckPerms 一致） -->
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
              <th class="px-3 py-2 text-left">动作</th>
              <th class="px-3 py-2 text-left">状态</th>
              <th class="px-3 py-2 text-left">消息</th>
              <th class="px-3 py-2 text-left">用户</th>
              <th class="px-3 py-2 text-left">时间</th>
            </tr>
          </thead>

          <tbody
            v-if="!loading && logs.length > 0"
            class="divide-y divide-slate-100 dark:divide-slate-800/70"
          >
            <tr
              v-for="item in logs"
              :key="item.id"
              class="transition hover:bg-slate-50/60 dark:hover:bg-slate-900/50"
            >
              <td class="px-3 py-3 text-xs uppercase">
                {{ item.providerKey }}
              </td>
              <td class="px-3 py-3 text-xs uppercase">{{ item.action }}</td>
              <td class="px-3 py-3">
                <UBadge
                  size="xs"
                  variant="soft"
                  :color="item.status === 'SUCCESS' ? 'primary' : 'error'"
                >
                  {{ item.status }}
                </UBadge>
              </td>
              <td class="px-3 py-3 text-sm text-slate-700 dark:text-slate-200">
                {{ item.message || '—' }}
              </td>
              <td class="px-3 py-3 text-xs text-slate-500">
                {{ item.user?.email ?? '未知用户' }}（ID:
                {{ item.user?.id || 'N/A' }}）
              </td>
              <td class="px-3 py-3 text-xs text-slate-500">
                {{ new Date(item.createdAt).toLocaleString() }}
              </td>
            </tr>
          </tbody>

          <tbody v-else-if="loading">
            <tr>
              <td colspan="6" class="p-6 text-center text-slate-500">
                <UIcon
                  name="i-lucide-loader-2"
                  class="inline-block h-4 w-4 animate-spin"
                />
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr>
              <td colspan="6" class="p-8 text-center text-slate-500">
                暂无日志记录
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="pagination.pageCount > 1"
      class="mt-6 flex items-center justify-between text-sm text-slate-500"
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
          >上一页</UButton
        >
        <UButton
          size="xs"
          :disabled="filters.page >= pagination.pageCount"
          @click="goTo(filters.page + 1)"
          >下一页</UButton
        >
      </div>
    </div>
  </div>
</template>
