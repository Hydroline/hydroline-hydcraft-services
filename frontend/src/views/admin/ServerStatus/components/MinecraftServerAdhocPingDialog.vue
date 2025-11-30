<script setup lang="ts">
import type {
  MinecraftPingResult,
  MinecraftServerEdition,
} from '@/types/minecraft'

interface EditionOption {
  label: string
  value: string
}

interface AdhocFormModel {
  host: string
  port: number | undefined
  edition: MinecraftServerEdition
}

const props = defineProps<{
  open: boolean
  adhocForm: AdhocFormModel
  adhocResult: MinecraftPingResult | null
  adhocLoading: boolean
  editionOptions: EditionOption[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'submit'): void
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
          <div class="flex items-center justify-between">
            <span class="text-sm text-slate-600 dark:text-slate-300"
              >临时 Ping 工具</span
            >
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-refresh-ccw"
              :loading="props.adhocLoading"
              @click="emit('submit')"
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
                v-model="props.adhocForm.host"
                placeholder="play.example.com"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-500 dark:text-slate-400"
                >端口 (可选)</label
              >
              <UInput
                v-model.number="props.adhocForm.port"
                type="number"
                placeholder="留空自动/SRV"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-500 dark:text-slate-400"
                >版本</label
              >
              <USelect
                v-model="props.adhocForm.edition"
                :items="props.editionOptions"
                value-key="value"
                label-key="label"
              />
            </div>
          </div>
          <div
            v-if="props.adhocResult"
            class="rounded-xl border border-slate-200/60 bg-slate-50/70 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium"
                >结果:
                {{
                  props.adhocResult.edition === 'BEDROCK'
                    ? props.adhocResult.response.version
                    : props.adhocResult.response.version?.name
                }}</span
              >
              <UBadge variant="soft" color="neutral">
                {{
                  props.adhocResult.edition === 'BEDROCK' ? '基岩版' : 'Java 版'
                }}
              </UBadge>
            </div>
            <div class="mt-2 grid grid-cols-3 gap-2">
              <div>
                <p class="text-slate-500 dark:text-slate-400">玩家</p>
                <p class="font-semibold">
                  {{ props.adhocResult.response.players?.online ?? 0 }} /
                  {{ props.adhocResult.response.players?.max ?? 0 }}
                </p>
              </div>
              <div>
                <p class="text-slate-500 dark:text-slate-400">延迟</p>
                <p class="font-semibold">
                  {{ props.adhocResult.response.latency ?? '—' }} ms
                </p>
              </div>
              <div class="col-span-1">
                <p class="text-slate-500 dark:text-slate-400">MOTD</p>
                <p class="line-clamp-3 break-all">
                  {{
                    props.adhocResult.edition === 'BEDROCK'
                      ? props.adhocResult.response.motd
                      : props.adhocResult.response.description
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
