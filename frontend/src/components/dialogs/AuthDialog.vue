<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  TransitionChild,
  TransitionRoot,
} from '@headlessui/vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { usePortalStore } from '@/stores/portal'
import { useFeatureStore } from '@/stores/feature'
import { ApiError } from '@/utils/api'
import { translateAuthErrorMessage } from '@/utils/auth-errors'

const authStore = useAuthStore()
const uiStore = useUiStore()
const portalStore = usePortalStore()
const featureStore = useFeatureStore()

const tab = ref<'login' | 'register'>('login')
const loginMode = ref<'EMAIL' | 'AUTHME'>('EMAIL')
const registerMode = ref<'EMAIL' | 'AUTHME'>('EMAIL')
const loginError = ref('')
// Forgot password flow states
const forgotOpen = ref(false)
const forgotStep = ref<'INPUT' | 'CODE' | 'DONE'>('INPUT')
const forgotForm = reactive({ email: '', code: '', password: '' })
const forgotSending = ref(false)
const forgotError = ref('')
const codeDialogOpen = ref(false)
const registerError = ref('')
const suppressLoginClose = ref(false) // prevents login dialog close when forgot modal toggles

const loginForm = reactive({
  email: '',
  password: '',
  rememberMe: true,
})

const authmeLoginForm = reactive({
  authmeId: '',
  password: '',
  rememberMe: true,
})

const registerForm = reactive({
  email: '',
  password: '',
  confirmPassword: '',
})

const authmeRegisterForm = reactive({
  authmeId: '',
  password: '',
  email: '',
})

const authmeLoginEnabled = computed(() => featureStore.flags.authmeLoginEnabled)
const authmeRegisterEnabled = computed(
  () => featureStore.flags.authmeRegisterEnabled,
)

watch(
  () => featureStore.flags,
  () => {
    if (!authmeLoginEnabled.value && loginMode.value === 'AUTHME') {
      loginMode.value = 'EMAIL'
    }
    if (!authmeRegisterEnabled.value && registerMode.value === 'AUTHME') {
      registerMode.value = 'EMAIL'
    }
  },
  { immediate: true, deep: true },
)

async function handleLogin() {
  loginError.value = ''
  uiStore.startLoading()
  try {
    if (loginMode.value === 'AUTHME') {
      await authStore.login({
        mode: 'AUTHME',
        authmeId: authmeLoginForm.authmeId,
        password: authmeLoginForm.password,
        rememberMe: authmeLoginForm.rememberMe,
      })
    } else {
      await authStore.login({
        mode: 'EMAIL',
        email: loginForm.email,
        password: loginForm.password,
        rememberMe: loginForm.rememberMe,
      })
    }
    await portalStore.fetchHome(true)
    uiStore.closeLoginDialog()
  } catch (error) {
    if (error instanceof ApiError) {
      loginError.value = translateAuthErrorMessage(error.message)
    } else {
      loginError.value = '登录失败，请稍后重试'
    }
  } finally {
    uiStore.stopLoading()
  }
}

async function handleRegister() {
  registerError.value = ''
  if (
    registerMode.value === 'EMAIL' &&
    registerForm.password !== registerForm.confirmPassword
  ) {
    registerError.value = '两次输入的密码不一致'
    return
  }
  if (registerMode.value === 'AUTHME') {
    const trimmedAuthmeId = authmeRegisterForm.authmeId.trim()
    const trimmedEmail = authmeRegisterForm.email.trim()
    if (!trimmedAuthmeId) {
      registerError.value = '请填写服务器账号'
      return
    }
    if (!trimmedEmail) {
      registerError.value = '请填写邮箱地址'
      return
    }
  }
  uiStore.startLoading()
  try {
    if (registerMode.value === 'AUTHME') {
      await authStore.register({
        mode: 'AUTHME',
        authmeId: authmeRegisterForm.authmeId.trim(),
        password: authmeRegisterForm.password,
        email: authmeRegisterForm.email.trim(),
      })
    } else {
      await authStore.register({
        mode: 'EMAIL',
        email: registerForm.email,
        password: registerForm.password,
        rememberMe: true,
      })
    }
    await portalStore.fetchHome(true)
    uiStore.closeLoginDialog()
  } catch (error) {
    if (error instanceof ApiError) {
      registerError.value = translateAuthErrorMessage(error.message)
    } else {
      registerError.value = '注册失败，请稍后再试'
    }
  } finally {
    uiStore.stopLoading()
  }
}

function closeDialog() {
  if (suppressLoginClose.value) {
    suppressLoginClose.value = false
    return
  }
  if (forgotOpen.value) {
    suppressLoginClose.value = true
    closeForgot()
    nextTick(() => {
      suppressLoginClose.value = false
    })
    return
  }
  uiStore.closeLoginDialog()
}

async function openForgot() {
  forgotError.value = ''
  forgotForm.email = loginForm.email.trim()
  forgotForm.code = ''
  forgotForm.password = ''
  forgotStep.value = 'INPUT'
  forgotOpen.value = true
}

function closeForgot() {
  forgotOpen.value = false
  codeDialogOpen.value = false
}

function handleForgotDialogButton(event: Event) {
  event.stopPropagation()
  event.preventDefault()
  suppressLoginClose.value = true
  closeForgot()
  nextTick(() => {
    suppressLoginClose.value = false
  })
}

async function sendForgotCode() {
  forgotError.value = ''
  const email = forgotForm.email.trim()
  if (!email) {
    forgotError.value = '请输入邮箱'
    return
  }
  forgotSending.value = true
  try {
    await authStore.requestPasswordResetCode(email)
    codeDialogOpen.value = true
    forgotStep.value = 'CODE'
  } catch (error) {
    forgotError.value =
      error instanceof ApiError ? error.message : '发送失败，请稍后重试'
  } finally {
    forgotSending.value = false
  }
}

async function confirmForgotReset() {
  forgotError.value = ''
  const email = forgotForm.email.trim()
  const code = forgotForm.code.trim()
  const password = forgotForm.password
  if (!email || !code || !password) {
    forgotError.value = '请填写完整信息'
    return
  }
  forgotSending.value = true
  try {
    await authStore.confirmPasswordReset({ email, code, password })
    forgotStep.value = 'DONE'
  } catch (error) {
    forgotError.value =
      error instanceof ApiError ? error.message : '重置失败，请稍后再试'
  } finally {
    forgotSending.value = false
  }
}

function resendForgotCode() {
  const email = forgotForm.email.trim()
  if (!email) return
  return authStore.requestPasswordResetCode(email)
}
</script>

<template>
  <TransitionRoot :show="uiStore.loginDialogOpen" as="template">
    <Dialog class="relative z-1100" @close="closeDialog">
      <TransitionChild
        as="template"
        enter="duration-200 ease-out"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="duration-150 ease-in"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
      </TransitionChild>

      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
          <TransitionChild
            as="template"
            enter="duration-200 ease-out"
            enter-from="opacity-0 translate-y-3 scale-95"
            enter-to="opacity-100 translate-y-0 scale-100"
            leave="duration-150 ease-in"
            leave-from="opacity-100 translate-y-0 scale-100"
            leave-to="opacity-0 translate-y-3 scale-95"
          >
            <DialogPanel
              class="w-full max-w-md transform overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/80"
            >
              <DialogTitle
                class="text-lg font-semibold text-slate-900 dark:text-white"
              >
                {{ tab === 'login' ? '登录 Hydroline' : '注册新账号' }}
              </DialogTitle>

              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                使用邮箱和密码登录。
              </p>

              <div
                class="mt-4 flex rounded-full bg-slate-100/80 p-1 text-sm dark:bg-slate-800/60"
              >
                <button
                  type="button"
                  class="flex-1 rounded-full px-3 py-1 font-medium transition"
                  :class="
                    tab === 'login'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  "
                  @click="tab = 'login'"
                >
                  登录
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-full px-3 py-1 font-medium transition"
                  :class="
                    tab === 'register'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  "
                  @click="tab = 'register'"
                >
                  注册
                </button>
              </div>

              <form
                v-if="tab === 'login'"
                class="mt-6 space-y-4"
                @submit.prevent="handleLogin"
              >
                <div
                  class="flex rounded-full bg-slate-100/80 p-1 text-xs font-medium dark:bg-slate-800/60"
                >
                  <button
                    type="button"
                    class="flex-1 rounded-full px-3 py-1"
                    :class="
                      loginMode === 'EMAIL'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    "
                    @click="loginMode = 'EMAIL'"
                  >
                    邮箱登录
                  </button>
                  <button
                    type="button"
                    class="flex-1 rounded-full px-3 py-1"
                    :class="
                      loginMode === 'AUTHME'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    "
                    :disabled="!authmeLoginEnabled"
                    :title="
                      authmeLoginEnabled
                        ? '使用服务器账号登录'
                        : '暂未开放服务器账号登录'
                    "
                    @click="loginMode = 'AUTHME'"
                  >
                    服务器账号登录
                  </button>
                </div>

                <template v-if="loginMode === 'EMAIL'">
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>邮箱</span>
                    <UInput
                      v-model="loginForm.email"
                      type="email"
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>密码</span>
                    <UInput
                      v-model="loginForm.password"
                      type="password"
                      placeholder="请输入密码"
                      required
                    />
                  </label>
                  <div class="flex items-center justify-between text-sm">
                    <label
                      class="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300"
                    >
                      <UCheckbox v-model="loginForm.rememberMe" />
                      记住我
                    </label>
                    <UButton variant="link" @click="openForgot"
                      >忘记密码</UButton
                    >
                  </div>
                </template>
                <template v-else>
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>服务器账号</span>
                    <UInput
                      v-model="authmeLoginForm.authmeId"
                      placeholder="请输入服务器内登录过的游戏 ID"
                      required
                    />
                  </label>
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>服务器密码</span>
                    <UInput
                      v-model="authmeLoginForm.password"
                      type="password"
                      placeholder="请输入服务器内的登录密码"
                      required
                    />
                  </label>
                  <div class="flex items-center justify-between text-sm">
                    <label
                      class="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300"
                    >
                      <UCheckbox v-model="authmeLoginForm.rememberMe" />
                      记住我
                    </label>
                    <span class="text-xs text-slate-400"
                      >服务器账号登录仅限已绑定账号</span
                    >
                  </div>
                </template>

                <div
                  v-if="loginError"
                  class="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                >
                  {{ loginError }}
                </div>

                <UButton
                  type="submit"
                  color="primary"
                  class="w-full flex justify-center items-center"
                  >登录</UButton
                >

                <div
                  class="rounded-lg border border-slate-200/60 p-3 text-xs text-slate-500 dark:border-slate-700/60 dark:text-slate-300"
                >
                  {{
                    loginMode === 'AUTHME'
                      ? '需要先在服务器内完成注册并绑定 Hydroline 账号才可登录'
                      : '支持邮箱密码登录'
                  }}
                </div>
              </form>

              <form
                v-else
                class="mt-6 space-y-4"
                @submit.prevent="handleRegister"
              >
                <div
                  class="flex rounded-full bg-slate-100/80 p-1 text-xs font-medium dark:bg-slate-800/60"
                >
                  <button
                    type="button"
                    class="flex-1 rounded-full px-3 py-1"
                    :class="
                      registerMode === 'EMAIL'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    "
                    @click="registerMode = 'EMAIL'"
                  >
                    常规注册
                  </button>
                  <button
                    type="button"
                    class="flex-1 rounded-full px-3 py-1"
                    :class="
                      registerMode === 'AUTHME'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    "
                    :disabled="!authmeRegisterEnabled"
                    :title="
                      authmeRegisterEnabled
                        ? '使用服务器账号快速注册'
                        : '暂未开放服务器账号注册'
                    "
                    @click="registerMode = 'AUTHME'"
                  >
                    服务器账号注册
                  </button>
                </div>

                <template v-if="registerMode === 'EMAIL'">
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>邮箱</span>
                    <UInput
                      v-model="registerForm.email"
                      type="email"
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>密码</span>
                    <UInput
                      v-model="registerForm.password"
                      type="password"
                      placeholder="设置登录密码"
                      required
                    />
                  </label>
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>确认密码</span>
                    <UInput
                      v-model="registerForm.confirmPassword"
                      type="password"
                      placeholder="再次输入密码"
                      required
                    />
                  </label>
                </template>
                <template v-else>
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>邮箱</span>
                    <UInput
                      v-model="authmeRegisterForm.email"
                      type="email"
                      placeholder="帐户邮箱"
                      required
                    />
                  </label>
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>服务器账号</span>
                    <UInput
                      v-model="authmeRegisterForm.authmeId"
                      placeholder="请输入服务器内登录过的游戏 ID"
                      required
                    />
                  </label>
                  <label
                    class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>服务器密码</span>
                    <UInput
                      v-model="authmeRegisterForm.password"
                      type="password"
                      placeholder="请输入服务器内的登录密码"
                      required
                    />
                  </label>
                  <p class="text-xs text-slate-500 dark:text-slate-300">
                    系统会校验服务器账号数据库并自动完成 Hydroline 账号绑定。
                  </p>
                </template>

                <div
                  v-if="registerError"
                  class="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                >
                  {{ registerError }}
                </div>

                <UButton
                  type="submit"
                  color="primary"
                  variant="outline"
                  class="w-full flex justify-center items-center"
                >
                  立即注册
                </UButton>
              </form>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
  <!-- Forgot Password Modal -->
  <TransitionRoot :show="forgotOpen" as="template">
    <Dialog class="relative z-1200" @close="closeForgot">
      <TransitionChild
        as="template"
        enter="duration-200 ease-out"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="duration-150 ease-in"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
      </TransitionChild>
      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
          <TransitionChild
            as="template"
            enter="duration-200 ease-out"
            enter-from="opacity-0 translate-y-3 scale-95"
            enter-to="opacity-100 translate-y-0 scale-100"
            leave="duration-150 ease-in"
            leave-from="opacity-100 translate-y-0 scale-100"
            leave-to="opacity-0 translate-y-3 scale-95"
          >
            <DialogPanel
              class="w-full max-w-md transform overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/80"
            >
              <DialogTitle
                class="text-lg font-semibold text-slate-900 dark:text-white"
                >找回密码</DialogTitle
              >
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                通过邮箱验证码重置登录密码。
              </p>
              <div class="mt-4 space-y-4">
                <template v-if="forgotStep === 'INPUT'">
                  <label
                    class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>绑定或辅助邮箱</span>
                    <UInput
                      v-model="forgotForm.email"
                      type="email"
                      placeholder="you@example.com"
                    />
                  </label>
                  <div class="flex gap-2">
                    <UButton
                      color="primary"
                      :loading="forgotSending"
                      class="flex-1"
                      @click="sendForgotCode"
                      >发送验证码</UButton
                    >
                    <UButton
                      variant="ghost"
                      class="flex-1"
                      @click="handleForgotDialogButton"
                    >
                      取消
                    </UButton>
                  </div>
                </template>
                <template v-else-if="forgotStep === 'CODE'">
                  <UInput v-model="forgotForm.code" placeholder="验证码" />
                  <UInput
                    v-model="forgotForm.password"
                    type="password"
                    placeholder="新密码"
                  />
                  <div class="flex gap-2">
                    <UButton
                      color="primary"
                      :loading="forgotSending"
                      class="flex-1"
                      @click="confirmForgotReset"
                      >确认重置</UButton
                    >
                    <UButton
                      variant="ghost"
                      class="flex-1"
                      @click="sendForgotCode"
                      >重新发送</UButton
                    >
                  </div>
                </template>
                <template v-else>
                  <div
                    class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400"
                  >
                    <UIcon name="i-lucide-check" class="h-5 w-5" />
                    密码已重置，请使用新密码登录。
                  </div>
                  <UButton
                    color="primary"
                    class="w-full"
                    @click="handleForgotDialogButton"
                  >
                    关闭
                  </UButton>
                </template>
                <p
                  v-if="forgotError"
                  class="text-sm text-red-600 dark:text-red-400"
                >
                  {{ forgotError }}
                </p>
              </div>
              <CodeSendDialog
                v-model:open="codeDialogOpen"
                :target="forgotForm.email"
                :countdown="60"
                title="验证码已发送"
                description="我们已发送密码重置验证码至："
                @resend="resendForgotCode"
              />
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
