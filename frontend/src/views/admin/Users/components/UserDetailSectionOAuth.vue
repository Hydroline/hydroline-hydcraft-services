<script setup lang="ts">
import { computed } from 'vue'
import type { AdminOauthAccount } from '@/types/admin'
import { resolveProviderAccent, resolveProviderIcon } from '@/utils/oauth/brand'

type ProviderSummary = {
  key: string
  name: string
  type: string
}

const props = withDefaults(
  defineProps<{
    providers: ProviderSummary[]
    accounts: AdminOauthAccount[]
    loading?: boolean
    unbindingId?: string | null
  }>(),
  {
    providers: () => [],
    accounts: () => [],
    loading: false,
    unbindingId: null,
  },
)

const emit = defineEmits<{ (e: 'unbind', accountId: string): void }>()

const accountMap = computed(() => {
  const map = new Map<string, AdminOauthAccount>()
  for (const account of props.accounts) {
    map.set(account.provider, account)
  }
  return map
})

function linkedAccount(providerKey: string) {
  return accountMap.value.get(providerKey) ?? null
}

function parseProfile(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return {
    displayName:
      typeof record.displayName === 'string' ? record.displayName : undefined,
    email: typeof record.email === 'string' ? record.email : undefined,
    userPrincipalName:
      typeof record.userPrincipalName === 'string'
        ? record.userPrincipalName
        : undefined,
  }
}

function accountPrimaryLabel(account: AdminOauthAccount | null) {
  if (!account) return '未绑定'
  const profile = parseProfile(account.profile)
  return (
    profile?.displayName ||
    profile?.userPrincipalName ||
    profile?.email ||
    account.providerAccountId
  )
}

function accountSecondaryLabel(account: AdminOauthAccount | null) {
  if (!account) return null
  const profile = parseProfile(account.profile)
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

const extraAccounts = computed(() =>
  props.accounts.filter(
    (acc) => !props.providers.some((provider) => provider.key === acc.provider),
  ),
)
</script>

<template>
  <section
    class="rounded-2xl border border-slate-200/70 p-6 dark:border-slate-800/70"
  >
    <div class="flex items-center justify-between">
      <div class="text-sm tracking-wide text-slate-500 dark:text-slate-400">
        OAuth 绑定
      </div>
    </div>

    <div v-if="providers.length || accounts.length" class="mt-4 space-y-3">
      <div
        v-for="provider in providers"
        :key="provider.key"
        class="flex items-center justify-between gap-4 rounded-xl border border-slate-200/70 bg-slate-100/50 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/50"
      >
        <div class="flex items-center gap-3">
          <div>
            <UIcon
              :name="resolveProviderIcon(provider.type)"
              class="h-7 w-7"
              :class="resolveProviderAccent(provider.type)"
            />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-slate-900 dark:text-white">
                {{ provider.name }}
              </p>
              <UBadge size="xs" variant="soft">{{
                linkedAccount(provider.key) ? '已绑定' : '未绑定'
              }}</UBadge>
            </div>
            <p
              v-if="linkedAccount(provider.key)"
              class="text-xs text-slate-600 dark:text-slate-300"
            >
              {{ accountPrimaryLabel(linkedAccount(provider.key)) }}
            </p>
            <p
              v-if="accountSecondaryLabel(linkedAccount(provider.key))"
              class="text-[11px] text-slate-500 dark:text-slate-400"
            >
              {{ accountSecondaryLabel(linkedAccount(provider.key)) }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            v-if="linkedAccount(provider.key)"
            size="sm"
            color="error"
            variant="link"
            :loading="unbindingId === linkedAccount(provider.key)?.id"
            :disabled="loading"
            @click="
              linkedAccount(provider.key) &&
              emit('unbind', linkedAccount(provider.key)!.id)
            "
          >
            解绑
          </UButton>
          <span v-else class="text-xs text-slate-400 dark:text-slate-500">
            未绑定
          </span>
        </div>
      </div>

      <div
        v-if="extraAccounts.length"
        class="rounded-xl border border-dashed border-slate-200/80 bg-white/40 p-4 text-xs text-slate-600 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-300"
      >
        <div
          class="mb-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400"
        >
          其他已绑定账号
        </div>
        <div class="space-y-2">
          <div
            v-for="account in extraAccounts"
            :key="account.id"
            class="flex items-center justify-between gap-3 rounded-lg bg-slate-50/80 px-3 py-2 dark:bg-slate-900/40"
          >
            <div>
              <p class="text-sm font-semibold text-slate-800 dark:text-white">
                {{ account.providerName || account.provider }}
              </p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">
                {{ account.providerAccountId }}
              </p>
            </div>
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              :loading="unbindingId === account.id"
              :disabled="loading"
              @click="emit('unbind', account.id)"
            >
              解绑
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else
      class="mt-4 rounded-xl border border-dashed border-slate-200/70 p-4 text-center text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-400"
    >
      暂无可用的 OAuth Provider
    </div>
  </section>
</template>
