import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import type {
  PlayerActionsResponse,
  PlayerAssetsResponse,
  PlayerLoginMap,
  PlayerMinecraftResponse,
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
    loginMap: null as PlayerLoginMap | null,
    actions: null as PlayerActionsResponse | null,
    assets: null as PlayerAssetsResponse | null,
    region: null as PlayerRegionResponse | null,
    minecraft: null as PlayerMinecraftResponse | null,
    stats: null as PlayerStatsResponse | null,
    loading: false,
    submitting: false,
    rankCategories: [] as RankCategoryInfo[],
    leaderboard: null as RankLeaderboardResponse | null,
    rankContext: null as RankContextResponse | null,
  }),
  actions: {
    async fetchSummary(force = false) {
      if (this.summary && !force) return this.summary
      this.summary = await apiFetch<PlayerSummary>('/portal/player/summary')
      return this.summary
    },
    async fetchLoginMap(force = false) {
      if (this.loginMap && !force) return this.loginMap
      this.loginMap = await apiFetch<PlayerLoginMap>(
        '/portal/player/login-map',
      )
      return this.loginMap
    },
    async fetchActions(page = 1) {
      this.actions = await apiFetch<PlayerActionsResponse>(
        `/portal/player/actions?page=${page}`,
      )
      return this.actions
    },
    async fetchAssets(force = false) {
      if (this.assets && !force) return this.assets
      this.assets = await apiFetch<PlayerAssetsResponse>('/portal/player/assets')
      return this.assets
    },
    async fetchRegion(force = false) {
      if (this.region && !force) return this.region
      this.region = await apiFetch<PlayerRegionResponse>('/portal/player/region')
      return this.region
    },
    async fetchMinecraft(force = false) {
      if (this.minecraft && !force) return this.minecraft
      this.minecraft = await apiFetch<PlayerMinecraftResponse>(
        '/portal/player/minecraft',
      )
      return this.minecraft
    },
    async fetchStats(period = '30d', force = false) {
      if (this.stats && !force && this.stats.period === period) {
        return this.stats
      }
      this.stats = await apiFetch<PlayerStatsResponse>(
        `/portal/player/stats?period=${period}`,
      )
      return this.stats
    },
    async requestAuthmeReset(reason?: string) {
      this.submitting = true
      try {
        await apiFetch('/portal/player/authme/reset-password', {
          method: 'POST',
          body: { reason },
        })
      } finally {
        this.submitting = false
      }
    },
    async requestForceLogin(reason?: string) {
      this.submitting = true
      try {
        await apiFetch('/portal/player/authme/force-login', {
          method: 'POST',
          body: { reason },
        })
      } finally {
        this.submitting = false
      }
    },
    async requestPermissionChange(targetGroup: string, reason: string) {
      this.submitting = true
      try {
        await apiFetch('/portal/player/permissions/request-change', {
          method: 'POST',
          body: { targetGroup, reason },
        })
      } finally {
        this.submitting = false
      }
    },
    async requestServerRestart(serverId: string, reason: string) {
      this.submitting = true
      try {
        await apiFetch('/portal/player/server/restart-request', {
          method: 'POST',
          body: { serverId, reason },
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
      )
      return this.rankContext
    },
    reset() {
      this.summary = null
      this.loginMap = null
      this.actions = null
      this.assets = null
      this.region = null
      this.minecraft = null
      this.stats = null
      this.rankContext = null
      this.leaderboard = null
    },
  },
})
