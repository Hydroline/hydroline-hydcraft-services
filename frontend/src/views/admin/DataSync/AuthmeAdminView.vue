<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiFetch, ApiError } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import { useUiStore } from '@/stores/shared/ui'

const authStore = useAuthStore()
const uiStore = useUiStore()
const toast = useToast()

type AuthmeHealth =
  | { ok: true; latencyMs: number }
  | {
      ok: false
      stage: 'DNS' | 'CONNECT' | 'AUTH' | 'QUERY'
      message: string
      cause?: string
    }

interface AuthmeConfigForm {
  host: string
  port: number
  database: string
  user: string
  password: string
  charset: string
  pool: {
    min: number
    max: number
    idleMillis: number
    acquireTimeoutMillis: number
  }
  connectTimeoutMillis: number
  readonly: boolean
  enabled: boolean
}

interface AuthmeFeatureForm {
  emailVerificationEnabled: boolean
  authmeRegisterEnabled: boolean
  authmeLoginEnabled: boolean
  authmeBindingEnabled: boolean
}

type StatusRow = {
  key: string
  label: string
  text?: string
  badge?: {
    color: 'primary' | 'success' | 'warning' | 'error' | 'neutral'
    text: string
  }
  description?: string
}

const loading = ref(true)
const savingConfig = ref(false)
const savingFeature = ref(false)
const reloadingHealth = ref(false)

const configDialogOpen = ref(false)
const featureDialogOpen = ref(false)

const health = ref<AuthmeHealth | null>(null)
const system = ref<{ uptimeSeconds: number; timestamp: string } | null>(null)
const configMeta = ref<{ version: number; updatedAt: string } | null>(null)
const featureMeta = ref<{ version: number; updatedAt: string } | null>(null)

const configBaseline = ref<AuthmeConfigForm | null>(null)
const featureBaseline = ref<AuthmeFeatureForm | null>(null)

const configForm = reactive<AuthmeConfigForm>({
  host: '',
  port: 3306,
  database: '',
  user: '',
  password: '',
  charset: 'utf8mb4',
  pool: {
    min: 0,
    max: 10,
    idleMillis: 30000,
    acquireTimeoutMillis: 10000,
  },
  connectTimeoutMillis: 5000,
  readonly: false,
  enabled: true,
})

const featureForm = reactive<AuthmeFeatureForm>({
  emailVerificationEnabled: false,
  authmeRegisterEnabled: true,
  authmeLoginEnabled: true,
  authmeBindingEnabled: true,
})

const uptimeText = computed(() => {
  if (!system.value) return '未获取'
  const total = system.value.uptimeSeconds
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) {
    return `${days} 天 ${hours} 小时`
  }
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`
  }
  return `${minutes} 分钟`
})

const statusRows = computed<StatusRow[]>(() => {
  const rows: StatusRow[] = []
  const healthValue = health.value
  rows.push({
    key: 'status',
    label: '运行状态',
    badge: {
      color: healthValue?.ok ? 'success' : 'error',
      text: healthValue?.ok
        ? '在线'
        : healthValue
          ? `异常 · ${healthValue.stage}`
          : '未知',
    },
    description: healthValue?.ok
      ? `延迟 ${healthValue.latencyMs} ms`
      : (healthValue?.message ?? '无法获取连接状态'),
  })
  rows.push({
    key: 'endpoint',
    label: '连接地址',
    text: configForm.host ? `${configForm.host}:${configForm.port}` : '未配置',
  })
  rows.push({
    key: 'database',
    label: '数据库',
    text: configForm.database || '未配置',
  })
  rows.push({
    key: 'user',
    label: '用户名',
    text: configForm.user || '未配置',
  })
  rows.push({
    key: 'charset',
    label: '字符集',
    text: configForm.charset || '未配置',
  })
  rows.push({
    key: 'connectTimeoutMillis',
    label: '连接超时',
    text: `${configForm.connectTimeoutMillis} ms`,
  })
  rows.push({
    key: 'pool',
    label: '连接池',
    text: `min ${configForm.pool.min} · max ${configForm.pool.max}`,
    description: `空闲 ${configForm.pool.idleMillis} ms · 获取 ${configForm.pool.acquireTimeoutMillis} ms`,
  })
  rows.push({
    key: 'enabled',
    label: '启用连接',
    badge: {
      color: configForm.enabled ? 'primary' : 'neutral',
      text: configForm.enabled ? '启用' : '停用',
    },
  })
  rows.push({
    key: 'readonly',
    label: '只读模式',
    badge: {
      color: configForm.readonly ? 'warning' : 'success',
      text: configForm.readonly ? '只读' : '读写',
    },
  })
  rows.push({
    key: 'uptime',
    label: '运行时长',
    text: uptimeText.value,
  })
  if (system.value) {
    rows.push({
      key: 'refreshedAt',
      label: '上次刷新',
      text: new Date(system.value.timestamp).toLocaleString(),
    })
  }
  if (configMeta.value) {
    rows.push({
      key: 'configVersion',
      label: '配置版本',
      text: `v${configMeta.value.version}`,
      description: new Date(configMeta.value.updatedAt).toLocaleString(),
    })
  }
  if (featureMeta.value) {
    rows.push({
      key: 'featureVersion',
      label: '功能版本',
      text: `v${featureMeta.value.version}`,
      description: new Date(featureMeta.value.updatedAt).toLocaleString(),
    })
  }
  return rows
})

async function loadOverview() {
  if (!authStore.token) {
    throw new Error('未登录')
  }
  const result = await apiFetch<{
    health: AuthmeHealth
    config: AuthmeConfigForm | null
    configMeta: { version: number; updatedAt: string } | null
    featureFlags: AuthmeFeatureForm
    featureMeta: { version: number; updatedAt: string } | null
    system: { uptimeSeconds: number; timestamp: string }
  }>('/authme/admin/overview', {
    token: authStore.token,
  })
  health.value = result.health
  system.value = result.system
  if (result.config) {
    applyConfig(result.config)
  } else {
    configBaseline.value = cloneAuthmeConfig(configForm)
  }
  configMeta.value = result.configMeta
  applyFeatureFlags(result.featureFlags)
  featureMeta.value = result.featureMeta
}

async function initialize() {
  loading.value = true
  uiStore.startLoading()
  try {
    await loadOverview()
  } catch (error) {
    handleError(error, '加载 AuthMe 概览失败')
  } finally {
    loading.value = false
    uiStore.stopLoading()
  }
}

async function saveConfig() {
  if (!authStore.token) return
  savingConfig.value = true
  uiStore.startLoading()
  try {
    await apiFetch('/authme/admin/config', {
      method: 'PATCH',
      token: authStore.token,
      body: configForm,
    })
    await loadOverview()
    toastSuccess('AuthMe 连接配置已更新')
    configDialogOpen.value = false
  } catch (error) {
    handleError(error, '更新 AuthMe 配置失败')
  } finally {
    savingConfig.value = false
    uiStore.stopLoading()
  }
}

async function saveFeatures() {
  if (!authStore.token) return
  savingFeature.value = true
  uiStore.startLoading()
  try {
    await apiFetch('/authme/admin/feature', {
      method: 'PATCH',
      token: authStore.token,
      body: featureForm,
    })
    await loadOverview()
    toastSuccess('AuthMe 功能开关已保存')
    featureDialogOpen.value = false
  } catch (error) {
    handleError(error, '更新功能开关失败')
  } finally {
    savingFeature.value = false
    uiStore.stopLoading()
  }
}

async function refreshHealth() {
  reloadingHealth.value = true
  try {
    await loadOverview()
  } catch (error) {
    handleError(error, '刷新状态失败')
  } finally {
    reloadingHealth.value = false
  }
}

function toastSuccess(message: string) {
  toast.add({
    title: '已保存',
    description: message,
    color: 'success',
  })
}

function handleError(error: unknown, fallback: string) {
  const description =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : fallback
  toast.add({
    title: fallback,
    description,
    color: 'error',
  })
  console.error(fallback, error)
}

function cloneAuthmeConfig(config: AuthmeConfigForm): AuthmeConfigForm {
  return {
    ...config,
    pool: { ...config.pool },
  }
}

function assignAuthmeConfig(
  target: AuthmeConfigForm,
  source: AuthmeConfigForm,
) {
  target.host = source.host
  target.port = source.port
  target.database = source.database
  target.user = source.user
  target.password = source.password
  target.charset = source.charset
  target.connectTimeoutMillis = source.connectTimeoutMillis
  target.readonly = source.readonly
  target.enabled = source.enabled
  target.pool.min = source.pool.min
  target.pool.max = source.pool.max
  target.pool.idleMillis = source.pool.idleMillis
  target.pool.acquireTimeoutMillis = source.pool.acquireTimeoutMillis
}

function applyConfig(next: AuthmeConfigForm) {
  assignAuthmeConfig(configForm, next)
  configBaseline.value = cloneAuthmeConfig(next)
}

function resetConfigForm() {
  if (configBaseline.value) {
    assignAuthmeConfig(configForm, configBaseline.value)
  }
}

function cloneFeatureForm(flags: AuthmeFeatureForm): AuthmeFeatureForm {
  return { ...flags }
}

function assignFeatureForm(
  target: AuthmeFeatureForm,
  source: AuthmeFeatureForm,
) {
  target.authmeLoginEnabled = source.authmeLoginEnabled
  target.authmeRegisterEnabled = source.authmeRegisterEnabled
  target.authmeBindingEnabled = source.authmeBindingEnabled
  target.emailVerificationEnabled = source.emailVerificationEnabled
}

function applyFeatureFlags(flags: AuthmeFeatureForm) {
  assignFeatureForm(featureForm, flags)
  featureBaseline.value = cloneFeatureForm(flags)
}

function resetFeatureForm() {
  if (featureBaseline.value) {
    assignFeatureForm(featureForm, featureBaseline.value)
  }
}

watch(configDialogOpen, () => {
  resetConfigForm()
})

watch(featureDialogOpen, () => {
  resetFeatureForm()
})

onMounted(() => {
  void initialize()
})
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
        AuthMe 状态
      </h1>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="reloadingHealth || loading"
          @click="refreshHealth"
        >
          刷新状态
        </UButton>
        <UButton
          variant="soft"
          icon="i-lucide-sliders-horizontal"
          @click="featureDialogOpen = true"
        >
          功能开关
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-plug"
          @click="configDialogOpen = true"
        >
          连接配置
        </UButton>
      </div>
    </header>

    <UAlert
      v-if="health && !health.ok"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      :title="`AuthMe 状态异常（${health.stage}）`"
      :description="health.message"
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
              <th class="px-4 py-3 text-left">参数</th>
              <th class="px-4 py-3 text-left">当前值</th>
              <th class="px-4 py-3 text-left">说明</th>
            </tr>
          </thead>
          <tbody
            v-if="!loading"
            class="divide-y divide-slate-100 dark:divide-slate-800/70"
          >
            <tr
              v-for="row in statusRows"
              :key="row.key"
              class="transition hover:bg-slate-50/60 dark:hover:bg-slate-900/50"
            >
              <td
                class="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                {{ row.label }}
              </td>
              <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                <template v-if="row.badge">
                  <UBadge :color="row.badge.color" variant="soft">
                    {{ row.badge.text }}
                  </UBadge>
                </template>
                <template v-else-if="row.text">
                  {{ row.text }}
                </template>
                <span v-else class="text-slate-400 dark:text-slate-500">
                  —
                </span>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <span v-if="row.description">{{ row.description }}</span>
                <span v-else class="text-slate-400 dark:text-slate-600">—</span>
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr>
              <td
                colspan="3"
                class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                加载中...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal
      :open="featureDialogOpen"
      @update:open="featureDialogOpen = $event"
      :ui="{
        content:
          'w-full max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                功能开关
              </h2>
              <p
                v-if="featureMeta"
                class="text-xs text-slate-500 dark:text-slate-400"
              >
                版本 {{ featureMeta.version }} ·
                {{ new Date(featureMeta.updatedAt).toLocaleString() }}
              </p>
            </div>
          </template>
          <form class="space-y-4" @submit.prevent="saveFeatures">
            <div class="space-y-3">
              <label
                class="flex items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-200"
              >
                <span>启用 AuthMe 注册</span>
                <USwitch v-model="featureForm.authmeRegisterEnabled" />
              </label>
              <label
                class="flex items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-200"
              >
                <span>启用 AuthMe 登录</span>
                <USwitch v-model="featureForm.authmeLoginEnabled" />
              </label>
              <label
                class="flex items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-200"
              >
                <span>允许绑定/解绑</span>
                <USwitch v-model="featureForm.authmeBindingEnabled" />
              </label>
              <label
                class="flex items-center justify-between gap-4 text-sm text-slate-700 dark:text-slate-200"
              >
                <span>启用邮箱验证</span>
                <USwitch v-model="featureForm.emailVerificationEnabled" />
              </label>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <UButton
                type="button"
                variant="ghost"
                @click="featureDialogOpen = false"
              >
                取消
              </UButton>
              <UButton type="submit" color="primary" :loading="savingFeature">
                保存
              </UButton>
            </div>
          </form>
        </UCard>
      </template>
    </UModal>

    <UModal
      :open="configDialogOpen"
      @update:open="configDialogOpen = $event"
      :ui="{
        content:
          'w-full max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                连接配置
              </h2>
              <p
                v-if="configMeta"
                class="text-xs text-slate-500 dark:text-slate-400"
              >
                版本 {{ configMeta.version }} ·
                {{ new Date(configMeta.updatedAt).toLocaleString() }}
              </p>
            </div>
          </template>
          <form class="grid gap-4 md:grid-cols-2" @submit.prevent="saveConfig">
            <label
              class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span class="font-medium text-slate-700 dark:text-slate-200">
                主机
              </span>
              <UInput
                v-model="configForm.host"
                placeholder="server2.aurlemon.top"
                required
              />
            </label>
            <label
              class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span class="font-medium text-slate-700 dark:text-slate-200">
                端口
              </span>
              <UInput
                v-model.number="configForm.port"
                type="number"
                min="1"
                required
              />
            </label>
            <label
              class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span class="font-medium text-slate-700 dark:text-slate-200">
                数据库名
              </span>
              <UInput
                v-model="configForm.database"
                placeholder="h2_authme"
                required
              />
            </label>
            <label
              class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span class="font-medium text-slate-700 dark:text-slate-200">
                用户名
              </span>
              <UInput
                v-model="configForm.user"
                placeholder="h2_authme"
                required
              />
            </label>
            <label
              class="md:col-span-2 flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span class="font-medium text-slate-700 dark:text-slate-200">
                密码
              </span>
              <UInput v-model="configForm.password" type="password" required />
            </label>
            <label
              class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span class="font-medium text-slate-700 dark:text-slate-200">
                字符集
              </span>
              <UInput v-model="configForm.charset" placeholder="utf8mb4" />
            </label>
            <label
              class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span class="font-medium text-slate-700 dark:text-slate-200">
                连接超时 (ms)
              </span>
              <UInput
                v-model.number="configForm.connectTimeoutMillis"
                type="number"
                min="0"
                required
              />
            </label>

            <div
              class="md:col-span-2 grid gap-4 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700/70"
            >
              <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
                连接池配置
              </p>
              <div class="grid gap-4 md:grid-cols-2">
                <label
                  class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span class="font-medium text-slate-700 dark:text-slate-200">
                    最小连接数
                  </span>
                  <UInput
                    v-model.number="configForm.pool.min"
                    type="number"
                    min="0"
                    required
                  />
                </label>
                <label
                  class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span class="font-medium text-slate-700 dark:text-slate-200">
                    最大连接数
                  </span>
                  <UInput
                    v-model.number="configForm.pool.max"
                    type="number"
                    min="1"
                    required
                  />
                </label>
                <label
                  class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span class="font-medium text-slate-700 dark:text-slate-200">
                    空闲释放 (ms)
                  </span>
                  <UInput
                    v-model.number="configForm.pool.idleMillis"
                    type="number"
                    min="0"
                    required
                  />
                </label>
                <label
                  class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span class="font-medium text-slate-700 dark:text-slate-200">
                    获取超时 (ms)
                  </span>
                  <UInput
                    v-model.number="configForm.pool.acquireTimeoutMillis"
                    type="number"
                    min="0"
                    required
                  />
                </label>
              </div>
            </div>

            <div
              class="md:col-span-2 flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-300"
            >
              <label class="flex items-center gap-2">
                <UCheckbox v-model="configForm.enabled" />
                启用连接
              </label>
              <label class="flex items-center gap-2">
                <UCheckbox v-model="configForm.readonly" />
                只读模式
              </label>
            </div>

            <div class="md:col-span-2 flex justify-end gap-2">
              <UButton
                type="button"
                variant="ghost"
                @click="configDialogOpen = false"
              >
                取消
              </UButton>
              <UButton type="submit" color="primary" :loading="savingConfig">
                保存配置
              </UButton>
            </div>
          </form>
        </UCard>
      </template>
    </UModal>
  </section>
</template>
