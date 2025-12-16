import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import type { AdminOverviewData, PortalHomeData } from '@/types/portal'
import { useAuthStore } from '@/stores/user/auth'

export const usePortalStore = defineStore('portal', {
  state: () => ({
    home: null as PortalHomeData | null,
    homeLoading: false,
    admin: null as AdminOverviewData | null,
    adminLoading: false,
  }),
  actions: {
    async fetchHome(force = false) {
      if (this.home && !force) {
        return this.home
      }
      const auth = useAuthStore()
      this.homeLoading = true
      try {
        const data = await apiFetch<PortalHomeData>('/portal/home', {
          token: auth.token ?? undefined,
        })
        this.home = data
        return data
      } finally {
        this.homeLoading = false
      }
    },
    async fetchAdminOverview(force = false) {
      if (this.admin && !force) {
        return this.admin
      }
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求后台概览')
      }
      this.adminLoading = true
      try {
        const data = await apiFetch<AdminOverviewData>(
          '/portal/admin/overview',
          {
            token: auth.token,
          },
        )
        this.admin = data
        return data
      } finally {
        this.adminLoading = false
      }
    },
    reset() {
      this.home = null
      this.admin = null
    },
  },
})
