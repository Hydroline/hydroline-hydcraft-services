import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  CompanyDashboardStats,
  CompanyDailyRegistration,
  CompanyDirectoryResponse,
  CompanyMemberInvitePayload,
  CompanyMemberJoinPayload,
  CompanyMemberUserRef,
  CompanyMeta,
  CompanyModel,
  CompanyRecommendation,
  CompanyDeregistrationApplyPayload,
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
    directory: {
      total: 0,
      page: 1,
      pageSize: 20,
      pageCount: 1,
      items: [],
    } as CompanyDirectoryResponse,
    directoryLoading: false,
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
        (sum, company) =>
          sum +
          company.members.filter((member) => member.joinStatus !== 'PENDING')
            .length,
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
    async applyDeregistration(
      companyId: string,
      payload: CompanyDeregistrationApplyPayload,
    ) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        const company = await apiFetch<CompanyModel>(
          `/companies/${companyId}/deregistration`,
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
    async updateSettings(
      companyId: string,
      payload: {
        joinPolicy: 'AUTO' | 'REVIEW'
        positionPermissions: Record<string, string[]>
      },
    ) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/settings`,
        {
          method: 'PATCH',
          body: payload,
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
      return company
    },
    async uploadLogo(companyId: string, file: File) {
      const authStore = useAuthStore()
      const formData = new FormData()
      formData.append('logo', file)
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/logo`,
        {
          method: 'PATCH',
          body: formData,
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
      return company
    },
    async setLogoAttachment(companyId: string, attachmentId: string) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/logo/attachment`,
        {
          method: 'PATCH',
          body: { attachmentId },
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
      return company
    },
    async approveJoinRequest(
      companyId: string,
      payload: {
        memberId: string
        positionCode?: string | null
        title?: string
      },
    ) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/members/approve`,
        {
          method: 'POST',
          body: payload,
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
      this.recalculateStats()
      return company
    },
    async rejectJoinRequest(companyId: string, payload: { memberId: string }) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/members/reject`,
        {
          method: 'POST',
          body: payload,
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
      this.recalculateStats()
      return company
    },
    async updateMember(
      companyId: string,
      payload: {
        memberId: string
        positionCode?: string | null
        title?: string
        permissions: string[]
      },
    ) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/members/${payload.memberId}`,
        {
          method: 'PATCH',
          body: payload,
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
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
    async fetchDirectory(params: {
      page?: number
      pageSize?: number
      typeId?: string
      industryId?: string
      search?: string
      category?: string
    }) {
      const query = new URLSearchParams()
      if (params.page) query.set('page', String(params.page))
      if (params.pageSize) query.set('pageSize', String(params.pageSize))
      if (params.typeId) query.set('typeId', params.typeId)
      if (params.industryId) query.set('industryId', params.industryId)
      if (params.search) query.set('search', params.search)
      if (params.category) query.set('category', params.category)
      this.directoryLoading = true
      try {
        const response = await apiFetch<CompanyDirectoryResponse>(
          `/companies/list?${query.toString()}`,
        )
        this.directory = response
        return response
      } finally {
        this.directoryLoading = false
      }
    },
  },
})
