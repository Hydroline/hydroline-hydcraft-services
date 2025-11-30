<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import type { AdminUserDetail } from '@/types/admin'
import { playerStatusOptions, type PlayerStatus } from '@/constants/status'

const props = defineProps<{
  open: boolean
  detail: AdminUserDetail | null
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'saved'): void
}>()

const open = toRef(props, 'open')
const auth = useAuthStore()
const toast = useToast()
const statusSelection = ref<PlayerStatus | null>(null)
const statusReason = ref('')
const statusSubmitting = ref(false)
const statusOptionMap = new Map<
  PlayerStatus,
  (typeof playerStatusOptions)[number]
>()
for (const option of playerStatusOptions) {
  statusOptionMap.set(option.value, option)
}

const currentStatusOption = computed(() => {
  const status = props.detail?.statusSnapshot?.status as
    | PlayerStatus
    | undefined
  if (!status) return null
  return statusOptionMap.get(status) ?? null
})

const selectedStatusOption = computed(() => {
  if (!statusSelection.value) return null
  return statusOptionMap.get(statusSelection.value) ?? null
})

watch(
  open,
  (value) => {
    if (value) {
      statusSelection.value =
        ((props.detail?.statusSnapshot?.status ??
          null) as PlayerStatus | null) ?? 'ACTIVE'
      statusReason.value = ''
    } else {
      statusSelection.value = null
      statusReason.value = ''
      statusSubmitting.value = false
    }
  },
  { immediate: true },
)

function closeDialog() {
  emit('update:open', false)
}

async function submitStatusChange() {
  if (!auth.token || !props.detail) return
  const status = statusSelection.value
  if (!status) {
    toast.add({ title: '请选择目标状态', color: 'warning' })
    return
  }
  const reasonDetail = statusReason.value.trim()
  statusSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${props.detail.id}/status`, {
      method: 'PATCH',
      token: auth.token,
      body: {
        status,
        reasonDetail: reasonDetail || undefined,
      },
    })
    toast.add({ title: '状态已更新', color: 'primary' })
    emit('saved')
    closeDialog()
  } catch (error) {
    console.warn('[admin] update user status failed', error)
    toast.add({ title: '状态更新失败', color: 'error' })
  } finally {
    statusSubmitting.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    @update:open="$emit('update:open', $event)"
    :ui="{
      content: 'w-full max-w-lg w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">调整用户状态</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>
        <div
          v-if="props.detail?.statusSnapshot"
          class="rounded-lg border border-slate-200/70 bg-slate-50/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-400"
        >
          <p class="text-[11px] font-semibold uppercase tracking-wide">
            当前状态
          </p>
          <p class="text-base font-semibold text-slate-900 dark:text-white">
            {{
              currentStatusOption?.label ?? props.detail?.statusSnapshot?.status
            }}
          </p>
          <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {{
              props.detail?.statusSnapshot?.event?.reasonDetail ||
              props.detail?.statusSnapshot?.event?.reasonCode ||
              '暂无备注'
            }}
          </p>
        </div>
        <div class="space-y-2">
          <label
            class="block text-xs font-semibold text-slate-600 dark:text-slate-300"
            >目标状态</label
          >
          <USelect
            class="w-full"
            v-model="statusSelection"
            :items="playerStatusOptions"
            label-key="label"
            value-key="value"
            :disabled="statusSubmitting || !props.detail"
          />
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            {{ selectedStatusOption?.description ?? '请选择要切换到的状态。' }}
          </p>
        </div>
        <div class="space-y-2">
          <label
            class="block text-xs font-semibold text-slate-600 dark:text-slate-300"
            >备注</label
          >
          <UTextarea
            class="w-full"
            v-model="statusReason"
            :rows="4"
            maxlength="512"
            :disabled="statusSubmitting || !props.detail"
            placeholder="记录调整原因以便后续审计"
          />
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            将写入生命周期事件，可留空，最长 512 字。
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="statusSubmitting"
            @click="closeDialog"
          >
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="statusSubmitting"
            :disabled="statusSubmitting || !props.detail || !statusSelection"
            @click="submitStatusChange"
          >
            保存
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
