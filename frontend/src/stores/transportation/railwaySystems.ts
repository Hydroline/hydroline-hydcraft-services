import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  RailwaySystemDetail,
  RailwaySystemListResponse,
} from '@/types/transportation'

export type RailwaySystemRouteInput = {
  entityId: string
  railwayType: string
  serverId: string
  dimension?: string | null
}

export type RailwaySystemCreatePayload = {
  name: string
  englishName?: string | null
  logoAttachmentId?: string | null
  routes: RailwaySystemRouteInput[]
}

export type RailwaySystemUpdatePayload = {
  name?: string
  englishName?: string | null
  logoAttachmentId?: string | null
  routes?: RailwaySystemRouteInput[]
}

export const useTransportationRailwaySystemsStore = defineStore(
  'transportation-railway-systems',
  {
    actions: {
      async fetchSystems(params?: {
        search?: string
        serverId?: string
        dimension?: string
        page?: number
        pageSize?: number
      }) {
        const query = new URLSearchParams()
        if (params?.search) query.set('search', params.search)
        if (params?.serverId) query.set('serverId', params.serverId)
        if (params?.dimension) query.set('dimension', params.dimension)
        if (params?.page) query.set('page', String(params.page))
        if (params?.pageSize) query.set('pageSize', String(params.pageSize))

        return apiFetch<RailwaySystemListResponse>(
          `/transportation/railway/systems?${query.toString()}`,
        )
      },
      async fetchServers() {
        return apiFetch<{ id: string; name: string; code: string }[]>(
          '/transportation/railway/systems/servers',
        )
      },
      async fetchSystemDetail(id: string) {
        return apiFetch<RailwaySystemDetail>(
          `/transportation/railway/systems/${id}`,
        )
      },
      async createSystem(payload: RailwaySystemCreatePayload) {
        const authStore = useAuthStore()
        return apiFetch<RailwaySystemDetail>(
          '/transportation/railway/systems',
          {
            method: 'POST',
            token: authStore.token,
            body: payload,
          },
        )
      },
      async updateSystem(id: string, payload: RailwaySystemUpdatePayload) {
        const authStore = useAuthStore()
        return apiFetch<RailwaySystemDetail>(
          `/transportation/railway/systems/${id}`,
          {
            method: 'PATCH',
            token: authStore.token,
            body: payload,
          },
        )
      },
      async uploadSystemLogo(id: string, file: File) {
        const authStore = useAuthStore()
        const body = new FormData()
        body.append('logo', file)
        return apiFetch<{
          id: string
          logoAttachmentId: string | null
          logoUrl: string | null
        }>(`/transportation/railway/systems/${id}/logo`, {
          method: 'PATCH',
          token: authStore.token,
          body,
        })
      },
    },
  },
)
