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
const identifier = ref('')
const setPrimary = ref(true)
const submitting = ref(false)

watch(open, (value) => {
  if (value) {
    identifier.value = ''
    setPrimary.value = true
  } else {
    submitting.value = false
  }
})

function closeDialog() {
  emit('update:open', false)
}

async function submitCreateBinding() {
  if (!auth.token || !props.detail) return
  const trimmed = identifier.value.trim()
  if (!trimmed) {
    toast.add({ title: '请输入要绑定的 AuthMe 标识', color: 'warning' })
    return
  }
  submitting.value = true
  try {
    await apiFetch(`/auth/users/${props.detail.id}/bindings`, {
      method: 'POST',
      token: auth.token,
      body: { identifier: trimmed, setPrimary: setPrimary.value },
    })
    toast.add({ title: '绑定成功', color: 'primary' })
    emit('saved')
    closeDialog()
  } catch (error) {
    console.warn('[admin] create binding failed', error)
    toast.add({ title: '绑定失败', color: 'error' })
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
          <h3 class="text-lg font-semibold">新增 AuthMe 绑定</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          输入 AuthMe 用户名或 Realname 进行绑定，若已存在将更新信息；
          可选择设为当前用户主绑定。
        </p>
        <div class="space-y-1">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >标识</label
          >
          <UInput
            v-model="identifier"
            placeholder="AuthMe 用户名或 Realname"
            :disabled="submitting"
          />
        </div>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <input
            type="checkbox"
            v-model="setPrimary"
            :disabled="submitting"
            class="h-4 w-4"
          />
          <span>设为主绑定</span>
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
            @click="submitCreateBinding"
          >
            绑定
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
