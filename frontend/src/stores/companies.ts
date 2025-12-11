import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import type {
  CompanyDashboardStats,
  CompanyDailyRegistration,
  CompanyMemberInvitePayload,
  CompanyMemberJoinPayload,
  CompanyMemberUserRef,
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
    dashboardStats: {
      companyCount: 0,
      individualBusinessCount: 0,
      memberCount: 0,
    } as CompanyDashboardStats,
    dailyRegistrations: [] as CompanyDailyRegistration[],
    dailyRegistrationsLoading: false,
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
        const response = await apiFetch<{
          stats: CompanyDashboardStats
          companies: CompanyModel[]
        }>('/companies/dashboard', {
          token: authStore.token,
        })
        this.dashboardStats = response.stats
        this.dashboard = response.companies
        return this.dashboard
      } finally {
        this.dashboardLoading = false
      }
    },
    recalculateStats() {
      const companyCount = this.dashboard.length
      const individualBusinessCount = this.dashboard.filter(
        (company) => company.isIndividualBusiness,
      ).length
      const memberCount = this.dashboard.reduce(
        (sum, company) => sum + company.members.length,
        0,
      )
      this.dashboardStats = {
        companyCount,
        individualBusinessCount,
        memberCount,
      }
    },
    async searchUsers(
      keyword: string,
      limit = 10,
    ): Promise<CompanyMemberUserRef[]> {
      if (!keyword.trim()) {
        return []
      }
      const authStore = useAuthStore()
      return apiFetch<CompanyMemberUserRef[]>(
        `/companies/users/search?query=${encodeURIComponent(keyword)}&limit=${limit}`,
        {
          token: authStore.token,
        },
      )
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
        this.recalculateStats()
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
      this.recalculateStats()
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
      this.recalculateStats()
      return detail
    },
    async inviteMember(companyId: string, payload: CompanyMemberInvitePayload) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/members/invite`,
        {
          method: 'POST',
          body: payload,
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      } else {
        this.dashboard.unshift(company)
      }
      this.recalculateStats()
      return company
    },
    async joinCompany(companyId: string, payload: CompanyMemberJoinPayload) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/members/join`,
        {
          method: 'POST',
          body: payload,
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      } else {
        this.dashboard.unshift(company)
      }
      this.recalculateStats()
      return company
    },
    async fetchDailyRegistrations(days = 30) {
      this.dailyRegistrationsLoading = true
      try {
        const params = new URLSearchParams()
        params.set('days', `${days}`)
        const stats = await apiFetch<CompanyDailyRegistration[]>(
          `/companies/statistics/registrations?${params.toString()}`,
        )
        this.dailyRegistrations = stats
        return stats
      } finally {
        this.dailyRegistrationsLoading = false
      }
    },
  },
})
