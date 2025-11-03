<script setup lang="ts">
import { reactive, ref } from 'vue'
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
import { ApiError } from '@/utils/api'

const authStore = useAuthStore()
const uiStore = useUiStore()
const portalStore = usePortalStore()

const tab = ref<'login' | 'register'>('login')
const errorMessage = ref('')

const loginForm = reactive({
  email: '',
  password: '',
  rememberMe: true,
})

const registerForm = reactive({
  email: '',
  password: '',
  confirmPassword: '',
})

async function handleLogin() {
  errorMessage.value = ''
  uiStore.startLoading()
  try {
    await authStore.signIn({
      email: loginForm.email,
      password: loginForm.password,
      rememberMe: loginForm.rememberMe,
    })
    await portalStore.fetchHome(true)
    uiStore.closeLoginDialog()
  } catch (error) {
    if (error instanceof ApiError) {
      errorMessage.value = error.message
    } else {
      errorMessage.value = '登录失败，请稍后重试'
    }
  } finally {
    uiStore.stopLoading()
  }
}

function handleRegisterPlaceholder() {
  errorMessage.value = '注册功能将在后端完善后开放，请联系管理员创建账户。'
}

function closeDialog() {
  uiStore.closeLoginDialog()
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
                  <UButton variant="link">忘记密码</UButton>
                </div>

                <div
                  v-if="errorMessage"
                  class="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                >
                  {{ errorMessage }}
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
                  支持邮箱密码登录。
                </div>
              </form>

              <form
                v-else
                class="mt-6 space-y-4"
                @submit.prevent="handleRegisterPlaceholder"
              >
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

                <div
                  class="rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                >
                  注册流程将由管理员审核后开放。当前阶段请联系管理员完成帐号创建。
                </div>

                <UButton
                  type="submit"
                  color="primary"
                  variant="outline"
                  class="w-full flex justify-center items-center"
                >
                  提交注册意向
                </UButton>
              </form>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
