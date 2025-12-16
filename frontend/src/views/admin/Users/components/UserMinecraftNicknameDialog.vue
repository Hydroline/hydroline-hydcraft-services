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
const nickname = ref('')
const isPrimary = ref(false)
const submitting = ref(false)

watch(open, (value) => {
  if (value) {
    nickname.value = ''
    isPrimary.value = false
  } else {
    submitting.value = false
  }
})

function closeDialog() {
  emit('update:open', false)
}

async function submitMinecraftProfile() {
  if (!auth.token || !props.detail) return
  const value = nickname.value.trim()
  if (!value) {
    toast.add({ title: '请输入昵称', color: 'warning' })
    return
  }
  submitting.value = true
  try {
    await apiFetch(`/auth/users/${props.detail.id}/minecraft-profiles`, {
      method: 'POST',
      token: auth.token,
      body: { nickname: value, isPrimary: isPrimary.value },
    })
    toast.add({ title: '已添加昵称', color: 'primary' })
    emit('saved')
    closeDialog()
  } catch (error) {
    console.warn('[admin] add minecraft profile failed', error)
    toast.add({ title: '添加失败', color: 'error' })
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
          <h3 class="text-lg font-semibold">添加 Minecraft 昵称</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>
        <div class="space-y-1">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >昵称</label
          >
          <UInput
            v-model="nickname"
            placeholder="输入昵称"
            :disabled="submitting"
          />
        </div>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <input
            type="checkbox"
            v-model="isPrimary"
            :disabled="submitting"
            class="h-4 w-4"
          />
          <span>设为主昵称</span>
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="submitting"
            @click="closeDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="submitting"
            @click="submitMinecraftProfile"
          >
            保存
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
