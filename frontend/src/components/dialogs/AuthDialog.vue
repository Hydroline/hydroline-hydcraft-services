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

const authStore = useAuthStore()
const uiStore = useUiStore()
const portalStore = usePortalStore()
const featureStore = useFeatureStore()
const oauthStore = useOAuthStore()
const toast = useToast()

const tab = ref<'login' | 'register'>('login')
const loginMode = ref<'EMAIL' | 'AUTHME'>('EMAIL')
const registerMode = ref<'EMAIL' | 'AUTHME'>('EMAIL')
const loginError = ref('')
const forgotOpen = ref(false)
const forgotStep = ref<'INPUT' | 'CODE' | 'DONE'>('INPUT')
const forgotForm = reactive({ email: '', code: '', password: '' })
const forgotSending = ref(false)
const forgotError = ref('')
const registerError = ref('')

const modalUi = {
  auth: {
    content: 'w-full max-w-md z-[185]',
    wrapper: 'z-[180]',
    overlay: 'z-[170]',
  },
  forgot: {
    content: 'w-full max-w-md z-[195]',
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
      <div class="p-6">
        <div>
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
        </div>

        <form
          v-if="tab === 'login'"
          class="mt-6 space-y-4"
          @submit.prevent="handleLogin"
        >
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
              <div>
                <UButton class="px-1!" variant="link">邮箱验证码登录</UButton>
                <UButton class="px-1!" variant="link" @click="openForgot">忘记密码</UButton>
              </div>
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
            </div>
          </template>

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
              v-if="authmeLoginEnabled && loginMode === 'EMAIL'"
              type="button"
              variant="outline"
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
              variant="ghost"
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
                class="bg-white px-2 text-slate-500 dark:bg-slate-900 dark:text-slate-400"
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

        <form v-else class="mt-6 space-y-4" @submit.prevent="handleRegister">
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
              variant="outline"
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
              variant="ghost"
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
                class="bg-white px-2 text-slate-500 dark:bg-slate-900 dark:text-slate-400"
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
      </div>
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
            <div class="flex items-center justify-end gap-2">
              <UButton variant="ghost" @click="closeForgot">取消</UButton>
              <UButton
                color="primary"
                :loading="forgotSending"
                @click="sendForgotCode"
                >发送验证码</UButton
              >
            </div>
          </template>
          <template v-else-if="forgotStep === 'CODE'">
            <div class="text-sm text-slate-600 dark:text-slate-300 mb-3">
              我们已发送验证码至：<span class="font-medium">{{
                forgotForm.email
              }}</span>
            </div>
            <label
              class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <span>验证码</span>
              <UInput v-model="forgotForm.code" placeholder="请输入6位验证码" />
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
          </template>
          <template v-else>
            <div
              class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400"
            >
              <UIcon name="i-lucide-check" class="h-5 w-5" />
              密码已重置，请使用新密码登录。
            </div>
            <UButton color="primary" class="w-full" @click="closeForgot"
              >关闭</UButton
            >
          </template>
          <p v-if="forgotError" class="text-sm text-red-600 dark:text-red-400">
            {{ forgotError }}
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
