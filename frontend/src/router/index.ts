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
        meta: { layout: 'user', title: '仪表盘', icon: 'i-lucide-home' },
      },
      {
        path: 'player/name/:playerName',
        name: 'player.name',
        component: () => import('@/views/user/Player/PlayerView.vue'),
        meta: {
          layout: 'user',
          title: '玩家档案',
          icon: 'i-lucide-user-round',
        },
      },
      {
        path: 'player/:playerId?',
        name: 'player',
        component: () => import('@/views/user/Player/PlayerView.vue'),
        meta: {
          layout: 'user',
          title: '玩家档案',
          icon: 'i-lucide-user-round',
        },
      },
      {
        path: 'rank',
        name: 'rank',
        component: () => import('@/views/user/Rank/RankView.vue'),
        meta: {
          layout: 'user',
          title: '排行榜',
          icon: 'i-lucide-trophy',
        },
      },
      {
        path: 'rank/top',
        name: 'rank.top',
        component: () => import('@/views/user/Rank/RankTopView.vue'),
        meta: {
          layout: 'user',
          title: '指标榜单',
          icon: 'i-lucide-line-chart',
        },
      },
      {
        path: 'server',
        name: 'server',
        component: () => import('@/views/user/Server/ServerStatusView.vue'),
        meta: {
          layout: 'user',
          title: '服务器状态',
          icon: 'i-lucide-server',
        },
      },
      {
        path: 'company',
        name: 'company',
        component: () => import('@/views/user/Company/CompanyOverviewView.vue'),
        meta: {
          layout: 'user',
          title: '工商系统',
          icon: 'i-lucide-building-2',
        },
      },
      {
        path: 'company/dashboard',
        name: 'company.dashboard',
        component: () =>
          import('@/views/user/Company/CompanyDashboardView.vue'),
        meta: {
          layout: 'user',
          title: '公司工作台',
          icon: 'i-lucide-briefcase',
          requiresAuth: true,
        },
      },
      {
        path: 'transportation',
        component: () =>
          import('@/views/user/Transportation/TransportationLayout.vue'),
        meta: {
          layout: 'user',
          title: '交通系统',
          icon: 'i-lucide-train-front',
        },
        children: [
          {
            path: '',
            redirect: { name: 'transportation.railway' },
          },
          {
            path: 'railway',
            name: 'transportation.railway',
            component: () =>
              import('@/views/user/Transportation/RailwayOverviewView.vue'),
          },
          {
            path: 'railway/routes',
            name: 'transportation.railway.routes',
            component: () =>
              import('@/views/user/Transportation/RailwayRouteListView.vue'),
          },
          {
            path: 'railway/routes/:railwayType/:routeId',
            name: 'transportation.railway.route',
            component: () =>
              import('@/views/user/Transportation/RailwayRouteDetailView.vue'),
          },
          {
            path: 'railway/routes/:railwayType/:routeId/map',
            name: 'transportation.railway.route.map',
            component: () =>
              import('@/views/user/Transportation/RailwayRouteMapView.vue'),
          },
          {
            path: 'railway/stations/:railwayType/:stationId',
            name: 'transportation.railway.station',
            component: () =>
              import(
                '@/views/user/Transportation/RailwayStationDetailView.vue'
              ),
          },
          {
            path: 'railway/stations',
            name: 'transportation.railway.stations',
            component: () =>
              import('@/views/user/Transportation/RailwayStationListView.vue'),
          },
          {
            path: 'railway/depots/:railwayType/:depotId',
            name: 'transportation.railway.depot',
            component: () =>
              import('@/views/user/Transportation/RailwayDepotDetailView.vue'),
          },
          {
            path: 'railway/depots',
            name: 'transportation.railway.depots',
            component: () =>
              import('@/views/user/Transportation/RailwayDepotListView.vue'),
          },
          {
            path: 'aviation',
            name: 'transportation.aviation',
            component: () =>
              import('@/views/user/Transportation/AviationPlaceholderView.vue'),
          },
        ],
      },
      {
        path: 'about',
        name: 'about',
        component: () => import('@/views/user/About/AboutView.vue'),
        meta: {
          layout: 'user',
          title: '关于 Hydroline',
          icon: 'i-lucide-info',
        },
      },
      {
        path: 'profile',
        component: () => import('@/views/user/Profile/ProfileInfoShell.vue'),
        meta: { layout: 'user' },
        children: [
          {
            path: '',
            name: 'profile',
            redirect: { name: 'profile.basic' },
          },
          {
            path: 'basic',
            name: 'profile.basic',
            component: () =>
              import('@/views/user/Profile/ProfileInfoBasicView.vue'),
            meta: {
              layout: 'user',
              title: '用户信息',
              icon: 'i-lucide-id-card',
            },
          },
          {
            path: 'minecraft',
            name: 'profile.minecraft',
            component: () =>
              import('@/views/user/Profile/ProfileInfoMinecraftView.vue'),
            meta: {
              layout: 'user',
              title: '服务器账户',
              icon: 'i-lucide-server',
            },
          },
          {
            path: 'sessions',
            name: 'profile.sessions',
            component: () =>
              import('@/views/user/Profile/ProfileInfoSessionsView.vue'),
            meta: {
              layout: 'user',
              title: '登录设备管理',
              icon: 'i-lucide-smartphone',
            },
          },
          {
            path: 'security',
            name: 'profile.security',
            component: () =>
              import('@/views/user/Profile/ProfileInfoSecurityView.vue'),
            meta: {
              layout: 'user',
              title: '隐私与安全',
              icon: 'i-lucide-shield-check',
            },
          },
        ],
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
          requiresPermissions: ['portal.view.admin-dashboard'],
          layout: 'admin',
        },
      },
      {
        path: 'users',
        name: 'admin.users',
        component: () => import('@/views/admin/Users/UserDirectory.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.view.users'],
          layout: 'admin',
        },
      },
      {
        path: 'players',
        name: 'admin.players',
        component: () => import('@/views/admin/Players/PlayerDirectory.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.view.players'],
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
          requiresPermissions: ['assets.view.attachments'],
          layout: 'admin',
        },
      },
      {
        path: 'authme',
        name: 'admin.authme',
        component: () => import('@/views/admin/DataSync/AuthmeAdminView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.view.authme'],
          layout: 'admin',
        },
      },
      {
        path: 'luckperms',
        name: 'admin.luckperms',
        component: () =>
          import('@/views/admin/DataSync/LuckpermsAdminView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.view.luckperms'],
          layout: 'admin',
        },
      },
      {
        path: 'minecraft/servers',
        name: 'admin.minecraft.servers',
        component: () =>
          import('@/views/admin/ServerStatus/MinecraftServerStatusView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['minecraft.view.servers'],
          layout: 'admin',
        },
      },

      // 服务端信息 / Hydroline Beacon
      {
        path: 'beacon/mtr-logs',
        name: 'admin.beacon.mtr-logs',
        component: () => import('@/views/admin/Beacon/BeaconMtrLogsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['beacon.view.logs'],
          layout: 'admin',
          section: 'server-info',
        },
      },
      {
        path: 'beacon/advancements',
        name: 'admin.beacon.advancements',
        component: () =>
          import('@/views/admin/Beacon/BeaconAdvancementsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['beacon.view.logs'],
          layout: 'admin',
          section: 'server-info',
        },
      },
      {
        path: 'beacon/stats',
        name: 'admin.beacon.stats',
        component: () => import('@/views/admin/Beacon/BeaconStatsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['beacon.view.logs'],
          layout: 'admin',
          section: 'server-info',
        },
      },
      {
        path: 'rbac',
        name: 'admin.rbac',
        component: () => import('@/views/admin/Rbac/RbacConsole.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.view.rbac'],
          layout: 'admin',
        },
      },
      {
        path: 'config',
        name: 'admin.config',
        component: () => import('@/views/admin/Config/ConfigConsole.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.view.general'],
          layout: 'admin',
        },
      },
      {
        path: 'verification',
        name: 'admin.verification',
        component: () =>
          import('@/views/admin/Verification/VerificationConsole.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.view.verification'],
          layout: 'admin',
        },
      },
      {
        path: 'portal/home',
        name: 'admin.portal.home',
        component: () => import('@/views/admin/Portal/PortalHomeConfig.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['portal.view.home-config'],
          layout: 'admin',
        },
      },
      {
        path: 'oauth/providers',
        name: 'admin.oauth.providers',
        component: () => import('@/views/admin/OAuth/OAuthProvidersView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['oauth.view.providers'],
          layout: 'admin',
        },
      },
      {
        path: 'oauth/accounts',
        name: 'admin.oauth.accounts',
        component: () => import('@/views/admin/OAuth/OAuthAccountsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['oauth.view.accounts'],
          layout: 'admin',
        },
      },
      {
        path: 'oauth/logs',
        name: 'admin.oauth.logs',
        component: () => import('@/views/admin/OAuth/OAuthLogsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['oauth.view.logs'],
          layout: 'admin',
        },
      },
      {
        path: 'oauth/stats',
        name: 'admin.oauth.stats',
        component: () => import('@/views/admin/OAuth/OAuthStatsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['oauth.view.stats'],
          layout: 'admin',
        },
      },
      {
        path: 'company/registry',
        name: 'admin.company.registry',
        component: () =>
          import('@/views/admin/Company/CompanyRegistryView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.view'],
          layout: 'admin',
        },
      },
      {
        path: 'company/applications',
        name: 'admin.company.applications',
        component: () =>
          import('@/views/admin/Company/CompanyApplicationsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.applications'],
          layout: 'admin',
        },
      },
      {
        path: 'company/industries',
        name: 'admin.company.industries',
        component: () =>
          import('@/views/admin/Company/CompanyIndustriesView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.config'],
          layout: 'admin',
        },
      },
      {
        path: 'company/types',
        name: 'admin.company.types',
        component: () => import('@/views/admin/Company/CompanyTypesView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.config'],
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
      path: '/oauth/callback',
      name: 'oauth.callback',
      component: () => import('@/views/common/OAuthCallbackView.vue'),
      meta: { layout: 'user' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/error/404',
    },
  ],

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
