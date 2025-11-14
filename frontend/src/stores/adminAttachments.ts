import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from './auth'
import type {
  AdminAttachmentListResponse,
  AdminAttachmentSummary,
} from '@/types/admin'

interface FetchAttachmentsOptions {
  includeDeleted?: boolean
  folderId?: string
  tagKeys?: string[]
  page?: number
  pageSize?: number
}

export const useAdminAttachmentsStore = defineStore('admin-attachments', {
  state: () => ({
    items: [] as AdminAttachmentSummary[],
    loading: false,
    filters: {
      includeDeleted: false,
      folderId: '' as string | null,
      tagKeys: [] as string[],
    },
    pagination: {
      total: 0,
      page: 1,
      pageSize: 10,
      pageCount: 1,
    },
  }),
  actions: {
    async fetch(options: FetchAttachmentsOptions = {}) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求附件数据')
      }

      const includeDeleted =
        options.includeDeleted ?? this.filters.includeDeleted
      const folderId = options.folderId ?? this.filters.folderId ?? undefined
      const tagKeys = options.tagKeys ?? this.filters.tagKeys ?? []
      const page = options.page ?? this.pagination.page
      const pageSize = options.pageSize ?? this.pagination.pageSize

      const params = new URLSearchParams()
      if (includeDeleted) {
        params.set('includeDeleted', 'true')
      }
      if (folderId) {
        params.set('folderId', folderId)
      }
      if (tagKeys.length > 0) {
        params.set('tagKeys', tagKeys.join(','))
      }
      params.set('page', page.toString())
      params.set('pageSize', pageSize.toString())

      this.loading = true
      try {
        const query = params.toString()
        const path = query ? `/attachments?${query}` : '/attachments'
        const data = await apiFetch<AdminAttachmentListResponse>(path, {
          token: auth.token,
        })
        this.items = data.items
        this.pagination = data.pagination
        this.filters = {
          includeDeleted,
          folderId: folderId ?? null,
          tagKeys,
        }
        return data
      } finally {
        this.loading = false
      }
    },
  },
})
