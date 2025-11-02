import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from './auth'
import type { AdminPermissionEntry, AdminRoleEntry } from '@/types/admin'

export const useAdminRbacStore = defineStore('admin-rbac', {
  state: () => ({
    roles: [] as AdminRoleEntry[],
    permissions: [] as AdminPermissionEntry[],
    loadingRoles: false,
    loadingPermissions: false,
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
  },
})
