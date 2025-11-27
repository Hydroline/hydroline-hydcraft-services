import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import type {
  PlayerActionsResponse,
  PlayerAssetsResponse,
  PlayerMinecraftResponse,
  PlayerStatusSnapshot,
  PlayerPortalProfileResponse,
  PlayerRegionResponse,
  PlayerStatsResponse,
  PlayerSummary,
} from '@/types/portal'

type RankContextResponse = import('@/types/portal').RankContextResponse
type RankLeaderboardResponse = import('@/types/portal').RankLeaderboardResponse
type RankCategoryInfo = import('@/types/portal').RankCategoryInfo

export const usePlayerPortalStore = defineStore('player-portal', {
  state: () => ({
    summary: null as PlayerSummary | null,
    actions: null as PlayerActionsResponse | null,
    assets: null as PlayerAssetsResponse | null,
    region: null as PlayerRegionResponse | null,
    minecraft: null as PlayerMinecraftResponse | null,
    stats: null as PlayerStatsResponse | null,
    statusSnapshot: null as PlayerStatusSnapshot | null,
    viewerId: null as string | null,
    targetUserId: null as string | null,
    loading: false,
    submitting: false,
    rankCategories: [] as RankCategoryInfo[],
    leaderboard: null as RankLeaderboardResponse | null,
    rankContext: null as RankContextResponse | null,
  }),
  actions: {
    authToken() {
      const auth = useAuthStore()
      return auth.token ?? null
    },
    async fetchProfile(options: {
      id?: string
      period?: string
      actionsPage?: number
    } = {}) {
      const params = new URLSearchParams()
      if (options.id) params.set('id', options.id)
      if (options.period) params.set('period', options.period)
      if (options.actionsPage) {
        params.set('actionsPage', String(options.actionsPage))
      }
      this.loading = true
      try {
        const query = params.toString()
        const response = await apiFetch<PlayerPortalProfileResponse>(
          `/player/profile${query ? `?${query}` : ''}`,
          { token: this.authToken() ?? undefined },
        )
        this.summary = response.summary
        this.actions = response.actions
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
    async fetchActions(page = 1, id?: string) {
      const params = new URLSearchParams({ page: String(page) })
      const effectiveId = id ?? this.targetUserId
      if (effectiveId) {
        params.set('id', effectiveId)
      }
      this.actions = await apiFetch<PlayerActionsResponse>(
        `/player/actions?${params.toString()}`,
        { token: this.authToken() ?? undefined },
      )
      return this.actions
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
    async requestAuthmeReset(reason?: string) {
      this.submitting = true
      try {
        await apiFetch('/player/authme/reset-password', {
          method: 'POST',
          body: { reason },
          token: this.authToken() ?? undefined,
        })
      } finally {
        this.submitting = false
      }
    },
    async requestForceLogin(reason?: string) {
      this.submitting = true
      try {
        await apiFetch('/player/authme/force-login', {
          method: 'POST',
          body: { reason },
          token: this.authToken() ?? undefined,
        })
      } finally {
        this.submitting = false
      }
    },
    async requestPermissionChange(targetGroup: string, reason: string) {
      this.submitting = true
      try {
        await apiFetch('/player/permissions/request-change', {
          method: 'POST',
          body: { targetGroup, reason },
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
    reset() {
      this.summary = null
      this.actions = null
      this.assets = null
      this.region = null
      this.minecraft = null
      this.stats = null
      this.statusSnapshot = null
      this.viewerId = null
      this.targetUserId = null
      this.rankContext = null
      this.leaderboard = null
    },
  },
})
