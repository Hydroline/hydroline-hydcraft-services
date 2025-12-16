import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  PlayerAssetsResponse,
  PlayerAuthmeProfileResponse,
  PlayerBiography,
  PlayerGameStatsResponse,
  PlayerLikeSummary,
  PlayerMessageBoardEntry,
  PlayerMessageReactionType,
  PlayerMinecraftResponse,
  PlayerPortalProfileResponse,
  PlayerRegionResponse,
  PlayerStatsResponse,
  PlayerSummary,
  PlayerIsLoggedResponse,
  PlayerLifecycleEvent,
  PermissionAdjustmentOptions,
  PlayerMtrBalanceResponse,
} from '@/types/portal'

type RankContextResponse = import('@/types/portal').RankContextResponse
type RankLeaderboardResponse = import('@/types/portal').RankLeaderboardResponse
type RankCategoryInfo = import('@/types/portal').RankCategoryInfo

export const usePlayerPortalStore = defineStore('player-portal', {
  state: () => ({
    summary: null as PlayerSummary | null,
    assets: null as PlayerAssetsResponse | null,
    region: null as PlayerRegionResponse | null,
    minecraft: null as PlayerMinecraftResponse | null,
    stats: null as PlayerStatsResponse | null,
    likes: null as PlayerLikeSummary | null,
    biography: null as PlayerBiography | null,
    statusSnapshot: null as PlayerStatusSnapshot | null,
    viewerId: null as string | null,
    targetUserId: null as string | null,
    authmeProfile: null as PlayerAuthmeProfileResponse | null,
    targetAuthmeUsername: null as string | null,
    messages: [] as PlayerMessageBoardEntry[],
    logged: null as boolean | null,
    loading: false,
    submitting: false,
    rankCategories: [] as RankCategoryInfo[],
    leaderboard: null as RankLeaderboardResponse | null,
    rankContext: null as RankContextResponse | null,
    lifecycleEvents: [] as PlayerLifecycleEvent[],
  }),
  actions: {
    authToken() {
      const auth = useAuthStore()
      return auth.token ?? null
    },
    async fetchProfile(
      options: {
        id?: string
        playerName?: string
      } = {},
    ) {
      const params = new URLSearchParams()
      if (options.playerName) {
        params.set('player_name', options.playerName)
      } else if (options.id) {
        params.set('id', options.id)
      }
      this.loading = true
      try {
        const query = params.toString()
        const response = await apiFetch<PlayerPortalProfileResponse>(
          `/player/profile${query ? `?${query}` : ''}`,
          { token: this.authToken() ?? undefined },
        )
        this.summary = response.summary
        this.assets = response.assets
        this.region = response.region
        this.minecraft = response.minecraft
        this.stats = response.stats
        this.likes = response.likes ?? null
        this.statusSnapshot = response.statusSnapshot
        this.biography = response.biography
        this.messages = response.messages ?? []
        this.viewerId = response.viewerId
        this.targetUserId = response.targetId
        this.authmeProfile = null
        this.targetAuthmeUsername = null
        return response
      } finally {
        this.loading = false
      }
    },
    async fetchAuthmeProfile(username: string) {
      if (!username) {
        throw new Error('Username is required')
      }
      this.loading = true
      try {
        const response = await apiFetch<PlayerAuthmeProfileResponse>(
          `/player/authme/${encodeURIComponent(username)}`,
          { token: this.authToken() ?? undefined },
        )
        this.authmeProfile = response
        this.summary = null
        this.assets = null
        this.region = null
        this.minecraft = null
        this.stats = response.stats
        this.statusSnapshot = null
        this.likes = null
        this.biography = null
        this.messages = []
        this.viewerId = null
        this.targetUserId = null
        this.targetAuthmeUsername = username
        return response
      } finally {
        this.loading = false
      }
    },
    async fetchLikeSummary(options: { id?: string } = {}) {
      const params = new URLSearchParams()
      if (options.id) params.set('id', options.id)
      const query = params.toString()
      this.likes = await apiFetch<PlayerLikeSummary>(
        `/player/likes${query ? `?${query}` : ''}`,
        { token: this.authToken() ?? undefined },
      )
      return this.likes
    },
    async likePlayer(options: { id?: string } = {}) {
      const params = new URLSearchParams()
      if (options.id) params.set('id', options.id)
      const query = params.toString()
      this.likes = await apiFetch<PlayerLikeSummary>(
        `/player/likes${query ? `?${query}` : ''}`,
        {
          method: 'POST',
          token: this.authToken() ?? undefined,
        },
      )
      return this.likes
    },
    async unlikePlayer(options: { id?: string } = {}) {
      const params = new URLSearchParams()
      if (options.id) params.set('id', options.id)
      const query = params.toString()
      this.likes = await apiFetch<PlayerLikeSummary>(
        `/player/likes${query ? `?${query}` : ''}`,
        {
          method: 'DELETE',
          token: this.authToken() ?? undefined,
        },
      )
      return this.likes
    },
    async fetchLoggedStatus(options: { id?: string } = {}) {
      const params = new URLSearchParams()
      if (options.id) params.set('id', options.id)
      const query = params.toString()
      const response = await apiFetch<PlayerIsLoggedResponse>(
        `/player/is-logged${query ? `?${query}` : ''}`,
        { token: this.authToken() ?? undefined },
      )
      this.logged = response.logged
      return response.logged
    },
    async fetchStats(period = '30d', id?: string) {
      const params = new URLSearchParams({ period })
      const effectiveId = id ?? this.targetUserId
      if (effectiveId) {
        params.set('id', effectiveId)
      }
      this.stats = await apiFetch<PlayerStatsResponse>(
        `/player/stats?${params.toString()}`,
        { token: this.authToken() ?? undefined },
      )
      return this.stats
    },
    async refreshStats(period = '30d') {
      this.stats = await apiFetch<PlayerStatsResponse>(
        '/player/stats/refresh',
        {
          method: 'POST',
          body: { period },
          token: this.authToken() ?? undefined,
        },
      )
      return this.stats
    },
    async fetchGameStatsForBinding(
      bindingId: string,
      options: { serverId?: string; userId?: string } = {},
    ) {
      const params = new URLSearchParams({ bindingId })
      const effectiveUserId = options.userId ?? this.targetUserId
      if (effectiveUserId) {
        params.set('id', effectiveUserId)
      }
      if (options.serverId) {
        params.set('serverId', options.serverId)
      }
      return apiFetch<PlayerGameStatsResponse>(
        `/player/game-stats?${params.toString()}`,
        { token: this.authToken() ?? undefined },
      )
    },
    async requestAuthmePasswordReset(payload: {
      serverId: string
      password: string
      bindingId?: string
      reason?: string
    }) {
      this.submitting = true
      try {
        await apiFetch('/player/authme/reset-password', {
          method: 'POST',
          body: payload,
          token: this.authToken() ?? undefined,
        })
      } finally {
        this.submitting = false
      }
    },
    async requestForceLogin(payload: {
      serverId: string
      bindingId?: string
      reason?: string
    }) {
      this.submitting = true
      try {
        await apiFetch('/player/authme/force-login', {
          method: 'POST',
          body: payload,
          token: this.authToken() ?? undefined,
        })
      } finally {
        this.submitting = false
      }
    },
    async requestSetPlayerMtrBalance(payload: {
      serverId: string
      bindingId?: string
      amount: number
    }) {
      this.submitting = true
      try {
        return await apiFetch<PlayerMtrBalanceResponse>('/player/mtr/set', {
          method: 'POST',
          body: payload,
          token: this.authToken() ?? undefined,
        })
      } finally {
        this.submitting = false
      }
    },
    async requestAddPlayerMtrBalance(payload: {
      serverId: string
      bindingId?: string
      amount: number
    }) {
      this.submitting = true
      try {
        return await apiFetch<PlayerMtrBalanceResponse>('/player/mtr/add', {
          method: 'POST',
          body: payload,
          token: this.authToken() ?? undefined,
        })
      } finally {
        this.submitting = false
      }
    },
    async fetchPlayerMtrBalance(payload: {
      serverId: string
      bindingId?: string
    }) {
      const params = new URLSearchParams()
      params.set('serverId', payload.serverId)
      if (payload.bindingId) {
        params.set('bindingId', payload.bindingId)
      }
      return apiFetch<PlayerMtrBalanceResponse>(
        `/player/mtr/balance?${params.toString()}`,
        {
          token: this.authToken() ?? undefined,
        },
      )
    },
    async requestPermissionChange(payload: {
      serverId: string
      targetGroup: string
      bindingId?: string
      reason?: string
    }) {
      this.submitting = true
      try {
        await apiFetch('/player/permissions/request-change', {
          method: 'POST',
          body: payload,
          token: this.authToken() ?? undefined,
        })
      } finally {
        this.submitting = false
      }
    },
    async requestServerRestart(serverId: string, reason: string) {
      this.submitting = true
      try {
        await apiFetch('/player/server/restart-request', {
          method: 'POST',
          body: { serverId, reason },
          token: this.authToken() ?? undefined,
        })
      } finally {
        this.submitting = false
      }
    },
    async fetchRankCategories(force = false) {
      if (this.rankCategories.length && !force) return this.rankCategories
      this.rankCategories = await apiFetch<RankCategoryInfo[]>(
        '/portal/rank/categories',
      )
      return this.rankCategories
    },
    async fetchLeaderboard(category: string, period: string) {
      this.loading = true
      try {
        this.leaderboard = await apiFetch<RankLeaderboardResponse>(
          `/portal/rank/leaderboard?category=${category}&period=${period}`,
        )
      } finally {
        this.loading = false
      }
      return this.leaderboard
    },
    async fetchRankContext(category: string, period: string) {
      this.rankContext = await apiFetch<RankContextResponse>(
        `/portal/rank/me?category=${category}&period=${period}`,
        { token: this.authToken() ?? undefined },
      )
      return this.rankContext
    },
    async fetchLifecycleEvents(
      options: { sources?: string[]; limit?: number; id?: string } = {},
    ) {
      const params = new URLSearchParams()
      if (options.sources?.length) {
        params.set('sources', options.sources.join(','))
      }
      if (options.limit) {
        params.set('limit', String(options.limit))
      }
      if (options.id) {
        params.set('id', options.id)
      }
      const query = params.toString()
      const response = await apiFetch<{ items: PlayerLifecycleEvent[] }>(
        `/player/lifecycle-events${query ? `?${query}` : ''}`,
        { token: this.authToken() ?? undefined },
      )
      this.lifecycleEvents = response.items
      return response.items
    },
    async fetchPermissionOptions(bindingId?: string, id?: string) {
      const params = new URLSearchParams()
      if (bindingId) params.set('bindingId', bindingId)
      if (id) params.set('id', id)
      const query = params.toString()
      return apiFetch<PermissionAdjustmentOptions>(
        `/player/permissions/available-groups${query ? `?${query}` : ''}`,
        { token: this.authToken() ?? undefined },
      )
    },
    async fetchMessages(options: { id?: string } = {}) {
      const effectiveId = options.id ?? this.targetUserId
      if (!effectiveId) {
        this.messages = []
        return this.messages
      }
      const params = new URLSearchParams({ id: effectiveId })
      this.messages = await apiFetch<PlayerMessageBoardEntry[]>(
        `/player/messages?${params.toString()}`,
        { token: this.authToken() ?? undefined },
      )
      return this.messages
    },
    async postMessage(content: string, options: { id?: string } = {}) {
      const params = new URLSearchParams()
      if (options.id) params.set('id', options.id)
      const query = params.toString()
      const response = await apiFetch<PlayerMessageBoardEntry>(
        `/player/messages${query ? `?${query}` : ''}`,
        {
          method: 'POST',
          body: { content },
          token: this.authToken() ?? undefined,
        },
      )
      await this.fetchMessages({ id: options.id })
      return response
    },
    async deleteMessage(messageId: string, options: { id?: string } = {}) {
      await apiFetch(`/player/messages/${messageId}`, {
        method: 'DELETE',
        token: this.authToken() ?? undefined,
      })
      await this.fetchMessages({ id: options.id })
    },
    async setMessageReaction(
      messageId: string,
      reaction: PlayerMessageReactionType,
      options: { id?: string } = {},
    ) {
      await apiFetch(`/player/messages/${messageId}/reactions`, {
        method: 'POST',
        body: { reaction },
        token: this.authToken() ?? undefined,
      })
      await this.fetchMessages({ id: options.id })
    },
    async clearMessageReaction(
      messageId: string,
      options: { id?: string } = {},
    ) {
      await apiFetch(`/player/messages/${messageId}/reactions`, {
        method: 'DELETE',
        token: this.authToken() ?? undefined,
      })
      await this.fetchMessages({ id: options.id })
    },
    async updateBiography(payload: { markdown: string; id?: string }) {
      const params = new URLSearchParams()
      if (payload.id) params.set('id', payload.id)
      const query = params.toString()
      const response = await apiFetch<PlayerBiography>(
        `/player/bio${query ? `?${query}` : ''}`,
        {
          method: 'POST',
          body: { markdown: payload.markdown },
          token: this.authToken() ?? undefined,
        },
      )
      this.biography = response
      return response
    },
    reset() {
      this.summary = null
      this.assets = null
      this.region = null
      this.minecraft = null
      this.stats = null
      this.statusSnapshot = null
      this.viewerId = null
      this.targetUserId = null
      this.authmeProfile = null
      this.targetAuthmeUsername = null
      this.logged = null
      this.biography = null
      this.messages = []
      this.rankContext = null
      this.leaderboard = null
      this.lifecycleEvents = []
    },
  },
})
