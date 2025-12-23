import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  AdminCompanyApplicationEntry,
  CompanyApplicationStatus,
} from '@/types/company'

interface FetchOptions {
  status?: CompanyApplicationStatus
  search?: string
  page?: number
  pageSize?: number
  workflowCode?: string
}

export const useAdminCompanyApplicationsStore = defineStore(
  'admin-company-applications',
  {
    state: () => ({
      items: [] as AdminCompanyApplicationEntry[],
      pagination: {
        total: 0,
        page: 1,
        pageSize: 20,
        pageCount: 1,
      },
      autoApproveEnabled: false,
      settingsLoading: false,
      loading: false,
    }),
    actions: {
      async fetchList(options: FetchOptions = {}) {
        const auth = useAuthStore()
        if (!auth.token) {
          throw new Error('未登录，无法查询申请')
        }
        const page = options.page ?? this.pagination.page
        const pageSize = options.pageSize ?? this.pagination.pageSize
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        })
        if (options.status) {
          params.set('status', options.status)
        }
        if (options.search) {
          params.set('search', options.search)
        }
        if (options.workflowCode) {
          params.set('workflowCode', options.workflowCode)
        }
        this.loading = true
        try {
          const result = await apiFetch<{
            total: number
            page: number
            pageSize: number
            pageCount: number
            items: AdminCompanyApplicationEntry[]
          }>(`/admin/company/applications?${params.toString()}`, {
            token: auth.token,
          })
          this.items = result.items
          this.pagination = {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            pageCount: result.pageCount,
          }
          return result
        } finally {
          this.loading = false
        }
      },
      async executeAction(
        applicationId: string,
        payload: { actionKey: string; comment?: string },
      ) {
        const auth = useAuthStore()
        if (!auth.token) {
          throw new Error('未登录，无法审批申请')
        }
        return apiFetch(
          `/admin/company/applications/${applicationId}/actions`,
          {
            method: 'POST',
            body: payload,
            token: auth.token,
          },
        )
      },
      async fetchSettings() {
        return this.fetchSettingsByWorkflow()
      },
      async fetchSettingsByWorkflow(workflowCode?: string) {
        const auth = useAuthStore()
        if (!auth.token) {
          throw new Error('未登录，无法获取审批设置')
        }
        this.settingsLoading = true
        try {
          const params = new URLSearchParams()
          if (workflowCode) {
            params.set('workflowCode', workflowCode)
          }
          const result = await apiFetch<{ autoApprove: boolean }>(
            `/admin/company/applications/settings${
              params.toString() ? `?${params.toString()}` : ''
            }`,
            { token: auth.token },
          )
          this.autoApproveEnabled = result.autoApprove
          return result
        } finally {
          this.settingsLoading = false
        }
      },
      async updateSettings(autoApprove: boolean) {
        return this.updateSettingsByWorkflow(autoApprove)
      },
      async updateSettingsByWorkflow(
        autoApprove: boolean,
        workflowCode?: string,
      ) {
        const auth = useAuthStore()
        if (!auth.token) {
          throw new Error('未登录，无法更新审批设置')
        }
        this.settingsLoading = true
        try {
          const params = new URLSearchParams()
          if (workflowCode) {
            params.set('workflowCode', workflowCode)
          }
          const result = await apiFetch<{ autoApprove: boolean }>(
            `/admin/company/applications/settings${
              params.toString() ? `?${params.toString()}` : ''
            }`,
            {
              method: 'POST',
              body: { autoApprove },
              token: auth.token,
            },
          )
          this.autoApproveEnabled = result.autoApprove
          return result
        } finally {
          this.settingsLoading = false
        }
      },
    },
  },
)
