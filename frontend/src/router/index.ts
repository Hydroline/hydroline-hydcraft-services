import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { registerAuthGuards } from './guards/auth'

export const userRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/user/UserShell.vue'),
    meta: { layout: 'user' },
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/user/Home/HomeView.vue'),
        meta: { layout: 'user' },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/user/Profile/ProfileView.vue'),
        meta: { requiresAuth: true, layout: 'user' },
      },
      {
        path: 'error/404',
        name: 'error.not-found',
        component: () => import('@/views/common/NotFoundView.vue'),
        meta: { layout: 'user' },
      },
    ],
  },
]

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    component: () => import('@/layouts/admin/AdminShell.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'moderator'],
      layout: 'admin',
    },
    children: [
      {
        path: '',
        name: 'admin.dashboard',
        component: () => import('@/views/admin/Dashboard/AdminOverview.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.manage.users'],
          layout: 'admin',
        },
      },
      {
        path: 'users',
        name: 'admin.users',
        component: () => import('@/views/admin/Users/UserDirectory.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.manage.users'],
          layout: 'admin',
        },
      },
      {
        path: 'attachments',
        name: 'admin.attachments',
        component: () => import('@/views/admin/Attachments/AttachmentLibrary.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['assets.manage.attachments'],
          layout: 'admin',
        },
      },
      {
        path: 'rbac',
        name: 'admin.rbac',
        component: () => import('@/views/admin/Rbac/RbacConsole.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.manage.roles'],
          layout: 'admin',
        },
      },
      {
        path: 'config',
        name: 'admin.config',
        component: () => import('@/views/admin/Config/ConfigConsole.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.manage'],
          layout: 'admin',
        },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...userRoutes,
    ...adminRoutes,
    {
      path: '/:pathMatch(.*)*',
      redirect: '/error/404',
    },
  ],
})

registerAuthGuards(router)

export default router
