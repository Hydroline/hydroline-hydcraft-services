<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useMinecraftServerStore } from '@/stores/minecraftServers'
import { useUiStore } from '@/stores/ui'
import { apiFetch } from '@/utils/api'
import type {
  MinecraftPingResult,
  MinecraftServer,
  MinecraftServerEdition,
} from '@/types/minecraft'

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
})

const tableRows = computed(() =>
  servers.value.map((item) => ({
    ...item,
    code: `${item.internalCodeCn} / ${item.internalCodeEn}`,
    hostLabel: `${item.host}:${item.port ?? (item.edition === 'BEDROCK' ? 19132 : 25565)}`,
  })),
)

const dialogTitle = computed(() =>
  editingServer.value ? `编辑：${editingServer.value.displayName}` : '新建服务器',
)

const editionOptions = [
  { label: 'Java 版', value: 'JAVA' },
  { label: '基岩版', value: 'BEDROCK' },
]

onMounted(async () => {
  uiStore.startLoading()
  try {
    await serverStore.fetchAll()
  } finally {
    uiStore.stopLoading()
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
}

function buildPayload() {
  return {
    displayName: form.displayName.trim(),
    internalCodeCn: form.internalCodeCn.trim(),
    internalCodeEn: form.internalCodeEn.trim(),
    host: form.host.trim(),
    port: form.port,
    edition: form.edition,
    description: form.description.trim() || undefined,
    isActive: form.isActive,
    displayOrder: form.displayOrder,
  }
}

async function saveServer() {
  if (!form.displayName || !form.host) {
    toast.add({
      title: '请完善表单',
      description: '显示名称与 Host 不能为空',
      color: 'warning',
    })
    return
  }
  saving.value = true
  try {
    if (editingServer.value) {
      const updated = await serverStore.update(editingServer.value.id, buildPayload())
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
    motdHtml.value = await parseMotd(
      motdPayload,
      result.edition === 'BEDROCK',
    )
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

function editionLabel(edition: MinecraftServerEdition) {
  return edition === 'BEDROCK' ? '基岩版' : 'Java 版'
}

async function handlePing(server: MinecraftServer) {
  await triggerPing(server.id)
}

function confirmDelete(server: MinecraftServer) {
  if (window.confirm(`确认删除 ${server.displayName}？`)) {
    void removeServer(server)
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">服务器状态</h1>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            配置 Hydroline 专属的 Minecraft 服务器，并实时检查其在线状态与 MOTD。
          </p>
        </div>
        <UButton color="primary" icon="i-lucide-plus" @click="openCreateDialog">新建服务器</UButton>
      </div>
    </header>

    <div class="rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
      <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <thead class="bg-slate-50/60 dark:bg-slate-900/60">
          <tr class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                <span class="font-medium text-slate-900 dark:text-white">{{ row.displayName }}</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">{{ row.description || '无备注' }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ row.code }}
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-col text-xs text-slate-500 dark:text-slate-400">
                <span class="font-medium text-slate-900 dark:text-white">{{ row.hostLabel }}</span>
                <span>{{ row.host }}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <UBadge variant="soft" color="neutral">{{ editionLabel(row.edition) }}</UBadge>
            </td>
            <td class="px-4 py-3">
              <UBadge :color="row.isActive ? 'success' : 'neutral'" variant="soft">
                {{ row.isActive ? '启用' : '停用' }}
              </UBadge>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <UButton
                  size="xs"
                  variant="ghost"
                  @click="handlePing(row)"
                  :loading="pingLoading && editingServer?.id === row.id"
                >
                  Ping
                </UButton>
                <UButton size="xs" variant="ghost" color="primary" @click="openEditDialog(row)">编辑</UButton>
                <UButton size="xs" color="error" variant="ghost" :loading="deleting" @click="confirmDelete(row)">
                  删除
                </UButton>
              </div>
            </td>
          </tr>
          <tr v-if="tableRows.length === 0">
            <td colspan="6" class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              暂无服务器配置，点击右上角“新建服务器”开始。
            </td>
          </tr>
        </tbody>
      </table>
      <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>共 {{ servers.length }} 台服务器</span>
        <UButton variant="ghost" size="2xs" icon="i-lucide-refresh-ccw" @click="serverStore.fetchAll()">刷新列表</UButton>
      </div>
    </div>

    <UCard v-if="lastPing">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-semibold text-slate-900 dark:text-white">
              最近一次 Ping · {{ editingServer?.displayName ?? '未选择服务器' }}
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ editionLabel(lastPing.edition) }} · 延迟 {{ lastPing.response.latency ?? '—' }} ms
            </p>
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
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400">版本</p>
          <p class="text-base font-semibold text-slate-900 dark:text-white">
            {{
              lastPing.edition === 'BEDROCK'
                ? lastPing.response.version
                : lastPing.response.version?.name ?? '未知'
            }}
          </p>
        </div>
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400">玩家</p>
          <p class="text-base font-semibold text-slate-900 dark:text-white">
            {{
              lastPing.response.players?.online ?? 0
            }} / {{ lastPing.response.players?.max ?? 0 }}
          </p>
        </div>
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400">延迟</p>
          <p class="text-base font-semibold text-slate-900 dark:text-white">{{ lastPing.response.latency ?? '—' }} ms</p>
        </div>
      </div>
      <div class="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/60">
        <p class="text-xs text-slate-500 dark:text-slate-400">MOTD</p>
        <div v-if="motdHtml" class="prose prose-sm mt-2 dark:prose-invert" v-html="motdHtml"></div>
        <p v-else class="mt-2 text-sm text-slate-500 dark:text-slate-400">暂无 MOTD 数据</p>
      </div>
    </UCard>

    <UModal :open="dialogOpen" @update:open="dialogOpen = $event">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">{{ dialogTitle }}</h3>
              <UTooltip text="保存后可立即 Ping">
                <UIcon name="i-lucide-info" class="h-4 w-4 text-slate-400 dark:text-slate-500" />
              </UTooltip>
            </div>
          </template>

          <!-- 统一的两列布局，左侧 Label 右侧控件；保证所有标签对齐 -->
          <div class="grid gap-4 md:grid-cols-2">
            <!-- 显示名称 -->
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label for="displayName" class="text-sm text-slate-600 dark:text-slate-300">显示名称<span class="text-red-500">*</span></label>
              <UInput id="displayName" v-model="form.displayName" placeholder="示例：主城 Lobby" />
            </div>
            <!-- 中文内部代号 -->
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label for="internalCodeCn" class="text-sm text-slate-600 dark:text-slate-300">中文内部代号<span class="text-red-500">*</span></label>
              <UInput id="internalCodeCn" v-model="form.internalCodeCn" placeholder="示例：主城" />
            </div>
            <!-- 英文内部代号 -->
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label for="internalCodeEn" class="text-sm text-slate-600 dark:text-slate-300">英文内部代号<span class="text-red-500">*</span></label>
              <UInput id="internalCodeEn" v-model="form.internalCodeEn" placeholder="示例：lobby" />
            </div>
            <!-- 版本 -->
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label for="edition" class="text-sm text-slate-600 dark:text-slate-300">版本</label>
              <USelectMenu id="edition" v-model="form.edition" :options="editionOptions" />
            </div>
            <!-- Host -->
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label for="host" class="text-sm text-slate-600 dark:text-slate-300">服务器 Host<span class="text-red-500">*</span></label>
              <UInput id="host" v-model="form.host" placeholder="mc.hydroline.example" />
            </div>
            <!-- Port -->
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label for="port" class="text-sm text-slate-600 dark:text-slate-300">端口</label>
              <UInput id="port" v-model.number="form.port" type="number" min="1" max="65535" />
            </div>
            <!-- 描述 -->
            <div class="grid grid-cols-[7rem,1fr] items-start gap-2 md:col-span-2">
              <label for="description" class="mt-2 text-sm text-slate-600 dark:text-slate-300">描述</label>
              <UTextarea id="description" v-model="form.description" placeholder="用于后台备注信息" />
            </div>
            <!-- 显示顺序 -->
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label for="displayOrder" class="text-sm text-slate-600 dark:text-slate-300">显示顺序</label>
              <UInput id="displayOrder" v-model.number="form.displayOrder" type="number" />
            </div>
            <!-- 状态 -->
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label for="isActive" class="text-sm text-slate-600 dark:text-slate-300">状态</label>
              <div class="flex h-10 items-center rounded-xl border border-slate-200 px-3 dark:border-slate-700">
                <UToggle id="isActive" v-model="form.isActive" label="启用" />
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-between">
              <div class="text-xs text-slate-500 dark:text-slate-400">
                保存后会自动刷新服务器状态
              </div>
              <div class="flex gap-2">
                <UButton variant="ghost" @click="dialogOpen = false">取消</UButton>
                <UButton color="primary" :loading="saving" @click="saveServer">
                  {{ editingServer ? '保存修改' : '创建' }}
                </UButton>
              </div>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
