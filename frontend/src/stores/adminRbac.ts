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
    submitting: false,
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
        const data = await apiFetch<AdminPermissionEntry[]>(
          '/auth/permissions',
          {
            token: auth.token,
          },
        )
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
        const data = await apiFetch<AdminPermissionLabelEntry[]>(
          '/auth/permission-labels',
          {
            token: auth.token,
          },
        )
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
        const data = await apiFetch<AdminPermissionCatalogEntry[]>(
          '/auth/permissions/catalog',
          {
            token: auth.token,
          },
        )
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
    // Role CRUD
    async createRole(payload: {
      key: string
      name: string
      description?: string | null
      permissionKeys: string[]
    }) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法创建角色')
      this.submitting = true
      try {
        await apiFetch('/auth/roles', {
          method: 'POST',
          token: auth.token,
          body: payload,
        })
        await this.fetchRoles(true)
      } finally {
        this.submitting = false
      }
    },
    async updateRole(
      roleId: string,
      payload: { name?: string; description?: string | null },
    ) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法更新角色')
      this.submitting = true
      try {
        await apiFetch(`/auth/roles/${roleId}`, {
          method: 'PATCH',
          token: auth.token,
          body: payload,
        })
        await this.fetchRoles(true)
      } finally {
        this.submitting = false
      }
    },
    async updateRolePermissions(roleId: string, permissionKeys: string[]) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法更新角色权限')
      this.submitting = true
      try {
        await apiFetch(`/auth/roles/${roleId}/permissions`, {
          method: 'PATCH',
          token: auth.token,
          body: { permissionKeys },
        })
        await this.fetchRoles(true)
      } finally {
        this.submitting = false
      }
    },
    async deleteRole(roleId: string) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法删除角色')
      this.submitting = true
      try {
        await apiFetch(`/auth/roles/${roleId}`, {
          method: 'DELETE',
          token: auth.token,
        })
        this.roles = this.roles.filter((r) => r.id !== roleId)
      } finally {
        this.submitting = false
      }
    },
    // Permission CRUD
    async createPermission(payload: {
      key: string
      description?: string | null
    }) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法创建权限')
      this.submitting = true
      try {
        await apiFetch('/auth/permissions', {
          method: 'POST',
          token: auth.token,
          body: payload,
        })
        await this.fetchPermissions(true)
        await this.fetchCatalog(true)
      } finally {
        this.submitting = false
      }
    },
    async updatePermission(
      permissionId: string,
      payload: { description?: string | null },
    ) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法更新权限')
      this.submitting = true
      try {
        await apiFetch(`/auth/permissions/${permissionId}`, {
          method: 'PATCH',
          token: auth.token,
          body: payload,
        })
        await this.fetchPermissions(true)
        await this.fetchCatalog(true)
      } finally {
        this.submitting = false
      }
    },
    async deletePermission(permissionId: string) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法删除权限')
      this.submitting = true
      try {
        await apiFetch(`/auth/permissions/${permissionId}`, {
          method: 'DELETE',
          token: auth.token,
        })
        this.permissions = this.permissions.filter((p) => p.id !== permissionId)
        await this.fetchCatalog(true)
      } finally {
        this.submitting = false
      }
    },
    // Permission Label CRUD
    async createLabel(payload: {
      key: string
      name: string
      description?: string | null
      color?: string | null
      permissionKeys: string[]
    }) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法创建权限标签')
      this.submitting = true
      try {
        await apiFetch('/auth/permission-labels', {
          method: 'POST',
          token: auth.token,
          body: payload,
        })
        await this.fetchLabels(true)
        await this.fetchCatalog(true)
      } finally {
        this.submitting = false
      }
    },
    async updateLabel(
      labelId: string,
      payload: {
        name?: string
        description?: string | null
        color?: string | null
        permissionKeys?: string[]
      },
    ) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法更新权限标签')
      this.submitting = true
      try {
        await apiFetch(`/auth/permission-labels/${labelId}`, {
          method: 'PATCH',
          token: auth.token,
          body: payload,
        })
        await this.fetchLabels(true)
        await this.fetchCatalog(true)
      } finally {
        this.submitting = false
      }
    },
    async deleteLabel(labelId: string) {
      const auth = useAuthStore()
      if (!auth.token) throw new Error('未登录，无法删除权限标签')
      this.submitting = true
      try {
        await apiFetch(`/auth/permission-labels/${labelId}`, {
          method: 'DELETE',
          token: auth.token,
        })
        this.labels = this.labels.filter((l) => l.id !== labelId)
        await this.fetchCatalog(true)
      } finally {
        this.submitting = false
      }
    },
  },
})
