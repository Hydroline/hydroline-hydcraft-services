import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type { AdminInviteEntry, AdminInviteListResponse } from '@/types/admin'

interface FetchInviteOptions {
  keyword?: string
  page?: number
  pageSize?: number
}

export const useAdminInvitesStore = defineStore('admin-invites', {
  state: () => ({
    items: [] as AdminInviteEntry[],
    pagination: {
      total: 0,
      page: 1,
      pageSize: 20,
      pageCount: 1,
    },
    keyword: '',
    loading: false,
    inviteRequired: false,
    featureLoading: false,
  }),
  actions: {
    async fetch(options: FetchInviteOptions = {}) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求邀请码数据')
      }

      const keyword = options.keyword ?? this.keyword
      const page = options.page ?? this.pagination.page
      const pageSize = options.pageSize ?? this.pagination.pageSize

      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('pageSize', pageSize.toString())
      if (keyword) params.set('keyword', keyword)

      this.loading = true
      try {
        const data = await apiFetch<AdminInviteListResponse>(
          `/auth/admin/invites?${params.toString()}`,
          {
            token: auth.token,
          },
        )
        this.items = data.items
        this.pagination = data.pagination
        this.keyword = keyword
        return data
      } finally {
        this.loading = false
      }
    },
    async create() {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法生成邀请码')
      const response = await apiFetch<{ invite: AdminInviteEntry }>(
        '/auth/admin/invites',
        {
          method: 'POST',
          token: auth.token,
        },
      )
      if ((this.pagination.page ?? 1) <= 1) {
        this.items = [response.invite, ...this.items]
      }
      this.pagination.total += 1
      this.pagination.pageCount = Math.max(
        Math.ceil(this.pagination.total / this.pagination.pageSize),
        1,
      )
      return response.invite
    },
    async delete(inviteId: string) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法删除邀请码')
      await apiFetch(`/auth/admin/invites/${inviteId}`, {
        method: 'DELETE',
        token: auth.token,
      })
      this.items = this.items.filter((item) => item.id !== inviteId)
      this.pagination.total = Math.max(this.pagination.total - 1, 0)
      this.pagination.pageCount = Math.max(
        Math.ceil(this.pagination.total / this.pagination.pageSize),
        1,
      )
    },
    async loadFeature() {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法请求邀请码开关')
      this.featureLoading = true
      try {
        const data = await apiFetch<{ inviteRequired: boolean }>(
          '/auth/admin/invites/feature',
          {
            token: auth.token,
          },
        )
        this.inviteRequired = data.inviteRequired
        return data
      } finally {
        this.featureLoading = false
      }
    },
    async updateFeature(inviteRequired: boolean) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法更新邀请码开关')
      this.featureLoading = true
      try {
        const data = await apiFetch<{ inviteRequired: boolean }>(
          '/auth/admin/invites/feature',
          {
            method: 'PATCH',
            token: auth.token,
            body: { inviteRequired },
          },
        )
        this.inviteRequired = data.inviteRequired
        return data
      } finally {
        this.featureLoading = false
      }
    },
  },
})
