<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/user/auth'
import { useFeatureStore } from '@/stores/shared/feature'
import CodeSendDialog from '@/components/dialogs/CodeSendDialog.vue'
import ProfileEmailContactsSection from './components/sections/ProfileEmailContactsSection.vue'
import ProfilePhoneContactsSection from './components/sections/ProfilePhoneContactsSection.vue'
import ProfileOAuthBindingsSection from './components/sections/ProfileOAuthBindingsSection.vue'
import { ApiError } from '@/utils/http/api'

const auth = useAuthStore()
const feature = useFeatureStore()
const toast = useToast()

const resetForm = reactive({ email: '', code: '', password: '' })
const resetStep = ref<'INPUT' | 'CODE' | 'DONE'>('INPUT')
const sendingReset = ref(false)
const resetError = ref('')
const codeDialogOpen = ref(false)
const resetDialogOpen = ref(false)

const passwordResetEnabled = computed(() => feature.passwordResetEnabled)

function prefillResetEmail() {
  const raw = (auth.user as { email?: string } | null)?.email
  if (typeof raw === 'string' && raw.length > 0) {
    resetForm.email = raw
  }
}

function openResetDialog() {
  prefillResetEmail()
  resetDialogOpen.value = true
  resetStep.value = 'INPUT'
  resetForm.code = ''
  resetForm.password = ''
  resetError.value = ''
  codeDialogOpen.value = false
  sendingReset.value = false
}

function updateResetDialog(value: boolean) {
  resetDialogOpen.value = value
  if (!value) {
    resetStep.value = 'INPUT'
    resetForm.code = ''
    resetForm.password = ''
    resetError.value = ''
    codeDialogOpen.value = false
    sendingReset.value = false
    prefillResetEmail()
  }
}

async function requestPasswordCode() {
  const email = resetForm.email.trim()
  if (!email) {
    resetError.value = '请输入邮箱地址'
    toast.add({
      title: '发送失败',
      description: resetError.value,
      color: 'error',
    })
    return
  }
  sendingReset.value = true
  resetError.value = ''
  try {
    await auth.requestPasswordResetCode(email)
    resetStep.value = 'CODE'
    codeDialogOpen.value = true
    toast.add({
      title: '验证码已发送',
      color: 'success',
    })
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '发送失败'
    resetError.value = message
    toast.add({
      title: '发送失败',
      description: message,
      color: 'error',
    })
  } finally {
    sendingReset.value = false
  }
}

async function resendPasswordCode() {
  const email = resetForm.email.trim()
  if (!email) {
    resetError.value = '请输入邮箱地址'
    toast.add({
      title: '发送失败',
      description: resetError.value,
      color: 'error',
    })
    return
  }
  sendingReset.value = true
  resetError.value = ''
  try {
    await auth.requestPasswordResetCode(email)
    resetStep.value = 'CODE'
    codeDialogOpen.value = true
    toast.add({
      title: '验证码已重新发送',
      color: 'success',
    })
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '发送失败'
    resetError.value = message
    toast.add({
      title: '发送失败',
      description: message,
      color: 'error',
    })
  } finally {
    sendingReset.value = false
  }
}

async function confirmPasswordReset() {
  const email = resetForm.email.trim()
  const code = resetForm.code.trim()
  const password = resetForm.password
  if (!email || !code || !password) {
    resetError.value = '请填写完整信息'
    toast.add({
      title: '提交失败',
      description: resetError.value,
      color: 'error',
    })
    return
  }
  sendingReset.value = true
  resetError.value = ''
  try {
    await auth.confirmPasswordReset({ email, code, password })
    resetStep.value = 'DONE'
    codeDialogOpen.value = false
    toast.add({
      title: '密码已重置',
      color: 'success',
    })
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '重置失败'
    resetError.value = message
    toast.add({
      title: '重置失败',
      description: message,
      color: 'error',
    })
  } finally {
    sendingReset.value = false
  }
}

onMounted(() => {
  prefillResetEmail()
})
</script>

<template>
  <div class="space-y-8">
    <ProfileEmailContactsSection />
    <ProfilePhoneContactsSection />
    <ProfileOAuthBindingsSection />

    <section v-if="passwordResetEnabled" class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3 px-1">
        <UButton
          class="text-lg p-0"
          variant="link"
          color="error"
          @click="openResetDialog"
        >
          重置密码
        </UButton>
      </div>

      <UModal
        :open="resetDialogOpen"
        @update:open="updateResetDialog"
        :ui="{
          content:
            'w-full max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
        }"
      >
        <template #content>
          <div class="space-y-5 p-6">
            <div class="flex items-center justify-between">
              <div>
                <h3
                  class="text-base font-semibold text-slate-900 dark:text-white"
                >
                  重置密码
                </h3>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="updateResetDialog(false)"
              />
            </div>

            <div class="space-y-3 text-sm">
              <template v-if="resetStep === 'INPUT'">
                <label
                  class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  <span>账户邮箱或辅助邮箱</span>
                  <UInput
                    class="w-full"
                    v-model="resetForm.email"
                    placeholder="请输入邮箱"
                    type="email"
                  />
                </label>

                <div class="flex justify-end">
                  <UButton
                    :loading="sendingReset"
                    color="primary"
                    @click="requestPasswordCode"
                  >
                    发送验证码
                  </UButton>
                </div>
              </template>

              <template v-else-if="resetStep === 'CODE'">
                <div class="grid gap-3">
                  <UInput
                    v-model="resetForm.code"
                    placeholder="请输入收到的验证码"
                  />
                  <UInput
                    v-model="resetForm.password"
                    type="password"
                    placeholder="设置新密码"
                  />
                  <div class="flex gap-2">
                    <UButton
                      :loading="sendingReset"
                      color="primary"
                      class="flex-1"
                      @click="confirmPasswordReset"
                    >
                      确认重置
                    </UButton>
                    <UButton
                      class="flex-1"
                      variant="ghost"
                      @click="resendPasswordCode"
                    >
                      重新发送
                    </UButton>
                  </div>
                </div>
              </template>

              <template v-else>
                <div
                  class="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                >
                  <UIcon name="i-lucide-check" class="h-5 w-5" />
                  密码已重置，请使用新密码登录。
                </div>
                <UButton
                  color="primary"
                  class="w-full"
                  @click="updateResetDialog(false)"
                >
                  关闭
                </UButton>
              </template>

              <p v-if="resetError" class="text-xs text-red-500">
                {{ resetError }}
              </p>
            </div>
          </div>
        </template>
      </UModal>

      <CodeSendDialog
        v-model:open="codeDialogOpen"
        :target="resetForm.email"
        :countdown="60"
        title="验证码已发送"
        description="我们已发送密码重置验证码至："
        @resend="resendPasswordCode"
      />
    </section>
  </div>
</template>
