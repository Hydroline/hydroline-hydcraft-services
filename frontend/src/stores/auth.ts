import { defineStore } from 'pinia'
import { apiFetch, ApiError } from '@/utils/api'
import { useUiStore } from '@/stores/ui'

const ACCESS_TOKEN_KEY = 'hydroline.accessToken'
const REFRESH_TOKEN_KEY = 'hydroline.refreshToken'
const USER_CACHE_KEY = 'hydroline.cachedUser'

type RawUser = Record<string, any>

type GenderType = 'UNSPECIFIED' | 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER'

type UpdateCurrentUserPayload = {
  name?: string
  image?: string
  email?: string
  displayName?: string
  birthday?: string
  gender?: GenderType
  motto?: string
  timezone?: string
  locale?: string
  extra?: {
    addressLine1?: string
    addressLine2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    phone?: string
    phoneCountry?: 'CN' | 'HK' | 'MO' | 'TW'
    regionCountry?: 'CN' | 'OTHER'
    regionProvince?: string
    regionCity?: string
    regionDistrict?: string
  }
}

export type { GenderType, UpdateCurrentUserPayload }

type AuthLoginPayload =
  | { mode: 'EMAIL'; email: string; password: string; rememberMe?: boolean }
  | { mode: 'AUTHME'; authmeId: string; password: string; rememberMe?: boolean }

type AuthRegisterPayload =
  | {
      mode: 'EMAIL'
      email: string
      password: string
      name?: string
      minecraftId?: string
      minecraftNick?: string
      rememberMe?: boolean
    }
  | { mode: 'AUTHME'; authmeId: string; password: string; rememberMe?: boolean }

function readStoredValue(key: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return localStorage.getItem(key)
  } catch (error) {
    console.warn(`[auth] failed to read ${key} from localStorage`, error)
    return null
  }
}

function readStoredUser(): RawUser | null {
  const raw = readStoredValue(USER_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as RawUser
  } catch (error) {
    console.warn('[auth] failed to parse cached user payload, clearing it', error)
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_CACHE_KEY)
    }
    return null
  }
}

const initialAccessToken = readStoredValue(ACCESS_TOKEN_KEY)
const initialRefreshToken = readStoredValue(REFRESH_TOKEN_KEY)
const initialUser = readStoredUser()

let initializePromise: Promise<void> | null = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: initialAccessToken as string | null,
    refreshToken: initialRefreshToken as string | null,
    user: initialUser as RawUser | null,
    loading: false,
    refreshing: false,
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    roleKeys(state): string[] {
      if (!state.user?.roles) return []
      return state.user.roles.map((entry: any) => entry.role?.key).filter(Boolean)
    },
    permissionKeys(state): string[] {
      if (!state.user?.roles) return []
      const keys = new Set<string>()
      for (const entry of state.user.roles as any[]) {
        const perms = entry.role?.rolePermissions ?? []
        for (const rp of perms) {
          if (rp.permission?.key) {
            keys.add(rp.permission.key)
          }
        }
      }
      return Array.from(keys)
    },
    hasRole() {
      return (roleKey: string) => this.roleKeys.includes(roleKey)
    },
    hasPermission() {
      return (permissionKey: string) => this.permissionKeys.includes(permissionKey)
    },
    displayName(state): string | null {
      if (!state.user) return null
      return (
        state.user.profile?.displayName ??
        state.user.name ??
        state.user.email ??
        null
      )
    },
  },
  actions: {
    setToken(token: string | null) {
      this.token = token
      if (typeof window !== 'undefined') {
        if (token) {
          localStorage.setItem(ACCESS_TOKEN_KEY, token)
        } else {
          localStorage.removeItem(ACCESS_TOKEN_KEY)
        }
      }
    },
    setRefreshToken(token: string | null) {
      this.refreshToken = token
      if (typeof window !== 'undefined') {
        if (token) {
          localStorage.setItem(REFRESH_TOKEN_KEY, token)
        } else {
          localStorage.removeItem(REFRESH_TOKEN_KEY)
        }
      }
    },
    setUser(user: RawUser | null) {
      this.user = user
      if (typeof window !== 'undefined') {
        if (user) {
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
        } else {
          localStorage.removeItem(USER_CACHE_KEY)
        }
      }
    },
    async initialize() {
      if (this.initialized) return
      if (initializePromise) {
        return initializePromise
      }
      this.loading = true
      initializePromise = (async () => {
        try {
          if (this.token) {
            await this.fetchSession()
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            this.clear()
          } else {
            throw error
          }
        } finally {
          this.loading = false
          this.initialized = true
        }
      })()
      try {
        await initializePromise
      } finally {
        initializePromise = null
      }
    },
    async register(payload: AuthRegisterPayload) {
      this.loading = true
      try {
        const result = await apiFetch<{
          tokens: { accessToken: string | null; refreshToken: string | null }
          user: RawUser
        }>('/auth/register', {
          method: 'POST',
          body: payload,
        })
        this.setToken(result.tokens.accessToken ?? null)
        this.setRefreshToken(result.tokens.refreshToken ?? null)
        this.setUser(result.user)
        return result.user
      } finally {
        this.loading = false
      }
    },
    async login(payload: AuthLoginPayload) {
      this.loading = true
      try {
        const result = await apiFetch<{
          tokens: { accessToken: string | null; refreshToken: string | null }
          user: RawUser
        }>('/auth/login', {
          method: 'POST',
          body: payload,
        })
        this.setToken(result.tokens.accessToken ?? null)
        this.setRefreshToken(result.tokens.refreshToken ?? null)
        this.setUser(result.user)
        return result.user
      } finally {
        this.loading = false
      }
    },
    async signIn(payload: { email: string; password: string; rememberMe?: boolean }) {
      return this.login({
        mode: 'EMAIL',
        email: payload.email,
        password: payload.password,
        rememberMe: payload.rememberMe,
      })
    },
    async signOut() {
      if (!this.token) {
        this.clear()
        return
      }
      try {
        await apiFetch('/auth/signout', {
          method: 'POST',
          token: this.token,
        })
      } catch (error) {
        // 忽略 401
      } finally {
        this.clear()
        const { usePortalStore } = await import('./portal')
        usePortalStore().reset()
      }
    },
    async fetchSession() {
      if (!this.token) {
        return null
      }
      try {
        const result = await apiFetch<{ user: RawUser }>('/auth/session', {
          token: this.token,
        })
        this.setUser(result.user)
        return result.user
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return this.refreshSession()
        }
        throw error
      }
    },
    async refreshSession() {
      if (!this.refreshToken) {
        this.clear()
        const ui = useUiStore()
        if (!ui.loginDialogOpen) {
          ui.openLoginDialog()
        }
        throw new ApiError(401, '登录状态已过期')
      }
      this.refreshing = true
      try {
        const result = await apiFetch<{
          tokens: { accessToken: string; refreshToken: string | null }
          user: RawUser
        }>('/auth/refresh', {
          method: 'POST',
          body: {
            refreshToken: this.refreshToken,
          },
        })
        this.setToken(result.tokens.accessToken)
        this.setRefreshToken(result.tokens.refreshToken ?? null)
        this.setUser(result.user)
        return result.user
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          this.clear()
          const ui = useUiStore()
          if (!ui.loginDialogOpen) {
            ui.openLoginDialog()
          }
        }
        throw error
      } finally {
        this.refreshing = false
      }
    },
    async fetchCurrentUser() {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const result = await apiFetch<{ user: RawUser }>('/auth/me', {
        token: this.token,
      })
      this.setUser(result.user)
      return result.user
    },
    async updateCurrentUser(payload: UpdateCurrentUserPayload) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const result = await apiFetch<{ user: RawUser }>('/auth/me', {
        method: 'PATCH',
        token: this.token,
        body: payload,
      })
      this.setUser(result.user)
      return result.user
    },
    async listSessions() {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      return apiFetch<{ sessions: Array<Record<string, unknown>> }>('/auth/sessions', {
        token: this.token,
      })
    },
    async revokeSession(sessionId: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const endpoint = `/auth/sessions/${encodeURIComponent(sessionId)}`
      return apiFetch<{ success: boolean; current?: boolean }>(endpoint, {
        method: 'DELETE',
        token: this.token,
      })
    },
    async bindAuthme(payload: { authmeId: string; password: string }) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const result = await apiFetch<{ user: RawUser }>('/authme/bind', {
        method: 'POST',
        token: this.token,
        body: payload,
      })
      this.setUser(result.user)
      return result.user
    },
    async unbindAuthme(payload: { username?: string; password: string }) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const result = await apiFetch<{ user: RawUser }>('/authme/bind', {
        method: 'DELETE',
        token: this.token,
        body: payload,
      })
      this.setUser(result.user)
      return result.user
    },
    clear() {
      this.setToken(null)
      this.setRefreshToken(null)
      this.setUser(null)
      this.loading = false
      this.refreshing = false
      this.initialized = false
    },
  },
})
