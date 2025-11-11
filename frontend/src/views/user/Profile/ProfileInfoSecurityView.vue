<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'
import CodeSendDialog from '@/components/dialogs/CodeSendDialog.vue'
import { ApiError } from '@/utils/api'

const auth = useAuthStore()
const feature = useFeatureStore()

// Password reset flow (public endpoints, but we allow triggering while logged in for convenience)
const resetForm = reactive({ email: '', code: '', password: '' })
const resetStep = ref<'INPUT' | 'CODE' | 'DONE'>('INPUT')
const sendingReset = ref(false)
const resetError = ref('')
const codeDialogOpen = ref(false)
const resetDialogOpen = ref(false)

function prefillResetEmail() {
  const raw = (auth.user as { email?: unknown } | null)?.email
  if (typeof raw === 'string' && raw.length > 0) {
    resetForm.email = raw
  }
}

function openResetDialog() {
  prefillResetEmail()
  resetError.value = ''
  resetStep.value = 'INPUT'
  resetForm.code = ''
  resetForm.password = ''
  resetDialogOpen.value = true
}

function updateResetDialog(value: boolean) {
  resetDialogOpen.value = value
  if (!value) {
    resetError.value = ''
    resetStep.value = 'INPUT'
    resetForm.code = ''
    resetForm.password = ''
    sendingReset.value = false
  }
}

async function requestPasswordCode() {
  resetError.value = ''
  const email = resetForm.email.trim()
  if (!email) {
    resetError.value = '请输入邮箱地址'
    return
  }
  sendingReset.value = true
  try {
    await auth.requestPasswordResetCode(email)
    codeDialogOpen.value = true
    resetStep.value = 'CODE'
  } catch (error) {
    resetError.value =
      error instanceof ApiError ? error.message : '发送失败，请稍后重试'
  } finally {
    sendingReset.value = false
  }
}

async function confirmPasswordReset() {
  resetError.value = ''
  const email = resetForm.email.trim()
  const code = resetForm.code.trim()
  const password = resetForm.password
  if (!email || !code || !password) {
    resetError.value = '请填写完整信息'
    return
  }
  sendingReset.value = true
  try {
    await auth.confirmPasswordReset({ email, code, password })
    resetStep.value = 'DONE'
  } catch (error) {
    resetError.value =
      error instanceof ApiError ? error.message : '重置失败，请稍后再试'
  } finally {
    sendingReset.value = false
  }
}

function resendPasswordCode() {
  const email = resetForm.email.trim()
  if (!email) return
  return auth.requestPasswordResetCode(email)
}

// Email contacts management
const emailContacts = ref<any[]>([])
const loadingContacts = ref(false)
const contactError = ref('')
const newEmail = ref('')
const verificationDialog = reactive({
  open: false,
  email: '',
  code: '',
  sendingCode: false,
  verifying: false,
  countdown: 0,
  codeRequested: false,
})
const verificationError = ref('')
const verificationTimer = ref<number | null>(null)

async function loadContacts() {
  loadingContacts.value = true
  contactError.value = ''
  try {
    emailContacts.value = await auth.listEmailContacts()
  } catch (error) {
    contactError.value = error instanceof ApiError ? error.message : '加载失败'
  } finally {
    loadingContacts.value = false
  }
}

async function addEmail() {
  contactError.value = ''
  const value = newEmail.value.trim()
  if (!value) {
    contactError.value = '请输入邮箱'
    return
  }
  try {
    await auth.addEmailContact(value)
    newEmail.value = ''
    await loadContacts()
  } catch (error) {
    contactError.value = error instanceof ApiError ? error.message : '添加失败'
  }
}

function stopVerificationCountdown() {
  if (verificationTimer.value && typeof window !== 'undefined') {
    window.clearInterval(verificationTimer.value)
    verificationTimer.value = null
  }
}

function startVerificationCountdown(seconds = 60) {
  stopVerificationCountdown()
  verificationDialog.countdown = seconds
  if (seconds <= 0 || typeof window === 'undefined') {
    return
  }
  verificationTimer.value = window.setInterval(() => {
    if (verificationDialog.countdown <= 1) {
      stopVerificationCountdown()
      verificationDialog.countdown = 0
      return
    }
    verificationDialog.countdown -= 1
  }, 1000)
}

function openVerificationDialog(email: string) {
  verificationDialog.email = email.trim()
  verificationDialog.code = ''
  verificationDialog.open = true
  verificationDialog.sendingCode = false
  verificationDialog.verifying = false
  verificationDialog.countdown = 0
  verificationDialog.codeRequested = false
  verificationError.value = ''
  stopVerificationCountdown()
}

function closeVerificationDialog() {
  verificationDialog.open = false
  verificationDialog.code = ''
  verificationDialog.email = ''
  verificationDialog.sendingCode = false
  verificationDialog.verifying = false
  verificationDialog.countdown = 0
  verificationDialog.codeRequested = false
  verificationError.value = ''
  stopVerificationCountdown()
}

function updateVerificationDialog(value: boolean) {
  if (!value) {
    closeVerificationDialog()
  } else {
    verificationDialog.open = true
  }
}

async function sendVerificationCode() {
  const email = verificationDialog.email.trim()
  if (!email) {
    verificationError.value = '邮箱地址无效'
    return
  }
  if (verificationDialog.countdown > 0) {
    return
  }
  verificationError.value = ''
  verificationDialog.sendingCode = true
  try {
    await auth.resendEmailVerification(email)
    startVerificationCountdown()
    verificationDialog.codeRequested = true
  } catch (error) {
    verificationError.value =
      error instanceof ApiError ? error.message : '验证码发送失败，请稍后重试'
  } finally {
    verificationDialog.sendingCode = false
  }
}

async function submitVerification() {
  const email = verificationDialog.email.trim()
  const code = verificationDialog.code.trim()
  if (!email) {
    verificationError.value = '邮箱地址无效'
    return
  }
  if (!verificationDialog.codeRequested) {
    verificationError.value = '请先发送验证码'
    return
  }
  if (!code) {
    verificationError.value = '请输入验证码'
    return
  }
  verificationError.value = ''
  verificationDialog.verifying = true
  try {
    await auth.verifyEmailContact({ email, code })
    await loadContacts()
    closeVerificationDialog()
  } catch (error) {
    verificationError.value =
      error instanceof ApiError ? error.message : '验证失败，请稍后重试'
  } finally {
    verificationDialog.verifying = false
  }
}

async function setPrimary(contact: any) {
  contactError.value = ''
  try {
    await auth.setPrimaryEmailContact(contact.id as string)
    await loadContacts()
  } catch (error) {
    contactError.value = error instanceof ApiError ? error.message : '设置失败'
  }
}

async function removeContact(contact: any) {
  contactError.value = ''
  try {
    await auth.removeEmailContact(contact.id as string)
    await loadContacts()
  } catch (error) {
    contactError.value = error instanceof ApiError ? error.message : '删除失败'
  }
}

function isContactVerified(contact: any) {
  if (!contact || typeof contact !== 'object') return false
  if (contact.verification === 'VERIFIED') return true
  return Boolean(contact.verifiedAt)
}

const passwordResetEnabled = computed(() => feature.passwordResetEnabled)
const phoneEnabled = computed(() => feature.phoneVerificationEnabled)
const emailVerificationEnabled = computed(
  () => feature.emailVerificationEnabled,
)

const showEmailVerifyBanner = computed(() => {
  if (!emailVerificationEnabled.value) return false
  const contacts: any[] = emailContacts.value || []
  if (contacts.length === 0) return false
  const primary = contacts.find((c) => c.isPrimary)
  const anyUnverified = contacts.some((c) => !isContactVerified(c))
  return (primary && !isContactVerified(primary)) || anyUnverified
})

onMounted(() => {
  prefillResetEmail()
  if (auth.isAuthenticated) void loadContacts()
})

onBeforeUnmount(() => {
  stopVerificationCountdown()
})
</script>

<template>
  <div class="space-y-8">
    <!-- Email Contacts Section -->
    <section v-if="emailVerificationEnabled" class="space-y-4">
      <h3
        class="flex items-center gap-2 px-1 text-lg text-slate-600 dark:text-slate-300"
      >
        邮箱绑定

        <span v-if="loadingContacts" class="block">
          <UIcon name="i-lucide-loader-2" class="mr-2 h-4 w-4 animate-spin" />
        </span>
      </h3>
      <div>
        <div class="space-y-3">
          <div class="flex gap-2">
            <UInput
              v-model="newEmail"
              placeholder="新增邮箱"
              type="email"
              class="flex-1"
            />
            <UButton
              color="primary"
              :disabled="!newEmail.trim()"
              @click="addEmail"
              >添加</UButton
            >
          </div>

          <div
            v-if="showEmailVerifyBanner"
            class="mb-3 rounded-lg border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-200 flex items-start gap-2"
          >
            <UIcon name="i-lucide-alert-triangle" class="h-4 w-4 shrink-0" />
            <span
              >部分邮箱尚未完成验证，请及时输入验证码或重发邮件以确保账户安全与找回功能。</span
            >
          </div>

          <p v-if="contactError" class="text-sm text-red-600 dark:text-red-400">
            {{ contactError }}
          </p>

          <div
            v-else-if="emailContacts.length === 0"
            class="text-sm text-slate-500 dark:text-slate-400"
          >
            暂无邮箱绑定。
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="contact in emailContacts"
              :key="contact.id"
              class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span
                    class="font-medium text-slate-800 dark:text-slate-100"
                    >{{ contact.value }}</span
                  >
                  <UBadge
                    v-if="contact.isPrimary"
                    color="primary"
                    variant="solid"
                    >主邮箱</UBadge
                  >
                  <UBadge v-else color="neutral" variant="soft">辅助</UBadge>
                  <UBadge
                    :color="isContactVerified(contact) ? 'success' : 'warning'"
                    variant="soft"
                    >{{
                      isContactVerified(contact) ? '已验证' : '未验证'
                    }}</UBadge
                  >
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    v-if="!isContactVerified(contact)"
                    size="xs"
                    variant="ghost"
                    @click="openVerificationDialog(contact.value as string)"
                    >验证</UButton
                  >
                  <UButton
                    v-if="!contact.isPrimary && isContactVerified(contact)"
                    size="xs"
                    variant="ghost"
                    @click="setPrimary(contact)"
                    >设为主邮箱</UButton
                  >
                  <UButton
                    v-if="!contact.isPrimary"
                    size="xs"
                    variant="ghost"
                    color="error"
                    @click="removeContact(contact)"
                    >删除</UButton
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <UModal
      :open="verificationDialog.open"
      @update:open="updateVerificationDialog"
      :ui="{ content: 'w-full max-w-md' }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div class="flex items-center justify-between">
            <div>
              <h3
                class="text-base font-semibold text-slate-900 dark:text-white"
              >
                验证邮箱
              </h3>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                向 {{ verificationDialog.email }} 发送验证码并完成验证。
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="updateVerificationDialog(false)"
            />
          </div>

          <div class="space-y-4 text-sm">
            <div
              class="flex items-center justify-between rounded-lg bg-slate-100/70 px-3 py-2 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200"
            >
              <span class="text-xs text-slate-500 dark:text-slate-400"
                >邮箱</span
              >
              <span class="font-medium">{{ verificationDialog.email }}</span>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                color="primary"
                class="flex-1"
                :loading="verificationDialog.sendingCode"
                :disabled="verificationDialog.countdown > 0"
                @click="sendVerificationCode"
              >
                {{
                  verificationDialog.countdown > 0
                    ? `重新发送 (${verificationDialog.countdown}s)`
                    : '发送验证码'
                }}
              </UButton>
              <UButton
                v-if="verificationDialog.countdown > 0"
                size="xs"
                variant="ghost"
                class="text-xs text-slate-500 dark:text-slate-400"
                disabled
              >
                等待邮件…
              </UButton>
            </div>
            <div v-if="verificationDialog.codeRequested" class="space-y-3">
              <UInput
                v-model="verificationDialog.code"
                placeholder="请输入验证码"
                autocomplete="one-time-code"
              />
              <UButton
                color="primary"
                class="w-full"
                :loading="verificationDialog.verifying"
                @click="submitVerification"
                >确认验证</UButton
              >
            </div>
            <div
              v-else
              class="rounded-lg border border-dashed border-slate-300/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400"
            >
              请先点击上方的“发送验证码”，等待邮件到达后再输入验证码。
            </div>
            <p
              v-if="verificationError"
              class="text-sm text-red-600 dark:text-red-400"
            >
              {{ verificationError }}
            </p>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Phone Placeholder Section -->
    <section v-if="phoneEnabled" class="space-y-4">
      <h3 class="text-lg font-medium text-slate-700 dark:text-slate-200">
        手机验证（预留）
      </h3>
      <div
        class="rounded-xl border border-slate-200/70 p-4 text-sm text-slate-500 dark:border-slate-700/60 dark:text-slate-400 bg-white/70 dark:bg-slate-800/40"
      >
        功能暂未开启，后续支持 +86/+852/+853/+886
        区号，仅用于安全验证和找回密码。
      </div>
    </section>

    <!-- Password Reset Section -->
    <section v-if="passwordResetEnabled" class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3 px-1">
        <UButton
          class="text-lg p-0"
          variant="link"
          color="error"
          @click="openResetDialog"
          >重置密码</UButton
        >
      </div>
      <UModal
        :open="resetDialogOpen"
        @update:open="updateResetDialog"
        :ui="{ content: 'w-full max-w-md' }"
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
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  输入邮箱并完成验证码验证即可重置账户密码。
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="updateResetDialog(false)"
              />
            </div>

            <div class="space-y-4 text-sm">
              <template v-if="resetStep === 'INPUT'">
                <label
                  class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  <span>账户邮箱或辅助邮箱</span>
                  <UInput
                    v-model="resetForm.email"
                    placeholder="you@example.com"
                    type="email"
                  />
                </label>
                <UButton
                  :loading="sendingReset"
                  color="primary"
                  class="w-full"
                  @click="requestPasswordCode"
                  >发送验证码</UButton
                >
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
                      >确认重置</UButton
                    >
                    <UButton
                      class="flex-1"
                      variant="ghost"
                      @click="requestPasswordCode"
                      >重新发送</UButton
                    >
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

              <p
                v-if="resetError"
                class="text-sm text-red-600 dark:text-red-400"
              >
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
