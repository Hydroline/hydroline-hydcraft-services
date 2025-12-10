# 前端 Admin 区域与权限映射草案（2025-11-19）

> 本文件从前端视角总结 `/admin` 下各页面与建议的权限节点，方便和后端文档对照使用。后端权限节点命名以 `.agents/backend/milestone/20251119/admin-permissions-backend.md` 为准。

## 一、整体路由与布局

文件：
- `frontend/src/layouts/admin/AdminShell.vue`
- `frontend/src/router/index.ts` 中 `adminRoutes`

现状：
- `/admin` 整体要求：
  - `meta.requiresAuth = true`
  - `meta.requiresRole = ['admin', 'moderator']`
- 每个子路由使用现有默认权限：
  - 用户/玩家/Verification 使用 `auth.manage.users`
  - RBAC 使用 `auth.manage.roles`
  - OAuth 使用 `auth.manage.oauth`
  - 附件使用 `assets.manage.attachments`
  - Config/AuthMe/LuckPerms 使用 `config.manage`
  - Minecraft/Beacon 使用 `minecraft.manage.servers`
  - Portal 使用 `portal.manage.home`

建议整体思路：
- `AdminShell` 仅要求「具备任一后台权限」即可访问外壳，菜单项则根据更细粒度权限控制显隐；
- 各子路由的 `meta.requiresPermissions` 使用后端文档中规划的细粒度权限。

## 二、按页面的权限建议

以下仅列出前端路由名（`name`）、路径（`path`）及对应建议权限。命名与后端文档一致。

### 1. 管理总览

- 路由：
  - `name: 'admin.dashboard'`
  - `path: '/admin'`
  - 组件：`views/admin/Dashboard/AdminOverview.vue`
- 当前权限：
  - `requiresPermissions: ['auth.manage.users']`
- 建议修改为：
  - `requiresPermissions: ['portal.view.admin-dashboard']`

### 2. 用户信息

- 用户列表：
  - `name: 'admin.users'`
  - `path: '/admin/users'`
  - 组件：`views/admin/Users/UserDirectory.vue`
  - 建议：`requiresPermissions: ['auth.view.users']`
  - 页面内针对编辑操作按钮：
    - 一般编辑（昵称、邮箱、联系方式、Minecraft 昵称等）：`auth.manage.users`
    - 安全/危险操作（封禁、解封、重置密码、删除账号）：`auth.admin.user-security`
    - 调整角色/权限标签：`auth.manage.user-permissions`

- 用户详情：
  - 组件：`views/admin/Users/UserDetail.vue` 及内部子组件
  - 通过路由或面板打开时，应确保：
    - 打开详情：`auth.view.users`
    - 分区权限示例：
      - OAuth 绑定信息：`auth.view.users` + `oauth.view.accounts`（若后端也细分）
      - 绑定历史、会话记录：`auth.view.users`
      - AuthMe 绑定管理：数据展示 `auth.view.users`，操作 `auth.manage.users`
      - 用户状态与生命周期事件：查看 `auth.view.users`，新增/修改 `auth.manage.users`，危险调整（例如封禁）叠加 `auth.admin.user-security`

### 3. 玩家信息

- 玩家列表：
  - `name: 'admin.players'`
  - `path: '/admin/players'`
  - 组件：`views/admin/Players/PlayerDirectory.vue`
  - 建议：
    - 列表/详情查看：`auth.view.players`
    - 若有修改玩家档案或标签的操作：`auth.manage.players`
    - 未来若有封禁、白名单、转服等操作，可视情况叠加：
      - `auth.admin.user-security` 或
      - 新增如 `minecraft.manage.player-bans`

### 4. 附件系统

- 附件库：
  - `name: 'admin.attachments'`
  - `path: '/admin/attachments'`
  - 组件：`views/admin/Attachments/AttachmentLibrary.vue`
  - 建议：
    - 页面访问（查看列表）：`assets.view.attachments`
    - 上传、重命名、移动、删除附件；管理文件夹/标签：`assets.manage.attachments`
    - 设置附件公共访问、生成可公开分享链接（如果要进一步限制）：`assets.admin.attachments-public`

### 5. 数据同步（AuthMe / LuckPerms）

- AuthMe 管理：
  - `name: 'admin.authme'`
  - `path: '/admin/authme'`
  - 组件：`views/admin/DataSync/AuthmeAdminView.vue`
  - 建议：
    - 只读查看状态/统计：`config.view.authme`
    - 修改配置、手动触发同步：`config.manage.authme`

- LuckPerms 管理：
  - `name: 'admin.luckperms'`
  - `path: '/admin/luckperms'`
  - 组件：`views/admin/DataSync/LuckpermsAdminView.vue`
  - 建议：
    - 查看状态：`config.view.luckperms`
    - 修改配置、同步：`config.manage.luckperms`

### 6. Minecraft 服务器 & Beacon

- Minecraft 服务器列表与详情：
  - `name: 'admin.minecraft.servers'`
  - `path: '/admin/minecraft/servers'`
  - 组件：`views/admin/ServerStatus/MinecraftServerStatusView.vue`
  - 建议：
    - 查看服务器信息与基本状态：`minecraft.view.servers`
    - 新增/编辑/删除服务器配置 & 修改自动 Ping 设置：`minecraft.manage.servers`
    - 前端在执行 MCSM 控制操作（start/stop/restart/kill/command）时，检查：
      - `minecraft.manage.mcsm-control`

- Beacon MTR 日志：
  - `name: 'admin.beacon.mtr-logs'`
  - `path: '/admin/beacon/mtr-logs'`
  - 组件：`views/admin/Beacon/BeaconMtrLogsView.vue`
  - 建议：
    - 页面访问和列表查询：`beacon.view.logs`

- Beacon 成就视图：
  - `name: 'admin.beacon.advancements'`
  - `path: '/admin/beacon/advancements'`
  - 组件：`views/admin/Beacon/BeaconAdvancementsView.vue`
  - 建议：
    - 访问：`beacon.view.logs`（或可单独使用 `beacon.view.status`，视后端接口类型而定）

- Beacon 统计视图：
  - `name: 'admin.beacon.stats'`
  - `path: '/admin/beacon/stats'`
  - 组件：`views/admin/Beacon/BeaconStatsView.vue`
  - 建议：
    - 访问：`beacon.view.logs` 或新增 `beacon.view.stats`（如统计与日志有区分）

### 7. RBAC 管理

- RBAC 控制台：
  - `name: 'admin.rbac'`
  - `path: '/admin/rbac'`
  - 组件：`views/admin/Rbac/RbacConsole.vue`
  - 建议：
    - 页面访问（查看角色/权限/标签列表）：`auth.view.rbac`
    - 创建/更新/删除角色：`auth.manage.roles`
    - 新增/编辑/删除权限点：`auth.manage.permissions`
    - 管理权限标签及标签与权限的映射：`auth.manage.permission-labels`
    - 自助为自己赋权（如前端有对应操作入口）：`auth.admin.self-permissions`

### 8. 全局配置控制台

- 配置管理：
  - `name: 'admin.config'`
  - `path: '/admin/config'`
  - 组件：`views/admin/Config/ConfigConsole.vue`
  - 建议：
    - 打开页面并只读查看配置项：`config.view.general`
    - 修改一般配置（非安全类）：`config.manage.general`
    - 编辑安全策略类配置（登录策略、验证码策略、IP 限制等）：`config.manage.security` / `config.manage.auth-policy`
    - 修改外部集成配置（AuthMe、LuckPerms、邮件、短信、OAuth Provider 等）：`config.manage.integrations`
  - 页面内部可根据配置项类型显示不同等级的操作按钮。

### 9. Verification 管理控制台

- Verification：
  - `name: 'admin.verification'`
  - `path: '/admin/verification'`
  - 组件：`views/admin/Verification/VerificationConsole.vue`
  - 当前路由注释已说明：允许仅具备用户管理权限的人员访问，页面内部再做权限细分。
  - 建议：
    - 页面访问（查看当前规则和状态）：`config.view.verification`
    - 修改验证规则、开关某些验证功能：`config.manage.verification`
    - 若某些开关影响安全策略（如是否允许免密码登录等），可叠加：`config.manage.security`

### 10. Portal 首页配置

- 门户首页配置：
  - `name: 'admin.portal.home'`
  - `path: '/admin/portal/home'`
  - 组件：`views/admin/Portal/PortalHomeConfig.vue`
  - 建议：
    - 查看当前草稿配置：`portal.view.home-config`
    - 修改内容（标题、副标题、背景图、导航链接等）：`portal.manage.home-content`
    - 修改卡片可见性规则（访客可见、特定角色/用户）：`portal.manage.home-visibility`
    - 如有“发布草稿”的操作：`portal.manage.home-publish`

### 11. OAuth 管理

- Provider 管理：
  - `name: 'admin.oauth.providers'`
  - `path: '/admin/oauth/providers'`
  - 组件：`views/admin/OAuth/OAuthProvidersView.vue`
  - 建议：
    - 查看 Provider 列表：`oauth.view.providers`
    - 创建/更新/删除 Provider、切换启用状态：`oauth.manage.providers`

- 绑定记录：
  - `name: 'admin.oauth.accounts'`
  - `path: '/admin/oauth/accounts'`
  - 组件：`views/admin/OAuth/OAuthAccountsView.vue`
  - 建议：
    - 查看绑定账户列表：`oauth.view.accounts`
    - 解绑定或清理异常绑定：`oauth.manage.accounts`

- OAuth 日志：
  - `name: 'admin.oauth.logs'`
  - `path: '/admin/oauth/logs'`
  - 组件：`views/admin/OAuth/OAuthLogsView.vue`
  - 建议：
    - 访问：`oauth.view.logs`

- OAuth 统计：
  - `name: 'admin.oauth.stats'`
  - `path: '/admin/oauth/stats'`
  - 组件：`views/admin/OAuth/OAuthStatsView.vue`
  - 建议：
    - 访问：`oauth.view.stats`

## 三、前端实施建议

1. **路由层调整**  
   - 在 `frontend/src/router/index.ts` 中，将各 `adminRoutes` 的 `requiresPermissions` 替换为本文件中建议的权限 key；  
   - 保留 `requiresRole` 作为“后台入口”的基础限制，但页面级权限由 `requiresPermissions` 决定。

2. **组件内按钮级别控制**  
   - 在 Admin 页面组件中，对于具体操作按钮（例如“删除用户”、“重置密码”、“启动服务器”、“kill 实例”等），增加基于细粒度权限的显隐控制；  
   - 对应的权限常量可单独维护在一个前端常量文件中（与后端 `DEFAULT_PERMISSIONS` 的 key 对齐）。

3. **权限加载与前端缓存**  
   - 利用现有的用户 Session 接口中返回的角色和权限标签，推导出最终的权限集合；  
   - 在前端 store 中缓存当前用户的权限 set，提供 `hasPermission()` 工具函数供路由守卫和组件使用。

4. **与后端文档保持同步**  
   - 本文件与 `.agents/backend/milestone/20251119/admin-permissions-backend.md` 配套使用；  
   - 若后端最终确认的权限 key 有变更，应同步更新本文件和路由配置。

