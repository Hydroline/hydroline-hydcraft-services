<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'
import { useOAuthStore } from '@/stores/oauth'
import { ApiError } from '@/utils/api'

const auth = useAuthStore()
const featureStore = useFeatureStore()
const oauthStore = useOAuthStore()
const toast = useToast()

const oauthProviders = computed(() => featureStore.flags.oauthProviders ?? [])

const accounts = computed(() => {
  const raw = (auth.user as { accounts?: unknown } | null)?.accounts
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is Record<string, unknown> => Boolean(entry))
})

function linkedAccount(providerKey: string) {
  return accounts.value.find(
    (account) => (account as { provider?: string }).provider === providerKey,
  )
}

const loadingProvider = ref<string | null>(null)

async function bindProvider(providerKey: string) {
  if (!auth.token) {
    toast.add({ title: '请先登录', color: 'error' })
    return
  }
  loadingProvider.value = providerKey
  try {
    const callbackUrl = `${window.location.origin}/oauth/callback`
    const result = await oauthStore.startFlow(
      providerKey,
      {
        mode: 'BIND',
        redirectUri: callbackUrl,
        rememberMe: true,
      },
      { token: auth.token },
    )
    window.location.href = result.authorizeUrl
  } catch (error) {
    loadingProvider.value = null
    toast.add({
      title: '绑定失败',
      description:
        error instanceof ApiError ? error.message : '无法启动授权流程',
      color: 'error',
    })
  }
}

async function unbindProvider(providerKey: string) {
  if (!auth.token) return
  loadingProvider.value = providerKey
  try {
    await oauthStore.unbind(providerKey)
    await auth.fetchCurrentUser()
    toast.add({ title: '已解除绑定', color: 'success' })
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: error instanceof ApiError ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    loadingProvider.value = null
  }
}
</script>

<template>
  <section v-if="oauthProviders.length" class="space-y-3">
    <div class="flex items-center justify-between px-1">
      <div>
        <h3
          class="flex items-center gap-2 px-1 text-lg text-slate-600 dark:text-slate-300"
        >
          平台绑定
        </h3>
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <div
        v-for="provider in oauthProviders"
        :key="provider.key"
        class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-700/60"
      >
        <div class="flex items-center justify-between">
          <div>
            <div
              class="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100"
            >
              {{ provider.name }}

              <UBadge
                v-if="linkedAccount(provider.key)"
                color="primary"
                size="sm"
                variant="soft"
                >已绑定</UBadge
              >
            </div>
          </div>
          <div class="flex gap-2">
            <UButton
              v-if="linkedAccount(provider.key)"
              color="error"
              size="sm"
              variant="ghost"
              :loading="loadingProvider === provider.key"
              @click="unbindProvider(provider.key)"
            >
              解除绑定
            </UButton>
            <UButton
              v-else
              color="primary"
              size="sm"
              variant="soft"
              :loading="loadingProvider === provider.key"
              @click="bindProvider(provider.key)"
            >
              绑定
            </UButton>
          </div>
        </div>
        <div class="grid gap-4 md:grid-cols-2 mt-3 text-sm text-slate-600 dark:text-slate-300">
          <template v-if="linkedAccount(provider.key)">
            <div>
              <div class="text-xs text-slate-500 dark:text-slate-500">账号</div>
              <div
                class="line-clamp-1 truncate text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{
                  (linkedAccount(provider.key)?.providerAccountId as string) ??
                  '已绑定'
                }}
              </div>
            </div>
            <div class="text-xs text-slate-500">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                绑定时间
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{
                  linkedAccount(provider.key)?.createdAt
                    ? new Date(
                        linkedAccount(provider.key)?.createdAt as string,
                      ).toLocaleString()
                    : '—'
                }}
              </div>
            </div>
          </template>
          <template v-else> 尚未绑定 {{ provider.name }} 账号 </template>
        </div>
      </div>
    </div>
  </section>
</template>
