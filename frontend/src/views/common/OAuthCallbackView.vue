<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useOAuthStore } from '@/stores/shared/oauth'
import { useAuthStore } from '@/stores/user/auth'
import { usePortalStore } from '@/stores/user/portal'
import { ApiError } from '@/utils/http/api'

type OAuthLoginResult = {
  success?: boolean
  tokens?: { accessToken: string | null; refreshToken: string | null }
  user?: Record<string, unknown> | null
  binding?: { providerKey: string; userId: string } | null
}

const router = useRouter()
const route = useRoute()
const oauthStore = useOAuthStore()
const authStore = useAuthStore()
const portalStore = usePortalStore()

const status = ref<'PENDING' | 'SUCCESS' | 'ERROR'>('PENDING')
const message = ref('正在完成授权，请稍候…')

function resolveRedirect(input: unknown) {
  if (typeof input !== 'string' || input.length === 0) return '/'
  try {
    const url = new URL(input, window.location.origin)
    if (url.origin !== window.location.origin) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

async function handleResult(providerKey: string, state: string) {
  const redirectTarget = resolveRedirect(route.query.redirect)
  try {
    const result = (await oauthStore.fetchResult(
      providerKey,
      state,
    )) as OAuthLoginResult
    if (result.tokens && result.user) {
      authStore.setToken(result.tokens.accessToken ?? null)
      authStore.setRefreshToken(result.tokens.refreshToken ?? null)
      authStore.setUser(result.user)
      await portalStore.fetchHome(true)
      status.value = 'SUCCESS'
      message.value = '登录成功，正在跳转…'
      setTimeout(() => {
        router.replace(redirectTarget)
      }, 1500)
      return
    }
    if (result.binding) {
      await authStore.fetchCurrentUser().catch(() => {})
      await portalStore.fetchHome(true)
      status.value = 'SUCCESS'
      message.value = '绑定成功'
      setTimeout(() => {
        router.replace(redirectTarget)
      }, 800)
      return
    }
    throw new Error('未能获取有效的授权结果')
  } catch (error) {
    status.value = 'ERROR'
    message.value =
      error instanceof ApiError ? error.message : '授权失败，请重试'
  }
}

onMounted(() => {
  const provider = route.query.provider
  const state = route.query.state
  if (
    typeof provider !== 'string' ||
    provider.length === 0 ||
    typeof state !== 'string' ||
    state.length === 0
  ) {
    status.value = 'ERROR'
    message.value = '缺少必要的授权参数'
    return
  }
  void handleResult(provider, state)
})
</script>

<template>
  <div
    class="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-slate-100 via-white to-slate-100 px-4 text-center dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
  >
    <div
      class="w-full max-w-md rounded-2xl border border-slate-200/70 bg-white/90 p-8 shadow-2xl shadow-slate-500/10 dark:border-slate-800/60 dark:bg-slate-900/90"
    >
      <div
        class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
      >
        <UIcon
          :name="
            status === 'SUCCESS'
              ? 'i-lucide-badge-check'
              : status === 'ERROR'
                ? 'i-lucide-alert-triangle'
                : 'i-lucide-loader-circle'
          "
          :class="['h-8 w-8', { 'animate-spin': status === 'PENDING' }]"
        />
      </div>
      <h1 class="mt-6 text-2xl font-semibold text-slate-900 dark:text-white">
        {{
          status === 'SUCCESS'
            ? '操作成功'
            : status === 'ERROR'
              ? '操作失败'
              : '请稍候'
        }}
      </h1>
      <p class="mt-3 text-sm text-slate-600 dark:text-slate-300">
        {{ message }}
      </p>
      <div class="mt-6">
        <UButton
          v-if="status !== 'PENDING'"
          color="primary"
          variant="soft"
          @click="router.replace(resolveRedirect(route.query.redirect))"
        >
          返回首页
        </UButton>
      </div>
    </div>
  </div>
</template>
