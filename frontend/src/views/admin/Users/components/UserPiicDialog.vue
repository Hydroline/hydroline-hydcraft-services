<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type { AdminUserDetail } from '@/types/admin'

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
const submitting = ref(false)

watch(open, (value) => {
  if (!value) {
    submitting.value = false
  }
})

function closeDialog() {
  emit('update:open', false)
}

async function confirmPiicRegeneration() {
  if (!auth.token || !props.detail) return
  submitting.value = true
  try {
    await apiFetch(`/auth/users/${props.detail.id}/piic/regenerate`, {
      method: 'POST',
      token: auth.token,
    })
    toast.add({ title: 'PIIC 已重新生成', color: 'primary' })
    emit('saved')
    closeDialog()
  } catch (error) {
    console.warn('[admin] regenerate piic failed', error)
    toast.add({ title: 'PIIC 生成失败', color: 'error' })
  } finally {
    submitting.value = false
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
      <div class="space-y-4 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">重新生成 PIIC</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          将为用户重新生成 PIIC 编号，历史编号会作废。
        </p>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="submitting"
            @click="confirmPiicRegeneration"
          >
            确认重新生成
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
