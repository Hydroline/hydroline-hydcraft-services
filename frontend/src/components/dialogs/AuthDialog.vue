<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { usePortalStore } from '@/stores/portal'
import { useFeatureStore } from '@/stores/feature'
import { useOAuthStore } from '@/stores/oauth'
import { ApiError } from '@/utils/api'
import { translateAuthErrorMessage } from '@/utils/auth-errors'
import { resolveProviderIcon } from '@/utils/oauth-brand'
import AuthDialogBackground from './AuthDialogBackground.vue'
import HydrolineLogo from '@/assets/resources/hydroline_logo.svg'

const authStore = useAuthStore()
const uiStore = useUiStore()
const portalStore = usePortalStore()
const featureStore = useFeatureStore()
const oauthStore = useOAuthStore()
const toast = useToast()

const tab = ref<'login' | 'register'>('login')
const loginMode = ref<'EMAIL' | 'AUTHME' | 'EMAIL_CODE'>('EMAIL')
const registerMode = ref<'EMAIL' | 'AUTHME'>('EMAIL')
const loginError = ref('')
const forgotOpen = ref(false)
const forgotStep = ref<'INPUT' | 'CODE' | 'DONE'>('INPUT')
const forgotForm = reactive({ email: '', code: '', password: '' })
const forgotSending = ref(false)
const forgotError = ref('')
const registerError = ref('')
const loginCode = ref('')
const registerCode = ref('')
const loginCodeSending = ref(false)
const registerCodeSending = ref(false)

const modalUi = {
  auth: {
    content:
      'w-full max-w-md z-[185] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    wrapper: 'z-[180]',
    overlay: 'z-[170]',
  },
  forgot: {
    content:
      'w-full max-w-md z-[195] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    wrapper: 'z-[190]',
    overlay: 'z-[185]',
  },
} as const

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
const oauthProviders = computed(() =>
  (featureStore.flags.oauthProviders ?? []).filter(
    (provider) => provider.hasClientSecret !== false,
  ),
)
const oauthLoadingProvider = ref<string | null>(null)

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

// 折叠过渡：在内容增减时平滑动画高度，避免对话框瞬间跳变
const collapseMs = 220
function onBeforeEnter(el: Element) {
  const e = el as HTMLElement
  e.style.height = '0'
  e.style.opacity = '0'
  e.style.overflow = 'hidden'
}
function onEnter(el: Element, done: () => void) {
  const e = el as HTMLElement
  const target = `${e.scrollHeight}px`
  e.style.transition = `height ${collapseMs}ms ease, opacity ${collapseMs}ms ease`
  requestAnimationFrame(() => {
    e.style.height = target
    e.style.opacity = '1'
  })
  const cleanup = (ev: TransitionEvent) => {
    if (ev.propertyName !== 'height') return
    e.style.height = ''
    e.style.transition = ''
    e.style.overflow = ''
    e.removeEventListener('transitionend', cleanup)
    done()
  }
  e.addEventListener('transitionend', cleanup)
}
function onBeforeLeave(el: Element) {
  const e = el as HTMLElement
  e.style.height = `${e.scrollHeight}px`
  e.style.opacity = '1'
  e.style.overflow = 'hidden'
}
function onLeave(el: Element, done: () => void) {
  const e = el as HTMLElement
  // 强制回流，确保起始高度生效
  void e.offsetHeight
  e.style.transition = `height ${collapseMs}ms ease, opacity ${collapseMs}ms ease`
  e.style.height = '0'
  e.style.opacity = '0'
  const cleanup = (ev: TransitionEvent) => {
    if (ev.propertyName !== 'height') return
    e.style.transition = ''
    e.style.overflow = ''
    e.removeEventListener('transitionend', cleanup)
    done()
  }
  e.addEventListener('transitionend', cleanup)
}

async function handleLogin() {
  loginError.value = ''
  const trimmedEmail = loginForm.email.trim()
  const trimmedCode = loginCode.value.trim()
  if (loginMode.value === 'EMAIL_CODE' && (!trimmedEmail || !trimmedCode)) {
    loginError.value = '请填写邮箱和验证码'
    return
  }
  uiStore.startLoading()
  try {
    if (loginMode.value === 'AUTHME') {
      await authStore.login({
        mode: 'AUTHME',
        authmeId: authmeLoginForm.authmeId,
        password: authmeLoginForm.password,
        rememberMe: authmeLoginForm.rememberMe,
      })
    } else if (loginMode.value === 'EMAIL_CODE') {
      await authStore.login({
        mode: 'EMAIL_CODE',
        email: trimmedEmail,
        code: trimmedCode,
        rememberMe: loginForm.rememberMe,
      })
    } else {
      await authStore.login({
        mode: 'EMAIL',
        email: trimmedEmail,
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

async function sendLoginCode() {
  loginError.value = ''
  const email = loginForm.email.trim()
  if (!email) {
    loginError.value = '请填写邮箱地址'
    return
  }
  loginCodeSending.value = true
  try {
    await authStore.requestEmailLoginCode(email)
    toast.add({
      title: '验证码已发送',
      description: `请查收 ${email} 邮箱的 6 位验证码`,
      color: 'success',
    })
  } catch (error) {
    loginError.value =
      error instanceof ApiError
        ? translateAuthErrorMessage(error.message)
        : '验证码发送失败，请稍后重试'
  } finally {
    loginCodeSending.value = false
  }
}

async function startOAuthLogin(providerKey: string) {
  if (typeof window === 'undefined') return
  oauthLoadingProvider.value = providerKey
  try {
    const callbackUrl = `${window.location.origin}/oauth/callback`
    const result = await oauthStore.startFlow(providerKey, {
      mode: 'LOGIN',
      redirectUri: callbackUrl,
      rememberMe: loginForm.rememberMe,
    })
    window.location.href = result.authorizeUrl
  } catch (error) {
    oauthLoadingProvider.value = null
    toast.add({
      title: '跳转失败',
      description:
        error instanceof ApiError ? error.message : '暂时无法连接第三方登录',
      color: 'error',
    })
  }
}

async function handleRegister() {
  registerError.value = ''
  const targetEmail =
    registerMode.value === 'AUTHME'
      ? authmeRegisterForm.email.trim()
      : registerForm.email.trim()
  const trimmedCode = registerCode.value.trim()
  if (
    registerMode.value === 'EMAIL' &&
    registerForm.password !== registerForm.confirmPassword
  ) {
    registerError.value = '两次输入的密码不一致'
    return
  }
  if (!targetEmail) {
    registerError.value = '请填写邮箱地址'
    return
  }
  if (!trimmedCode) {
    registerError.value = '请输入邮箱验证码'
    return
  }
  if (registerMode.value === 'AUTHME') {
    const trimmedAuthmeId = authmeRegisterForm.authmeId.trim()
    if (!trimmedAuthmeId) {
      registerError.value = '请填写服务器账号'
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
        email: targetEmail,
        code: trimmedCode,
      })
    } else {
      await authStore.register({
        mode: 'EMAIL',
        email: targetEmail,
        password: registerForm.password,
        code: trimmedCode,
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

async function sendRegisterCode() {
  registerError.value = ''
  const email =
    registerMode.value === 'AUTHME'
      ? authmeRegisterForm.email.trim()
      : registerForm.email.trim()
  if (!email) {
    registerError.value = '请填写邮箱地址'
    return
  }
  registerCodeSending.value = true
  try {
    await authStore.requestEmailRegisterCode(email)
    toast.add({
      title: '验证码已发送',
      description: `验证码已发送至 ${email}`,
      color: 'success',
    })
  } catch (error) {
    registerError.value =
      error instanceof ApiError
        ? translateAuthErrorMessage(error.message)
        : '验证码发送失败，请稍后再试'
  } finally {
    registerCodeSending.value = false
  }
}

function closeDialog() {
  if (forgotOpen.value) return
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
  forgotStep.value = 'INPUT'
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
</script>

<template>
  <UModal
    :open="uiStore.loginDialogOpen"
    @update:open="
      (v: boolean) => {
        if (!v) closeDialog()
      }
    "
    :ui="modalUi.auth"
  >
    <template #content>
      <AuthDialogBackground>
        <template #background>
          <video
            src="@/assets/images/video_background_240726.webm"
            autoplay
            muted
            loop
            class="w-full h-1/2 object-cover"
          ></video>
        </template>
        <template #foreground>
          <div class="p-6">
            <div>
              <div class="flex flex-col items-center gap-1">
                <HydrolineLogo class="h-9 w-9" />
                <div class="font-semibold text-2xl">Hydroline</div>
              </div>

              <div
                class="mt-5 flex rounded-full p-1 text-sm bg-slate-200 dark:bg-slate-800 inset-shadow-lg"
              >
                <button
                  type="button"
                  class="flex-1 rounded-full px-3 py-1 font-medium transition duration-300"
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
                  class="flex-1 rounded-full px-3 py-1 font-medium transition duration-300"
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
            </div>

            <Transition
              mode="out-in"
              @before-enter="onBeforeEnter"
              @enter="onEnter"
              @before-leave="onBeforeLeave"
              @leave="onLeave"
            >
              <form
                v-if="tab === 'login'"
                key="tab-login"
                class="mt-6 space-y-4"
                @submit.prevent="handleLogin"
              >
                <Transition
                  mode="out-in"
                  @before-enter="onBeforeEnter"
                  @enter="onEnter"
                  @before-leave="onBeforeLeave"
                  @leave="onLeave"
                >
                  <div
                    v-if="loginMode === 'EMAIL'"
                    key="login-email"
                    class="space-y-4"
                  >
                    <label
                      class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                    >
                      <span>邮箱</span>
                      <UInput
                        v-model="loginForm.email"
                        type="email"
                        placeholder="请输入邮箱"
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
                      <div>
                        <UButton
                          class="px-1!"
                          variant="link"
                          @click="loginMode = 'EMAIL_CODE'"
                          >邮箱验证码登录</UButton
                        >
                        <UButton
                          class="px-1!"
                          variant="link"
                          @click="openForgot"
                          >忘记密码</UButton
                        >
                      </div>
                    </div>
                  </div>
                  <div
                    v-else-if="loginMode === 'EMAIL_CODE'"
                    key="login-email-code"
                    class="space-y-4"
                  >
                    <label
                      class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                    >
                      <span>邮箱</span>
                      <UInput
                        v-model="loginForm.email"
                        type="email"
                        placeholder="请输入邮箱"
                        required
                      />
                    </label>
                    <label
                      class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                    >
                      <span>验证码</span>
                      <div class="flex gap-2">
                        <UInput
                          class="flex-1"
                          v-model="loginCode"
                          inputmode="numeric"
                          placeholder="请输入 6 位验证码"
                          required
                        />
                        <UButton
                          type="button"
                          color="primary"
                          variant="soft"
                          :loading="loginCodeSending"
                          @click="sendLoginCode"
                          >获取验证码</UButton
                        >
                      </div>
                    </label>
                    <div class="flex items-center justify-between text-sm">
                      <label
                        class="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300"
                      >
                        <UCheckbox v-model="loginForm.rememberMe" />
                        记住我
                      </label>
                      <div class="flex items-center gap-1">
                        <UButton
                          class="px-1!"
                          variant="link"
                          @click="loginMode = 'EMAIL'"
                          >密码登录</UButton
                        >
                        <UButton
                          class="px-1!"
                          variant="link"
                          @click="openForgot"
                          >忘记密码</UButton
                        >
                      </div>
                    </div>
                  </div>
                  <div v-else key="login-authme" class="space-y-4">
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
                    </div>
                  </div>
                </Transition>

                <div
                  v-if="loginError"
                  class="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                >
                  {{ loginError }}
                </div>

                <div class="flex gap-2 items-center">
                  <UButton
                    type="submit"
                    color="primary"
                    class="w-full flex justify-center items-center"
                    :loading="uiStore.isLoading"
                    >登录</UButton
                  >

                  <UButton
                    v-if="authmeLoginEnabled && loginMode !== 'AUTHME'"
                    type="button"
                    variant="soft"
                    class="w-full flex justify-center items-center gap-2"
                    @click="loginMode = 'AUTHME'"
                  >
                    <UIcon
                      name="i-lucide-database"
                      class="h-4 w-4"
                      aria-hidden="true"
                    />
                    服务器账号登录
                  </UButton>

                  <UButton
                    v-if="loginMode === 'AUTHME'"
                    :loading="uiStore.isLoading"
                    variant="soft"
                    class="w-full flex justify-center items-center"
                    @click="loginMode = 'EMAIL'"
                  >
                    返回邮箱登录
                  </UButton>
                </div>

                <div class="relative">
                  <div class="absolute inset-0 flex items-center">
                    <div
                      class="w-full border-t border-slate-200 dark:border-slate-700"
                    ></div>
                  </div>
                  <div class="relative flex justify-center text-sm">
                    <span
                      class="bg-white px-2 text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"
                      >使用第三方账号快速登录</span
                    >
                  </div>
                </div>

                <div v-if="oauthProviders.length" class="space-y-2 rounded-xl">
                  <UButton
                    v-for="provider in oauthProviders"
                    :key="provider.key"
                    variant="outline"
                    :loading="oauthLoadingProvider === provider.key"
                    :disabled="
                      oauthLoadingProvider !== null &&
                      oauthLoadingProvider !== provider.key
                    "
                    class="w-full justify-center gap-2"
                    @click="startOAuthLogin(provider.key)"
                  >
                    <UIcon
                      :name="resolveProviderIcon(provider.type)"
                      class="h-4 w-4"
                    />
                    {{ provider.name }}
                  </UButton>
                </div>
              </form>

              <form
                v-else
                key="tab-register"
                class="mt-6 space-y-4"
                @submit.prevent="handleRegister"
              >
                <Transition
                  mode="out-in"
                  @before-enter="onBeforeEnter"
                  @enter="onEnter"
                  @before-leave="onBeforeLeave"
                  @leave="onLeave"
                >
                  <div
                    v-if="registerMode === 'EMAIL'"
                    key="register-email"
                    class="space-y-4"
                  >
                    <label
                      class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                    >
                      <span>邮箱</span>
                      <UInput
                        v-model="registerForm.email"
                        type="email"
                        placeholder="请输入邮箱"
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
                  </div>
                  <div v-else key="register-authme" class="space-y-4">
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
                  </div>
                </Transition>

                <label
                  class="flex flex-col gap-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  <span>邮箱验证码</span>
                  <div class="flex gap-2">
                    <UInput
                      class="flex-1"
                      v-model="registerCode"
                      inputmode="numeric"
                      placeholder="请输入 6 位验证码"
                      required
                    />
                    <UButton
                      type="button"
                      color="primary"
                      variant="soft"
                      :loading="registerCodeSending"
                      @click="sendRegisterCode"
                      >获取验证码</UButton
                    >
                  </div>
                </label>

                <p class="text-xs text-slate-500 dark:text-slate-300">
                  系统会校验服务器账号数据库并自动完成 Hydroline 账号绑定。
                </p>

                <div
                  v-if="registerError"
                  class="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                >
                  {{ registerError }}
                </div>

                <div class="flex gap-2 items-center">
                  <UButton
                    type="submit"
                    color="primary"
                    :loading="uiStore.isLoading"
                    class="w-full flex justify-center items-center"
                  >
                    立即注册
                  </UButton>

                  <UButton
                    v-if="authmeRegisterEnabled && registerMode === 'EMAIL'"
                    type="button"
                    variant="soft"
                    class="w-full flex justify-center items-center gap-2"
                    @click="registerMode = 'AUTHME'"
                  >
                    <UIcon
                      name="i-lucide-database"
                      class="h-4 w-4"
                      aria-hidden="true"
                    />
                    服务器账号注册
                  </UButton>

                  <UButton
                    v-if="registerMode === 'AUTHME'"
                    type="button"
                    variant="soft"
                    class="w-full flex justify-center items-center"
                    @click="registerMode = 'EMAIL'"
                  >
                    返回常规注册
                  </UButton>
                </div>

                <div class="relative">
                  <div class="absolute inset-0 flex items-center">
                    <div
                      class="w-full border-t border-slate-200 dark:border-slate-700"
                    ></div>
                  </div>
                  <div class="relative flex justify-center text-sm">
                    <span
                      class="bg-white px-2 text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"
                      >使用第三方账号快速注册</span
                    >
                  </div>
                </div>

                <div v-if="oauthProviders.length" class="space-y-2 rounded-xl">
                  <UButton
                    v-for="provider in oauthProviders"
                    :key="provider.key"
                    variant="outline"
                    :loading="oauthLoadingProvider === provider.key"
                    :disabled="
                      oauthLoadingProvider !== null &&
                      oauthLoadingProvider !== provider.key
                    "
                    class="w-full justify-center gap-2"
                    @click="startOAuthLogin(provider.key)"
                  >
                    <UIcon
                      :name="resolveProviderIcon(provider.type)"
                      class="h-4 w-4"
                    />
                    {{ provider.name }}
                  </UButton>
                </div>
              </form>
            </Transition>
          </div>
        </template>
      </AuthDialogBackground>
    </template>
  </UModal>

  <UModal
    :open="forgotOpen"
    @update:open="
      (v: boolean) => {
        if (!v) closeForgot()
      }
    "
    :ui="modalUi.forgot"
  >
    <template #content>
      <div class="p-6">
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            找回密码
          </h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeForgot"
          />
        </div>
        <div class="mt-4 space-y-4">
          <Transition
            mode="out-in"
            @before-enter="onBeforeEnter"
            @enter="onEnter"
            @before-leave="onBeforeLeave"
            @leave="onLeave"
          >
            <div
              v-if="forgotStep === 'INPUT'"
              key="forgot-input"
              class="space-y-4"
            >
              <label
                class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                <span>绑定或辅助邮箱</span>
                <UInput
                  v-model="forgotForm.email"
                  type="email"
                  placeholder="请输入邮箱"
                />
              </label>
              <div class="flex items-center justify-end gap-2">
                <UButton variant="ghost" @click="closeForgot">取消</UButton>
                <UButton
                  color="primary"
                  :loading="forgotSending"
                  @click="sendForgotCode"
                  >发送验证码</UButton
                >
              </div>
            </div>
            <div
              v-else-if="forgotStep === 'CODE'"
              key="forgot-code"
              class="space-y-4"
            >
              <div class="text-sm text-slate-600 dark:text-slate-300 mb-3">
                我们已发送验证码至：<span class="font-medium">{{
                  forgotForm.email
                }}</span>
              </div>
              <label
                class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                <span>验证码</span>
                <UInput
                  v-model="forgotForm.code"
                  placeholder="请输入6位验证码"
                />
              </label>
              <label
                class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                <span>新密码</span>
                <UInput
                  v-model="forgotForm.password"
                  type="password"
                  placeholder="请输入新密码"
                />
              </label>
              <div class="flex gap-2">
                <UButton
                  color="primary"
                  :loading="forgotSending"
                  class="flex-1"
                  @click="confirmForgotReset"
                  >确认重置</UButton
                >
                <UButton variant="ghost" class="flex-1" @click="sendForgotCode"
                  >重新发送</UButton
                >
              </div>
            </div>
            <div v-else key="forgot-done" class="space-y-4">
              <div
                class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400"
              >
                <UIcon name="i-lucide-check" class="h-5 w-5" />
                密码已重置，请使用新密码登录。
              </div>
              <UButton color="primary" class="w-full" @click="closeForgot"
                >关闭</UButton
              >
            </div>
          </Transition>
          <p v-if="forgotError" class="text-sm text-red-600 dark:text-red-400">
            {{ forgotError }}
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
