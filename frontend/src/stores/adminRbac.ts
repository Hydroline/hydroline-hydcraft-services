import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from './auth'
import type {
  AdminPermissionCatalogEntry,
  AdminPermissionEntry,
  AdminPermissionLabelEntry,
  AdminRoleEntry,
} from '@/types/admin'

export const useAdminRbacStore = defineStore('admin-rbac', {
  state: () => ({
    roles: [] as AdminRoleEntry[],
    permissions: [] as AdminPermissionEntry[],
    labels: [] as AdminPermissionLabelEntry[],
    catalog: [] as AdminPermissionCatalogEntry[],
    loadingRoles: false,
    loadingPermissions: false,
    loadingLabels: false,
    loadingCatalog: false,
  }),
  actions: {
    async fetchRoles(force = false) {
      if (this.roles.length > 0 && !force) {
        return this.roles
      }
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求角色数据')
      }
      this.loadingRoles = true
      try {
        const data = await apiFetch<AdminRoleEntry[]>('/auth/roles', {
          token: auth.token,
        })
        this.roles = data
        return data
      } finally {
        this.loadingRoles = false
      }
    },
    async fetchPermissions(force = false) {
      if (this.permissions.length > 0 && !force) {
        return this.permissions
      }
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求权限数据')
      }
      this.loadingPermissions = true
      try {
        const data = await apiFetch<AdminPermissionEntry[]>('/auth/permissions', {
          token: auth.token,
        })
        this.permissions = data
        return data
      } finally {
        this.loadingPermissions = false
      }
    },
    async fetchLabels(force = false) {
      if (this.labels.length > 0 && !force) {
        return this.labels
      }
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求权限标签数据')
      }
      this.loadingLabels = true
      try {
        const data = await apiFetch<AdminPermissionLabelEntry[]>('/auth/permission-labels', {
          token: auth.token,
        })
        this.labels = data
        return data
      } finally {
        this.loadingLabels = false
      }
    },
    async fetchCatalog(force = false) {
      if (this.catalog.length > 0 && !force) {
        return this.catalog
      }
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求权限目录')
      }
      this.loadingCatalog = true
      try {
        const data = await apiFetch<AdminPermissionCatalogEntry[]>('/auth/permissions/catalog', {
          token: auth.token,
        })
        this.catalog = data
        return data
      } finally {
        this.loadingCatalog = false
      }
    },
    async selfAssignPermissions(permissionKeys: string[]) {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法申请权限')
      }
      return apiFetch('/auth/rbac/self/permissions', {
        method: 'POST',
        token: auth.token,
        body: { permissionKeys },
      })
    },
  },
})
