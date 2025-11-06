<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { apiFetch, ApiError } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const authStore = useAuthStore()
const uiStore = useUiStore()
const toast = useToast()

type LuckpermsHealth =
  | { ok: true; latencyMs: number }
  | {
      ok: false
      stage: 'DNS' | 'CONNECT' | 'AUTH' | 'QUERY'
      message: string
      cause?: string
    }

interface LuckpermsConfigForm {
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

type GroupLabelPair = {
  group: string
  label: string
}

type EditableGroupLabelEntry = {
  id: number
  group: string
  label: string
}

const loading = ref(true)
const savingConfig = ref(false)
const reloadingHealth = ref(false)

const health = ref<LuckpermsHealth | null>(null)
const system = ref<{ uptimeSeconds: number; timestamp: string } | null>(null)
const configMeta = ref<{ version: number; updatedAt: string } | null>(null)

const configForm = reactive<LuckpermsConfigForm>({
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

let groupLabelSeed = 0
function createGroupLabelEntry(
  group = '',
  label = '',
): EditableGroupLabelEntry {
  groupLabelSeed += 1
  return {
    id: groupLabelSeed,
    group,
    label,
  }
}

const groupLabelEntries = ref<EditableGroupLabelEntry[]>([
  createGroupLabelEntry(),
])
const groupLabelMeta = ref<{ version: number; updatedAt: string } | null>(null)
const groupLabelBaseline = ref<GroupLabelPair[]>([])
const groupLabelSignature = ref('[]')
const savingGroupLabels = ref(false)

const groupLabelDirty = computed(() => {
  return (
    serializeGroupLabelEntries(groupLabelEntries.value) !==
    groupLabelSignature.value
  )
})

function normalizeGroupLabelPayload(
  entries: Array<{ group: string; label: string }>,
): GroupLabelPair[] {
  const map = new Map<string, string>()
  for (const entry of entries) {
    const group = typeof entry.group === 'string' ? entry.group.trim() : ''
    const label = typeof entry.label === 'string' ? entry.label.trim() : ''
    if (!group || !label) {
      continue
    }
    map.set(group, label)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, label]) => ({ group, label }))
}

function serializeGroupLabelEntries(entries: EditableGroupLabelEntry[]) {
  const payload = entries.map((entry) => ({
    group: entry.group,
    label: entry.label,
  }))
  return JSON.stringify(normalizeGroupLabelPayload(payload))
}

function setGroupLabelEntriesFromServer(entries: GroupLabelPair[]) {
  const normalized = normalizeGroupLabelPayload(entries)
  groupLabelBaseline.value = normalized
  groupLabelEntries.value =
    normalized.length > 0
      ? normalized.map((entry) => createGroupLabelEntry(entry.group, entry.label))
      : [createGroupLabelEntry()]
  groupLabelSignature.value = JSON.stringify(normalized)
}

function resetGroupLabels() {
  setGroupLabelEntriesFromServer(groupLabelBaseline.value)
}

function addGroupLabelEntry() {
  groupLabelEntries.value.push(createGroupLabelEntry())
}

function removeGroupLabelEntry(id: number) {
  if (groupLabelEntries.value.length <= 1) {
    groupLabelEntries.value = [createGroupLabelEntry()]
    return
  }
  groupLabelEntries.value = groupLabelEntries.value.filter(
    (entry) => entry.id !== id,
  )
  if (!groupLabelEntries.value.length) {
    groupLabelEntries.value.push(createGroupLabelEntry())
  }
}

function buildGroupLabelPayload() {
  return normalizeGroupLabelPayload(
    groupLabelEntries.value.map((entry) => ({
      group: entry.group,
      label: entry.label,
    })),
  )
}

const healthStatusText = computed(() => {
  if (!health.value) return '未知'
  if (health.value.ok) {
    return `已连接（延迟 ${health.value.latencyMs} ms）`
  }
  return `异常 · ${health.value.stage}`
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

async function loadOverview() {
  if (!authStore.token) {
    throw new Error('未登录')
  }
  const result = await apiFetch<{
    health: LuckpermsHealth
    config: LuckpermsConfigForm | null
    configMeta: { version: number; updatedAt: string } | null
    system: { uptimeSeconds: number; timestamp: string }
    groupLabels: { entries: GroupLabelPair[]; meta: { version: number; updatedAt: string } | null } | null
  }>('/luckperms/admin/overview', {
    token: authStore.token,
  })
  health.value = result.health
  system.value = result.system
  if (result.config) {
    applyConfig(result.config)
  }
  configMeta.value = result.configMeta
  if (result.groupLabels) {
    setGroupLabelEntriesFromServer(result.groupLabels.entries ?? [])
    groupLabelMeta.value = result.groupLabels.meta ?? null
  } else {
    setGroupLabelEntriesFromServer([])
    groupLabelMeta.value = null
  }
}

async function initialize() {
  loading.value = true
  uiStore.startLoading()
  try {
    await loadOverview()
  } catch (error) {
    handleError(error, '加载 LuckPerms 概览失败')
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
    await apiFetch('/luckperms/admin/config', {
      method: 'PATCH',
      token: authStore.token,
      body: configForm,
    })
    await loadOverview()
    toastSuccess('LuckPerms 连接配置已更新')
  } catch (error) {
    handleError(error, '更新 LuckPerms 配置失败')
  } finally {
    savingConfig.value = false
    uiStore.stopLoading()
  }
}

async function saveGroupLabels() {
  if (!authStore.token || !groupLabelDirty.value) return
  savingGroupLabels.value = true
  uiStore.startLoading()
  try {
    await apiFetch('/luckperms/admin/group-labels', {
      method: 'PATCH',
      token: authStore.token,
      body: {
        entries: buildGroupLabelPayload(),
      },
    })
    await loadOverview()
    toastSuccess('权限组显示文本已更新')
  } catch (error) {
    handleError(error, '更新权限组显示文本失败')
  } finally {
    savingGroupLabels.value = false
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

function applyConfig(next: LuckpermsConfigForm) {
  configForm.host = next.host
  configForm.port = next.port
  configForm.database = next.database
  configForm.user = next.user
  configForm.password = next.password
  configForm.charset = next.charset
  configForm.connectTimeoutMillis = next.connectTimeoutMillis
  configForm.readonly = next.readonly
  configForm.enabled = next.enabled
  configForm.pool.min = next.pool.min
  configForm.pool.max = next.pool.max
  configForm.pool.idleMillis = next.pool.idleMillis
  configForm.pool.acquireTimeoutMillis = next.pool.acquireTimeoutMillis
}

onMounted(() => {
  void initialize()
})
</script>

<template>
  <section class="space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          LuckPerms 管理
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          管理 LuckPerms 数据库直连配置，查看连接健康状态。
        </p>
      </div>
      <UButton
        color="primary"
        variant="soft"
        :loading="reloadingHealth || loading"
        class="items-center"
        icon="i-lucide-refresh-cw"
        @click="refreshHealth"
      >
        刷新状态
      </UButton>
    </header>

    <UAlert
      v-if="health && !health.ok"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      :title="`LuckPerms 状态异常（${health.stage}）`"
      :description="health.message"
    />

    <div class="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <UCard class="bg-white/80 dark:bg-slate-900/70">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
              连接状态
            </h2>
            <UBadge
              :color="health?.ok ? 'success' : 'error'"
              variant="soft"
              class="uppercase tracking-wide"
            >
              {{ healthStatusText }}
            </UBadge>
          </div>
        </template>
        <ul class="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >地址</span
            >
            <p>{{ configForm.host }}:{{ configForm.port }}</p>
          </li>
          <li>
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >数据库</span
            >
            <p>{{ configForm.database }}</p>
          </li>
          <li>
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >用户名</span
            >
            <p>{{ configForm.user }}</p>
          </li>
          <li>
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >运行时长</span
            >
            <p>{{ uptimeText }}</p>
          </li>
          <li v-if="system">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >上次刷新</span
            >
            <p>{{ new Date(system.timestamp).toLocaleString() }}</p>
          </li>
        </ul>
      </UCard>

      <UCard class="bg-white/80 dark:bg-slate-900/70">
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
            <span class="font-medium text-slate-700 dark:text-slate-200"
              >主机</span
            >
            <UInput
              v-model="configForm.host"
              placeholder="server2.aurlemon.top"
              required
            />
          </label>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="font-medium text-slate-700 dark:text-slate-200"
              >端口</span
            >
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
            <span class="font-medium text-slate-700 dark:text-slate-200"
              >数据库名</span
            >
            <UInput
              v-model="configForm.database"
              placeholder="h2_luckperms"
              required
            />
          </label>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="font-medium text-slate-700 dark:text-slate-200"
              >用户名</span
            >
            <UInput
              v-model="configForm.user"
              placeholder="h2_luckperms"
              required
            />
          </label>
          <label
            class="md:col-span-2 flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="font-medium text-slate-700 dark:text-slate-200"
              >密码</span
            >
            <UInput v-model="configForm.password" type="password" required />
          </label>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="font-medium text-slate-700 dark:text-slate-200"
              >字符集</span
            >
            <UInput v-model="configForm.charset" placeholder="utf8mb4" />
          </label>
          <label
            class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <span class="font-medium text-slate-700 dark:text-slate-200"
              >连接超时 (ms)</span
            >
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
                <span class="font-medium text-slate-700 dark:text-slate-200"
                  >最小连接数</span
                >
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
                <span class="font-medium text-slate-700 dark:text-slate-200"
                  >最大连接数</span
                >
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
                <span class="font-medium text-slate-700 dark:text-slate-200"
                  >空闲释放 (ms)</span
                >
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
                <span class="font-medium text-slate-700 dark:text-slate-200"
                  >获取超时 (ms)</span
                >
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
            <UButton type="submit" color="primary" :loading="savingConfig"
              >保存配置</UButton
            >
          </div>
        </form>
      </UCard>
    </div>

    <UCard class="bg-white/80 dark:bg-slate-900/70">
      <template #header>
        <div
          class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
              权限组显示文本
            </h2>
            <p class="text-xs text-slate-600 dark:text-slate-300">
              为 LuckPerms 权限组配置展示别名，前端将优先显示此映射。
            </p>
          </div>
          <div class="flex flex-col items-end gap-2 md:flex-row md:items-center">
            <p class="text-xs text-slate-500 dark:text-slate-400">
              <span v-if="groupLabelMeta"
                >版本 {{ groupLabelMeta.version }} ·
                {{ new Date(groupLabelMeta.updatedAt).toLocaleString() }}</span
              >
              <span v-else>尚未保存映射</span>
            </p>
            <div class="flex items-center gap-2">
              <UButton
                size="xs"
                variant="ghost"
                :disabled="!groupLabelDirty || savingGroupLabels"
                @click="resetGroupLabels"
              >
                重置
              </UButton>
              <UButton
                size="xs"
                color="primary"
                :loading="savingGroupLabels"
                :disabled="!groupLabelDirty"
                @click="saveGroupLabels"
              >
                保存映射
              </UButton>
            </div>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div
          v-for="(entry, index) in groupLabelEntries"
          :key="entry.id"
          class="rounded-xl border border-slate-200/70 p-4 dark:border-slate-700/70"
        >
          <div
            class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"
          >
            <span>映射 #{{ index + 1 }}</span>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-trash-2"
              :disabled="groupLabelEntries.length <= 1 || savingGroupLabels"
              @click="removeGroupLabelEntry(entry.id)"
            />
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <label
              class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span class="font-medium text-slate-700 dark:text-slate-200"
                >权限组标识</span
              >
              <UInput
                v-model="entry.group"
                :disabled="savingGroupLabels"
                placeholder="hydca1"
              />
            </label>
            <label
              class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
            >
              <span class="font-medium text-slate-700 dark:text-slate-200"
                >显示文本</span
              >
              <UInput
                v-model="entry.label"
                :disabled="savingGroupLabels"
                placeholder="A1"
              />
            </label>
          </div>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3 text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400"
        >
          <span>留空显示文本时将使用原始权限组名称。</span>
          <UButton
            size="xs"
            variant="ghost"
            icon="i-lucide-plus"
            :disabled="savingGroupLabels"
            @click="addGroupLabelEntry"
          >
            添加映射
          </UButton>
        </div>
      </div>
    </UCard>
  </section>
</template>
