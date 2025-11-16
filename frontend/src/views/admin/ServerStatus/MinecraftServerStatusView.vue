<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMinecraftServerStore } from '@/stores/minecraftServers'
import { useUiStore } from '@/stores/ui'
import { apiFetch } from '@/utils/api'
import type {
  MinecraftPingResult,
  MinecraftServer,
  MinecraftServerEdition,
  MinecraftPingHistoryItem,
  MinecraftPingSettings,
  McsmInstanceDetail,
} from '@/types/minecraft'
import VChart from 'vue-echarts'
import dayjs from 'dayjs'
// ECharts modules are registered globally in main.ts; no need to register here.

const serverStore = useMinecraftServerStore()
const uiStore = useUiStore()
const toast = useToast()

const { items: servers } = storeToRefs(serverStore)

const dialogOpen = ref(false)
const editingServer = ref<MinecraftServer | null>(null)
const saving = ref(false)
const deleting = ref(false)
const pingLoading = ref(false)
const lastPing = ref<MinecraftPingResult | null>(null)
const motdHtml = ref<string | null>(null)
const detailOpen = ref(false)
// 每个服务器卡片内的单独加载态
const pingLoadingById = reactive<Record<string, boolean>>({})
const mcsmDetail = ref<McsmInstanceDetail | null>(null)
const mcsmOutput = ref('')
const mcsmStatusLoading = ref(false)
const mcsmOutputLoading = ref(false)
const mcsmCommand = ref('')
const mcsmCommandLoading = ref(false)
const mcsmControlsLoading = reactive({
  start: false,
  stop: false,
  restart: false,
  kill: false,
})

// 删除确认对话框
const deleteConfirmDialogOpen = ref(false)
const deleteConfirmServer = ref<MinecraftServer | null>(null)
const deleteConfirmSubmitting = ref(false)

// 自动 Ping 设置 & 历史数据
const settings = ref<MinecraftPingSettings | null>(null)
const settingsLoading = ref(false)
const history = ref<MinecraftPingHistoryItem[]>([])
const historyLoading = ref(false)
const historyDays = ref(1)

// 页面总览图表（与详情弹窗分离）
const chartServerId = ref<string | undefined>(undefined)
const chartDays = ref(1)
const chartHistory = ref<MinecraftPingHistoryItem[]>([])
const chartLoading = ref(false)
function formatChartLabel(dateInput: string | number | Date) {
  const d = dayjs(dateInput)
  return d.isSame(dayjs(), 'day') ? d.format('HH:mm') : d.format('MM-DD HH:mm')
}
const chartOption = computed(() => {
  const points = chartHistory.value.slice().reverse()
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: points.map((p) => formatChartLabel(p.createdAt)),
    },
    yAxis: { type: 'value', min: 0, splitLine: { show: false } },
    // 默认仅展示“在线人数”，隐藏“延迟(ms)”图层，可通过图例手动开启
    legend: {
      top: 0,
      selected: { 在线人数: true, '延迟(ms)': false },
      selectedMode: 'single',
    },
    series: [
      {
        type: 'line',
        name: '在线人数',
        smooth: true,
        showSymbol: false,
        data: points.map((p) => p.onlinePlayers ?? 0),
      },
      {
        type: 'line',
        name: '延迟(ms)',
        smooth: true,
        showSymbol: false,
        data: points.map((p) => p.latency ?? 0),
      },
    ],
  }
})

// 临时 Ping 工具
const adhocDialog = ref(false)
const adhocForm = reactive({
  host: '',
  port: undefined as number | undefined,
  edition: 'JAVA' as MinecraftServerEdition,
})
const adhocResult = ref<MinecraftPingResult | null>(null)
const adhocLoading = ref(false)

const form = reactive({
  displayName: '',
  internalCodeCn: '',
  internalCodeEn: '',
  host: '',
  port: 25565,
  edition: 'JAVA' as MinecraftServerEdition,
  description: '',
  isActive: true,
  displayOrder: 0,
  mcsmPanelUrl: '',
  mcsmDaemonId: '',
  mcsmInstanceUuid: '',
  mcsmApiKey: '',
  mcsmRequestTimeoutMs: undefined as number | undefined,
})

const tableRows = computed(() =>
  servers.value.map((item) => ({
    ...item,
    code: `${item.internalCodeCn} / ${item.internalCodeEn}`,
    hostLabel: `${item.host}:${item.port ?? (item.edition === 'BEDROCK' ? 19132 : 25565)}`,
  })),
)

// 供选择器使用的兼容 items（避免类型不匹配：description 可能为 null）
const serverSelectItems = computed(() =>
  servers.value.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    internalCodeCn: s.internalCodeCn,
    internalCodeEn: s.internalCodeEn,
    host: s.host,
    edition: s.edition,
    // 统一保证为 undefined 而非 null，减少与 SelectMenuItem 类型冲突
    description: s.description || undefined,
  })),
)

const dialogTitle = computed(() =>
  editingServer.value
    ? `编辑：${editingServer.value.displayName}`
    : '新建服务器',
)

const mcsmConfigReady = computed(() => {
  const s = editingServer.value
  if (!s) return false
  return Boolean(
    s.mcsmPanelUrl &&
      s.mcsmDaemonId &&
      s.mcsmInstanceUuid &&
      (s.mcsmConfigured || form.mcsmApiKey),
  )
})

const editionOptions = [
  { label: 'Java 版', value: 'JAVA' },
  { label: '基岩版', value: 'BEDROCK' },
]

onMounted(async () => {
  uiStore.startLoading()
  try {
    await serverStore.fetchAll()
    await loadSettings()
    // 默认选中第一个服务器用于图表
    chartServerId.value = servers.value[0]?.id ?? undefined
    await autoPingAll()
    await loadChartHistory()
  } finally {
    uiStore.stopLoading()
  }
})

async function loadSettings() {
  settingsLoading.value = true
  try {
    settings.value = await serverStore.getPingSettings()
  } finally {
    settingsLoading.value = false
  }
}

async function saveSettings() {
  if (!settings.value) return
  settingsLoading.value = true
  try {
    const updated = await serverStore.updatePingSettings({
      intervalMinutes: settings.value.intervalMinutes,
      retentionDays: settings.value.retentionDays,
    })
    settings.value = updated
    toast.add({ title: '设置已更新', color: 'success' })
  } catch (e) {
    toast.add({
      title: '保存失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    settingsLoading.value = false
  }
}

async function loadHistory(serverId: string | null) {
  if (!serverId) return
  historyLoading.value = true
  try {
    history.value = await serverStore.listPingHistory(
      serverId,
      historyDays.value,
    )
  } catch {
    history.value = []
  } finally {
    historyLoading.value = false
  }
}

async function loadChartHistory() {
  if (!chartServerId.value) {
    chartHistory.value = []
    return
  }
  chartLoading.value = true
  try {
    chartHistory.value = await serverStore.listPingHistory(
      chartServerId.value,
      chartDays.value,
    )
  } catch {
    chartHistory.value = []
  } finally {
    chartLoading.value = false
  }
}

watch([chartServerId, chartDays], () => {
  void loadChartHistory()
})

watch(historyDays, () => {
  void loadHistory(editingServer.value?.id ?? null)
})

function openCreateDialog() {
  editingServer.value = null
  resetForm()
  dialogOpen.value = true
}

function openEditDialog(server: MinecraftServer) {
  editingServer.value = server
  populateForm(server)
  dialogOpen.value = true
}

function populateForm(server: MinecraftServer) {
  form.displayName = server.displayName
  form.internalCodeCn = server.internalCodeCn
  form.internalCodeEn = server.internalCodeEn
  form.host = server.host
  form.port = server.port ?? (server.edition === 'BEDROCK' ? 19132 : 25565)
  form.edition = server.edition
  form.description = server.description ?? ''
  form.isActive = server.isActive
  form.displayOrder = server.displayOrder ?? 0
  form.mcsmPanelUrl = server.mcsmPanelUrl ?? ''
  form.mcsmDaemonId = server.mcsmDaemonId ?? ''
  form.mcsmInstanceUuid = server.mcsmInstanceUuid ?? ''
  form.mcsmApiKey = ''
  form.mcsmRequestTimeoutMs = server.mcsmRequestTimeoutMs ?? undefined
}

function resetForm() {
  form.displayName = ''
  form.internalCodeCn = ''
  form.internalCodeEn = ''
  form.host = ''
  form.port = 25565
  form.edition = 'JAVA'
  form.description = ''
  form.isActive = true
  form.displayOrder = 0
  form.mcsmPanelUrl = ''
  form.mcsmDaemonId = ''
  form.mcsmInstanceUuid = ''
  form.mcsmApiKey = ''
  form.mcsmRequestTimeoutMs = undefined
}

function buildPayload() {
  const portNumber = Number(form.port)
  const payloadPort =
    Number.isFinite(portNumber) && portNumber > 0 ? portNumber : undefined
  return {
    displayName: form.displayName.trim(),
    internalCodeCn: form.internalCodeCn.trim(),
    internalCodeEn: form.internalCodeEn.trim(),
    host: form.host.trim(),
    port: payloadPort,
    edition: form.edition,
    description: form.description.trim() || undefined,
    isActive: form.isActive,
    displayOrder: form.displayOrder,
    mcsmPanelUrl: form.mcsmPanelUrl.trim() || undefined,
    mcsmDaemonId: form.mcsmDaemonId.trim() || undefined,
    mcsmInstanceUuid: form.mcsmInstanceUuid.trim() || undefined,
    mcsmApiKey: form.mcsmApiKey.trim() || undefined,
    mcsmRequestTimeoutMs: form.mcsmRequestTimeoutMs,
  }
}

async function saveServer() {
  // 基础必填项校验
  if (!form.displayName || !form.host) {
    toast.add({
      title: '请完善表单',
      description: '显示名称与 Host 不能为空',
      color: 'warning',
    })
    return
  }

  // 与后端 DTO 保持一致的前端校验，避免提交后才失败
  const cn = form.internalCodeCn.trim()
  const en = form.internalCodeEn.trim()
  if (cn.length < 1 || en.length < 2) {
    toast.add({
      title: '表单校验未通过',
      description: '中文内部代号需 ≥1 字符；英文内部代号需 ≥2 字符',
      color: 'warning',
    })
    return
  }
  if (form.port !== undefined && form.port !== null) {
    const p = Number(form.port)
    // 若用户不填或填 0，视为自动解析（默认端口或 SRV），不报错
    if (Number.isFinite(p) && (p < 1 || p > 65535)) {
      toast.add({
        title: '端口不合法',
        description: '端口范围应为 1-65535；留空则自动（默认或 SRV）',
        color: 'warning',
      })
      return
    }
  }
  saving.value = true
  try {
    if (editingServer.value) {
      const updated = await serverStore.update(
        editingServer.value.id,
        buildPayload(),
      )
      toast.add({ title: '服务器已更新', color: 'success' })
      editingServer.value = updated
    } else {
      const created = await serverStore.create(buildPayload())
      toast.add({ title: '服务器已创建', color: 'success' })
      editingServer.value = created
    }
    dialogOpen.value = false
    await triggerPing(editingServer.value?.id ?? null)
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function removeServer(server: MinecraftServer) {
  deleting.value = true
  try {
    await serverStore.remove(server.id)
    toast.add({ title: '服务器已删除', color: 'warning' })
    if (editingServer.value?.id === server.id) {
      editingServer.value = null
      lastPing.value = null
      motdHtml.value = null
    }
  } catch (error) {
    toast.add({
      title: '删除失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    deleting.value = false
  }
}

async function parseMotd(motd: unknown, bedrock: boolean) {
  const result = await apiFetch<{ html: string }>('/minecraft/motd/parse', {
    method: 'POST',
    body: { motd, bedrock },
  })
  return result.html
}

async function triggerPing(serverId: string | null) {
  if (!serverId) return
  const server =
    servers.value.find((item) => item.id === serverId) ?? editingServer.value
  if (server) {
    editingServer.value = server
  }
  pingLoading.value = true
  try {
    const result = await serverStore.ping(serverId)
    lastPing.value = result
    const motdPayload =
      result.edition === 'JAVA'
        ? result.response.description
        : result.response.motd
    motdHtml.value = await parseMotd(motdPayload, result.edition === 'BEDROCK')
    toast.add({ title: 'Ping 成功', color: 'success' })
  } catch (error) {
    lastPing.value = null
    motdHtml.value = null
    toast.add({
      title: 'Ping 失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    pingLoading.value = false
  }
}

async function pingOnCard(server: MinecraftServer) {
  pingLoadingById[server.id] = true
  try {
    await serverStore.ping(server.id)
  } catch {}
  pingLoadingById[server.id] = false
}

async function autoPingAll() {
  const list = servers.value.slice()
  // 控制并发：顺序执行，避免一次性大量 socket 连接
  for (const srv of list) {
    pingLoadingById[srv.id] = true
    try {
      await serverStore.ping(srv.id)
    } catch {}
    pingLoadingById[srv.id] = false
  }
}

function getPingResult(id: string) {
  return serverStore.pingResults.get(id) as MinecraftPingResult | undefined
}

function editionLabel(edition: MinecraftServerEdition) {
  return edition === 'BEDROCK' ? '基岩版' : 'Java 版'
}

function mcsmStatusLabel(status?: number | null) {
  if (status === -1) return '忙碌'
  if (status === 0) return '停止'
  if (status === 1) return '停止中'
  if (status === 2) return '启动中'
  if (status === 3) return '运行中'
  return '未知'
}

function mcsmStatusColor(status?: number | null) {
  if (status === 3) return 'success'
  if (status === 2) return 'primary'
  if (status === 1) return 'warning'
  if (status === 0) return 'neutral'
  return 'info'
}

async function handlePing(server: MinecraftServer) {
  await triggerPing(server.id)
}

function confirmDelete(server: MinecraftServer) {
  deleteConfirmServer.value = server
  deleteConfirmDialogOpen.value = true
}

async function handleConfirmDelete() {
  if (!deleteConfirmServer.value) return
  deleteConfirmSubmitting.value = true
  try {
    await removeServer(deleteConfirmServer.value)
  } finally {
    deleteConfirmSubmitting.value = false
    deleteConfirmDialogOpen.value = false
    deleteConfirmServer.value = null
  }
}

function openDetail(server: MinecraftServer) {
  editingServer.value = server
  detailOpen.value = true
  mcsmDetail.value = null
  mcsmOutput.value = ''
  mcsmCommand.value = ''
  // 即时刷新一次
  void triggerPing(server.id)
  void loadHistory(server.id)
  if (
    server.mcsmPanelUrl &&
    server.mcsmDaemonId &&
    server.mcsmInstanceUuid &&
    (server.mcsmConfigured || form.mcsmApiKey)
  ) {
    void loadMcsmStatus(server.id)
    void loadMcsmOutput(server.id, 1024)
  }
}

function openAdhoc() {
  adhocDialog.value = true
  adhocResult.value = null
}

async function submitAdhoc() {
  if (!adhocForm.host.trim()) {
    toast.add({ title: '请输入主机名', color: 'warning' })
    return
  }
  adhocLoading.value = true
  try {
    const result = await serverStore.adhocPing({
      host: adhocForm.host.trim(),
      port: adhocForm.port || undefined,
      edition: adhocForm.edition,
    })
    adhocResult.value = result
    toast.add({ title: '临时 Ping 成功', color: 'success' })
  } catch (e) {
    adhocResult.value = null
    toast.add({
      title: '临时 Ping 失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    adhocLoading.value = false
  }
}

async function loadMcsmStatus(serverId: string) {
  mcsmStatusLoading.value = true
  try {
    const { detail } = await serverStore.fetchMcsmStatus(serverId)
    mcsmDetail.value = detail
  } catch (e) {
    mcsmDetail.value = null
    toast.add({
      title: '获取 MCSM 状态失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    mcsmStatusLoading.value = false
  }
}

async function loadMcsmOutput(serverId: string, size?: number) {
  mcsmOutputLoading.value = true
  try {
    const { output } = await serverStore.fetchMcsmOutput(serverId, size)
    mcsmOutput.value = output
  } catch (e) {
    mcsmOutput.value = ''
    toast.add({
      title: '获取输出失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    mcsmOutputLoading.value = false
  }
}

async function runMcsmCommand(serverId: string) {
  if (!mcsmCommand.value.trim()) {
    toast.add({ title: '请输入命令', color: 'warning' })
    return
  }
  mcsmCommandLoading.value = true
  try {
    await serverStore.sendMcsmCommand(serverId, mcsmCommand.value.trim())
    toast.add({ title: '命令已发送', color: 'success' })
    mcsmCommand.value = ''
    await loadMcsmOutput(serverId)
  } catch (e) {
    toast.add({
      title: '发送命令失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    mcsmCommandLoading.value = false
  }
}

async function controlMcsm(
  serverId: string,
  action: 'start' | 'stop' | 'restart' | 'kill',
) {
  mcsmControlsLoading[action] = true
  try {
    if (action === 'start') {
      await serverStore.startMcsm(serverId)
    } else if (action === 'stop') {
      await serverStore.stopMcsm(serverId)
    } else if (action === 'restart') {
      await serverStore.restartMcsm(serverId)
    } else {
      await serverStore.killMcsm(serverId)
    }
    toast.add({
      title: `实例${action === 'restart' ? '已重启' : '已执行'}`,
      color: 'success',
    })
    await loadMcsmStatus(serverId)
  } catch (e) {
    toast.add({
      title: '操作失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    mcsmControlsLoading[action] = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
            服务端状态
          </h1>
        </div>
        <UButton color="primary" icon="i-lucide-plus" @click="openCreateDialog"
          >新建服务器</UButton
        >
        <UButton variant="ghost" icon="i-lucide-zap" @click="openAdhoc"
          >临时 Ping</UButton
        >
      </div>
    </header>

    <!-- 自动 Ping 设置面板 -->
    <div
      v-if="settings"
      class="rounded-2xl border border-slate-200/60 bg-white/70 p-4 text-xs dark:border-slate-700 dark:bg-slate-900/60"
    >
      <div class="mb-3 flex items-center justify-between">
        <span class="font-medium text-slate-700 dark:text-slate-200"
          >自动 Ping 设置</span
        >
        <UButton
          size="xs"
          variant="ghost"
          :loading="settingsLoading"
          icon="i-lucide-save"
          @click="saveSettings"
          >保存</UButton
        >
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <div class="flex flex-col gap-1">
          <label class="text-slate-500 dark:text-slate-400">周期 (分钟)</label>
          <UInput
            v-model.number="settings.intervalMinutes"
            type="number"
            min="1"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-slate-500 dark:text-slate-400">保留天数</label>
          <UInput
            v-model.number="settings.retentionDays"
            type="number"
            min="1"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-slate-500 dark:text-slate-400"
            >查看历史 (天)</label
          >
          <UInput v-model.number="historyDays" type="number" min="1" max="30" />
        </div>
      </div>
    </div>

    <!-- 总览图表面板 -->
    <div
      class="rounded-2xl border border-slate-200/60 bg-white/70 p-4 text-xs dark:border-slate-700 dark:bg-slate-900/60"
    >
      <div class="mb-3 flex items-center justify-between">
        <span class="font-medium text-slate-700 dark:text-slate-200"
          >服务器历史图表</span
        >
        <div class="flex items-center gap-2">
          <USelect
            v-model="chartServerId"
            :items="serverSelectItems"
            value-key="id"
            label-key="displayName"
            :filter-fields="[
              'displayName',
              'internalCodeCn',
              'internalCodeEn',
              'host',
            ]"
            class="w-48"
            placeholder="选择服务器"
          />
          <UButton
            size="xs"
            variant="ghost"
            icon="i-lucide-refresh-ccw"
            :loading="chartLoading"
            @click="loadChartHistory()"
            >刷新</UButton
          >
        </div>
      </div>
      <div class="h-64">
        <VChart v-if="chartHistory.length" :option="chartOption" autoresize />
        <div
          v-else
          class="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400"
        >
          {{ chartLoading ? '加载中...' : '暂无历史数据' }}
        </div>
      </div>
    </div>

    <div
      class="rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <!-- 顶部服务器信息卡片（始终显示），3 列布局；卡片内可直接 Ping 并显示结果 -->
      <div
        class="grid gap-3 border-b border-slate-100 p-3 dark:border-slate-800 md:grid-cols-3"
      >
        <div
          v-for="srv in servers"
          :key="srv.id"
          class="rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/40"
        >
          <div class="flex items-center justify-between">
            <div class="font-medium text-slate-900 dark:text-white">
              {{ srv.displayName }}
            </div>
            <UBadge variant="soft" color="neutral">{{
              editionLabel(srv.edition)
            }}</UBadge>
          </div>
          <div class="mt-2 grid grid-cols-3 gap-2">
            <div>
              <p class="text-slate-500 dark:text-slate-400">玩家</p>
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ getPingResult(srv.id)?.response.players?.online ?? 0 }} /
                {{ getPingResult(srv.id)?.response.players?.max ?? 0 }}
              </p>
            </div>
            <div>
              <p class="text-slate-500 dark:text-slate-400">延迟</p>
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ getPingResult(srv.id)?.response.latency ?? '—' }} ms
              </p>
            </div>
            <div class="flex items-center justify-end gap-2">
              <UButton size="xs" variant="ghost" @click="openDetail(srv)"
                >详情</UButton
              >
              <UButton
                size="xs"
                variant="ghost"
                :loading="pingLoadingById[srv.id]"
                @click="pingOnCard(srv)"
                >Ping</UButton
              >
            </div>
          </div>
        </div>
        <div
          v-if="servers.length === 0"
          class="text-xs text-slate-500 dark:text-slate-400"
        >
          暂无服务器配置
        </div>
      </div>
      <table
        class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
      >
        <thead class="bg-slate-50/60 dark:bg-slate-900/60">
          <tr
            class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            <th class="px-4 py-3">名称</th>
            <th class="px-4 py-3">内部代号</th>
            <th class="px-4 py-3">服务器地址</th>
            <th class="px-4 py-3">版本</th>
            <th class="px-4 py-3">状态</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="row in tableRows"
            :key="row.id"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3">
              <div class="flex flex-col">
                <span class="font-medium text-slate-900 dark:text-white">{{
                  row.displayName
                }}</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">{{
                  row.description || '无备注'
                }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ row.code }}
            </td>
            <td class="px-4 py-3">
              <div
                class="flex flex-col text-xs text-slate-500 dark:text-slate-400"
              >
                <span class="font-medium text-slate-900 dark:text-white">{{
                  row.hostLabel
                }}</span>
                <span>{{ row.host }}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <UBadge variant="soft" color="neutral">{{
                editionLabel(row.edition)
              }}</UBadge>
            </td>
            <td class="px-4 py-3">
              <UBadge
                :color="row.isActive ? 'success' : 'neutral'"
                variant="soft"
              >
                {{ row.isActive ? '启用' : '停用' }}
              </UBadge>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <UButton size="xs" variant="ghost" @click="openDetail(row)"
                  >查看</UButton
                >
                <UButton
                  size="xs"
                  variant="ghost"
                  @click="handlePing(row)"
                  :loading="pingLoading && editingServer?.id === row.id"
                >
                  Ping
                </UButton>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="primary"
                  @click="openEditDialog(row)"
                  >编辑</UButton
                >
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  :loading="deleting"
                  @click="confirmDelete(row)"
                >
                  删除
                </UButton>
              </div>
            </td>
          </tr>
          <tr v-if="tableRows.length === 0">
            <td
              colspan="6"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无服务器配置，点击右上角“新建服务器”开始。
            </td>
          </tr>
        </tbody>
      </table>
      <div
        class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
      >
        <span>共 {{ servers.length }} 个服务端</span>
        <UButton
          variant="ghost"
          size="xs"
          icon="i-lucide-refresh-ccw"
          @click="serverStore.fetchAll()"
          >刷新列表</UButton
        >
      </div>
    </div>

    <!-- 查看详情弹窗：展示当前选中服务器的 Ping 结果与 MOTD 与历史图表 -->
    <UModal :open="detailOpen" @update:open="detailOpen = $event">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="text-sm text-slate-600 dark:text-slate-300">
                {{ editingServer?.displayName ?? '未选择服务器' }} ·
                {{ editingServer ? editionLabel(editingServer.edition) : '' }}
              </div>
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-refresh-ccw"
                :loading="pingLoading"
                @click="triggerPing(editingServer?.id ?? null)"
              >
                重新 Ping
              </UButton>
            </div>
          </template>
          <div v-if="lastPing" class="grid gap-4 md:grid-cols-3">
            <div>
              <p class="text-xs text-slate-500 dark:text-slate-400">版本</p>
              <p class="text-base font-semibold text-slate-900 dark:text-white">
                {{
                  lastPing.edition === 'BEDROCK'
                    ? lastPing.response.version
                    : (lastPing.response.version?.name ?? '未知')
                }}
              </p>
            </div>
            <div>
              <p class="text-xs text-slate-500 dark:text-slate-400">玩家</p>
              <p class="text-base font-semibold text-slate-900 dark:text-white">
                {{ lastPing.response.players?.online ?? 0 }} /
                {{ lastPing.response.players?.max ?? 0 }}
              </p>
            </div>
            <div>
              <p class="text-xs text-slate-500 dark:text-slate-400">延迟</p>
              <p class="text-base font-semibold text-slate-900 dark:text-white">
                {{ lastPing.response.latency ?? '—' }} ms
              </p>
            </div>
          </div>
          <div
            class="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/60"
          >
            <p class="text-xs text-slate-500 dark:text-slate-400">MOTD</p>
            <div
              v-if="motdHtml"
              class="prose prose-sm mt-2 dark:prose-invert"
              v-html="motdHtml"
            ></div>
            <p v-else class="mt-2 text-sm text-slate-500 dark:text-slate-400">
              暂无 MOTD 数据
            </p>
          </div>

          <div
            class="mt-4 rounded-2xl border border-slate-200/70 bg-white/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/50"
          >
            <div class="mb-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span
                  class="text-sm font-medium text-slate-700 dark:text-slate-200"
                  >MCSM 实例</span
                >
                <UBadge
                  size="xs"
                  variant="soft"
                  :color="mcsmStatusColor(mcsmDetail?.status)"
                  >{{ mcsmStatusLabel(mcsmDetail?.status) }}</UBadge
                >
              </div>
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-refresh-cw"
                :loading="mcsmStatusLoading"
                :disabled="!mcsmConfigReady"
                @click="
                  editingServer?.id ? loadMcsmStatus(editingServer.id) : null
                "
              >
                刷新状态
              </UButton>
            </div>
            <div v-if="!mcsmConfigReady" class="text-sm text-slate-500">
              未配置 MCSM 参数（或未保存 API Key），请在编辑表单中补充。
            </div>
            <div v-else class="grid gap-3 md:grid-cols-4">
              <div class="md:col-span-4">
                <div class="mt-2 flex flex-wrap gap-2">
                  <UButton
                    size="xs"
                    :loading="mcsmControlsLoading.start"
                    :disabled="mcsmStatusLoading"
                    icon="i-lucide-play"
                    @click="
                      editingServer?.id
                        ? controlMcsm(editingServer.id, 'start')
                        : null
                    "
                    >启动</UButton
                  >
                  <UButton
                    size="xs"
                    :loading="mcsmControlsLoading.stop"
                    :disabled="mcsmStatusLoading"
                    color="warning"
                    icon="i-lucide-square"
                    @click="
                      editingServer?.id
                        ? controlMcsm(editingServer.id, 'stop')
                        : null
                    "
                    >停止</UButton
                  >
                  <UButton
                    size="xs"
                    :loading="mcsmControlsLoading.restart"
                    :disabled="mcsmStatusLoading"
                    color="primary"
                    icon="i-lucide-rotate-ccw"
                    @click="
                      editingServer?.id
                        ? controlMcsm(editingServer.id, 'restart')
                        : null
                    "
                    >重启</UButton
                  >
                  <UButton
                    size="xs"
                    :loading="mcsmControlsLoading.kill"
                    :disabled="mcsmStatusLoading"
                    color="error"
                    icon="i-lucide-zap"
                    @click="
                      editingServer?.id
                        ? controlMcsm(editingServer.id, 'kill')
                        : null
                    "
                    >强制终止</UButton
                  >
                </div>
              </div>

              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">CPU</p>
                <p
                  class="text-base font-semibold text-slate-900 dark:text-white"
                >
                  {{ mcsmDetail?.processInfo?.cpu ?? '—' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">内存</p>
                <p
                  class="text-base font-semibold text-slate-900 dark:text-white"
                >
                  {{ mcsmDetail?.processInfo?.memory ?? '—' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  在线人数
                </p>
                <p
                  class="text-base font-semibold text-slate-900 dark:text-white"
                >
                  {{ mcsmDetail?.info?.currentPlayers ?? '—' }} /
                  {{ mcsmDetail?.info?.maxPlayers ?? '—' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">版本</p>
                <p
                  class="text-base font-semibold text-slate-900 dark:text-white"
                >
                  {{ mcsmDetail?.info?.version ?? '—' }}
                </p>
              </div>
            </div>
            <div v-if="mcsmConfigReady" class="mt-4 space-y-3">
              <div class="flex items-center gap-2">
                <UInput
                  v-model="mcsmCommand"
                  class="flex-1"
                  placeholder="输入要发送到实例的命令"
                  :disabled="mcsmCommandLoading"
                />
                <UButton
                  color="primary"
                  :loading="mcsmCommandLoading"
                  :disabled="!editingServer?.id"
                  @click="
                    editingServer?.id ? runMcsmCommand(editingServer.id) : null
                  "
                  >发送命令</UButton
                >
              </div>
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs text-slate-500 dark:text-slate-400"
                    >输出日志</span
                  >
                  <UButton
                    size="xs"
                    variant="ghost"
                    :loading="mcsmOutputLoading"
                    :disabled="!editingServer?.id"
                    @click="
                      editingServer?.id
                        ? loadMcsmOutput(editingServer.id, 1024)
                        : null
                    "
                    >刷新输出</UButton
                  >
                </div>
                <pre
                  class="max-h-64 overflow-auto rounded-xl bg-slate-900/80 p-3 text-xs text-slate-100"
                  >{{ mcsmOutput || '暂无输出' }}</pre
                >
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <UModal :open="dialogOpen" @update:open="dialogOpen = $event">
      <template #content>
        <div class="max-h-[80vh] overflow-y-auto">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3
                  class="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  {{ dialogTitle }}
                </h3>
                <UTooltip text="保存后可立即 Ping">
                  <UIcon
                    name="i-lucide-info"
                    class="h-4 w-4 text-slate-400 dark:text-slate-500"
                  />
                </UTooltip>
              </div>
            </template>

            <!-- 统一的两列布局，左侧 Label 右侧控件；保证所有标签对齐 -->
            <div class="grid gap-4 md:grid-cols-2">
              <!-- 显示名称 -->
              <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                <label
                  for="displayName"
                  class="text-sm text-slate-600 dark:text-slate-300"
                  >显示名称<span class="text-red-500">*</span></label
                >
                <UInput
                  id="displayName"
                  v-model="form.displayName"
                  placeholder="示例：七周目"
                />
              </div>
              <!-- 中文内部代号 -->
              <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                <label
                  for="internalCodeCn"
                  class="text-sm text-slate-600 dark:text-slate-300"
                  >中文内部代号<span class="text-red-500">*</span></label
                >
                <UInput
                  id="internalCodeCn"
                  v-model="form.internalCodeCn"
                  placeholder="示例：氮"
                />
              </div>
              <!-- 英文内部代号 -->
              <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                <label
                  for="internalCodeEn"
                  class="text-sm text-slate-600 dark:text-slate-300"
                  >英文内部代号<span class="text-red-500">*</span></label
                >
                <UInput
                  id="internalCodeEn"
                  v-model="form.internalCodeEn"
                  placeholder="示例：Nitrogen"
                />
              </div>
              <!-- 版本 -->
              <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                <label
                  for="edition"
                  class="text-sm text-slate-600 dark:text-slate-300"
                  >版本</label
                >
                <USelect
                  id="edition"
                  v-model="form.edition"
                  :items="editionOptions"
                  value-key="value"
                  label-key="label"
                />
              </div>
              <!-- Host -->
              <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                <label
                  for="host"
                  class="text-sm text-slate-600 dark:text-slate-300"
                  >服务器 Host<span class="text-red-500">*</span></label
                >
                <UInput
                  id="host"
                  v-model="form.host"
                  placeholder="mc.hydroline.example"
                />
              </div>
              <!-- Port -->
              <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                <label
                  for="port"
                  class="text-sm text-slate-600 dark:text-slate-300"
                  >端口</label
                >
                <UInput
                  id="port"
                  v-model.number="form.port"
                  type="number"
                  min="1"
                  max="65535"
                  placeholder="留空=自动（默认或 SRV）"
                />
              </div>
              <!-- 描述 -->
              <div
                class="grid grid-cols-[7rem,1fr] items-start gap-2 md:col-span-2"
              >
                <label
                  for="description"
                  class="mt-2 text-sm text-slate-600 dark:text-slate-300"
                  >描述</label
                >
                <UTextarea
                  id="description"
                  v-model="form.description"
                  placeholder="用于后台备注信息"
                />
              </div>
              <!-- 显示顺序 -->
              <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                <label
                  for="displayOrder"
                  class="text-sm text-slate-600 dark:text-slate-300"
                  >显示顺序</label
                >
                <UInput
                  id="displayOrder"
                  v-model.number="form.displayOrder"
                  type="number"
                />
              </div>
              <!-- 状态 -->
              <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                <label
                  for="isActive"
                  class="text-sm text-slate-600 dark:text-slate-300"
                  >状态</label
                >
                <div
                  class="flex h-10 items-center rounded-xl border border-slate-200 px-3 dark:border-slate-700"
                >
                  <UCheckbox
                    id="isActive"
                    v-model="form.isActive"
                    label="启用"
                  />
                </div>
              </div>

              <div class="md:col-span-2">
                <div class="mb-2 flex items-center gap-2">
                  <span
                    class="text-sm font-medium text-slate-700 dark:text-slate-200"
                    >MCSM 配置</span
                  >
                  <UTooltip text="仅 API Key 不会回显，留空则不更新">
                    <UIcon
                      name="i-lucide-info"
                      class="h-4 w-4 text-slate-400 dark:text-slate-500"
                    />
                  </UTooltip>
                </div>
                <div class="grid gap-3 md:grid-cols-2">
                  <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                    <label
                      for="mcsmPanelUrl"
                      class="text-sm text-slate-600 dark:text-slate-300"
                      >面板地址</label
                    >
                    <UInput
                      id="mcsmPanelUrl"
                      v-model="form.mcsmPanelUrl"
                      placeholder="http://panel.hydcraft.cn/"
                    />
                  </div>
                  <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                    <label
                      for="mcsmDaemonId"
                      class="text-sm text-slate-600 dark:text-slate-300"
                      >Daemon ID</label
                    >
                    <UInput
                      id="mcsmDaemonId"
                      v-model="form.mcsmDaemonId"
                      placeholder="daemons-xxxx"
                    />
                  </div>
                  <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                    <label
                      for="mcsmInstanceUuid"
                      class="text-sm text-slate-600 dark:text-slate-300"
                      >Instance UUID</label
                    >
                    <UInput
                      id="mcsmInstanceUuid"
                      v-model="form.mcsmInstanceUuid"
                      placeholder="50c7..."
                    />
                  </div>
                  <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                    <label
                      for="mcsmApiKey"
                      class="text-sm text-slate-600 dark:text-slate-300"
                      >API Key</label
                    >
                    <UInput
                      id="mcsmApiKey"
                      v-model="form.mcsmApiKey"
                      type="password"
                      placeholder="输入以更新，留空保持不变"
                    />
                  </div>
                  <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                    <label
                      for="mcsmRequestTimeoutMs"
                      class="text-sm text-slate-600 dark:text-slate-300"
                      >超时 (ms)</label
                    >
                    <UInput
                      id="mcsmRequestTimeoutMs"
                      v-model.number="form.mcsmRequestTimeoutMs"
                      type="number"
                      min="1000"
                      placeholder="默认 10000"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- 历史图表 -->
            <div class="mt-4">
              <p class="mb-2 text-xs text-slate-500 dark:text-slate-400">
                最近 {{ historyDays }} 天走势
              </p>
              <div class="h-60">
                <VChart
                  v-if="history.length"
                  :option="{
                    tooltip: { trigger: 'axis' },
                    grid: { left: 40, right: 20, top: 30, bottom: 30 },
                    xAxis: {
                      type: 'category',
                      data: history
                        .slice()
                        .reverse()
                        .map((p) => formatChartLabel(p.createdAt)),
                    },
                    yAxis: {
                      type: 'value',
                      min: 0,
                      splitLine: { show: false },
                    },
                    // 默认隐藏延迟图层
                    legend: {
                      top: 0,
                      selected: { 在线人数: true, '延迟(ms)': false },
                      selectedMode: 'single',
                    },
                    series: [
                      {
                        type: 'line',
                        name: '在线人数',
                        smooth: true,
                        showSymbol: false,
                        data: history
                          .slice()
                          .reverse()
                          .map((p) => p.onlinePlayers ?? 0),
                      },
                      {
                        type: 'line',
                        name: '延迟(ms)',
                        smooth: true,
                        showSymbol: false,
                        data: history
                          .slice()
                          .reverse()
                          .map((p) => p.latency ?? 0),
                      },
                    ],
                  }"
                  autoresize
                />
                <div
                  v-else
                  class="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ historyLoading ? '加载中...' : '暂无历史数据' }}
                </div>
              </div>
            </div>
            <div
              class="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800"
            >
              <div class="text-xs text-slate-500 dark:text-slate-400">
                保存后会自动刷新服务端状态。
              </div>
              <div class="flex justify-end gap-2">
                <UButton variant="ghost" @click="dialogOpen = false"
                  >取消</UButton
                >
                <UButton color="primary" :loading="saving" @click="saveServer">
                  {{ editingServer ? '保存修改' : '创建' }}
                </UButton>
              </div>
            </div>
          </UCard>
        </div>
      </template>
    </UModal>

    <!-- 临时 Ping 弹窗 -->
    <UModal :open="adhocDialog" @update:open="adhocDialog = $event">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-600 dark:text-slate-300"
                >临时 Ping 工具</span
              >
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-refresh-ccw"
                :loading="adhocLoading"
                @click="submitAdhoc"
                >执行</UButton
              >
            </div>
          </template>
          <div class="space-y-4">
            <div class="grid gap-4 md:grid-cols-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500 dark:text-slate-400"
                  >主机名 / 域名</label
                >
                <UInput
                  v-model="adhocForm.host"
                  placeholder="play.example.com"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500 dark:text-slate-400"
                  >端口 (可选)</label
                >
                <UInput
                  v-model.number="adhocForm.port"
                  type="number"
                  placeholder="留空自动/SRV"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs text-slate-500 dark:text-slate-400"
                  >版本</label
                >
                <USelect
                  v-model="adhocForm.edition"
                  :items="editionOptions"
                  value-key="value"
                  label-key="label"
                />
              </div>
            </div>
            <div
              v-if="adhocResult"
              class="rounded-xl border border-slate-200/60 bg-slate-50/70 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-medium"
                  >结果:
                  {{
                    adhocResult.edition === 'BEDROCK'
                      ? adhocResult.response.version
                      : adhocResult.response.version?.name
                  }}</span
                >
                <UBadge variant="soft" color="neutral">{{
                  editionLabel(adhocResult.edition)
                }}</UBadge>
              </div>
              <div class="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <p class="text-slate-500 dark:text-slate-400">玩家</p>
                  <p class="font-semibold">
                    {{ adhocResult.response.players?.online ?? 0 }} /
                    {{ adhocResult.response.players?.max ?? 0 }}
                  </p>
                </div>
                <div>
                  <p class="text-slate-500 dark:text-slate-400">延迟</p>
                  <p class="font-semibold">
                    {{ adhocResult.response.latency ?? '—' }} ms
                  </p>
                </div>
                <div class="col-span-1">
                  <p class="text-slate-500 dark:text-slate-400">MOTD</p>
                  <p class="line-clamp-3 break-all">
                    {{
                      adhocResult.edition === 'JAVA'
                        ? adhocResult.response.description
                        : adhocResult.response.motd
                    }}
                  </p>
                </div>
              </div>
            </div>
            <div v-else class="text-xs text-slate-500 dark:text-slate-400">
              {{ adhocLoading ? '请求中...' : '填写参数后点击执行' }}
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- 删除确认对话框 -->
    <UModal
      :open="deleteConfirmDialogOpen"
      @update:open="deleteConfirmDialogOpen = $event"
      :ui="{
        content: 'w-full max-w-sm',
        wrapper: 'z-[140]',
        overlay: 'z-[130]',
      }"
    >
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <p class="text-base font-semibold text-slate-900 dark:text-white">
            确认删除 {{ deleteConfirmServer?.displayName }}？
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              @click="deleteConfirmDialogOpen = false"
              >取消</UButton
            >
            <UButton
              color="error"
              variant="soft"
              :loading="deleteConfirmSubmitting"
              @click="handleConfirmDelete"
              >确定</UButton
            >
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
