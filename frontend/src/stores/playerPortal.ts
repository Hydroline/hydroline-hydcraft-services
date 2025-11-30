import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import type {
  PlayerAssetsResponse,
  PlayerMinecraftResponse,
  PlayerStatusSnapshot,
  PlayerPortalProfileResponse,
  PlayerRegionResponse,
  PlayerStatsResponse,
  PlayerSummary,
  PlayerIsLoggedResponse,
  PlayerLifecycleEvent,
  PermissionAdjustmentOptions,
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
    statusSnapshot: null as PlayerStatusSnapshot | null,
    viewerId: null as string | null,
    targetUserId: null as string | null,
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
      } = {},
    ) {
      const params = new URLSearchParams()
      if (options.id) params.set('id', options.id)
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
        this.statusSnapshot = response.statusSnapshot
        this.viewerId = response.viewerId
        this.targetUserId = response.targetId
        return response
      } finally {
        this.loading = false
      }
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
    reset() {
      this.summary = null
      this.assets = null
      this.region = null
      this.minecraft = null
      this.stats = null
      this.statusSnapshot = null
      this.viewerId = null
      this.targetUserId = null
      this.logged = null
      this.rankContext = null
      this.leaderboard = null
      this.lifecycleEvents = []
    },
  },
})
