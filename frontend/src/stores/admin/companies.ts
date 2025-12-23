import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  AdminCreateCompanyPayload,
  CompanyModel,
  CompanyStatus,
} from '@/types/company'

export interface AdminCompanyFilter {
  status?: CompanyStatus
  typeId?: string
  industryId?: string
  isIndividualBusiness?: boolean
  search?: string
  page?: number
  pageSize?: number
}

interface AdminCompanyListResponse {
  total: number
  page: number
  pageSize: number
  items: CompanyModel[]
}

export const useAdminCompanyStore = defineStore('admin-companies', {
  state: () => ({
    items: [] as CompanyModel[],
    total: 0,
    page: 1,
    pageSize: 20,
    loading: false,
    detailLoading: false,
    selected: null as CompanyModel | null,
  }),
  actions: {
    async fetchList(filters: AdminCompanyFilter = {}) {
      this.loading = true
      try {
        const query = new URLSearchParams()
        if (filters.status) query.set('status', filters.status)
        if (filters.typeId) query.set('typeId', filters.typeId)
        if (filters.industryId) query.set('industryId', filters.industryId)
        if (filters.isIndividualBusiness !== undefined) {
          query.set(
            'isIndividualBusiness',
            String(filters.isIndividualBusiness),
          )
        }
        if (filters.search) query.set('search', filters.search)
        query.set('page', String(filters.page ?? this.page))
        query.set('pageSize', String(filters.pageSize ?? this.pageSize))
        const authStore = useAuthStore()
        const payload = await apiFetch<AdminCompanyListResponse>(
          `/admin/companies?${query.toString()}`,
          { token: authStore.token },
        )
        this.items = payload.items
        this.total = payload.total
        this.page = payload.page
        this.pageSize = payload.pageSize
        return payload
      } finally {
        this.loading = false
      }
    },
    async fetchDetail(id: string) {
      this.detailLoading = true
      try {
        const authStore = useAuthStore()
        this.selected = await apiFetch<CompanyModel>(`/admin/companies/${id}`, {
          token: authStore.token,
        })
        return this.selected
      } finally {
        this.detailLoading = false
      }
    },
    async updateCompany(id: string, payload: Record<string, unknown>) {
      const authStore = useAuthStore()
      const result = await apiFetch<CompanyModel>(`/admin/companies/${id}`, {
        method: 'PATCH',
        body: payload,
        token: authStore.token,
      })
      this.selected = result
      const index = this.items.findIndex((item) => item.id === id)
      if (index !== -1) {
        this.items[index] = result
      }
      return result
    },
    async executeAction(
      id: string,
      payload: { actionKey: string; comment?: string },
    ) {
      const authStore = useAuthStore()
      const result = await apiFetch<CompanyModel>(
        `/admin/companies/${id}/actions`,
        {
          method: 'POST',
          body: payload,
          token: authStore.token,
        },
      )
      this.selected = result
      const index = this.items.findIndex((item) => item.id === id)
      if (index !== -1) {
        this.items[index] = result
      }
      return result
    },
    async createCompany(payload: AdminCreateCompanyPayload) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>('/admin/companies', {
        method: 'POST',
        body: payload,
        token: authStore.token,
      })
      this.items.unshift(company)
      this.total += 1
      this.selected = company
      return company
    },
    async deleteCompany(id: string) {
      const authStore = useAuthStore()
      const result = await apiFetch<{ success: boolean }>(
        `/admin/companies/${id}`,
        {
          method: 'DELETE',
          token: authStore.token,
        },
      )
      this.items = this.items.filter((item) => item.id !== id)
      this.total = Math.max(this.total - 1, 0)
      if (this.selected?.id === id) {
        this.selected = null
      }
      return result
    },
  },
})
