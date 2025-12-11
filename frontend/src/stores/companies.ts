import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import type {
  CompanyMeta,
  CompanyModel,
  CompanyRecommendation,
  CreateCompanyApplicationPayload,
  UpdateCompanyPayload,
} from '@/types/company'

export type RecommendationKind = 'recent' | 'active'

export const useCompanyStore = defineStore('companies', {
  state: () => ({
    meta: null as CompanyMeta | null,
    metaLoading: false,
    recommendations: {
      recent: [] as CompanyRecommendation[],
      active: [] as CompanyRecommendation[],
    },
    recommendationsLoading: false,
    dashboard: [] as CompanyModel[],
    dashboardLoading: false,
    submitting: false,
  }),
  getters: {
    hasCompanies(state): boolean {
      return state.dashboard.length > 0
    },
  },
  actions: {
    async fetchMeta(force = false) {
      if (this.meta && !force) {
        return this.meta
      }
      this.metaLoading = true
      try {
        this.meta = await apiFetch<CompanyMeta>('/companies/meta')
        return this.meta
      } finally {
        this.metaLoading = false
      }
    },
    async fetchRecommendations(kind: RecommendationKind) {
      this.recommendationsLoading = true
      try {
        const items = await apiFetch<CompanyRecommendation[]>(
          `/companies/public/recommendations?kind=${kind}`,
        )
        this.recommendations[kind] = items
      } finally {
        this.recommendationsLoading = false
      }
    },
    async fetchDashboard() {
      this.dashboardLoading = true
      try {
        const authStore = useAuthStore()
        this.dashboard = await apiFetch<CompanyModel[]>(
          '/companies/dashboard',
          {
            token: authStore.token,
          },
        )
        return this.dashboard
      } finally {
        this.dashboardLoading = false
      }
    },
    async apply(payload: CreateCompanyApplicationPayload) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        const company = await apiFetch<CompanyModel>('/companies/apply', {
          method: 'POST',
          body: payload,
          token: authStore.token,
        })
        this.dashboard.unshift(company)
        return company
      } finally {
        this.submitting = false
      }
    },
    async update(companyId: string, payload: UpdateCompanyPayload) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(`/companies/${companyId}`, {
        method: 'PATCH',
        body: payload,
        token: authStore.token,
      })
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
      return company
    },
    async refreshCompany(companyId: string) {
      const authStore = useAuthStore()
      const detail = await apiFetch<CompanyModel>(`/companies/${companyId}`, {
        token: authStore.token,
      })
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = detail
      } else {
        this.dashboard.unshift(detail)
      }
      return detail
    },
  },
})
