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
        meta: { layout: 'user' },
      },
      {
        path: 'profile/info',
        name: 'profile.info',
        component: () => import('@/views/user/Profile/ProfileInfoView.vue'),
        meta: { layout: 'user' },
      },
      {
        path: 'profile/preferences',
        name: 'profile.preferences',
        component: () =>
          import('@/views/user/Profile/ProfilePreferencesView.vue'),
        meta: { layout: 'user' },
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
        component: () =>
          import('@/views/admin/Attachments/AttachmentLibrary.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['assets.manage.attachments'],
          layout: 'admin',
        },
      },
      {
        path: 'data-sync',
        name: 'admin.dataSync',
        component: () => import('@/views/admin/DataSync/DataSyncView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.manage'],
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
      {
        path: 'portal/home',
        name: 'admin.portal.home',
        component: () => import('@/views/admin/Portal/PortalHomeConfig.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['portal.manage.home'],
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
  // 保持用户体验一致：导航到新页面时滚动到顶部；浏览器后退/前进时恢复之前的位置。
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.hash) {
      return { el: to.hash }
    }
    return { left: 0, top: 0 }
  },
})

registerAuthGuards(router)

export default router
