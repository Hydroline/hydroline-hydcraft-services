import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type { CompanyType } from '@/types/company'

interface UpsertTypePayload {
  id?: string
  name: string
  code?: string
  description?: string
  category?: string
  requiredDocuments?: string[]
  config?: Record<string, unknown>
}

export const useAdminCompanyTypesStore = defineStore('admin-company-types', {
  state: () => ({
    items: [] as CompanyType[],
    loading: false,
    saving: false,
  }),
  actions: {
    async fetchAll() {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法加载公司类型')
      }
      this.loading = true
      try {
        const list = await apiFetch<CompanyType[]>(
          '/admin/company/config/types',
          { token: auth.token },
        )
        this.items = list
        return list
      } finally {
        this.loading = false
      }
    },
    async upsert(payload: UpsertTypePayload) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法提交公司类型')
      }
      this.saving = true
      try {
        const body: Record<string, unknown> = {
          name: payload.name,
        }
        if (payload.id) body.id = payload.id
        if (payload.code) body.code = payload.code
        if (payload.description) body.description = payload.description
        if (payload.category) body.category = payload.category
        if (payload.requiredDocuments) {
          body.requiredDocuments = payload.requiredDocuments
        }
        if (payload.config) {
          body.config = payload.config
        }
        const result = await apiFetch<CompanyType>(
          '/admin/company/config/types',
          {
            method: 'POST',
            token: auth.token,
            body,
          },
        )
        await this.fetchAll()
        return result
      } finally {
        this.saving = false
      }
    },
  },
})
