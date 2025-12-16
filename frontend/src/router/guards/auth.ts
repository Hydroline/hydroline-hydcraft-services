import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { useUiStore } from '@/stores/shared/ui'

function toArray<T>(input: T | T[] | undefined): T[] {
  if (!input) return []
  return Array.isArray(input) ? input : [input]
}

export function registerAuthGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    const ui = useUiStore()

    if (!auth.initialized) {
      try {
        await auth.initialize()
      } catch (error) {
        console.error('[auth] initialize failed', error)
      }
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      ui.openLoginDialog()
      return { name: 'home', query: { redirect: to.fullPath } }
    }

    const requiredRoles = toArray(to.meta.requiresRole)
    if (requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((role) => auth.roleKeys.includes(role))
      if (!hasRole) {
        return { name: 'home' }
      }
    }

    const requiredPermissions = toArray(to.meta.requiresPermissions)
    if (requiredPermissions.length > 0) {
      const hasPermission = requiredPermissions.every((permission) =>
        auth.permissionKeys.includes(permission),
      )
      if (!hasPermission) {
        return { name: 'home' }
      }
    }

    return true
  })
}
