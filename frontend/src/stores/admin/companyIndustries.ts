import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type { CompanyIndustry } from '@/types/company'

interface UpsertIndustryPayload {
  id?: string
  name: string
  code?: string
  description?: string
  icon?: string
  color?: string
  parentId?: string
  metadata?: Record<string, unknown>
}

export const useAdminCompanyIndustriesStore = defineStore(
  'admin-company-industries',
  {
    state: () => ({
      items: [] as CompanyIndustry[],
      loading: false,
      saving: false,
    }),
    actions: {
      async fetchAll() {
        const auth = useAuthStore()
        if (!auth.token) {
          throw new Error('未登录，无法加载行业信息')
        }
        this.loading = true
        try {
          const list = await apiFetch<CompanyIndustry[]>(
            '/admin/company/config/industries',
            { token: auth.token },
          )
          this.items = list
          return list
        } finally {
          this.loading = false
        }
      },
      async upsert(payload: UpsertIndustryPayload) {
        const auth = useAuthStore()
        if (!auth.token) {
          throw new Error('未登录，无法提交行业配置')
        }
        this.saving = true
        try {
          const body: Record<string, unknown> = {
            name: payload.name,
          }
          if (payload.id) body.id = payload.id
          if (payload.code) body.code = payload.code
          if (payload.description) body.description = payload.description
          if (payload.icon) body.icon = payload.icon
          if (payload.color) body.color = payload.color
          if (payload.parentId) body.parentId = payload.parentId
          if (payload.metadata) body.metadata = payload.metadata
          const result = await apiFetch<CompanyIndustry>(
            '/admin/company/config/industries',
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
  },
)
