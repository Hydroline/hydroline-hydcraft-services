<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMinecraftServerStore } from '@/stores/minecraftServers'
import { useUiStore } from '@/stores/ui'
import { apiFetch } from '@/utils/api'
import type {
  BeaconStatusResponse,
  BeaconConnectionStatus,
  BeaconConnectionStatusResponse,
  BeaconConnectivityCheckResponse,
  MinecraftPingResult,
  MinecraftServer,
  MinecraftServerEdition,
  MinecraftPingHistoryItem,
  MinecraftPingSettings,
  McsmInstanceDetail,
} from '@/types/minecraft'
import VChart from 'vue-echarts'
import dayjs from 'dayjs'
import MinecraftServerFormDialog from './components/MinecraftServerFormDialog.vue'
import MinecraftServerAdhocPingDialog from './components/MinecraftServerAdhocPingDialog.vue'
import MinecraftServerDetailDialog from './components/MinecraftServerDetailDialog.vue'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import MinecraftServerBeaconDialog from './components/MinecraftServerBeaconDialog.vue'
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
  beaconHost: '',
  beaconPort: undefined as number | undefined,
  beaconKey: '',
  beaconEnabled: false,
  beaconRequestTimeoutMs: undefined as number | undefined,
  beaconMaxRetry: undefined as number | undefined,
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

const beaconStatus = ref<BeaconStatusResponse | null>(null)
const beaconLoading = ref(false)
let beaconTimer: ReturnType<typeof setInterval> | null = null
// Beacon 连接状态缓存（按服务器）
const beaconConnStatus = reactive<Record<string, BeaconConnectionStatus>>({})

// Beacon 连接详情弹窗
const beaconDialogOpen = ref(false)
const beaconDialogServer = ref<MinecraftServer | null>(null)
const beaconConnDetail = ref<BeaconConnectionStatusResponse | null>(null)
const beaconConnLoading = ref(false)
const beaconStatusDetail = ref<BeaconStatusResponse | null>(null)
const beaconStatusLoading = ref(false)
const beaconCheckLoading = ref(false)
async function openBeaconDialog(server: MinecraftServer) {
  beaconDialogServer.value = server
  beaconDialogOpen.value = true
  await Promise.all([refreshBeaconConn(), refreshBeaconStatus()])
}
async function refreshBeaconConn() {
  const id = beaconDialogServer.value?.id
  if (!id) return
  beaconConnLoading.value = true
  try {
    const res = (await serverStore.getBeaconConnectionStatus(
      id,
    )) as BeaconConnectionStatusResponse
    beaconConnDetail.value = res
    // 同步缓存用于表格徽标
    beaconConnStatus[id] = res.connection
  } catch (e) {
    toast.add({
      title: '获取连接状态失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    beaconConnLoading.value = false
  }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function manualConnectBeacon() {
  const id = beaconDialogServer.value?.id
  if (!id) return
  beaconConnLoading.value = true
  try {
    const res = (await serverStore.connectBeacon(
      id,
    )) as BeaconConnectionStatusResponse
    beaconConnDetail.value = res
    beaconConnStatus[id] = res.connection
    toast.add({ title: '已触发重连', color: 'success' })
  } catch (e) {
    toast.add({
      title: '重连失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    beaconConnLoading.value = false
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function disconnectBeacon() {
  const id = beaconDialogServer.value?.id
  if (!id) return
  beaconConnLoading.value = true
  try {
    const res = (await serverStore.disconnectBeacon(
      id,
    )) as BeaconConnectionStatusResponse
    beaconConnDetail.value = res
    beaconConnStatus[id] = res.connection
    toast.add({ title: '已断开连接', color: 'success' })
  } catch (e) {
    toast.add({
      title: '断开失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    beaconConnLoading.value = false
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function reconnectBeacon() {
  const id = beaconDialogServer.value?.id
  if (!id) return
  beaconConnLoading.value = true
  try {
    const res = (await serverStore.reconnectBeacon(
      id,
    )) as BeaconConnectionStatusResponse
    beaconConnDetail.value = res
    beaconConnStatus[id] = res.connection
    toast.add({ title: '已触发重连', color: 'success' })
  } catch (e) {
    toast.add({
      title: '重连失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    beaconConnLoading.value = false
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function checkBeaconConnectivity() {
  const id = beaconDialogServer.value?.id
  if (!id) return
  beaconCheckLoading.value = true
  try {
    const res = (await serverStore.checkBeaconConnectivity(
      id,
    )) as BeaconConnectivityCheckResponse
    if (res.ok) {
      toast.add({
        title: '连通性正常',
        description: `延迟约 ${res.latencyMs ?? '-'} ms`,
        color: 'success',
      })
    } else {
      toast.add({
        title: '连通性异常',
        description: res.error || '未知错误',
        color: 'warning',
      })
    }
    await refreshBeaconConn()
  } catch (e) {
    toast.add({
      title: '连通性检查失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    beaconCheckLoading.value = false
  }
}
async function refreshBeaconStatus() {
  const id = beaconDialogServer.value?.id
  if (!id) return
  // 若未启用或未配置，提示并返回
  if (
    !beaconDialogServer.value?.beaconEnabled &&
    !beaconDialogServer.value?.beaconConfigured
  ) {
    toast.add({
      title: '未配置 Beacon',
      description: '请在编辑表单中配置并启用 Beacon',
      color: 'warning',
    })
    return
  }
  beaconStatusLoading.value = true
  try {
    const res = (await serverStore.getBeaconStatus(id)) as BeaconStatusResponse
    beaconStatusDetail.value = res
  } catch (e) {
    beaconStatusDetail.value = null
    toast.add({
      title: '获取 Beacon 状态失败',
      description: (e as Error).message,
      color: 'error',
    })
  } finally {
    beaconStatusLoading.value = false
  }
}

// Beacon 对话框自动轮询
let beaconDialogTimer: ReturnType<typeof setInterval> | null = null
function stopBeaconDialogPolling() {
  if (beaconDialogTimer) {
    clearInterval(beaconDialogTimer)
    beaconDialogTimer = null
  }
}
function startBeaconDialogPolling() {
  stopBeaconDialogPolling()
  beaconDialogTimer = setInterval(() => {
    void refreshBeaconConn()
    void refreshBeaconStatus()
  }, 10000)
}
watch(beaconDialogOpen, (open) => {
  if (open) {
    startBeaconDialogPolling()
  } else {
    stopBeaconDialogPolling()
  }
})

async function loadBeaconConnStatus(id: string) {
  try {
    const res = (await serverStore.getBeaconConnectionStatus(
      id,
    )) as BeaconConnectionStatusResponse
    beaconConnStatus[id] = res.connection
  } catch (e) {
    beaconConnStatus[id] = {
      connected: false,
      connecting: false,
      lastError: (e as Error).message,
    }
  }
}

async function loadBeaconConnStatusAll() {
  for (const s of servers.value) {
    if (s.beaconEnabled || s.beaconConfigured) {
      await loadBeaconConnStatus(s.id)
    }
  }
}

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
    await loadBeaconConnStatusAll()
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

watch(detailOpen, (open) => {
  if (
    open &&
    (editingServer.value?.beaconEnabled ||
      editingServer.value?.beaconConfigured)
  ) {
    beaconStatus.value = null
    startBeaconPolling()
  } else {
    stopBeaconPolling()
  }
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
  // 解析 Beacon endpoint，拆分为 host + port，兼容 http://host:port / https://host:port / host:port
  form.beaconHost = ''
  form.beaconPort = undefined
  const rawEndpoint = server.beaconEndpoint ?? ''
  if (rawEndpoint) {
    const withProto =
      rawEndpoint.startsWith('http://') || rawEndpoint.startsWith('https://')
        ? rawEndpoint
        : `http://${rawEndpoint}`
    try {
      const url = new URL(withProto)
      form.beaconHost = url.hostname
      form.beaconPort = url.port ? Number(url.port) : undefined
    } catch {
      form.beaconHost = rawEndpoint
    }
  }
  form.beaconKey = ''
  form.beaconEnabled = Boolean(
    server.beaconEnabled ?? server.beaconConfigured ?? false,
  )
  form.beaconRequestTimeoutMs = server.beaconRequestTimeoutMs ?? undefined
  form.beaconMaxRetry = server.beaconMaxRetry ?? undefined
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
  form.beaconHost = ''
  form.beaconPort = undefined
  form.beaconKey = ''
  form.beaconEnabled = false
  form.beaconRequestTimeoutMs = undefined
  form.beaconMaxRetry = undefined
}

function buildPayload() {
  const portNumber = Number(form.port)
  const payloadPort =
    Number.isFinite(portNumber) && portNumber > 0 ? portNumber : undefined
  const beaconPortNumber = Number(form.beaconPort)
  const beaconPort =
    Number.isFinite(beaconPortNumber) && beaconPortNumber > 0
      ? beaconPortNumber
      : undefined
  const beaconHost = form.beaconHost.trim()
  const beaconEndpoint =
    beaconHost && beaconPort
      ? `http://${beaconHost}:${beaconPort}`
      : beaconHost
        ? beaconHost
        : undefined
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
    beaconEndpoint,
    beaconKey: form.beaconKey.trim() || undefined,
    beaconEnabled: form.beaconEnabled,
    beaconRequestTimeoutMs: form.beaconRequestTimeoutMs,
    beaconMaxRetry: form.beaconMaxRetry,
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

async function loadBeaconStatus(serverId: string | null) {
  if (!serverId) return
  beaconLoading.value = true
  try {
    const res = (await serverStore.getBeaconStatus(
      serverId,
    )) as BeaconStatusResponse
    beaconStatus.value = res
  } catch {
    beaconStatus.value = null
  } finally {
    beaconLoading.value = false
  }
}

function stopBeaconPolling() {
  if (beaconTimer) {
    clearInterval(beaconTimer)
    beaconTimer = null
  }
}

function startBeaconPolling() {
  if (!editingServer.value?.id) return
  stopBeaconPolling()
  void loadBeaconStatus(editingServer.value.id)
  beaconTimer = setInterval(() => {
    void loadBeaconStatus(editingServer.value?.id ?? null)
  }, 10000)
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

async function handlePing(server: MinecraftServer) {
  await triggerPing(server.id)
}

function confirmDelete(server: MinecraftServer) {
  deleteConfirmServer.value = server
  deleteConfirmDialogOpen.value = true
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  void loadBeaconConnStatus(server.id)
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
              <div class="flex items-center justify-end gap-0.5">
                <UButton
                  v-if="row.beaconEnabled || (row as any).beaconConfigured"
                  size="xs"
                  variant="ghost"
                  :color="
                    beaconConnStatus[row.id]?.connected
                      ? 'success'
                      : beaconConnStatus[row.id]?.connecting
                        ? 'primary'
                        : beaconConnStatus[row.id]?.lastError
                          ? 'error'
                          : 'neutral'
                  "
                  @click="openBeaconDialog(row)"
                >
                  Beacon
                </UButton>
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

    <MinecraftServerDetailDialog
      :open="detailOpen"
      :server="editingServer"
      :last-ping="lastPing"
      :motd-html="motdHtml"
      :mcsm-detail="mcsmDetail"
      :mcsm-config-ready="mcsmConfigReady"
      :mcsm-status-loading="mcsmStatusLoading"
      :mcsm-controls-loading="mcsmControlsLoading"
      :mcsm-command="mcsmCommand"
      :mcsm-command-loading="mcsmCommandLoading"
      :mcsm-output="mcsmOutput"
      :history="history"
      :history-days="historyDays"
      :history-loading="historyLoading"
      :format-chart-label="formatChartLabel"
      @update:open="detailOpen = $event"
      @refresh-ping="triggerPing(editingServer?.id ?? null)"
      @load-mcsm-status="editingServer?.id && loadMcsmStatus(editingServer.id)"
      @load-mcsm-output="
        editingServer?.id && loadMcsmOutput(editingServer.id, 1024)
      "
      @run-mcsm-command="editingServer?.id && runMcsmCommand(editingServer.id)"
      @control-mcsm="
        (action) => editingServer?.id && controlMcsm(editingServer.id, action)
      "
      @update:mcsmCommand="mcsmCommand = $event"
    />

    <MinecraftServerFormDialog
      :open="dialogOpen"
      :dialog-title="dialogTitle"
      :form="form"
      :edition-options="editionOptions"
      :history-days="historyDays"
      :history="history"
      :history-loading="historyLoading"
      :saving="saving"
      :format-chart-label="formatChartLabel"
      :is-editing="!!editingServer"
      @update:open="dialogOpen = $event"
      @save="saveServer"
    />

    <MinecraftServerAdhocPingDialog
      :open="adhocDialog"
      :adhoc-form="adhocForm"
      :adhoc-result="adhocResult"
      :adhoc-loading="adhocLoading"
      :edition-options="editionOptions"
      @update:open="adhocDialog = $event"
      @submit="submitAdhoc"
    />
    <!-- 删除确认对话框 -->
    <UModal
      :open="deleteConfirmDialogOpen"
      @update:open="deleteConfirmDialogOpen = $event"
      :ui="{
        content:
          'w-full max-w-sm w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
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

    <MinecraftServerBeaconDialog
      :open="beaconDialogOpen"
      :server="beaconDialogServer"
      :connection-detail="beaconConnDetail"
      :status-detail="beaconStatusDetail"
      :conn-loading="beaconConnLoading"
      :status-loading="beaconStatusLoading"
      :check-loading="beaconCheckLoading"
      @update:open="beaconDialogOpen = $event"
      @edit="
        beaconDialogServer
          ? (openEditDialog(beaconDialogServer), (beaconDialogOpen = false))
          : null
      "
      @manual-connect="manualConnectBeacon"
      @disconnect="disconnectBeacon"
      @reconnect="reconnectBeacon"
      @check-connectivity="checkBeaconConnectivity"
      @refresh-conn="refreshBeaconConn"
    />
  </div>
</template>
