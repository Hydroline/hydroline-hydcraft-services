<script setup lang="ts">
import dayjs from 'dayjs'
import type {
  BeaconConnectionStatusResponse,
  BeaconStatusResponse,
  MinecraftServer,
} from '@/types/minecraft'

const props = defineProps<{
  open: boolean
  server: MinecraftServer | null
  connectionDetail: BeaconConnectionStatusResponse | null
  statusDetail: BeaconStatusResponse | null
  connLoading: boolean
  statusLoading: boolean
  checkLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'edit'): void
  (e: 'manual-connect'): void
  (e: 'disconnect'): void
  (e: 'reconnect'): void
  (e: 'check-connectivity'): void
  (e: 'refresh-conn'): void
}>()
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="emit('update:open', $event)"
    :ui="{ content: 'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' }"
  >
    <template #content>
      <UCard>
        <template #header>
          <div class="flex flex-col gap-3">
            <div class="flex justify-between">
              <div>
                <div
                  class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  Beacon 连接
                </div>
                <div
                  class="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  {{ props.server?.displayName || '未选择' }}
                </div>
              </div>

              <div>
                <UButton
                  variant="ghost"
                  @click="emit('update:open', false)"
                  icon="i-lucide-x"
                />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <UButton
                class="flex justify-center items-center"
                size="sm"
                variant="soft"
                icon="i-lucide-pencil"
                :disabled="!props.server"
                @click="emit('edit')"
                >编辑</UButton
              >
              <UButton
                class="flex justify-center items-center"
                size="sm"
                variant="soft"
                icon="i-lucide-cable"
                :loading="props.connLoading"
                :disabled="!props.server?.id"
                @click="emit('manual-connect')"
                >手动连接</UButton
              >
              <UButton
                class="flex justify-center items-center"
                size="sm"
                variant="soft"
                color="warning"
                icon="i-lucide-plug"
                :loading="props.connLoading"
                :disabled="!props.server?.id"
                @click="emit('disconnect')"
                >断开</UButton
              >
              <UButton
                class="flex justify-center items-center"
                size="sm"
                variant="soft"
                color="primary"
                icon="i-lucide-rotate-ccw"
                :loading="props.connLoading"
                :disabled="!props.server?.id"
                @click="emit('reconnect')"
                >重连</UButton
              >
              <UButton
                class="flex justify-center items-center"
                size="sm"
                variant="soft"
                icon="i-lucide-activity"
                :loading="props.checkLoading"
                :disabled="!props.server?.id"
                @click="emit('check-connectivity')"
                >检查连通性</UButton
              >
              <UButton
                class="flex justify-center items-center"
                size="sm"
                variant="soft"
                icon="i-lucide-refresh-cw"
                :loading="props.connLoading"
                :disabled="!props.server?.id"
                @click="emit('refresh-conn')"
                >刷新</UButton
              >
            </div>
          </div>
        </template>
        <div class="space-y-3 text-sm">
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <p
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                Endpoint
              </p>
              <p
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{
                  props.connectionDetail?.config?.endpoint ||
                  props.connectionDetail?.connection?.endpoint ||
                  '—'
                }}
              </p>
            </div>
            <div>
              <p
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                状态
              </p>
              <div class="flex items-center gap-2">
                <UBadge
                  variant="soft"
                  :color="
                    props.connectionDetail?.connection?.connected
                      ? 'success'
                      : props.connectionDetail?.connection?.connecting
                        ? 'primary'
                        : props.connectionDetail?.connection?.lastError
                          ? 'error'
                          : 'neutral'
                  "
                >
                  {{
                    props.connectionDetail?.connection?.connected
                      ? '在线'
                      : props.connectionDetail?.connection?.connecting
                        ? '连接中'
                        : props.connectionDetail?.connection?.lastError
                          ? '错误'
                          : '离线'
                  }}
                </UBadge>
                <span
                  class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
                >
                  重试
                  {{
                    props.connectionDetail?.connection?.reconnectAttempts ?? 0
                  }}
                  次
                </span>
                <UBadge
                  v-if="
                    (props.connectionDetail?.connection?.reconnectAttempts ??
                      0) >= 10 &&
                    !props.connectionDetail?.connection?.connected &&
                    !props.connectionDetail?.connection?.connecting
                  "
                  size="xs"
                  variant="soft"
                  color="warning"
                >
                  已停止重试
                </UBadge>
              </div>
            </div>
            <div>
              <p
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                最后连接时间
              </p>
              <p
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{
                  props.connectionDetail?.connection?.lastConnectedAt
                    ? dayjs(
                        props.connectionDetail?.connection?.lastConnectedAt,
                      ).format('YYYY-MM-DD HH:mm:ss')
                    : '—'
                }}
              </p>
            </div>
            <div>
              <p
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                最近错误
              </p>
              <p
                class="text-base font-semibold text-slate-800 dark:text-slate-300 break-all"
              >
                {{ props.connectionDetail?.connection?.lastError || '—' }}
              </p>
            </div>
            <div>
              <p
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                启用 / 已配置
              </p>
              <p
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ props.connectionDetail?.config?.enabled ? '启用' : '禁用' }}
                /
                {{ props.connectionDetail?.config?.configured ? '是' : '否' }}
              </p>
            </div>
            <div>
              <p
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                超时 / 最大重试
              </p>
              <p
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ props.connectionDetail?.config?.timeoutMs ?? '默认' }} /
                {{ props.connectionDetail?.config?.maxRetry ?? '默认' }}
              </p>
            </div>
          </div>

          <div
            v-if="!props.connectionDetail"
            class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
          >
            {{ props.connLoading ? '加载连接信息中...' : '暂无连接信息' }}
          </div>

          <div
            class="mt-2 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/40"
          >
            <div class="mb-2 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UBadge
                  v-if="props.statusDetail?.fromCache"
                  size="xs"
                  variant="soft"
                  color="warning"
                  >缓存</UBadge
                >
              </div>
            </div>
            <div
              v-if="props.statusLoading"
              class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
            >
              加载状态中...
            </div>
            <div
              v-else-if="!props.statusDetail"
              class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
            >
              暂无状态数据
            </div>
            <div v-else class="grid gap-3 md:grid-cols-3 text-sm">
              <div>
                <p
                  class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
                >
                  在线玩家
                </p>
                <p class="font-semibold text-slate-900 dark:text-white">
                  {{ props.statusDetail.status.online_player_count ?? 0 }} /
                  {{ props.statusDetail.status.server_max_players ?? 0 }}
                </p>
              </div>
              <div>
                <p
                  class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
                >
                  MTR 日志总数
                </p>
                <p class="font-semibold text-slate-900 dark:text-white">
                  {{ props.statusDetail.status.mtr_logs_total ?? 0 }}
                </p>
              </div>
              <div>
                <p
                  class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
                >
                  统计条目
                </p>
                <p class="font-semibold text-slate-900 dark:text-white">
                  {{ props.statusDetail.status.stats_total ?? 0 }}
                </p>
              </div>
              <div>
                <p
                  class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
                >
                  成就条目
                </p>
                <p class="font-semibold text-slate-900 dark:text-white">
                  {{ props.statusDetail.status.advancements_total ?? 0 }}
                </p>
              </div>
              <div>
                <p
                  class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
                >
                  扫描周期
                </p>
                <p class="font-semibold text-slate-900 dark:text-white">
                  {{
                    props.statusDetail.status.interval_time_seconds ??
                    props.statusDetail.status.interval_time_ticks ??
                    '—'
                  }}
                </p>
              </div>
              <div>
                <p
                  class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
                >
                  最后心跳时间
                </p>
                <p class="font-semibold text-slate-900 dark:text-white">
                  {{
                    dayjs(props.statusDetail.lastHeartbeatAt).format(
                      'YYYY-MM-DD HH:mm:ss',
                    )
                  }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </UModal>
</template>
