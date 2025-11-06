import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'

type AuthFeatureFlags = {
  emailVerificationEnabled: boolean
  authmeRegisterEnabled: boolean
  authmeLoginEnabled: boolean
  authmeBindingEnabled: boolean
}

const DEFAULT_FLAGS: AuthFeatureFlags = {
  emailVerificationEnabled: false,
  authmeRegisterEnabled: false,
  authmeLoginEnabled: false,
  authmeBindingEnabled: true,
}

export const useFeatureStore = defineStore('features', {
  state: () => ({
    flags: DEFAULT_FLAGS as AuthFeatureFlags,
    loading: false,
    loaded: false,
  }),
  actions: {
    async initialize(force = false) {
      if (this.loaded && !force) return
      this.loading = true
      try {
        const result = await apiFetch<AuthFeatureFlags>('/auth/features')
        this.flags = result
        this.loaded = true
      } catch (error) {
        console.warn('[feature] failed to load feature flags', error)
      } finally {
        this.loading = false
      }
    },
  },
})
