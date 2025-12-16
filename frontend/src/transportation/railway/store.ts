import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import type {
  RailwayBanner,
  RailwayBannerPayload,
  RailwayBannerUpdatePayload,
  RailwayOverview,
  RailwayRouteDetail,
} from '@/types/transportation'

interface RouteCacheParams {
  routeId: string
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
      routeDetails: {} as Record<string, RailwayRouteDetail>,
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
