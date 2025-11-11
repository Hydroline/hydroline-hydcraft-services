import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'

type AuthFeatureFlags = {
  emailVerificationEnabled: boolean
  authmeRegisterEnabled: boolean
  authmeLoginEnabled: boolean
  authmeBindingEnabled: boolean
}

type SecurityFeatureFlags = {
  emailVerificationEnabled: boolean
  phoneVerificationEnabled: boolean
  passwordResetEnabled: boolean
}

const DEFAULT_FLAGS: AuthFeatureFlags & SecurityFeatureFlags = {
  emailVerificationEnabled: false,
  authmeRegisterEnabled: false,
  authmeLoginEnabled: false,
  authmeBindingEnabled: true,
  phoneVerificationEnabled: false,
  passwordResetEnabled: true,
}

export const useFeatureStore = defineStore('features', {
  state: () => ({
    flags: DEFAULT_FLAGS as AuthFeatureFlags & SecurityFeatureFlags,
    loading: false,
    loaded: false,
  }),
  getters: {
    authmeEnabled: (s) => s.flags.authmeBindingEnabled,
    emailVerificationEnabled: (s) => s.flags.emailVerificationEnabled,
    phoneVerificationEnabled: (s) => s.flags.phoneVerificationEnabled,
    passwordResetEnabled: (s) => s.flags.passwordResetEnabled,
  },
  actions: {
    async initialize(force = false) {
      if (this.loaded && !force) return
      this.loading = true
      try {
        const [authFlags, secFlags] = await Promise.all([
          apiFetch<AuthFeatureFlags>('/auth/features').catch((e) => {
            console.warn('[feature] load /auth/features failed', e)
            return DEFAULT_FLAGS
          }),
          apiFetch<SecurityFeatureFlags>('/auth/security/features').catch(
            (e) => {
              console.warn('[feature] load /auth/security/features failed', e)
              return {
                emailVerificationEnabled:
                  DEFAULT_FLAGS.emailVerificationEnabled,
                phoneVerificationEnabled:
                  DEFAULT_FLAGS.phoneVerificationEnabled,
                passwordResetEnabled: DEFAULT_FLAGS.passwordResetEnabled,
              }
            },
          ),
        ])
        this.flags = {
          ...DEFAULT_FLAGS,
          ...authFlags,
          ...secFlags,
          // 优先以 security 的 emailVerificationEnabled 覆盖 auth 的同名标志
          emailVerificationEnabled: secFlags.emailVerificationEnabled,
        }
        this.loaded = true
      } catch (error) {
        console.warn('[feature] failed to merge feature flags', error)
      } finally {
        this.loading = false
      }
    },
  },
})
