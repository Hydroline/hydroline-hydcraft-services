import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from './auth'
import type { AdminUserListItem, AdminUserListResponse } from '@/types/admin'

type SortOrder = 'asc' | 'desc'

interface FetchUsersOptions {
  keyword?: string
  page?: number
  pageSize?: number
  sortField?: string
  sortOrder?: SortOrder
}

export const useAdminUsersStore = defineStore('admin-users', {
  state: () => ({
    items: [] as AdminUserListItem[],
    pagination: {
      total: 0,
      page: 1,
      pageSize: 20,
      pageCount: 1,
    },
    keyword: '',
    loading: false,
    sortField: 'createdAt' as string,
    sortOrder: 'desc' as SortOrder,
  }),
  actions: {
    async fetch(options: FetchUsersOptions = {}) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求用户数据')
      }

      const keyword = options.keyword ?? this.keyword
      const page = options.page ?? this.pagination.page
      const pageSize = options.pageSize ?? this.pagination.pageSize
      const sortField = options.sortField ?? this.sortField
      const sortOrder = options.sortOrder ?? this.sortOrder

      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('pageSize', pageSize.toString())
      if (keyword) {
        params.set('keyword', keyword)
      }
      if (sortField) {
        params.set('sortField', sortField)
      }
      if (sortOrder) {
        params.set('sortOrder', sortOrder)
      }

      this.loading = true
      try {
        const data = await apiFetch<AdminUserListResponse>(
          `/auth/users?${params.toString()}`,
          {
            token: auth.token,
          },
        )
        this.items = data.items
        this.pagination = data.pagination
        this.keyword = keyword
        this.sortField = sortField
        this.sortOrder = sortOrder
        return data
      } finally {
        this.loading = false
      }
    },
    setKeyword(value: string) {
      this.keyword = value
    },
    setSort(field: string, order: SortOrder) {
      this.sortField = field
      this.sortOrder = order
    },
    async delete(userId: string) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法删除用户')
      }
      await apiFetch(`/auth/users/${userId}`, {
        method: 'DELETE',
        token: auth.token,
      })
      this.items = this.items.filter((item) => item.id !== userId)
    },
    async resetPassword(userId: string, password?: string) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法重置密码')
      }
      return apiFetch<{ temporaryPassword: string | null }>(
        `/auth/users/${userId}/reset-password`,
        {
          method: 'POST',
          token: auth.token,
          body: password ? { password } : {},
        },
      )
    },
    async regeneratePiic(userId: string) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法生成 PIIC')
      await apiFetch(`/auth/users/${userId}/piic/regenerate`, {
        method: 'POST',
        token: auth.token,
      })
      await this.fetch({ page: this.pagination.page })
    },
    async assignRoles(userId: string, roleKeys: string[]) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法分配角色')
      await apiFetch(`/auth/users/${userId}/roles`, {
        method: 'POST',
        token: auth.token,
        body: { roleKeys },
      })
      await this.fetch({ page: this.pagination.page })
    },
    async assignPermissionLabels(userId: string, labelKeys: string[]) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法分配标签')
      await apiFetch(`/auth/users/${userId}/permission-labels`, {
        method: 'POST',
        token: auth.token,
        body: { labelKeys },
      })
      await this.fetch({ page: this.pagination.page })
    },
    updateUserAvatar(userId: string, payload: { avatarUrl?: string | null; avatarAttachmentId?: string | null }) {
      const target = this.items.find((item) => item.id === userId)
      if (!target) return
      target.avatarUrl = payload.avatarUrl ?? null
      target.avatarAttachmentId = payload.avatarAttachmentId ?? null
      if (!target.profile) {
        target.profile = {
          displayName: target.name ?? null,
          piic: null,
          primaryAuthmeBindingId: null,
          primaryMinecraft: null,
          avatarUrl: payload.avatarUrl ?? null,
        }
      } else {
        target.profile.avatarUrl = payload.avatarUrl ?? null
      }
    },
  },
})
