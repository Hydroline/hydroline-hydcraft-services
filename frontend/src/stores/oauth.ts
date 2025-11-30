import { defineStore } from 'pinia'
import { apiFetch, ApiError } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'

export type AdminOAuthProvider = {
  id: string
  key: string
  name: string
  type: string
  description?: string | null
  enabled: boolean
  settings: {
    tenantId?: string
    clientId?: string
    authorizeUrl?: string
    tokenUrl?: string
    redirectUri?: string
    graphUserUrl?: string
    graphPhotoUrl?: string
    scopes?: string[]
    providerProxyEnabled?: boolean
    hasClientSecret: boolean
  }
  createdAt: string
  updatedAt: string
}

type Pagination<T> = {
  items: T[]
  pagination: {
    total: number
    page: number
    pageSize: number
    pageCount: number
  }
}

export const useOAuthStore = defineStore('oauth-admin', {
  state: () => ({
    providers: [] as AdminOAuthProvider[],
    providersLoaded: false,
    loadingProviders: false,
    proxyEnv: null as null | { proxyUrl: string | null; hasProxyKey: boolean },
  }),
  actions: {
    requireToken() {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new ApiError(401, '未登录')
      }
      return auth.token
    },
    async fetchProviders(force = false) {
      if (this.providersLoaded && !force) return
      const token = this.requireToken()
      this.loadingProviders = true
      try {
        const result = await apiFetch<AdminOAuthProvider[]>(
          '/auth/oauth/providers',
          { token },
        )
        this.providers = result
        this.providersLoaded = true
      } finally {
        this.loadingProviders = false
      }
    },
    async fetchProxyEnv() {
      const token = this.requireToken()
      this.proxyEnv = await apiFetch<{
        proxyUrl: string | null
        hasProxyKey: boolean
      }>('/auth/oauth/proxy-env', { token })
    },
    async testProxyConnectivity() {
      const token = this.requireToken()
      return apiFetch<{
        ok: boolean
        status?: number
        elapsedMs?: number
        env?: { proxyUrl: string | null; hasProxyKey: boolean }
        error?: string
      }>('/auth/oauth/proxy-test', { token })
    },
    async testProviderProxy(providerId?: string, url?: string) {
      const token = this.requireToken()
      const qs = new URLSearchParams()
      if (url) qs.set('url', url)
      const targetProviderId = providerId ?? this.providers[0]?.id ?? ''
      const path =
        qs.toString().length > 0
          ? `/auth/oauth/providers/${targetProviderId}/proxy-test?${qs.toString()}`
          : `/auth/oauth/providers/${targetProviderId}/proxy-test`
      return apiFetch<{
        ok: boolean
        status?: number
        env?: { proxyUrl?: string | null; hasProxyKey?: boolean }
        providerProxyEnabled?: boolean
        snippet?: string
        error?: string
      }>(path, { token })
    },
    async createProvider(payload: {
      key: string
      name: string
      type: string
      description?: string
      enabled?: boolean
      settings?: Record<string, unknown>
    }) {
      const token = this.requireToken()
      const provider = await apiFetch<AdminOAuthProvider>(
        '/auth/oauth/providers',
        {
          method: 'POST',
          token,
          body: payload,
        },
      )
      this.providers.push(provider)
      return provider
    },
    async updateProvider(
      providerId: string,
      payload: {
        key?: string
        name?: string
        type?: string
        description?: string | null
        enabled?: boolean
        settings?: Record<string, unknown>
      },
    ) {
      const token = this.requireToken()
      const provider = await apiFetch<AdminOAuthProvider>(
        `/auth/oauth/providers/${providerId}`,
        {
          method: 'PATCH',
          token,
          body: payload,
        },
      )
      const index = this.providers.findIndex((item) => item.id === providerId)
      if (index >= 0) {
        this.providers[index] = provider
      } else {
        this.providers.push(provider)
      }
      return provider
    },
    async removeProvider(providerId: string) {
      const token = this.requireToken()
      await apiFetch(`/auth/oauth/providers/${providerId}`, {
        method: 'DELETE',
        token,
      })
      this.providers = this.providers.filter((item) => item.id !== providerId)
    },
    async listAccounts(query: Record<string, string | number | undefined>) {
      const token = this.requireToken()
      const qs = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return
        qs.set(key, String(value))
      })
      const queryString = qs.toString()
      const path =
        queryString.length > 0
          ? `/auth/oauth/accounts?${queryString}`
          : '/auth/oauth/accounts'
      return apiFetch<Pagination<Record<string, unknown>>>(path, { token })
    },
    async removeAccount(accountId: string) {
      const token = this.requireToken()
      await apiFetch(`/auth/oauth/accounts/${accountId}`, {
        method: 'DELETE',
        token,
      })
      return true
    },
    async listLogs(query: Record<string, string | number | undefined>) {
      const token = this.requireToken()
      const qs = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (!value) return
        qs.set(key, String(value))
      })
      const queryString = qs.toString()
      const path =
        queryString.length > 0
          ? `/auth/oauth/logs?${queryString}`
          : '/auth/oauth/logs'
      return apiFetch<Pagination<Record<string, unknown>>>(path, { token })
    },
    async fetchStats(query: Record<string, string | number | undefined>) {
      const token = this.requireToken()
      const qs = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (!value) return
        qs.set(key, String(value))
      })
      const queryString = qs.toString()
      const path =
        queryString.length > 0
          ? `/auth/oauth/stats?${queryString}`
          : '/auth/oauth/stats'
      return apiFetch<Array<{ date: string; action: string; count: number }>>(
        path,
        { token },
      )
    },
    async startFlow(
      providerKey: string,
      payload: {
        mode: 'LOGIN' | 'BIND'
        redirectUri: string
        rememberMe?: boolean
      },
      options: { token?: string } = {},
    ) {
      return apiFetch<{ authorizeUrl: string; state: string }>(
        `/oauth/providers/${encodeURIComponent(providerKey)}/authorize`,
        {
          method: 'POST',
          body: payload,
          token: options.token,
        },
      )
    },
    async fetchResult(providerKey: string, state: string) {
      const qs = new URLSearchParams({ state })
      return apiFetch<Record<string, unknown>>(
        `/oauth/providers/${encodeURIComponent(providerKey)}/result?${qs.toString()}`,
      )
    },
    async unbind(providerKey: string) {
      const token = this.requireToken()
      await apiFetch(
        `/oauth/providers/${encodeURIComponent(providerKey)}/bindings`,
        {
          method: 'DELETE',
          token,
        },
      )
      return true
    },
  },
})
