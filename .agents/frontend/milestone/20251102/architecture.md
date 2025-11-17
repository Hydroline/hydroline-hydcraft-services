# Hydroline 前端 2025-11-02 里程碑设计指引

## 目标概述
- 延续 HomeView 现有视觉风格，使用 Nuxt UI + Tailwind CSS + Reka UI + Headless UI 构建双端（用户 / 后台）界面。
- 适配移动端与暗色主题，提供统一的加载动画、Header 动效与模糊渐变背景。
- 将用户端与后台端隔离在路由、布局、状态层，并共享认证、主题、资源附件、KV 配置等基础逻辑。
- 通过后端聚合接口减少请求数：`/portal/home` 提供首页展示数据，`/portal/admin/overview` 提供后台仪表信息；KV 配置由 `/config/*` 系列接口维护。

## 文件组织
```
frontend/src
├── layouts
│   ├── user
│   │   └── UserShell.vue      # 首页及普通用户使用的基础框架
│   └── admin
│       └── AdminShell.vue     # 后台管理专用布局
├── router
│   ├── guards                 # 权限守卫（auth、role 检查）
│   └── index.ts               # 暴露 user/admin 双域路由并封装守卫注册
├── stores
│   ├── auth.ts                # BetterAuth 登录态、用户信息
│   ├── ui.ts                  # 主题模式、加载条控制
│   └── portal.ts              # 首页 / 后台聚合数据
├── views
│   ├── user
│   │   ├── Home
│   │   │   ├── HomeView.vue
│   │   │   └── components     # Hero、Header、动态卡片
│   │   └── Profile            # 个人资料视图（后续扩展）
│   └── admin
│       ├── Dashboard
│       │   ├── AdminOverview.vue
│       │   └── components     # 用户/玩家双栏、附件卡片
│       └── Config
│           └── ConfigConsole.vue  # KV 命名空间/配置项管理
└── components
    ├── common
    │   ├── AppLoadingBar.vue  # 全局加载动画条
    │   ├── ThemeToggle.vue
    │   ├── UserAvatar.vue
    │   └── AttachmentBadge.vue
    └── dialogs
        └── AuthDialog.vue     # 登录/注册弹窗，预留 SSO 接口注释
```

## 状态与数据流
- `auth` store 负责：
  - 与 `/auth/signin`、`/auth/signout`、`/auth/session` 交互，管理访问令牌。
  - 缓存当前用户、角色、关联 Minecraft 身份与头像（来自附件系统）。
- `portal` store：
  - `fetchHomePortal()` 调用 `/portal/home`，同时获取背景图、卡片清单、导航链接（来自 KV）。
  - `fetchAdminPortal()` 调用 `/portal/admin/overview`，提供后台仪表、用户/玩家映射、附件统计。
- 所有请求通过 `api` 封装模块集中处理，内置错误拦截与加载条控制。

## UI 与交互要点
- Header 分三段（左：Minecraft 占位 / 折叠菜单按钮；中：动态标题；右：用户区 + 消息 + 主题切换）。
- 根据滚动状态使用 `IntersectionObserver` + `useMotion`（GSAP）组合实现文字与背景渐变。
- 背景层包含图片、渐变遮罩与 `backdrop-filter: blur` 动效；滚动时提高模糊并收缩渐变。
- 卡片展示：
  - “个人资料” 取自 `portal.home.profileCard`；
  - 其他卡片显示禁用样式，保留未来拓展占位。
- 移动端：Header 切换为更紧凑布局，菜单抽屉化；背景与卡片栅格调整为单列。
- Dialog：登录 / 注册切换使用标签页；SSO 区域保留 `<!-- SSO placeholder -->` 注释。

## 权限与路由策略
- `adminRoutes` 需挂载 `meta.requiresRole = 'admin' | 'moderator'` 等，守卫从 `auth` store 校验。
- 未登录用户访问后台 -> 重定向至首页并触发登录弹窗。
- 导航菜单来源于 `portal.home.navigation` 与 `portal.admin.menu`，确保后端可配置。

## 开发与测试注意
- 所有新组件遵循 Tailwind 原子类 + Nuxt UI 组件复用，不直接写内联颜色值，使用主题变量（`--color-surface-*` 等）。
- 动画统一通过 `motion` composable，避免在多个组件重复监听 scroll。
- Playwright 脚本覆盖：
  1. 未登录进入首页，验证背景/按钮/登录入口；
  2. 使用管理员测试账号登录；
  3. 访问后台仪表页面并验证用户/玩家映射渲染；
  4. 附件列表加载与标签筛选的基本交互。
- 任何临时日志需在提交前移除，KV 编辑操作后需要刷新命名空间/配置项以同步最新数据。

## 接口契约摘要
- `GET /portal/home`
  - 返回：`hero`（背景图、标题、描述）、`navigation`, `cards`, `messages`, `theme`, `userSnapshot`.
- `GET /portal/admin/overview`
  - 返回：`users` 列表（含 `linkedPlayers`）、`unlinkedPlayers`、`permissions`, `attachments`.
- `GET /attachments`, `POST /attachments`, `PATCH /attachments/:id`, `DELETE /attachments/:id`
  - 权限：`assets.manage.attachments`
  - 上传接口支持多分区（文件夹）、标签、外链生成。
- `GET /config/namespaces` / `POST /config/namespaces`
  - 管理 KV 命名空间，用于导航、客户端配置等各类非核心参数。
- `GET /config/namespaces/:id/entries` / `POST /config/namespaces/:id/entries`
  - JSON 形式的配置项增删改查，后台“配置中心”视图直接调用。

后续迭代：Minecraft 服务器信息与更多卡片类型预留接口，由聚合服务扩展即可。
