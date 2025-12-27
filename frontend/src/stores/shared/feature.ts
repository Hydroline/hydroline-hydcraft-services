import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'

type OAuthProviderSummary = {
  key: string
  name: string
  type: string
  hasClientSecret?: boolean
}

type AuthFeatureFlags = {
  emailVerificationEnabled: boolean
  authmeRegisterEnabled: boolean
  authmeLoginEnabled: boolean
  authmeBindingEnabled: boolean
  phoneVerificationEnabled: boolean
  passwordResetEnabled: boolean
  inviteRequired: boolean
  oauthProviders?: OAuthProviderSummary[]
}

const DEFAULT_FLAGS: AuthFeatureFlags = {
  emailVerificationEnabled: false,
  authmeRegisterEnabled: false,
  authmeLoginEnabled: false,
  authmeBindingEnabled: true,
  oauthProviders: [],
  phoneVerificationEnabled: false,
  passwordResetEnabled: true,
  inviteRequired: false,
}

export const useFeatureStore = defineStore('features', {
  state: () => ({
    flags: DEFAULT_FLAGS as AuthFeatureFlags,
    loading: false,
    loaded: false,
  }),
  getters: {
    authmeEnabled: (s) => s.flags.authmeBindingEnabled,
    emailVerificationEnabled: (s) => s.flags.emailVerificationEnabled,
    phoneVerificationEnabled: (s) => s.flags.phoneVerificationEnabled,
    passwordResetEnabled: (s) => s.flags.passwordResetEnabled,
    oauthProviders: (s) => s.flags.oauthProviders ?? [],
  },
  actions: {
    async initialize(force = false) {
      if (this.loaded && !force) return
      this.loading = true
      try {
        const authFlags = await apiFetch<AuthFeatureFlags>(
          '/auth/features',
        ).catch((e) => {
          console.warn('[feature] load /auth/features failed', e)
          return DEFAULT_FLAGS
        })
        this.flags = { ...DEFAULT_FLAGS, ...authFlags }
        this.loaded = true
      } catch (error) {
        console.warn('[feature] failed to merge feature flags', error)
      } finally {
        this.loading = false
      }
    },
  },
})
