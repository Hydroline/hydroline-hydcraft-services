import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  AdminPlayerEntry,
  AdminPlayerListResponse,
  AdminBindingHistoryEntry,
} from '@/types/admin'

type SortOrder = 'asc' | 'desc'

interface FetchPlayersOptions {
  keyword?: string
  page?: number
  pageSize?: number
  sortField?: string
  sortOrder?: SortOrder
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
    sortField: 'lastlogin' as string,
    sortOrder: 'desc' as SortOrder,
    loading: false,
    sourceStatus: 'ok' as 'ok' | 'degraded',
    error: '' as string | null,
  }),
  actions: {
    setSort(field: string, order: SortOrder) {
      this.sortField = field
      this.sortOrder = order
    },
    async fetch(options: FetchPlayersOptions = {}) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求玩家数据')
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
      if (sortField) params.set('sortField', sortField)
      if (sortOrder) params.set('sortOrder', sortOrder)
      this.loading = true
      try {
        const data = await apiFetch<AdminPlayerListResponse>(
          `/auth/players?${params.toString()}`,
          {
            token: auth.token,
          },
        )
        this.items = data.items
        this.pagination = data.pagination
        this.keyword = keyword
        this.sortField = sortField
        this.sortOrder = sortOrder
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
    async fetchHistory(username: string, page = 1, pageSize = 20) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法查询历史')
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      return apiFetch<{
        items: AdminBindingHistoryEntry[]
        pagination: {
          total: number
          page: number
          pageSize: number
          pageCount: number
        }
      }>(
        `/auth/players/${encodeURIComponent(username)}/history?${params.toString()}`,
        {
          token: auth.token,
        },
      )
    },
    async bindToUser(username: string, userId: string) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法绑定玩家')
      return apiFetch(`/auth/players/${encodeURIComponent(username)}/bind`, {
        method: 'POST',
        token: auth.token,
        body: { userId },
      })
    },
  },
})
