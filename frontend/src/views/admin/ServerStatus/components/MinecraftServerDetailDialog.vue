<script setup lang="ts">
import VChart from 'vue-echarts'
import dayjs from 'dayjs'
import type {
  MinecraftPingHistoryItem,
  MinecraftPingResult,
  McsmInstanceDetail,
  MinecraftServer,
} from '@/types/minecraft'

const props = defineProps<{
  open: boolean
  server: MinecraftServer | null
  lastPing: MinecraftPingResult | null
  motdHtml: string | null
  mcsmDetail: McsmInstanceDetail | null
  mcsmConfigReady: boolean
  mcsmStatusLoading: boolean
  mcsmControlsLoading: {
    start: boolean
    stop: boolean
    restart: boolean
    kill: boolean
  }
  mcsmCommand: string
  mcsmCommandLoading: boolean
  mcsmOutput: string
  history: MinecraftPingHistoryItem[]
  historyDays: number
  historyLoading: boolean
  formatChartLabel: (value: string | number | Date) => string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'refresh-ping'): void
  (e: 'load-mcsm-status'): void
  (e: 'load-mcsm-output'): void
  (e: 'run-mcsm-command'): void
  (e: 'control-mcsm', action: 'start' | 'stop' | 'restart' | 'kill'): void
  (e: 'update:mcsmCommand', value: string): void
}>()

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
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="emit('update:open', $event)"
    :ui="{ content: 'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' }"
  >
    <template #content>
      <UCard class="max-h-[80vh] overflow-y-auto">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <div
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                {{ props.server?.displayName ?? '未选择服务器' }}
              </div>
              <div class="text-lg font-semibold text-slate-900 dark:text-white">
                {{
                  props.server
                    ? props.server.edition === 'BEDROCK'
                      ? '基岩版'
                      : 'Java 版'
                    : ''
                }}
              </div>
            </div>
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-refresh-ccw"
              :loading="false"
              @click="emit('refresh-ping')"
            >
              重新 Ping
            </UButton>
          </div>
        </template>

        <div class="grid gap-4 md:grid-cols-3">
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              版本
            </p>
            <p class="text-base font-semibold text-slate-900 dark:text-white">
              <span v-if="props.lastPing">
                {{
                  props.lastPing.edition === 'BEDROCK'
                    ? props.lastPing.response.version
                    : (props.lastPing.response.version?.name ?? '未知')
                }}
              </span>
              <UIcon
                v-else
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </p>
          </div>
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              玩家
            </p>
            <p class="text-base font-semibold text-slate-900 dark:text-white">
              <span v-if="props.lastPing">
                {{ props.lastPing.response.players?.online ?? 0 }} /
                {{ props.lastPing.response.players?.max ?? 0 }}
              </span>
              <UIcon
                v-else
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </p>
          </div>
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              延迟
            </p>
            <p class="text-base font-semibold text-slate-900 dark:text-white">
              <span v-if="props.lastPing">
                {{ props.lastPing.response.latency ?? '—' }} ms
              </span>
              <UIcon
                v-else
                name="i-lucide-loader-2"
                class="inline-block h-4 w-4 animate-spin"
              />
            </p>
          </div>
        </div>

        <div class="mt-4">
          <p
            class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            MOTD
          </p>
          <div
            v-if="props.motdHtml"
            class="prose prose-sm mt-1 dark:prose-invert rounded-2xl border border-slate-200/70 bg-slate-50/70 p-2 px-3 dark:border-slate-800/60 dark:bg-slate-900/60"
            v-html="props.motdHtml"
          />
          <p v-else class="mt-2 text-sm text-slate-500 dark:text-slate-400">
            暂无 MOTD 数据
          </p>
        </div>

        <div class="mt-8">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span
                class="text-base font-semibold text-slate-900 dark:text-white"
                >MCSM 实例</span
              >
              <UBadge
                size="xs"
                variant="soft"
                :color="mcsmStatusColor(props.mcsmDetail?.status)"
                >{{ mcsmStatusLabel(props.mcsmDetail?.status) }}</UBadge
              >
            </div>
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              :loading="props.mcsmStatusLoading"
              :disabled="!props.mcsmConfigReady"
              @click="emit('load-mcsm-status')"
            >
              刷新状态
            </UButton>
          </div>

          <div
            v-if="!props.mcsmConfigReady"
            class="text-base font-semibold text-slate-900 dark:text-white"
          >
            未配置 MCSM 参数（或未保存 API Key），请在编辑表单中补充。
          </div>

          <div v-else class="grid gap-3 md:grid-cols-4">
            <div class="md:col-span-4">
              <div class="mt-2 flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  variant="soft"
                  :loading="props.mcsmControlsLoading.start"
                  :disabled="props.mcsmStatusLoading"
                  icon="i-lucide-play"
                  @click="emit('control-mcsm', 'start')"
                  >启动</UButton
                >
                <UButton
                  size="sm"
                  variant="soft"
                  :loading="props.mcsmControlsLoading.stop"
                  :disabled="props.mcsmStatusLoading"
                  color="warning"
                  icon="i-lucide-square"
                  @click="emit('control-mcsm', 'stop')"
                  >停止</UButton
                >
                <UButton
                  size="sm"
                  variant="soft"
                  :loading="props.mcsmControlsLoading.restart"
                  :disabled="props.mcsmStatusLoading"
                  color="primary"
                  icon="i-lucide-rotate-ccw"
                  @click="emit('control-mcsm', 'restart')"
                  >重启</UButton
                >
                <UButton
                  size="sm"
                  variant="soft"
                  :loading="props.mcsmControlsLoading.kill"
                  :disabled="props.mcsmStatusLoading"
                  color="error"
                  icon="i-lucide-zap"
                  @click="emit('control-mcsm', 'kill')"
                  >强制终止</UButton
                >
              </div>
            </div>

            <div>
              <p
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                CPU
              </p>
              <p class="text-base font-semibold text-slate-900 dark:text-white">
                {{ props.mcsmDetail?.processInfo?.cpu ?? '—' }}
              </p>
            </div>
            <div>
              <p
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                内存
              </p>
              <p class="text-base font-semibold text-slate-900 dark:text-white">
                {{ props.mcsmDetail?.processInfo?.memory ?? '—' }}
              </p>
            </div>
            <div>
              <p
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                在线人数
              </p>
              <p class="text-base font-semibold text-slate-900 dark:text-white">
                {{ props.mcsmDetail?.info?.currentPlayers ?? '—' }} /
                {{ props.mcsmDetail?.info?.maxPlayers ?? '—' }}
              </p>
            </div>
            <div>
              <p
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                版本
              </p>
              <p class="text-base font-semibold text-slate-900 dark:text-white">
                {{ props.mcsmDetail?.info?.version ?? '—' }}
              </p>
            </div>
          </div>

          <div v-if="props.mcsmConfigReady" class="mt-4 space-y-3">
            <div class="flex items-center gap-2">
              <UInput
                :model-value="props.mcsmCommand"
                class="flex-1"
                placeholder="输入要发送到实例的命令"
                :disabled="props.mcsmCommandLoading"
                @update:model-value="emit('update:mcsmCommand', $event)"
              />
              <UButton
                color="primary"
                :loading="props.mcsmCommandLoading"
                :disabled="!props.server?.id"
                @click="emit('run-mcsm-command')"
                >发送命令</UButton
              >
            </div>
            <div>
              <div class="mb-2 flex items-center justify-between">
                <span
                  class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >输出日志</span
                >
                <UButton
                  size="xs"
                  variant="ghost"
                  :loading="false"
                  :disabled="!props.server?.id"
                  @click="emit('load-mcsm-output')"
                  >刷新输出</UButton
                >
              </div>
              <pre
                class="max-h-64 overflow-auto rounded-xl bg-slate-900/80 p-3 text-xs text-slate-100"
                >{{ props.mcsmOutput || '暂无输出' }}</pre
              >
            </div>
          </div>
        </div>

        <div class="mt-8">
          <p class="text-base font-semibold text-slate-900 dark:text-white">
            最近 {{ props.historyDays }} 天走势
          </p>
          <div class="h-60">
            <VChart
              v-if="props.history.length"
              :option="{
                tooltip: { trigger: 'axis' },
                grid: { left: 40, right: 20, top: 30, bottom: 30 },
                xAxis: {
                  type: 'category',
                  data: props.history
                    .slice()
                    .reverse()
                    .map((p) => props.formatChartLabel(p.createdAt)),
                },
                yAxis: {
                  type: 'value',
                  min: 0,
                  splitLine: { show: false },
                },
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
                    data: props.history
                      .slice()
                      .reverse()
                      .map((p) => p.onlinePlayers ?? 0),
                  },
                  {
                    type: 'line',
                    name: '延迟(ms)',
                    smooth: true,
                    showSymbol: false,
                    data: props.history
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
              class="flex h-full items-center justify-center text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              <template v-if="props.historyLoading">
                <UIcon
                  name="i-lucide-loader-2"
                  class="inline-block h-4 w-4 animate-spin"
                />
              </template>
              <template v-else>暂无历史数据</template>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </UModal>
</template>
