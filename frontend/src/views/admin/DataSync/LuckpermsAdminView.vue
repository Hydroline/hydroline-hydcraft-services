<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiFetch, ApiError } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import { useUiStore } from '@/stores/shared/ui'

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

type GroupPriorityPair = {
  group: string
  priority: number
}

type EditableGroupConfigEntry = {
  id: number
  group: string
  label: string
  priority: number | ''
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
const savingGroupConfig = ref(false)
const reloadingHealth = ref(false)
const syncingCache = ref(false)

const configDialogOpen = ref(false)
const groupConfigDialogOpen = ref(false)

const health = ref<LuckpermsHealth | null>(null)
const system = ref<{ uptimeSeconds: number; timestamp: string } | null>(null)
const configMeta = ref<{ version: number; updatedAt: string } | null>(null)
const groupLabelMeta = ref<{ version: number; updatedAt: string } | null>(null)
const groupPriorityMeta = ref<{ version: number; updatedAt: string } | null>(
  null,
)
const groupLabelBaseline = ref<GroupLabelPair[]>([])
const groupPriorityBaseline = ref<GroupPriorityPair[]>([])

const configBaseline = ref<LuckpermsConfigForm | null>(null)

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

let groupConfigSeed = 0
function createGroupConfigEntry(
  group = '',
  label = '',
  priority: number | '' = '',
): EditableGroupConfigEntry {
  groupConfigSeed += 1
  return {
    id: groupConfigSeed,
    group,
    label,
    priority,
  }
}

const groupConfigEntries = ref<EditableGroupConfigEntry[]>([
  createGroupConfigEntry(),
])
const groupConfigBaseline = ref<EditableGroupConfigEntry[]>([])
const groupConfigSignature = ref('[]')

const groupConfigDirty = computed(() => {
  return (
    serializeGroupConfigEntries(groupConfigEntries.value) !==
    groupConfigSignature.value
  )
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
    key: 'connectTimeout',
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
  rows.push({
    key: 'groupLabels',
    label: '权限组映射',
    text: `${groupLabelBaseline.value.length} 个映射`,
    description: groupLabelMeta.value
      ? `版本 ${groupLabelMeta.value.version} · ${new Date(groupLabelMeta.value.updatedAt).toLocaleString()}`
      : '尚未保存映射',
  })
  rows.push({
    key: 'groupPriorities',
    label: '权限组优先级',
    text: `${groupPriorityBaseline.value.length} 条规则`,
    description: groupPriorityMeta.value
      ? `版本 ${groupPriorityMeta.value.version} · ${new Date(groupPriorityMeta.value.updatedAt).toLocaleString()}`
      : '尚未配置优先级',
  })
  return rows
})

const canSyncCache = computed(() =>
  authStore.hasPermission('config.manage.luckperms'),
)

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

function normalizeGroupPriorityPayload(
  entries: Array<{ group: string; priority: number }>,
): GroupPriorityPair[] {
  const map = new Map<string, number>()
  for (const entry of entries) {
    const group = typeof entry.group === 'string' ? entry.group.trim() : ''
    const priority = Number(entry.priority)
    if (!group || Number.isNaN(priority)) {
      continue
    }
    map.set(group, priority)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([group, priority]) => ({ group, priority }))
}

function serializeGroupConfigEntries(entries: EditableGroupConfigEntry[]) {
  const payload = entries.map((entry) => ({
    group: entry.group,
    label: entry.label,
    priority: entry.priority,
  }))
  return JSON.stringify(payload)
}

function setGroupConfigEntriesFromServer(
  labels: GroupLabelPair[],
  priorities: GroupPriorityPair[],
) {
  const map = new Map<string, { label: string; priority: number | '' }>()
  for (const entry of labels) {
    const group = typeof entry.group === 'string' ? entry.group.trim() : ''
    if (!group) continue
    const label = typeof entry.label === 'string' ? entry.label : ''
    const existing = map.get(group) ?? { label: '', priority: '' }
    existing.label = label
    map.set(group, existing)
  }
  for (const entry of priorities) {
    const group = typeof entry.group === 'string' ? entry.group.trim() : ''
    if (!group) continue
    const priority = Number(entry.priority)
    const existing = map.get(group) ?? { label: '', priority: '' }
    existing.priority = Number.isFinite(priority) ? priority : ''
    map.set(group, existing)
  }
  const normalized = Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, payload]) =>
      createGroupConfigEntry(
        group,
        payload.label ?? '',
        payload.priority ?? '',
      ),
    )
  if (!normalized.length) {
    normalized.push(createGroupConfigEntry())
  }
  groupConfigEntries.value = normalized
  groupConfigBaseline.value = normalized.map((entry) =>
    createGroupConfigEntry(entry.group, entry.label, entry.priority),
  )
  groupConfigSignature.value = serializeGroupConfigEntries(normalized)
}

function resetGroupConfig() {
  groupConfigEntries.value =
    groupConfigBaseline.value.length > 0
      ? groupConfigBaseline.value.map((entry) =>
          createGroupConfigEntry(entry.group, entry.label, entry.priority),
        )
      : [createGroupConfigEntry()]
}

function addGroupConfigEntry() {
  groupConfigEntries.value.push(createGroupConfigEntry())
}

function removeGroupConfigEntry(id: number) {
  if (groupConfigEntries.value.length <= 1) {
    groupConfigEntries.value = [createGroupConfigEntry()]
    return
  }
  groupConfigEntries.value = groupConfigEntries.value.filter(
    (entry) => entry.id !== id,
  )
  if (!groupConfigEntries.value.length) {
    groupConfigEntries.value.push(createGroupConfigEntry())
  }
}

function buildGroupLabelPayloadFromConfig(entries: EditableGroupConfigEntry[]) {
  return normalizeGroupLabelPayload(
    entries.map((entry) => ({ group: entry.group, label: entry.label })),
  )
}

function buildGroupPriorityPayloadFromConfig(
  entries: EditableGroupConfigEntry[],
) {
  return normalizeGroupPriorityPayload(
    entries
      .filter((entry) => entry.priority !== '' && entry.priority !== null)
      .map((entry) => ({
        group: entry.group,
        priority: Number(entry.priority),
      })),
  )
}

async function loadOverview() {
  if (!authStore.token) {
    throw new Error('未登录')
  }
  const result = await apiFetch<{
    health: LuckpermsHealth
    config: LuckpermsConfigForm | null
    configMeta: { version: number; updatedAt: string } | null
    system: { uptimeSeconds: number; timestamp: string }
    groupLabels: {
      entries: GroupLabelPair[]
      meta: { version: number; updatedAt: string } | null
    } | null
    groupPriorities: {
      entries: GroupPriorityPair[]
      meta: { version: number; updatedAt: string } | null
    } | null
  }>('/luckperms/admin/overview', {
    token: authStore.token,
  })
  health.value = result.health
  system.value = result.system
  if (result.config) {
    applyConfig(result.config)
  } else {
    configBaseline.value = cloneLuckpermsConfig(configForm)
  }
  configMeta.value = result.configMeta
  const labelEntries = normalizeGroupLabelPayload(
    result.groupLabels?.entries ?? [],
  )
  const priorityEntries = normalizeGroupPriorityPayload(
    result.groupPriorities?.entries ?? [],
  )
  groupLabelBaseline.value = labelEntries
  groupPriorityBaseline.value = priorityEntries
  groupLabelMeta.value = result.groupLabels?.meta ?? null
  groupPriorityMeta.value = result.groupPriorities?.meta ?? null
  setGroupConfigEntriesFromServer(labelEntries, priorityEntries)
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
    configDialogOpen.value = false
  } catch (error) {
    handleError(error, '更新 LuckPerms 配置失败')
  } finally {
    savingConfig.value = false
    uiStore.stopLoading()
  }
}

async function saveGroupConfig() {
  if (!authStore.token || !groupConfigDirty.value) return
  savingGroupConfig.value = true
  uiStore.startLoading()
  try {
    const [labelPayload, priorityPayload] = [
      buildGroupLabelPayloadFromConfig(groupConfigEntries.value),
      buildGroupPriorityPayloadFromConfig(groupConfigEntries.value),
    ]
    await Promise.all([
      apiFetch('/luckperms/admin/group-labels', {
        method: 'PATCH',
        token: authStore.token,
        body: { entries: labelPayload },
      }),
      apiFetch('/luckperms/admin/group-priorities', {
        method: 'PATCH',
        token: authStore.token,
        body: { entries: priorityPayload },
      }),
    ])
    await loadOverview()
    toastSuccess('权限组配置已更新')
    groupConfigDialogOpen.value = false
  } catch (error) {
    handleError(error, '更新权限组配置失败')
  } finally {
    savingGroupConfig.value = false
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

async function forceSyncCache() {
  if (!authStore.token || !canSyncCache.value) return
  syncingCache.value = true
  try {
    await apiFetch('/luckperms/admin/sync-cache', {
      method: 'POST',
      token: authStore.token,
    })
    await loadOverview()
    toastSuccess('已触发 LuckPerms 缓存同步')
  } catch (error) {
    handleError(error, '触发 LuckPerms 同步失败')
  } finally {
    syncingCache.value = false
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

function cloneLuckpermsConfig(
  config: LuckpermsConfigForm,
): LuckpermsConfigForm {
  return {
    ...config,
    pool: { ...config.pool },
  }
}

function assignLuckpermsConfig(
  target: LuckpermsConfigForm,
  source: LuckpermsConfigForm,
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

function applyConfig(next: LuckpermsConfigForm) {
  assignLuckpermsConfig(configForm, next)
  configBaseline.value = cloneLuckpermsConfig(next)
}

function resetConfigForm() {
  if (configBaseline.value) {
    assignLuckpermsConfig(configForm, configBaseline.value)
  }
}

watch(configDialogOpen, () => {
  resetConfigForm()
})

watch(groupConfigDialogOpen, () => {
  resetGroupConfig()
})

onMounted(() => {
  void initialize()
})
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
        LuckPerms 状态
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
          v-if="canSyncCache"
          variant="soft"
          icon="i-lucide-rotate-cw"
          :loading="syncingCache"
          @click="forceSyncCache"
        >
          强制同步
        </UButton>
        <UButton
          variant="soft"
          icon="i-lucide-settings-2"
          @click="groupConfigDialogOpen = true"
        >
          权限组配置
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
      :title="`LuckPerms 状态异常（${health.stage}）`"
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
                <UIcon
                  name="i-lucide-loader-2"
                  class="inline-block h-4 w-4 animate-spin"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

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
                placeholder="h2_luckperms"
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
                placeholder="h2_luckperms"
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

    <UModal
      :open="groupConfigDialogOpen"
      @update:open="groupConfigDialogOpen = $event"
      :ui="{
        content:
          'w-full max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex flex-col gap-1">
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                权限组配置
              </h2>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                管理权限组的展示文本与优先级，统一控制用户前端显示与可调整范围。
              </p>
            </div>
          </template>
          <form class="space-y-4" @submit.prevent="saveGroupConfig">
            <div
              class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50/60 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/60 dark:text-slate-400"
            >
              <div class="space-y-1">
                <p>
                  显示文本：
                  <span v-if="groupLabelMeta">
                    版本 {{ groupLabelMeta.version }} ·
                    {{ new Date(groupLabelMeta.updatedAt).toLocaleString() }}
                  </span>
                  <span v-else>尚未保存</span>
                </p>
                <p>
                  优先级：
                  <span v-if="groupPriorityMeta">
                    版本 {{ groupPriorityMeta.version }} ·
                    {{ new Date(groupPriorityMeta.updatedAt).toLocaleString() }}
                  </span>
                  <span v-else>尚未保存</span>
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  size="xs"
                  variant="ghost"
                  :disabled="!groupConfigDirty || savingGroupConfig"
                  @click="resetGroupConfig"
                >
                  重置
                </UButton>
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-plus"
                  :disabled="savingGroupConfig"
                  @click="addGroupConfigEntry"
                >
                  添加权限组
                </UButton>
              </div>
            </div>

            <div class="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div
                v-for="(entry, index) in groupConfigEntries"
                :key="entry.id"
                class="rounded-xl border border-slate-200/70 p-4 dark:border-slate-700/70"
              >
                <div
                  class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"
                >
                  <span>权限组 #{{ index + 1 }}</span>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-trash-2"
                    :disabled="
                      groupConfigEntries.length <= 1 || savingGroupConfig
                    "
                    @click="removeGroupConfigEntry(entry.id)"
                  />
                </div>
                <div class="mt-3 grid gap-3 md:grid-cols-3">
                  <label
                    class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span class="font-medium text-slate-700 dark:text-slate-200"
                      >权限组标识</span
                    >
                    <UInput
                      v-model="entry.group"
                      :disabled="savingGroupConfig"
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
                      :disabled="savingGroupConfig"
                      placeholder="A1"
                    />
                  </label>
                  <label
                    class="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span class="font-medium text-slate-700 dark:text-slate-200"
                      >优先级（越小越高）</span
                    >
                    <UInput
                      v-model.number="entry.priority"
                      :disabled="savingGroupConfig"
                      type="number"
                      placeholder="10"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <UButton
                type="button"
                variant="ghost"
                @click="groupConfigDialogOpen = false"
              >
                取消
              </UButton>
              <UButton
                type="submit"
                color="primary"
                :loading="savingGroupConfig"
                :disabled="!groupConfigDirty"
              >
                保存配置
              </UButton>
            </div>
          </form>
        </UCard>
      </template>
    </UModal>
  </section>
</template>
