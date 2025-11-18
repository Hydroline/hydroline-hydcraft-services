<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'
import { useOAuthStore } from '@/stores/oauth'
import { ApiError } from '@/utils/api'
import { resolveProviderAccent, resolveProviderIcon } from '@/utils/oauth-brand'

type AccountProfile = {
  displayName?: string | null
  email?: string | null
  userPrincipalName?: string | null
  avatarDataUri?: string | null
}

type BoundAccount = {
  id: string
  provider: string
  providerAccountId: string
  createdAt?: string
  profile?: AccountProfile | null
}

const auth = useAuthStore()
const featureStore = useFeatureStore()
const oauthStore = useOAuthStore()
const toast = useToast()

const oauthProviders = computed(() => featureStore.flags.oauthProviders ?? [])

function parseProfile(value: unknown): AccountProfile | undefined {
  if (!value || typeof value !== 'object') return undefined
  const profile = value as Record<string, unknown>
  return {
    displayName:
      typeof profile.displayName === 'string' ? profile.displayName : undefined,
    email: typeof profile.email === 'string' ? profile.email : undefined,
    userPrincipalName:
      typeof profile.userPrincipalName === 'string'
        ? profile.userPrincipalName
        : undefined,
    avatarDataUri:
      typeof profile.avatarDataUri === 'string'
        ? profile.avatarDataUri
        : undefined,
  }
}

const boundAccounts = computed<BoundAccount[]>(() => {
  const raw = (auth.user as { accounts?: unknown } | null)?.accounts
  if (!Array.isArray(raw)) return []
  const normalized: BoundAccount[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const provider = record.provider
    const providerAccountId = record.providerAccountId
    const id = record.id
    if (
      typeof provider !== 'string' ||
      typeof providerAccountId !== 'string' ||
      typeof id !== 'string'
    ) {
      continue
    }
    normalized.push({
      id,
      provider,
      providerAccountId,
      createdAt:
        typeof record.createdAt === 'string' ? record.createdAt : undefined,
      profile: parseProfile(record.profile),
    })
  }
  return normalized
})

const accountMap = computed<Map<string, BoundAccount>>(() => {
  const map = new Map<string, BoundAccount>()
  for (const account of boundAccounts.value) {
    map.set(account.provider, account)
  }
  return map
})

function linkedAccount(providerKey: string) {
  return accountMap.value.get(providerKey) ?? null
}

function accountPrimaryLabel(account: BoundAccount | null) {
  if (!account) return ''
  const profile = account.profile
  return (
    profile?.displayName ??
    profile?.userPrincipalName ??
    profile?.email ??
    account.providerAccountId
  )
}

function accountSecondaryLabel(account: BoundAccount | null) {
  if (!account) return null
  const profile = account.profile
  if (!profile) return null
  const primary = accountPrimaryLabel(account)
  const candidate =
    profile.userPrincipalName && profile.userPrincipalName !== primary
      ? profile.userPrincipalName
      : profile.email && profile.email !== primary
        ? profile.email
        : null
  return candidate
}

function accountAvatar(account: BoundAccount | null) {
  return account?.profile?.avatarDataUri ?? null
}

const loadingProvider = ref<string | null>(null)

async function bindProvider(providerKey: string) {
  if (!auth.token) {
    toast.add({ title: '请先登录', color: 'error' })
    return
  }
  loadingProvider.value = providerKey
  try {
    const callbackUrl = `${window.location.origin}/oauth/callback?redirect=${encodeURIComponent(window.location.href)}`
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
        class="rounded-xl border border-slate-200/60 bg-white dark:border-slate-800/60 dark:bg-slate-700/60 overflow-hidden"
      >
        <div class="px-5 py-3 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center">
              <UIcon
                :name="resolveProviderIcon(provider.type)"
                class="h-5 w-5"
                :class="resolveProviderAccent(provider.type)"
              />
            </div>
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
                <UBadge v-else color="neutral" size="sm" variant="soft"
                  >未绑定</UBadge
                >
              </div>
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
              variant="ghost"
              :loading="loadingProvider === provider.key"
              @click="bindProvider(provider.key)"
            >
              绑定
            </UButton>
          </div>
        </div>

        <div
          class="grid gap-4 p-4 py-3 bg-slate-50/60 dark:bg-slate-700/60 border-t border-slate-200/60 dark:border-slate-800/60 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2"
          v-if="linkedAccount(provider.key)"
        >
          <div class="col-span-2 flex items-center gap-3">
            <div>
              <div class="flex items-center gap-3">
                <UAvatar
                  v-if="accountAvatar(linkedAccount(provider.key))"
                  :src="accountAvatar(linkedAccount(provider.key))!"
                  size="lg"
                  class="ring-2 ring-slate-200/50 dark:ring-slate-800/50"
                />
                <div
                  v-else
                  class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800"
                >
                  <UIcon name="i-lucide-user-round" class="h-9 w-9" />
                </div>

                <div>
                  <div
                    class="text-base font-semibold text-slate-800 dark:text-slate-200"
                  >
                    {{ accountPrimaryLabel(linkedAccount(provider.key)) }}
                  </div>
                  <p
                    v-if="accountSecondaryLabel(linkedAccount(provider.key))"
                    class="text-xs text-slate-500 dark:text-slate-400"
                  >
                    {{ accountSecondaryLabel(linkedAccount(provider.key)) }}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div class="text-xs text-slate-500 dark:text-slate-500">
              外部账号 ID
            </div>
            <div
              class="break-all text-base font-semibold text-slate-800 dark:text-slate-300"
            >
              {{ linkedAccount(provider.key)?.providerAccountId }}
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
        </div>
      </div>
    </div>
  </section>
</template>
