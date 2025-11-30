<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useOAuthStore, type AdminOAuthProvider } from '@/stores/oauth'
import { ApiError } from '@/utils/api'

const oauthStore = useOAuthStore()
const { providers } = storeToRefs(oauthStore)
const toast = useToast()

const loading = computed(() => oauthStore.loadingProviders)
const formModalOpen = ref(false)
const proxyTestModalOpen = ref(false)
const formSaving = ref(false)
const formError = ref('')
const editingProvider = ref<AdminOAuthProvider | null>(null)

const form = reactive({
  key: '',
  name: '',
  type: 'MICROSOFT',
  description: '',
  enabled: true,
  tenantId: '',
  clientId: '',
  clientSecret: '',
  authorizeUrl: '',
  tokenUrl: '',
  redirectUri: '',
  providerProxyEnabled: false,
  scopes: 'openid profile email offline_access User.Read',
})

onMounted(() => {
  if (!oauthStore.providersLoaded) {
    void oauthStore.fetchProviders().catch((error) => {
      console.warn('[oauth] failed to load providers', error)
    })
  }
  void oauthStore.fetchProxyEnv().catch((error) => {
    console.warn('[oauth] failed to load proxy env', error)
  })
})

async function runProxyConnectivityTest() {
  try {
    const result = await oauthStore.testProxyConnectivity()
    proxyTestResult.value = {
      ok: !!(result as any).ok,
      status: result.status,
      error: result.error,
      env: result.env,
    }
    toast.add({
      title: (result as any).ok ? '已收到 Proxy 响应' : 'Proxy 不可用',
      description: (result as any).ok
        ? `status=${result.status ?? 'unknown'}, elapsed=${result.elapsedMs ?? '-'}ms`
        : (result.error ?? 'Unknown error'),
      color: (result as any).ok ? 'success' : 'error',
    })
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : '测试失败，请稍后再试'
    proxyTestResult.value = { ok: false, error: message }
    toast.add({ title: '测试失败', description: message, color: 'error' })
  }
}

const proxyTestResult = ref<null | {
  ok: boolean
  status?: number
  error?: string
  env?: { proxyUrl?: string | null; hasProxyKey?: boolean }
}>(null)

function openProxyTestDialog() {
  proxyTestResult.value = null
  proxyTestModalOpen.value = true
}

function openCreate() {
  editingProvider.value = null
  resetForm()
  formModalOpen.value = true
}

function openEdit(provider: AdminOAuthProvider) {
  editingProvider.value = provider
  form.key = provider.key
  form.name = provider.name
  form.type = provider.type
  form.description = provider.description ?? ''
  form.enabled = provider.enabled
  form.tenantId = provider.settings.tenantId ?? ''
  form.clientId = provider.settings.clientId ?? ''
  form.authorizeUrl = provider.settings.authorizeUrl ?? ''
  form.tokenUrl = provider.settings.tokenUrl ?? ''
  form.redirectUri = provider.settings.redirectUri ?? ''
  form.providerProxyEnabled = provider.settings.providerProxyEnabled ?? false
  form.scopes = (provider.settings.scopes ?? []).join(' ')
  form.clientSecret = ''
  formModalOpen.value = true
}

function resetForm() {
  form.key = ''
  form.name = ''
  form.type = 'MICROSOFT'
  form.description = ''
  form.enabled = true
  form.tenantId = ''
  form.clientId = ''
  form.clientSecret = ''
  form.authorizeUrl = ''
  form.tokenUrl = ''
  form.redirectUri = ''
  form.providerProxyEnabled = false
  form.scopes = 'openid profile email offline_access User.Read'
}

async function submitForm() {
  formError.value = ''
  formSaving.value = true
  try {
    const payload = {
      key: form.key.trim(),
      name: form.name.trim(),
      type: form.type.trim() || 'MICROSOFT',
      description: form.description.trim() || undefined,
      enabled: form.enabled,
      settings: {
        tenantId: form.tenantId.trim() || undefined,
        clientId: form.clientId.trim() || undefined,
        clientSecret: form.clientSecret.trim() || undefined,
        authorizeUrl: form.authorizeUrl.trim() || undefined,
        tokenUrl: form.tokenUrl.trim() || undefined,
        redirectUri: form.redirectUri.trim() || undefined,
        providerProxyEnabled: form.providerProxyEnabled,
        scopes: form.scopes
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean),
      },
    }
    if (editingProvider.value) {
      await oauthStore.updateProvider(editingProvider.value.id, payload)
    } else {
      await oauthStore.createProvider(payload)
    }
    formModalOpen.value = false
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : '保存失败，请稍后再试'
    formError.value = message
    toast.add({ title: '保存失败', description: message, color: 'error' })
  } finally {
    formSaving.value = false
  }
}

async function refresh() {
  await oauthStore.fetchProviders(true)
}

function closeForm() {
  formModalOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-end">
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="refresh"
        >
          刷新
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-flask-conical"
          @click="openProxyTestDialog"
        >
          测试 Provider Proxy
        </UButton>
        <UButton color="primary" icon="i-lucide-plus" @click="openCreate">
          新增 Provider
        </UButton>
        <span class="ml-2 text-xs text-slate-500 dark:text-slate-400">
          当前共 {{ providers.length }} 个 Provider
        </span>
      </div>
    </div>

    <!-- Proxy 信息不再在顶部展示，放入对话框中 -->

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
              <th class="px-3 py-2 text-left">Key</th>
              <th class="px-3 py-2 text-left">名称</th>
              <th class="px-3 py-2 text-left">类型</th>
              <th class="px-3 py-2 text-left">状态</th>
              <th class="px-3 py-2 text-left">客户端 ID</th>
              <th class="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>

          <tbody
            v-if="!loading && providers.length > 0"
            class="divide-y divide-slate-100 dark:divide-slate-800/70"
          >
            <tr
              v-for="provider in providers"
              :key="provider.id"
              class="transition hover:bg-slate-50/60 dark:hover:bg-slate-900/50"
            >
              <td class="px-3 py-3 font-mono text-xs text-slate-500">
                {{ provider.key }}
              </td>
              <td class="px-3 py-3">
                <div class="font-semibold text-slate-900 dark:text-white">
                  {{ provider.name }}
                </div>
                <div class="text-xs text-slate-500">
                  {{ provider.description || '—' }}
                </div>
              </td>
              <td class="px-3 py-3 uppercase text-xs">{{ provider.type }}</td>
              <td class="px-3 py-3">
                <UBadge
                  :color="provider.enabled ? 'primary' : 'neutral'"
                  variant="soft"
                >
                  {{ provider.enabled ? '启用' : '禁用' }}
                </UBadge>
              </td>
              <td class="px-3 py-3 text-xs text-slate-500">
                {{ provider.settings.clientId || '未配置' }}
              </td>
              <td class="px-3 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-pen-square"
                    @click="openEdit(provider)"
                  >
                    编辑
                  </UButton>
                  <UBadge
                    v-if="provider.settings.hasClientSecret"
                    variant="soft"
                  >
                    已配置密钥
                  </UBadge>
                </div>
              </td>
            </tr>
          </tbody>

          <tbody v-else-if="loading">
            <tr>
              <td colspan="6" class="p-6 text-center text-slate-500">
                加载中...
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr>
              <td colspan="6" class="p-8 text-center text-slate-500">
                暂无 Provider，点击右上角按钮创建。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal
      v-model:open="formModalOpen"
      :ui="{ content: 'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' }"
    >
      <template #content>
        <div class="space-y-4 p-6">
          <div class="flex justify-between items-center gap-4">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ editingProvider ? '编辑 Provider' : '创建 Provider' }}
            </h3>

            <div class="flex items-center justify-between gap-2">
              <span class="text-sm text-slate-600 dark:text-slate-300"
                >启用状态</span
              >
              <USwitch size="sm" v-model="form.enabled" />
            </div>
          </div>

          <div class="grid md:grid-cols-2 gap-4">
            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">Key</div>
              <UInput
                class="w-full"
                v-model="form.key"
                :disabled="Boolean(editingProvider)"
              />
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">名称</div>
              <UInput class="w-full" v-model="form.name" />
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">类型</div>
              <UInput class="w-full" v-model="form.type" />
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                Scopes（空格分隔）
              </div>
              <UInput class="w-full" v-model="form.scopes" />
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                Tenant ID
              </div>
              <UInput class="w-full" v-model="form.tenantId" />
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                Client ID
              </div>
              <UInput class="w-full" v-model="form.clientId" />
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                Client Secret
              </div>
              <UInput
                class="w-full"
                v-model="form.clientSecret"
                type="password"
                placeholder="留空则保持不变"
              />
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                启用 Provider Proxy
              </div>
              <USwitch v-model="form.providerProxyEnabled" />
              <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                启用后，后端将通过配置的 PROXY 服务中转 OAuth HTTP
                请求，用于规避直连受限（仅对该 Provider 生效）。
              </p>
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                Redirect URL
              </div>
              <UInput class="w-full" v-model="form.redirectUri" />
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                Authorize URL
              </div>
              <UInput class="w-full" v-model="form.authorizeUrl" />
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                Token URL
              </div>
              <UInput class="w-full" v-model="form.tokenUrl" />
            </div>

            <div class="space-y-1 md:col-span-2">
              <div class="text-xs text-slate-500 dark:text-slate-500">描述</div>
              <UTextarea class="w-full" v-model="form.description" :rows="3" />
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="closeForm">取消</UButton>
            <UButton color="primary" :loading="formSaving" @click="submitForm">
              保存
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="proxyTestModalOpen"
      :ui="{ content: 'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' }"
    >
      <template #content>
        <div class="space-y-4 p-6">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            测试 Provider Proxy
          </h3>

          <div class="space-y-2 text-xs text-slate-500 dark:text-slate-400">
            <div>
              <span class="font-medium">Proxy URL:</span>
              <span class="ml-1">
                {{ oauthStore.proxyEnv?.proxyUrl || '未配置' }}
              </span>
            </div>
            <div>
              <span class="font-medium">Proxy Key:</span>
              <span class="ml-1">
                {{ oauthStore.proxyEnv?.hasProxyKey ? '已配置' : '未配置' }}
              </span>
            </div>
          </div>

          <!-- 不需要自定义 URL，直接执行连通性测试 -->

          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="proxyTestModalOpen = false">
              关闭
            </UButton>
            <UButton color="primary" @click="runProxyConnectivityTest">
              执行测试
            </UButton>
          </div>

          <div v-if="proxyTestResult" class="mt-4 text-xs">
            <div
              :class="[
                'mb-2 font-medium',
                proxyTestResult.ok ? 'text-emerald-600' : 'text-rose-600',
              ]"
            >
              {{ proxyTestResult.ok ? '测试成功' : '测试失败' }}
              <span v-if="proxyTestResult.status">
                （HTTP {{ proxyTestResult.status }}）
              </span>
            </div>
            <!-- 无需展示响应体，仅显示错误信息（若有） -->
            <div v-if="proxyTestResult.error" class="text-rose-500 text-[11px]">
              {{ proxyTestResult.error }}
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
