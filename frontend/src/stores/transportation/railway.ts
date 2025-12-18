import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  RailwayBanner,
  RailwayBannerPayload,
  RailwayBannerUpdatePayload,
  RailwayDepotDetail,
  RailwayEntityListResponse,
  RailwayOverview,
  RailwayRouteDetail,
  RailwayRouteListResponse,
  RailwayRouteLogResult,
  RailwayServerOption,
  RailwayStationDetail,
  RailwayStationRouteMapResponse,
} from '@/types/transportation'

interface RouteCacheParams {
  routeId: string
  serverId: string
  dimension?: string | null
  railwayType: string
}

interface EntityCacheParams {
  id: string
  serverId: string
  dimension?: string | null
  railwayType: string
}

export const useTransportationRailwayStore = defineStore(
  'transportation-railway',
  {
    state: () => ({
      overview: null as RailwayOverview | null,
      overviewLoading: false,
      overviewError: null as string | null,
      servers: [] as RailwayServerOption[],
      routeDetails: {} as Record<string, RailwayRouteDetail>,
      stationDetails: {} as Record<string, RailwayStationDetail>,
      depotDetails: {} as Record<string, RailwayDepotDetail>,
      routeLogs: {} as Record<string, RailwayRouteLogResult>,
      stationLogs: {} as Record<string, RailwayRouteLogResult>,
      depotLogs: {} as Record<string, RailwayRouteLogResult>,
      routeLoading: false,
      adminBanners: [] as RailwayBanner[],
      adminBannersLoading: false,
      bannerSubmitting: false,
    }),
    getters: {
      hasOverview(state): boolean {
        return Boolean(state.overview)
      },
    },
    actions: {
      async fetchServers(force = false) {
        if (this.servers.length && !force) {
          return this.servers
        }
        const data = await apiFetch<RailwayServerOption[]>(
          '/transportation/railway/servers',
        )
        this.servers = data
        return data
      },
      async fetchOverview(force = false) {
        if (this.overview && !force) {
          return this.overview
        }
        this.overviewLoading = true
        this.overviewError = null
        try {
          const data = await apiFetch<RailwayOverview>(
            '/transportation/railway/overview',
          )
          this.overview = data
          return data
        } catch (error) {
          this.overviewError =
            error instanceof Error ? error.message : '加载失败'
          throw error
        } finally {
          this.overviewLoading = false
        }
      },
      buildRouteCacheKey(params: RouteCacheParams) {
        const dimension = params.dimension ?? ''
        return `${params.serverId}::${params.routeId}::${dimension}::${params.railwayType}`
      },
      buildEntityCacheKey(params: EntityCacheParams) {
        const dimension = params.dimension ?? ''
        return `${params.serverId}::${params.id}::${dimension}::${params.railwayType}`
      },
      async fetchRouteDetail(params: RouteCacheParams, force = false) {
        const cacheKey = this.buildRouteCacheKey(params)
        if (this.routeDetails[cacheKey] && !force) {
          return this.routeDetails[cacheKey]
        }
        this.routeLoading = true
        try {
          const query = new URLSearchParams({
            serverId: params.serverId,
          })
          if (params.dimension) {
            query.set('dimension', params.dimension)
          }
          const detail = await apiFetch<RailwayRouteDetail>(
            `/transportation/railway/routes/${encodeURIComponent(params.railwayType)}/${encodeURIComponent(params.routeId)}?${query.toString()}`,
          )
          this.routeDetails[cacheKey] = detail
          return detail
        } finally {
          this.routeLoading = false
        }
      },
      async fetchStationDetail(params: EntityCacheParams, force = false) {
        const cacheKey = this.buildEntityCacheKey(params)
        if (this.stationDetails[cacheKey] && !force) {
          return this.stationDetails[cacheKey]
        }
        const query = new URLSearchParams({ serverId: params.serverId })
        if (params.dimension) {
          query.set('dimension', params.dimension)
        }
        const detail = await apiFetch<RailwayStationDetail>(
          `/transportation/railway/stations/${encodeURIComponent(params.railwayType)}/${encodeURIComponent(params.id)}?${query.toString()}`,
        )
        this.stationDetails[cacheKey] = detail
        return detail
      },
      async fetchDepotDetail(params: EntityCacheParams, force = false) {
        const cacheKey = this.buildEntityCacheKey(params)
        if (this.depotDetails[cacheKey] && !force) {
          return this.depotDetails[cacheKey]
        }
        const query = new URLSearchParams({ serverId: params.serverId })
        if (params.dimension) {
          query.set('dimension', params.dimension)
        }
        const detail = await apiFetch<RailwayDepotDetail>(
          `/transportation/railway/depots/${encodeURIComponent(params.railwayType)}/${encodeURIComponent(params.id)}?${query.toString()}`,
        )
        this.depotDetails[cacheKey] = detail
        return detail
      },
      async fetchRouteLogs(
        params: RouteCacheParams & {
          page?: number
          limit?: number
          search?: string
        },
        force = false,
      ) {
        const page = params.page ?? 1
        const limit = params.limit ?? 10
        const searchKey = params.search ?? ''
        const cacheKey = `${this.buildRouteCacheKey(params)}::${page}::${limit}::${searchKey}`
        if (this.routeLogs[cacheKey] && !force) {
          return this.routeLogs[cacheKey]
        }
        const query = new URLSearchParams({
          serverId: params.serverId,
          page: String(page),
          limit: String(limit),
        })
        if (params.dimension) {
          query.set('dimension', params.dimension)
        }
        const searchTerm = params.search ?? params.routeId ?? ''
        if (searchTerm) {
          query.set('search', searchTerm)
        }
        const detail = await apiFetch<RailwayRouteLogResult>(
          `/transportation/railway/routes/${encodeURIComponent(params.railwayType)}/${encodeURIComponent(params.routeId)}/logs?${query.toString()}`,
        )
        this.routeLogs[cacheKey] = detail
        return detail
      },

      async fetchStationLogs(
        params: EntityCacheParams & {
          page?: number
          limit?: number
          search?: string
        },
        force = false,
      ) {
        const page = params.page ?? 1
        const limit = params.limit ?? 10
        const searchKey = params.search ?? ''
        const cacheKey = `${this.buildEntityCacheKey(params)}::${page}::${limit}::${searchKey}`
        if (this.stationLogs[cacheKey] && !force) {
          return this.stationLogs[cacheKey]
        }
        const query = new URLSearchParams({
          serverId: params.serverId,
          page: String(page),
          limit: String(limit),
        })
        if (params.dimension) {
          query.set('dimension', params.dimension)
        }
        const searchTerm = params.search ?? params.id ?? ''
        if (searchTerm) {
          query.set('search', searchTerm)
        }
        const detail = await apiFetch<RailwayRouteLogResult>(
          `/transportation/railway/stations/${encodeURIComponent(params.railwayType)}/${encodeURIComponent(params.id)}/logs?${query.toString()}`,
        )
        this.stationLogs[cacheKey] = detail
        return detail
      },

      async fetchStationRouteMap(
        params: EntityCacheParams,
        force = false,
      ): Promise<RailwayStationRouteMapResponse> {
        const query = new URLSearchParams({ serverId: params.serverId })
        if (params.dimension) {
          query.set('dimension', params.dimension)
        }
        // Note: this endpoint is async/poll-based; we intentionally do not cache 'pending'.
        // Use noDedupe on force to avoid in-flight request sharing during polling.
        return await apiFetch<RailwayStationRouteMapResponse>(
          `/transportation/railway/stations/${encodeURIComponent(params.railwayType)}/${encodeURIComponent(params.id)}/map?${query.toString()}`,
          force ? { noDedupe: true } : {},
        )
      },

      async fetchDepotLogs(
        params: EntityCacheParams & {
          page?: number
          limit?: number
          search?: string
        },
        force = false,
      ) {
        const page = params.page ?? 1
        const limit = params.limit ?? 10
        const searchKey = params.search ?? ''
        const cacheKey = `${this.buildEntityCacheKey(params)}::${page}::${limit}::${searchKey}`
        if (this.depotLogs[cacheKey] && !force) {
          return this.depotLogs[cacheKey]
        }
        const query = new URLSearchParams({
          serverId: params.serverId,
          page: String(page),
          limit: String(limit),
        })
        if (params.dimension) {
          query.set('dimension', params.dimension)
        }
        const searchTerm = params.search ?? params.id ?? ''
        if (searchTerm) {
          query.set('search', searchTerm)
        }
        const detail = await apiFetch<RailwayRouteLogResult>(
          `/transportation/railway/depots/${encodeURIComponent(params.railwayType)}/${encodeURIComponent(params.id)}/logs?${query.toString()}`,
        )
        this.depotLogs[cacheKey] = detail
        return detail
      },

      async fetchRouteList(params: {
        search?: string
        serverId?: string
        railwayType?: string
        dimension?: string
        transportMode?: string
        page?: number
        pageSize?: number
      }) {
        const query = new URLSearchParams()
        if (params.search) query.set('search', params.search)
        if (params.serverId) query.set('serverId', params.serverId)
        if (params.railwayType) query.set('railwayType', params.railwayType)
        if (params.dimension) query.set('dimension', params.dimension)
        if (params.transportMode)
          query.set('transportMode', params.transportMode)
        if (params.page) query.set('page', String(params.page))
        if (params.pageSize) query.set('pageSize', String(params.pageSize))
        return await apiFetch<RailwayRouteListResponse>(
          `/transportation/railway/routes?${query.toString()}`,
        )
      },

      async fetchStationList(params: {
        search?: string
        serverId?: string
        railwayType?: string
        dimension?: string
        transportMode?: string
        page?: number
        pageSize?: number
      }) {
        const query = new URLSearchParams()
        if (params.search) query.set('search', params.search)
        if (params.serverId) query.set('serverId', params.serverId)
        if (params.railwayType) query.set('railwayType', params.railwayType)
        if (params.dimension) query.set('dimension', params.dimension)
        if (params.transportMode)
          query.set('transportMode', params.transportMode)
        if (params.page) query.set('page', String(params.page))
        if (params.pageSize) query.set('pageSize', String(params.pageSize))
        return await apiFetch<RailwayEntityListResponse>(
          `/transportation/railway/stations?${query.toString()}`,
        )
      },

      async fetchDepotList(params: {
        search?: string
        serverId?: string
        railwayType?: string
        dimension?: string
        transportMode?: string
        page?: number
        pageSize?: number
      }) {
        const query = new URLSearchParams()
        if (params.search) query.set('search', params.search)
        if (params.serverId) query.set('serverId', params.serverId)
        if (params.railwayType) query.set('railwayType', params.railwayType)
        if (params.dimension) query.set('dimension', params.dimension)
        if (params.transportMode)
          query.set('transportMode', params.transportMode)
        if (params.page) query.set('page', String(params.page))
        if (params.pageSize) query.set('pageSize', String(params.pageSize))
        return await apiFetch<RailwayEntityListResponse>(
          `/transportation/railway/depots?${query.toString()}`,
        )
      },
      async fetchAdminBanners() {
        this.adminBannersLoading = true
        try {
          const authStore = useAuthStore()
          this.adminBanners = await apiFetch<RailwayBanner[]>(
            '/transportation/railway/admin/banners',
            {
              token: authStore.token,
            },
          )
          return this.adminBanners
        } finally {
          this.adminBannersLoading = false
        }
      },
      async createBanner(payload: RailwayBannerPayload) {
        this.bannerSubmitting = true
        try {
          const authStore = useAuthStore()
          const banner = await apiFetch<RailwayBanner>(
            '/transportation/railway/admin/banners',
            {
              method: 'POST',
              body: payload,
              token: authStore.token,
            },
          )
          this.adminBanners.unshift(banner)
          await this.fetchOverview(true)
          return banner
        } finally {
          this.bannerSubmitting = false
        }
      },
      async updateBanner(
        bannerId: string,
        payload: RailwayBannerUpdatePayload,
      ) {
        this.bannerSubmitting = true
        try {
          const authStore = useAuthStore()
          const banner = await apiFetch<RailwayBanner>(
            `/transportation/railway/admin/banners/${bannerId}`,
            {
              method: 'PATCH',
              body: payload,
              token: authStore.token,
            },
          )
          const index = this.adminBanners.findIndex(
            (item) => item.id === bannerId,
          )
          if (index !== -1) {
            this.adminBanners[index] = banner
          } else {
            this.adminBanners.unshift(banner)
          }
          await this.fetchOverview(true)
          return banner
        } finally {
          this.bannerSubmitting = false
        }
      },
      async deleteBanner(bannerId: string) {
        const authStore = useAuthStore()
        await apiFetch(`/transportation/railway/admin/banners/${bannerId}`, {
          method: 'DELETE',
          token: authStore.token,
        })
        this.adminBanners = this.adminBanners.filter(
          (banner) => banner.id !== bannerId,
        )
        await this.fetchOverview(true)
        return { success: true }
      },
      clearBannerCache() {
        this.adminBanners = []
      },
    },
  },
)
