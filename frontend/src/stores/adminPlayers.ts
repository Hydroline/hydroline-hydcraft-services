import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from './auth'
import type { AdminPlayerEntry, AdminPlayerListResponse } from '@/types/admin'

interface FetchPlayersOptions {
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export const useAdminPlayersStore = defineStore('admin-players', {
  state: () => ({
    items: [] as AdminPlayerEntry[],
    pagination: {
      total: 0,
      page: 1,
      pageSize: 20,
      pageCount: 1,
    },
    keyword: '',
    loading: false,
    sourceStatus: 'ok' as 'ok' | 'degraded',
    error: '' as string | null,
  }),
  actions: {
    async fetch(options: FetchPlayersOptions = {}) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求玩家数据')
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
        const data = await apiFetch<AdminPlayerListResponse>(`/auth/players?${params.toString()}`, {
          token: auth.token,
        })
        this.items = data.items
        this.pagination = data.pagination
        this.keyword = keyword
        this.sourceStatus = data.sourceStatus
        this.error = data.error ?? null
        return data
      } finally {
        this.loading = false
      }
    },
    async createHistory(username: string, payload: Record<string, unknown>) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法补录历史')
      }
      return apiFetch(`/auth/players/${encodeURIComponent(username)}/history`, {
        method: 'POST',
        token: auth.token,
        body: payload,
      })
    },
  },
})
