<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, reactive, computed, onMounted } from 'vue'
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
const verifying = ref(false)
const verifyForm = reactive({ email: '', code: '' })

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

async function resendVerify(email: string) {
  contactError.value = ''
  try {
    await auth.resendEmailVerification(email)
  } catch (error) {
    contactError.value = error instanceof ApiError ? error.message : '重发失败'
  }
}

function beginVerify(email: string) {
  verifyForm.email = email
  verifyForm.code = ''
  verifying.value = true
}

async function submitVerify() {
  contactError.value = ''
  const email = verifyForm.email.trim()
  const code = verifyForm.code.trim()
  if (!email || !code) {
    contactError.value = '请输入验证码'
    return
  }
  try {
    await auth.verifyEmailContact({ email, code })
    verifying.value = false
    await loadContacts()
  } catch (error) {
    contactError.value = error instanceof ApiError ? error.message : '验证失败'
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

const passwordResetEnabled = computed(() => feature.passwordResetEnabled)
const phoneEnabled = computed(() => feature.phoneVerificationEnabled)
const emailVerificationEnabled = computed(
  () => feature.emailVerificationEnabled,
)

// 未验证提示：主邮箱未验证或存在未验证辅助邮箱
const showEmailVerifyBanner = computed(() => {
  if (!emailVerificationEnabled.value) return false
  const contacts: any[] = emailContacts.value || []
  if (contacts.length === 0) return false
  const primary = contacts.find((c) => c.isPrimary)
  const anyUnverified = contacts.some((c) => !c.verifiedAt)
  return (primary && !primary.verifiedAt) || anyUnverified
})

onMounted(() => {
  if (auth.isAuthenticated) void loadContacts()
})
</script>

<template>
  <div class="space-y-10">
    <!-- Password Reset Section -->
    <section v-if="passwordResetEnabled" class="space-y-4">
      <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">重置密码</h3>
      <div
        class="rounded-xl border border-slate-200/70 p-4 dark:border-slate-700/60 bg-white/70 dark:bg-slate-800/40"
      >
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
            class="mt-3"
            @click="requestPasswordCode"
            >发送验证码</UButton
          >
        </template>
        <template v-else-if="resetStep === 'CODE'">
          <div class="grid gap-3">
            <UInput v-model="resetForm.code" placeholder="请输入收到的验证码" />
            <UInput
              v-model="resetForm.password"
              type="password"
              placeholder="设置新密码"
            />
            <div class="flex gap-2">
              <UButton
                :loading="sendingReset"
                color="primary"
                @click="confirmPasswordReset"
                >确认重置</UButton
              >
              <UButton variant="ghost" @click="requestPasswordCode"
                >重新发送</UButton
              >
            </div>
          </div>
        </template>
        <template v-else>
          <div
            class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400"
          >
            <UIcon name="i-lucide-check" class="h-5 w-5" />
            密码已重置，请使用新密码登录。
          </div>
        </template>
        <p
          v-if="resetError"
          class="mt-2 text-sm text-red-600 dark:text-red-400"
        >
          {{ resetError }}
        </p>
      </div>
      <CodeSendDialog
        v-model:open="codeDialogOpen"
        :target="resetForm.email"
        :countdown="60"
        title="验证码已发送"
        description="我们已发送密码重置验证码至："
        @resend="resendPasswordCode"
      />
    </section>

    <!-- Email Contacts Section -->
    <section v-if="emailVerificationEnabled" class="space-y-4">
      <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">邮箱绑定</h3>
      <div
        class="rounded-xl border border-slate-200/70 p-4 dark:border-slate-700/60 bg-white/70 dark:bg-slate-800/40"
      >
        <div
          v-if="showEmailVerifyBanner"
          class="mb-3 rounded-lg border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-200 flex items-start gap-2"
        >
          <UIcon name="i-lucide-alert-triangle" class="h-4 w-4 shrink-0" />
          <span
            >部分邮箱尚未完成验证，请及时输入验证码或重发邮件以确保账户安全与找回功能。</span
          >
        </div>
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
          <p v-if="contactError" class="text-sm text-red-600 dark:text-red-400">
            {{ contactError }}
          </p>
          <div
            v-if="loadingContacts"
            class="text-sm text-slate-500 dark:text-slate-400"
          >
            加载中...
          </div>
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
              class="flex flex-col gap-1 rounded-lg border border-slate-200/60 p-3 text-sm dark:border-slate-700/60"
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
                    :color="contact.verifiedAt ? 'success' : 'warning'"
                    variant="soft"
                    >{{ contact.verifiedAt ? '已验证' : '未验证' }}</UBadge
                  >
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    v-if="!contact.verifiedAt"
                    size="xs"
                    variant="ghost"
                    @click="resendVerify(contact.value as string)"
                    >重发验证码</UButton
                  >
                  <UButton
                    v-if="!contact.isPrimary && contact.verifiedAt"
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
              <div
                v-if="verifying && verifyForm.email === contact.value"
                class="mt-2 space-y-2"
              >
                <UInput v-model="verifyForm.code" placeholder="验证码" />
                <div class="flex gap-2">
                  <UButton size="xs" color="primary" @click="submitVerify"
                    >验证</UButton
                  >
                  <UButton size="xs" variant="ghost" @click="verifying = false"
                    >取消</UButton
                  >
                </div>
              </div>
              <div v-else-if="!contact.verifiedAt" class="mt-2">
                <UButton
                  size="xs"
                  variant="outline"
                  @click="beginVerify(contact.value as string)"
                  >输入验证码验证</UButton
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

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
  </div>
</template>
