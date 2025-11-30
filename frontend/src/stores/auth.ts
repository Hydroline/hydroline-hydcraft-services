import { defineStore } from 'pinia'
import { apiFetch, ApiError } from '@/utils/api'
import { useUiStore } from '@/stores/ui'

const ACCESS_TOKEN_KEY = 'hydroline.accessToken'
const REFRESH_TOKEN_KEY = 'hydroline.refreshToken'
const USER_CACHE_KEY = 'hydroline.cachedUser'

type RawUser = Record<string, unknown>
type EmailContact = Record<string, unknown>
type PhoneContact = Record<string, unknown>

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
  | { mode: 'EMAIL_CODE'; email: string; code: string; rememberMe?: boolean }
  | { mode: 'AUTHME'; authmeId: string; password: string; rememberMe?: boolean }

type AuthRegisterPayload =
  | {
      mode: 'EMAIL'
      email: string
      password: string
      code: string
      name?: string
      minecraftId?: string
      minecraftNick?: string
      rememberMe?: boolean
    }
  | {
      mode: 'AUTHME'
      authmeId: string
      password: string
      email: string
      code: string
      rememberMe?: boolean
    }

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
    console.warn(
      '[auth] failed to parse cached user payload, clearing it',
      error,
    )
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
      const roles = (state.user as { roles?: unknown } | null)?.roles
      if (!Array.isArray(roles)) {
        return []
      }
      const keys: string[] = []
      for (const entry of roles) {
        if (!entry || typeof entry !== 'object') {
          continue
        }
        const role = (entry as { role?: unknown }).role
        if (!role || typeof role !== 'object') {
          continue
        }
        const key = (role as { key?: unknown }).key
        if (typeof key === 'string' && key.length > 0) {
          keys.push(key)
        }
      }
      return keys
    },
    permissionKeys(state): string[] {
      const roles = (state.user as { roles?: unknown } | null)?.roles
      if (!Array.isArray(roles)) {
        return []
      }
      const keys = new Set<string>()
      for (const entry of roles) {
        if (!entry || typeof entry !== 'object') {
          continue
        }
        const role = (entry as { role?: unknown }).role
        if (!role || typeof role !== 'object') {
          continue
        }
        const rolePermissions = (role as { rolePermissions?: unknown })
          .rolePermissions
        if (!Array.isArray(rolePermissions)) {
          continue
        }
        for (const rp of rolePermissions) {
          if (!rp || typeof rp !== 'object') {
            continue
          }
          const permission = (rp as { permission?: unknown }).permission
          if (!permission || typeof permission !== 'object') {
            continue
          }
          const key = (permission as { key?: unknown }).key
          if (typeof key === 'string' && key.length > 0) {
            keys.add(key)
          }
        }
      }
      return Array.from(keys)
    },
    hasRole() {
      return (roleKey: string) => this.roleKeys.includes(roleKey)
    },
    hasPermission() {
      return (permissionKey: string) =>
        this.permissionKeys.includes(permissionKey)
    },
    displayName(state): string | null {
      const user = state.user
      if (!user || typeof user !== 'object') {
        return null
      }
      const profile = (user as { profile?: unknown }).profile
      if (profile && typeof profile === 'object') {
        const displayName = (profile as { displayName?: unknown }).displayName
        if (typeof displayName === 'string' && displayName.length > 0) {
          return displayName
        }
      }
      const name = (user as { name?: unknown }).name
      if (typeof name === 'string' && name.length > 0) {
        return name
      }
      const email = (user as { email?: unknown }).email
      if (typeof email === 'string' && email.length > 0) {
        return email
      }
      return null
    },
    avatarUrl(state): string | null {
      const user = state.user
      if (!user || typeof user !== 'object') {
        return null
      }
      const profile = (user as { profile?: unknown }).profile
      if (profile && typeof profile === 'object') {
        const profileAvatar = (profile as { avatarUrl?: unknown }).avatarUrl
        if (typeof profileAvatar === 'string' && profileAvatar.length > 0) {
          return profileAvatar
        }
      }
      const directAvatar = (user as { avatarUrl?: unknown }).avatarUrl
      if (typeof directAvatar === 'string' && directAvatar.length > 0) {
        return directAvatar
      }
      const fallbackImage = (user as { image?: unknown }).image
      return typeof fallbackImage === 'string' && fallbackImage.length > 0
        ? fallbackImage
        : null
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
    async requestEmailLoginCode(email: string) {
      const trimmed = (email || '').trim()
      if (!trimmed) {
        throw new ApiError(400, '请输入邮箱')
      }
      await apiFetch<{ success: boolean }>('/auth/login/code', {
        method: 'POST',
        body: { email: trimmed },
      })
      return true
    },
    async requestEmailRegisterCode(email: string) {
      const trimmed = (email || '').trim()
      if (!trimmed) {
        throw new ApiError(400, '请输入邮箱')
      }
      await apiFetch<{ success: boolean }>('/auth/register/code', {
        method: 'POST',
        body: { email: trimmed },
      })
      return true
    },
    // Public: request a password reset verification code to email
    async requestPasswordResetCode(email: string) {
      const trimmed = (email || '').trim()
      if (!trimmed) {
        throw new ApiError(400, '请输入邮箱')
      }
      await apiFetch<{ success: boolean }>('/auth/password/forgot', {
        method: 'POST',
        body: { email: trimmed },
      })
      return true
    },
    // Public: confirm password reset with code and new password
    async confirmPasswordReset(payload: {
      email: string
      code: string
      password: string
    }) {
      const email = (payload.email || '').trim()
      const code = (payload.code || '').trim()
      const password = payload.password || ''
      if (!email || !code || !password) {
        throw new ApiError(400, '请填写完整信息')
      }
      await apiFetch<{ success: boolean }>('/auth/password/confirm', {
        method: 'POST',
        body: { email, code, password },
      })
      return true
    },
    // Authenticated: list email contacts (primary first)
    async listEmailContacts() {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const result = await apiFetch<{
        items?: EmailContact[]
        contacts?: EmailContact[]
      }>('/auth/me/contacts/email', {
        token: this.token,
      })
      const contacts = Array.isArray(result.items)
        ? result.items
        : Array.isArray(result.contacts)
          ? result.contacts
          : []
      return contacts
    },
    // Authenticated: add an email contact (will send verification code)
    async addEmailContact(email: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const trimmed = (email || '').trim()
      if (!trimmed) {
        throw new ApiError(400, '请输入邮箱')
      }
      const result = await apiFetch<{ contact: EmailContact }>(
        '/auth/me/contacts/email',
        {
          method: 'POST',
          token: this.token,
          body: { email: trimmed },
        },
      )
      try {
        await this.fetchCurrentUser()
      } catch {}
      return result.contact
    },
    // Authenticated: resend email verification code for a contact email
    async resendEmailVerification(email: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const trimmed = (email || '').trim()
      if (!trimmed) {
        throw new ApiError(400, '请输入邮箱')
      }
      await apiFetch<{ success: boolean }>('/auth/me/contacts/email/resend', {
        method: 'POST',
        token: this.token,
        body: { email: trimmed },
      })
      return true
    },
    // Authenticated: verify email contact with a code
    async verifyEmailContact(payload: { email: string; code: string }) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const email = (payload.email || '').trim()
      const code = (payload.code || '').trim()
      if (!email || !code) {
        throw new ApiError(400, '请输入邮箱和验证码')
      }
      const result = await apiFetch<{
        success: boolean
        updatedUser?: RawUser
      }>('/auth/me/contacts/email/verify', {
        method: 'POST',
        token: this.token,
        body: { email, code },
      })
      // If backend returns updated user, sync
      if (result.updatedUser) {
        this.setUser(result.updatedUser)
      } else {
        // Else refresh current user to reflect contact verification status
        try {
          await this.fetchCurrentUser()
        } catch {}
      }
      return true
    },
    // Authenticated: set a contact as primary (by contactId)
    async setPrimaryEmailContact(contactId: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const endpoint = `/auth/me/contacts/email/${encodeURIComponent(contactId)}/primary`
      const result = await apiFetch<{ success: boolean; user?: RawUser }>(
        endpoint,
        {
          method: 'PATCH',
          token: this.token,
        },
      )
      if (result.user) {
        this.setUser(result.user)
      } else {
        try {
          await this.fetchCurrentUser()
        } catch {}
      }
      return true
    },
    // Authenticated: remove an email contact (cannot remove primary; backend enforces)
    async removeEmailContact(contactId: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const endpoint = `/auth/me/contacts/email/${encodeURIComponent(contactId)}`
      await apiFetch<{ success: boolean }>(endpoint, {
        method: 'DELETE',
        token: this.token,
      })
      try {
        await this.fetchCurrentUser()
      } catch {}
      return true
    },
    async listPhoneContacts() {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const result = await apiFetch<{
        items?: PhoneContact[]
        contacts?: PhoneContact[]
      }>('/auth/me/contacts/phone', {
        token: this.token,
      })
      const contacts = Array.isArray(result.items)
        ? result.items
        : Array.isArray(result.contacts)
          ? result.contacts
          : []
      return contacts
    },
    async addPhoneContact(payload: {
      dialCode: string
      phone: string
      isPrimary?: boolean
    }) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const { dialCode, phone, isPrimary } = payload
      const result = await apiFetch<{ contact: PhoneContact }>(
        '/auth/me/contacts/phone',
        {
          method: 'POST',
          token: this.token,
          body: {
            dialCode,
            phone,
            isPrimary,
          },
        },
      )
      try {
        await this.fetchCurrentUser()
      } catch {}
      return result.contact
    },
    async updatePhoneContact(
      contactId: string,
      payload: { dialCode?: string; phone?: string; isPrimary?: boolean },
    ) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const endpoint = `/auth/me/contacts/phone/${encodeURIComponent(contactId)}`
      const result = await apiFetch<{ contact: PhoneContact }>(endpoint, {
        method: 'PATCH',
        token: this.token,
        body: payload,
      })
      try {
        await this.fetchCurrentUser()
      } catch {}
      return result.contact
    },
    async resendPhoneVerification(phone: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const trimmed = (phone || '').trim()
      if (!trimmed) {
        throw new ApiError(400, '请输入手机号')
      }
      await apiFetch<{ success: boolean }>('/auth/me/contacts/phone/resend', {
        method: 'POST',
        token: this.token,
        body: { phone: trimmed },
      })
      return true
    },
    async verifyPhoneContact(payload: { phone: string; code: string }) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const phone = (payload.phone || '').trim()
      const code = (payload.code || '').trim()
      if (!phone || !code) {
        throw new ApiError(400, '请输入手机号和验证码')
      }
      await apiFetch<{ success: boolean }>('/auth/me/contacts/phone/verify', {
        method: 'POST',
        token: this.token,
        body: { phone, code },
      })
      try {
        await this.fetchCurrentUser()
      } catch {}
      return true
    },
    async setPrimaryPhoneContact(contactId: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const endpoint = `/auth/me/contacts/phone/${encodeURIComponent(contactId)}/primary`
      await apiFetch<{ success: boolean }>(endpoint, {
        method: 'PATCH',
        token: this.token,
      })
      try {
        await this.fetchCurrentUser()
      } catch {}
      return true
    },
    async removePhoneContact(contactId: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const endpoint = `/auth/me/contacts/phone/${encodeURIComponent(contactId)}`
      await apiFetch<{ success: boolean }>(endpoint, {
        method: 'DELETE',
        token: this.token,
      })
      try {
        await this.fetchCurrentUser()
      } catch {}
      return true
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
    async signIn(payload: {
      email: string
      password: string
      rememberMe?: boolean
    }) {
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
      } catch {
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
    async uploadAvatar(file: File) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const formData = new FormData()
      formData.append('avatar', file)
      const result = await apiFetch<{ user: RawUser }>('/auth/me/avatar', {
        method: 'PATCH',
        token: this.token,
        body: formData,
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
      return apiFetch<{ sessions: Array<Record<string, unknown>> }>(
        '/auth/sessions',
        {
          token: this.token,
        },
      )
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
    async setPrimaryAuthmeBinding(bindingId: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const result = await apiFetch<{ user: RawUser }>('/authme/bind/primary', {
        method: 'PATCH',
        token: this.token,
        body: { bindingId },
      })
      this.setUser(result.user)
      return result.user
    },
    async addMinecraftNickname(payload: {
      nickname: string
      isPrimary?: boolean
    }) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const result = await apiFetch<{ user: RawUser }>(
        '/auth/me/minecraft-profiles',
        {
          method: 'POST',
          token: this.token,
          body: payload,
        },
      )
      this.setUser(result.user)
      return result.user
    },
    async updateMinecraftNickname(
      profileId: string,
      payload: { nickname?: string; isPrimary?: boolean },
    ) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const endpoint = `/auth/me/minecraft-profiles/${encodeURIComponent(profileId)}`
      const result = await apiFetch<{ user: RawUser }>(endpoint, {
        method: 'PATCH',
        token: this.token,
        body: payload,
      })
      this.setUser(result.user)
      return result.user
    },
    async removeMinecraftNickname(profileId: string) {
      if (!this.token) {
        throw new ApiError(401, '未登录')
      }
      const endpoint = `/auth/me/minecraft-profiles/${encodeURIComponent(profileId)}`
      const result = await apiFetch<{ user: RawUser }>(endpoint, {
        method: 'DELETE',
        token: this.token,
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
