import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from './auth'
import type { AdminUserListItem, AdminUserListResponse } from '@/types/admin'

interface FetchUsersOptions {
  keyword?: string;
  page?: number;
  pageSize?: number;
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

      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('pageSize', pageSize.toString())
      if (keyword) {
        params.set('keyword', keyword)
      }

      this.loading = true
      try {
        const data = await apiFetch<AdminUserListResponse>(`/auth/users?${params.toString()}`, {
          token: auth.token,
        })
        this.items = data.items
        this.pagination = data.pagination
        this.keyword = keyword
        return data
      } finally {
        this.loading = false
      }
    },
    setKeyword(value: string) {
      this.keyword = value
    },
  },
})
