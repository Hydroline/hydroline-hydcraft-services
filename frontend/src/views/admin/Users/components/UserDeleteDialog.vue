<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import { useAdminUsersStore } from '@/stores/adminUsers'

const props = defineProps<{
  open: boolean
  detail: {
    id: string
    profile?: { displayName?: string }
    email?: string
  } | null
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'deleted'): void
}>()

const open = toRef(props, 'open')
const usersStore = useAdminUsersStore()
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

async function confirmDeleteUser() {
  if (!props.detail) return
  submitting.value = true
  try {
    await usersStore.delete(props.detail.id)
    toast.add({ title: '用户已删除', color: 'primary' })
    emit('deleted')
    closeDialog()
  } catch (error) {
    console.warn('[admin] delete user failed', error)
    toast.add({ title: '删除失败', color: 'error' })
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
      content:
        'w-full max-w-md z-[1101] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      overlay: 'z-[1100]',
    }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            确认删除用户
          </h3>
        </div>
        <div
          class="rounded-lg bg-slate-50/70 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
        >
          {{
            props.detail?.profile?.displayName ??
            props.detail?.email ??
            props.detail?.id
          }}
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeDialog">
            取消
          </UButton>
          <UButton
            color="error"
            :loading="submitting"
            @click="confirmDeleteUser"
          >
            确认删除
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
