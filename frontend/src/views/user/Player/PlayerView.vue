<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePlayerPortalStore } from '@/stores/playerPortal'
import { apiFetch } from '@/utils/api'
import type { PlayerLoginCluster } from '@/types/portal'

const auth = useAuthStore()
const playerStore = usePlayerPortalStore()
const loading = ref(true)
const statsPeriod = ref('30d')
const serverOptions = ref<Array<{ id: string; displayName: string }>>([])
const permissionDialog = reactive({
  open: false,
  targetGroup: '',
  reason: '',
})
const restartDialog = reactive({
  open: false,
  serverId: '',
  reason: '',
})
const actionsPage = ref(1)
const toast = useToast()

const summary = computed(() => playerStore.summary)
const ownership = computed(() => summary.value?.ownership ?? null)
const loginMap = computed(() => playerStore.loginMap)
const loginClusters = computed<PlayerLoginCluster[]>(
  () => playerStore.loginMap?.clusters ?? [],
)
const assets = computed(() => playerStore.assets)
const region = computed(() => playerStore.region)
const minecraft = computed(() => playerStore.minecraft)
const stats = computed(() => playerStore.stats)
const actions = computed(() => playerStore.actions)

const regionPositions: Record<string, { x: number; y: number }> = {
  北京: { x: 70, y: 18 },
  上海: { x: 82, y: 32 },
  广东: { x: 68, y: 58 },
  江苏: { x: 80, y: 30 },
  浙江: { x: 82, y: 38 },
  湖北: { x: 70, y: 38 },
  湖南: { x: 66, y: 45 },
  四川: { x: 58, y: 40 },
  重庆: { x: 60, y: 36 },
  天津: { x: 72, y: 20 },
  辽宁: { x: 76, y: 12 },
  陕西: { x: 60, y: 30 },
  山西: { x: 64, y: 24 },
  广西: { x: 58, y: 60 },
  云南: { x: 48, y: 58 },
  福建: { x: 78, y: 48 },
  浙江省: { x: 82, y: 38 },
  江苏省: { x: 80, y: 30 },
  Taiwan: { x: 88, y: 52 },
  日本: { x: 92, y: 28 },
  Singapore: { x: 70, y: 70 },
  UnitedStates: { x: 10, y: 30 },
}

async function initialize() {
  loading.value = true
  try {
    await Promise.all([
      playerStore.fetchSummary(),
      playerStore.fetchAssets(),
      playerStore.fetchLoginMap(),
      playerStore.fetchRegion(),
      playerStore.fetchMinecraft(),
      playerStore.fetchStats(statsPeriod.value),
      playerStore.fetchActions(actionsPage.value),
    ])
    const publicServers = await apiFetch<{
      servers: Array<{ id: string; displayName: string }>
    }>('/portal/header/minecraft-status')
    serverOptions.value = publicServers.servers ?? []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void initialize()
})

watch(
  () => statsPeriod.value,
  async (value) => {
    await playerStore.fetchStats(value, true)
  },
)

async function refreshActions(page = 1) {
  actionsPage.value = page
  await playerStore.fetchActions(actionsPage.value)
}

async function handleAuthmeReset() {
  try {
    await playerStore.requestAuthmeReset()
    toast.add({ title: '已提交 AuthMe 密码重置申请', color: 'primary' })
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function handleForceLogin() {
  try {
    await playerStore.requestForceLogin()
    toast.add({ title: '已提交强制登陆申请', color: 'primary' })
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function submitPermissionChange() {
  if (!permissionDialog.targetGroup.trim()) {
    toast.add({ title: '请输入目标权限组', color: 'warning' })
    return
  }
  try {
    await playerStore.requestPermissionChange(
      permissionDialog.targetGroup,
      permissionDialog.reason,
    )
    toast.add({ title: '已提交权限组调整申请', color: 'primary' })
    permissionDialog.open = false
    permissionDialog.targetGroup = ''
    permissionDialog.reason = ''
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function submitRestartRequest() {
  if (!restartDialog.serverId) {
    toast.add({ title: '请选择服务器', color: 'warning' })
    return
  }
  try {
    await playerStore.requestServerRestart(
      restartDialog.serverId,
      restartDialog.reason,
    )
    toast.add({ title: '已提交重启请求', color: 'primary' })
    restartDialog.open = false
    restartDialog.serverId = ''
    restartDialog.reason = ''
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

function markerStyle(cluster: PlayerLoginCluster) {
  const key =
    cluster.province || cluster.city || cluster.country || cluster.id || 'default'
  const mapped =
    regionPositions[key] ??
    regionPositions[key.replace(/省|市|自治区|特别行政区/g, '')] ??
    { x: 55, y: 35 }
  return {
    left: `${mapped.x}%`,
    top: `${mapped.y}%`,
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return date.toLocaleString()
}

function formatMetricValue(value: number, unit: string) {
  if (unit === 'seconds') {
    return `${Math.round(value / 3600)} 小时`
  }
  if (unit === 'times') {
    return `${value} 次`
  }
  if (unit === 'days') {
    return `${value} 天`
  }
  return `${value}`
}
</script>

<template>
  <section class="mx-auto w-full max-w-6xl px-4 pb-16 pt-8">
    <header
      class="flex flex-col gap-2 border-b border-slate-100 pb-6 dark:border-slate-800 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          玩家档案
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          在这里浏览 Minecraft 账户、玩家数据与操作历史。
        </p>
      </div>
      <RouterLink
        v-if="auth.isAuthenticated"
        to="/profile"
        class="inline-flex items-center gap-2 rounded-full border border-primary-200 px-4 py-1.5 text-sm font-medium text-primary-600 transition hover:border-primary-300 hover:text-primary-500 dark:border-primary-500/40 dark:text-primary-200"
      >
        <UIcon name="i-lucide-id-card" class="h-4 w-4" />
        管理用户信息
      </RouterLink>
    </header>

    <div class="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
      <div class="space-y-6">
        <UCard class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
          <template #header>
            <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
              档案概要
            </p>
          </template>
          <div v-if="summary" class="space-y-3">
            <div class="flex items-center gap-4">
              <img
                :src="
                  summary.minecraftProfiles[0]?.nickname
                    ? `https://mc-heads.net/avatar/${summary.minecraftProfiles[0]?.nickname}/64`
                    : 'https://mc-heads.net/avatar/Steve/64'
                "
                :alt="summary.displayName ?? summary.email"
                class="h-16 w-16 rounded-xl border border-slate-200 object-cover dark:border-slate-700"
              />
              <div>
                <p class="text-lg font-semibold text-slate-900 dark:text-white">
                  {{ summary.displayName || summary.email }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  PIIC：{{ summary.piic || '未分配' }}
                </p>
              </div>
            </div>
            <dl class="grid grid-cols-1 gap-3 text-sm text-slate-700 dark:text-slate-200">
              <div>
                <dt class="text-xs text-slate-500 dark:text-slate-400">注册时间</dt>
                <dd>{{ formatDateTime(summary.createdAt) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500 dark:text-slate-400">最近登录</dt>
                <dd>
                  {{ formatDateTime(summary.lastLoginAt) }}
                  <span
                    v-if="summary.lastLoginLocation"
                    class="text-xs text-slate-500 dark:text-slate-400"
                  >
                    · {{ summary.lastLoginLocation }}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
          <USkeleton v-else class="h-32 w-full" />
        </UCard>

        <UCard class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
          <template #header>
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
                登录地图
              </p>
              <span class="text-xs text-slate-500 dark:text-slate-400">
                {{ loginMap?.range.from }} - {{ loginMap?.range.to }}
              </span>
            </div>
          </template>
          <div class="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-100 to-slate-200 p-4 dark:border-slate-800/70 dark:from-slate-800 dark:to-slate-900">
            <div class="relative h-56 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top,_#cbd5f5,_transparent_60%),radial-gradient(circle_at_bottom,_#f1f5ff,_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_#1e293b,_transparent_60%),radial-gradient(circle_at_bottom,_#0f172a,_transparent_55%)]">
              <div
                v-for="cluster in loginClusters"
                :key="cluster.id"
                class="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-primary-500/80 text-xs font-semibold text-white shadow"
                :style="markerStyle(cluster)"
              >
                {{ cluster.count }}
              </div>
            </div>
            <ul class="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <li
                v-for="cluster in loginClusters.slice(0, 4)"
                :key="cluster.id"
                class="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 shadow-sm dark:bg-slate-900/60"
              >
                <span>
                  {{ cluster.city || cluster.province || cluster.country || '未知' }}
                </span>
                <span class="font-semibold text-slate-900 dark:text-white">
                  {{ cluster.count }}
                </span>
              </li>
            </ul>
          </div>
        </UCard>

        <UCard class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
          <template #header>
            <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
              操作记录
            </p>
          </template>
          <div v-if="actions?.items.length" class="space-y-3 text-sm">
            <div
              v-for="item in actions.items"
              :key="item.id"
              class="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800/70"
            >
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ item.action }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ formatDateTime(item.createdAt) }}
              </p>
              <p v-if="item.reason" class="text-xs text-slate-600 dark:text-slate-300">
                {{ item.reason }}
              </p>
            </div>
            <UButton
              v-if="actions?.pagination.pageCount && actions.pagination.page < actions.pagination.pageCount"
              block
              variant="ghost"
              color="neutral"
              @click="refreshActions(actions.pagination.page + 1)"
            >
              查看更多
            </UButton>
          </div>
          <p v-else class="text-center text-sm text-slate-500 dark:text-slate-400">
            暂无操作记录
          </p>
        </UCard>
      </div>

      <div class="space-y-6">
        <UCard class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
          <template #header>
            <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
              名下资产
            </p>
          </template>
          <div v-if="ownership" class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-xs text-slate-500 dark:text-slate-400">AuthMe 绑定</p>
              <p class="text-2xl font-semibold text-slate-900 dark:text-white">
                {{ ownership.authmeBindings }}
              </p>
            </div>
            <div>
              <p class="text-xs text-slate-500 dark:text-slate-400">Minecraft 档案</p>
              <p class="text-2xl font-semibold text-slate-900 dark:text-white">
                {{ ownership.minecraftProfiles }}
              </p>
            </div>
            <div>
              <p class="text-xs text-slate-500 dark:text-slate-400">公司/铁路</p>
              <p class="text-2xl font-semibold text-slate-900 dark:text-white">
                {{ ownership.companyCount + ownership.railwayCount }}
              </p>
            </div>
            <div>
              <p class="text-xs text-slate-500 dark:text-slate-400">角色授权</p>
              <p class="text-2xl font-semibold text-slate-900 dark:text-white">
                {{ ownership.roleAssignments }}
              </p>
            </div>
          </div>
          <USkeleton v-else class="h-28 w-full" />
        </UCard>

        <UCard class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
          <template #header>
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
                服务器账户
              </p>
              <UBadge color="primary" variant="soft">
                {{ minecraft?.permissionRoles.length ?? 0 }} 权限组
              </UBadge>
            </div>
          </template>
          <div v-if="minecraft" class="space-y-4">
            <div
              v-for="binding in minecraft.bindings"
              :key="binding.id"
              class="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800/70"
            >
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ binding.username }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                绑定时间：{{ formatDateTime(binding.boundAt) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="role in minecraft.permissionRoles"
                :key="role.id"
                color="neutral"
                variant="soft"
              >
                {{ role.name || role.key }}
              </UBadge>
            </div>
          </div>
          <USkeleton v-else class="h-32 w-full" />
        </UCard>

        <UCard class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
          <template #header>
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
                统计信息
              </p>
              <USelectMenu
                v-model="statsPeriod"
                :options="[
                  { label: '近 30 天', value: '30d' },
                  { label: '近 7 天', value: '7d' },
                  { label: '全部', value: 'all' },
                ]"
                class="w-28"
              />
            </div>
          </template>
          <div v-if="stats" class="grid gap-4 md:grid-cols-2">
            <div
              v-for="metric in stats.metrics"
              :key="metric.id"
              class="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800/70"
            >
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ metric.label }}
              </p>
              <p class="text-xl font-semibold text-slate-900 dark:text-white">
                {{ formatMetricValue(metric.value, metric.unit) }}
              </p>
            </div>
          </div>
          <USkeleton v-else class="h-28 w-full" />
        </UCard>

        <UCard class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
          <template #header>
            <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
              自助操作
            </p>
          </template>
          <div class="grid gap-3 md:grid-cols-2">
            <UButton
              color="primary"
              variant="soft"
              @click="handleAuthmeReset"
            >
              AuthMe 密码重置
            </UButton>
            <UButton
              color="primary"
              variant="ghost"
              @click="handleForceLogin"
            >
              强制登陆
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              @click="permissionDialog.open = true"
            >
              权限组调整申请
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="restartDialog.open = true"
            >
              炸服重启申请
            </UButton>
          </div>
        </UCard>
      </div>
    </div>

    <UModal v-model:open="permissionDialog.open" :ui="{ content: 'w-full max-w-md' }">
      <div class="space-y-4">
        <p class="text-lg font-semibold text-slate-900 dark:text-white">
          权限组调整申请
        </p>
        <div class="space-y-2">
          <label class="text-sm text-slate-600 dark:text-slate-300">目标权限组</label>
          <UInput v-model="permissionDialog.targetGroup" placeholder="例如：builder" />
        </div>
        <div class="space-y-2">
          <label class="text-sm text-slate-600 dark:text-slate-300">说明</label>
          <UTextarea v-model="permissionDialog.reason" placeholder="补充说明" />
        </div>
        <div class="flex justify-end gap-3">
          <UButton variant="ghost" color="neutral" @click="permissionDialog.open = false">
            取消
          </UButton>
          <UButton color="primary" @click="submitPermissionChange">
            提交
          </UButton>
        </div>
      </div>
    </UModal>

    <UModal v-model:open="restartDialog.open" :ui="{ content: 'w-full max-w-md' }">
      <div class="space-y-4">
        <p class="text-lg font-semibold text-slate-900 dark:text-white">
          炸服重启申请
        </p>
        <div class="space-y-2">
          <label class="text-sm text-slate-600 dark:text-slate-300">服务器</label>
          <USelectMenu
            v-model="restartDialog.serverId"
            :options="serverOptions.map((server) => ({
              label: server.displayName,
              value: server.id,
            }))"
            placeholder="选择服务器"
          />
        </div>
        <div class="space-y-2">
          <label class="text-sm text-slate-600 dark:text-slate-300">说明</label>
          <UTextarea v-model="restartDialog.reason" placeholder="请输入崩服情况说明" />
        </div>
        <div class="flex justify-end gap-3">
          <UButton variant="ghost" color="neutral" @click="restartDialog.open = false">
            取消
          </UButton>
          <UButton color="primary" @click="submitRestartRequest">
            提交
          </UButton>
        </div>
      </div>
    </UModal>
  </section>
</template>
