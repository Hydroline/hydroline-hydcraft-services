<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import { useAdminUsersStore } from '@/stores/admin/users'

const props = defineProps<{
  open: boolean
  detail: { id: string } | null
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (
    event: 'result',
    payload: {
      temporaryPassword: string | null
      message: string
    },
  ): void
}>()

const open = toRef(props, 'open')
const usersStore = useAdminUsersStore()
const toast = useToast()
const passwordMode = ref<'temporary' | 'custom'>('temporary')
const customPassword = ref('')
const showCustomPassword = ref(false)
const submitting = ref(false)

watch(open, (value) => {
  if (!value) {
    passwordMode.value = 'temporary'
    customPassword.value = ''
    showCustomPassword.value = false
    submitting.value = false
  }
})

function closeDialog() {
  emit('update:open', false)
}

async function confirmResetPassword() {
  if (!props.detail) return
  if (passwordMode.value === 'custom' && !customPassword.value.trim()) {
    toast.add({ title: '请填写要设置的密码', color: 'warning' })
    return
  }
  submitting.value = true
  try {
    const result = await usersStore.resetPassword(
      props.detail.id,
      passwordMode.value === 'custom' ? customPassword.value : undefined,
    )
    const payload = {
      temporaryPassword: result.temporaryPassword,
      message: result.temporaryPassword
        ? '已生成临时密码，请尽快通知用户并提示修改。'
        : '密码已重置，请尽快通知用户修改。',
    }
    toast.add({ title: '密码已重置', color: 'primary' })
    emit('result', payload)
    closeDialog()
  } catch (error) {
    console.warn('[admin] reset password failed', error)
    toast.add({ title: '密码重置失败', color: 'error' })
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
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">重置密码</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          请选择重置方式，可以生成临时密码或直接指定新密码。
        </p>
        <div class="space-y-3">
          <label
            class="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600"
          >
            <input
              v-model="passwordMode"
              class="mt-1 h-4 w-4"
              type="radio"
              value="temporary"
            />
            <div class="space-y-1">
              <p class="text-sm font-medium text-slate-900 dark:text-white">
                生成临时密码
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                系统将自动生成随机密码并显示给你，用户首次登录需修改。
              </p>
            </div>
          </label>

          <label
            class="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600"
          >
            <input
              v-model="passwordMode"
              class="mt-1 h-4 w-4"
              type="radio"
              value="custom"
            />
            <div class="flex-1 space-y-2">
              <div>
                <p class="text-sm font-medium text-slate-900 dark:text-white">
                  指定新密码
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  管理员自定义密码，系统不会额外生成临时密码。
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UInput
                  v-model="customPassword"
                  :disabled="passwordMode !== 'custom'"
                  :type="showCustomPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="输入要设置的新密码"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="passwordMode !== 'custom'"
                  @click="showCustomPassword = !showCustomPassword"
                >
                  <span v-if="showCustomPassword">隐藏</span>
                  <span v-else>显示</span>
                </UButton>
              </div>
            </div>
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeDialog">
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="submitting"
            @click="confirmResetPassword"
          >
            确认重置
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
