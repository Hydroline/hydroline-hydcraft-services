<script setup lang="ts">
import VChart from 'vue-echarts'
import type {
  MinecraftPingHistoryItem,
  MinecraftServerEdition,
} from '@/types/minecraft'

interface EditionOption {
  label: string
  value: string
}

interface FormModel {
  displayName: string
  internalCodeCn: string
  internalCodeEn: string
  host: string
  port: number | undefined
  edition: MinecraftServerEdition
  description: string
  isActive: boolean
  displayOrder: number
  mcsmPanelUrl: string
  mcsmDaemonId: string
  mcsmInstanceUuid: string
  mcsmApiKey: string
  mcsmRequestTimeoutMs: number | undefined
  beaconHost: string
  beaconPort: number | undefined
  beaconKey: string
  beaconEnabled: boolean
  beaconRequestTimeoutMs: number | undefined
  beaconMaxRetry: number | undefined
}

const props = defineProps<{
  open: boolean
  dialogTitle: string
  form: FormModel
  editionOptions: EditionOption[]
  historyDays: number
  history: MinecraftPingHistoryItem[]
  historyLoading: boolean
  saving: boolean
  formatChartLabel: (value: string | number | Date) => string
  isEditing: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save'): void
}>()
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="emit('update:open', $event)"
    :ui="{ content: 'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' }"
  >
    <template #content>
      <div class="max-h-[80vh] overflow-y-auto">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ props.dialogTitle }}
              </h3>

              <div>
                <UCheckbox
                  id="isActive"
                  v-model="props.form.isActive"
                  label="启用"
                />
              </div>
            </div>
          </template>

          <!-- 基本信息表单 -->
          <div class="grid gap-4 md:grid-cols-2">
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label
                for="displayName"
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >显示名称<span class="text-red-500">*</span></label
              >
              <UInput
                id="displayName"
                v-model="props.form.displayName"
                placeholder="示例：七周目"
              />
            </div>
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label
                for="internalCodeCn"
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >中文内部代号<span class="text-red-500">*</span></label
              >
              <UInput
                id="internalCodeCn"
                v-model="props.form.internalCodeCn"
                placeholder="示例：氮"
              />
            </div>
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label
                for="internalCodeEn"
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >英文内部代号<span class="text-red-500">*</span></label
              >
              <UInput
                id="internalCodeEn"
                v-model="props.form.internalCodeEn"
                placeholder="示例：Nitrogen"
              />
            </div>
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label
                for="edition"
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >版本</label
              >
              <USelect
                id="edition"
                v-model="props.form.edition"
                :items="props.editionOptions"
                value-key="value"
                label-key="label"
              />
            </div>
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label
                for="host"
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >服务器 Host<span class="text-red-500">*</span></label
              >
              <UInput
                id="host"
                v-model="props.form.host"
                placeholder="mc.hydroline.example"
              />
            </div>
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label
                for="port"
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >端口</label
              >
              <UInput
                id="port"
                v-model.number="props.form.port"
                type="number"
                min="1"
                max="65535"
                placeholder="留空=自动（默认或 SRV）"
              />
            </div>
            <div
              class="grid grid-cols-[7rem,1fr] items-start gap-2 md:col-span-2"
            >
              <label
                for="description"
                class="mt-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >描述</label
              >
              <UTextarea
                id="description"
                v-model="props.form.description"
                placeholder="用于后台备注信息"
              />
            </div>
            <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
              <label
                for="displayOrder"
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >显示顺序</label
              >
              <UInput
                id="displayOrder"
                v-model.number="props.form.displayOrder"
                type="number"
              />
            </div>

            <!-- MCSM -->
            <div class="md:col-span-2">
              <div class="mt-4 mb-2 flex items-center gap-2">
                <span
                  class="text-base font-semibold text-slate-900 dark:text-white"
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
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >面板地址</label
                  >
                  <UInput
                    id="mcsmPanelUrl"
                    v-model="props.form.mcsmPanelUrl"
                    placeholder="http://panel.hydcraft.cn/"
                  />
                </div>
                <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                  <label
                    for="mcsmDaemonId"
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >Daemon ID</label
                  >
                  <UInput
                    id="mcsmDaemonId"
                    v-model="props.form.mcsmDaemonId"
                    placeholder="daemons-xxxx"
                  />
                </div>
                <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                  <label
                    for="mcsmInstanceUuid"
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >Instance UUID</label
                  >
                  <UInput
                    id="mcsmInstanceUuid"
                    v-model="props.form.mcsmInstanceUuid"
                    placeholder="50c7..."
                  />
                </div>
                <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                  <label
                    for="mcsmApiKey"
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >API Key</label
                  >
                  <UInput
                    id="mcsmApiKey"
                    v-model="props.form.mcsmApiKey"
                    type="password"
                    placeholder="输入以更新，留空保持不变"
                  />
                </div>
                <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                  <label
                    for="mcsmRequestTimeoutMs"
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >超时 (ms)</label
                  >
                  <UInput
                    id="mcsmRequestTimeoutMs"
                    v-model.number="props.form.mcsmRequestTimeoutMs"
                    type="number"
                    min="1000"
                    placeholder="默认 10000"
                  />
                </div>
              </div>
            </div>

            <!-- Beacon -->
            <div class="mt-4 md:col-span-2">
              <div class="mb-2 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span
                    class="text-base font-semibold text-slate-900 dark:text-white"
                  >
                    Beacon 插件配置
                  </span>

                  <UTooltip
                    text="仅保存 Host/端口与 Key；Key 不会回显，留空则不更新"
                  >
                    <UIcon
                      name="i-lucide-info"
                      class="h-4 w-4 text-slate-400 dark:text-slate-500"
                    />
                  </UTooltip>
                </div>

                <div>
                  <UCheckbox
                    id="beaconEnabled"
                    v-model="props.form.beaconEnabled"
                    label="启用"
                  />
                </div>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                  <label
                    for="beaconHost"
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >Host</label
                  >
                  <UInput
                    id="beaconHost"
                    v-model="props.form.beaconHost"
                    placeholder="127.0.0.1 或 beacon.example"
                  />
                </div>
                <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                  <label
                    for="beaconPort"
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >端口</label
                  >
                  <UInput
                    id="beaconPort"
                    v-model.number="props.form.beaconPort"
                    type="number"
                    min="1"
                    max="65535"
                    placeholder="必填，例如 1145"
                  />
                </div>
                <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                  <label
                    for="beaconKey"
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >Key</label
                  >
                  <UInput
                    id="beaconKey"
                    v-model="props.form.beaconKey"
                    type="password"
                    placeholder="输入以更新，留空保持不变"
                  />
                </div>
                <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                  <label
                    for="beaconRequestTimeoutMs"
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >超时 (ms)</label
                  >
                  <UInput
                    id="beaconRequestTimeoutMs"
                    v-model.number="props.form.beaconRequestTimeoutMs"
                    type="number"
                    min="1000"
                    placeholder="默认 10000"
                  />
                </div>
                <div class="grid grid-cols-[7rem,1fr] items-center gap-2">
                  <label
                    for="beaconMaxRetry"
                    class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >最大重试</label
                  >
                  <UInput
                    id="beaconMaxRetry"
                    v-model.number="props.form.beaconMaxRetry"
                    type="number"
                    min="0"
                    placeholder="默认 3"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 历史图表 -->
          <div class="mt-8">
            <p
              class="mb-2 text-base font-semibold text-slate-900 dark:text-white"
            >
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
                class="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400"
              >
                {{ props.historyLoading ? '加载中...' : '暂无历史数据' }}
              </div>
            </div>
          </div>

          <div class="mt-1 flex flex-col gap-3">
            <div class="text-xs text-slate-500 dark:text-slate-400">
              保存后会自动刷新服务端状态。
            </div>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="emit('update:open', false)"
                >取消</UButton
              >
              <UButton
                color="primary"
                :loading="props.saving"
                @click="emit('save')"
              >
                {{ props.isEditing ? '保存修改' : '创建' }}
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UModal>
</template>
