# 后端管理接口权限规划（草案）

> 说明：本文件基于 2025-11-19 代码快照梳理，仅做权限粒度设计，不直接改动代码。后续可以按本文为基准逐步调整 `DEFAULT_PERMISSIONS`、角色及各控制器上的 `@RequirePermissions`。

## 一、命名规范

- 统一使用「领域.动作.对象」的形式，必要时再增加层级：
  - 领域：`auth` / `users` / `portal` / `minecraft` / `attachments` / `config` / `oauth` / `beacon` 等；
  - 动作：`view`（只读）/ `manage`（读写）/ `admin`（危险或全局操作）/ `stats`（统计）/ `logs`（日志）；
  - 对象：`users` / `roles` / `auth-config` / `minecraft-servers` / `beacon` / `attachments` / `portal-home` 等。
- 对于前端绑定到同一页面，但页面内有明显“危险操作”或“敏感字段”的场景，建议拆出额外权限：
  - 例如：`auth.manage.users`（一般管理） + `auth.admin.user-security`（封禁、重置密码、删除账号等高危操作）。

## 二、按模块划分的权限节点

### 1. 管理概览 / Portal 管理后台

关联前端：
- `frontend/src/views/admin/Dashboard/AdminOverview.vue`
- store：`frontend/src/stores/portal.ts` 中 `/portal/admin/overview`

关联后端：
- `backend/src/portal/portal.controller.ts` 中的 `/portal/admin/overview`、`/portal/admin/stats` 等。

建议权限节点：
- `portal.view.admin-dashboard`：查看管理概览页（概览统计、关键指标只读）。
- `portal.view.admin-stats`：查看更详细的后台统计（如有单独接口）。

说明：
- 当前前端路由要求 `auth.manage.users` 才能进入仪表盘，后续可改为更贴近“后台总览”的权限。

### 2. 用户管理（UserDirectory / UserDetail）

关联前端：
- `frontend/src/views/admin/Users/UserDirectory.vue`
- `frontend/src/views/admin/Users/UserDetail.vue`
- 若干子组件（状态、会话、绑定、重置密码等）。

关联后端：
- `backend/src/auth/controllers/users.controller.ts`（`/auth/users`）
- `backend/src/auth/controllers/contact-channels.controller.ts`
- `backend/src/auth/controllers/verification-admin.controller.ts`（部分和用户密切相关）
- `backend/src/auth/controllers/players.controller.ts`（玩家信息与用户关联）。

现有默认权限：
- `auth.manage.users`

建议拆分：
- `auth.view.users`：查询用户列表、查看用户详情、查看关联 OAuth / 玩家 / 会话 / 状态等信息；
- `auth.manage.users`：一般用户管理操作：
  - 编辑基础资料（昵称、邮箱、联系方式、玩家昵称记录等）；
  - 调整入服日期；
  - 管理 AuthMe 绑定（但不含危险操作）；
  - 创建/更新联系渠道记录；
- `auth.admin.user-security`：涉及安全和不可逆操作：
  - 重置用户密码；
  - 封禁 / 解封（修改状态为封禁等）；
  - 删除用户；
  - 管理敏感安全字段（如二次验证开关、敏感标记等，如有）；
- `auth.manage.user-permissions`：调整用户角色和权限标签：
  - `/auth/users/:userId/roles` 相关接口；
  - `/auth/users/:userId/permission-labels` 相关接口；
  - 只限 RBAC 相关，不包括普通资料编辑。

### 3. 玩家管理（PlayerDirectory）

关联前端：
- `frontend/src/views/admin/Players/PlayerDirectory.vue`

关联后端：
- `backend/src/auth/controllers/players.controller.ts`（`/auth/players`）

现有默认权限：
- 前端使用 `auth.manage.users`
- 后端控制器使用 `DEFAULT_PERMISSIONS.MANAGE_USERS`

建议拆分：
- `auth.view.players`：查看玩家列表与基础信息；
- `auth.manage.players`：管理玩家信息（例如玩家档案中的非安全字段、标签等）；
- 若涉及封禁/白名单等危险操作，可用已有的 `auth.admin.user-security` 或衍生出更具体权限：
  - `minecraft.manage.player-bans`（如果后续有封禁操作）。

### 4. RBAC 管理控制台（RbacConsole）

关联前端：
- `frontend/src/views/admin/Rbac/RbacConsole.vue`

关联后端：
- `backend/src/auth/controllers/roles.controller.ts`（`/auth/roles`）
- `backend/src/auth/controllers/rbac-self.controller.ts`（自助权限）
- `backend/src/auth/services/roles.service.ts`（权限、角色、标签、权限目录）。

现有默认权限：
- `auth.manage.roles`

建议拆分：
- `auth.view.rbac`：只读查看角色列表、权限列表、标签列表以及权限目录；
- `auth.manage.roles`：增删改角色（创建、更新、删除角色）；
- `auth.manage.permissions`：增删改权限点（慎用，一般只留给系统管理员）；
- `auth.manage.permission-labels`：增删改权限标签及标签所包含的权限；
- `auth.admin.self-permissions`：通过 `/auth/rbac/self` 自助为自己分配权限（仅限管理员，需配合强审计）。

### 5. 附件系统（AttachmentLibrary）

关联前端：
- `frontend/src/views/admin/Attachments/AttachmentLibrary.vue`
- `frontend/src/views/admin/Attachments/components/*`

关联后端：
- `backend/src/attachments/attachments.controller.ts`（`/attachments`）

现有默认权限：
- `assets.manage.attachments`

建议拆分：
- `assets.view.attachments`：查看附件列表、文件夹、标签信息；
- `assets.manage.attachments`：上传/更新/删除附件，管理文件夹/标签，生成分享链接；
- `assets.admin.attachments-public`：将附件设置为公共、生成可公开访问的链接（如需额外保护，可单独控制）。

### 6. 数据同步 / 外部服务（AuthMe / LuckPerms）

关联前端：
- `frontend/src/views/admin/DataSync/AuthmeAdminView.vue`
- `frontend/src/views/admin/DataSync/LuckpermsAdminView.vue`

关联后端：
- `backend/src/authme/authme.admin.controller.ts`（`/authme/admin/...`）
- `backend/src/luckperms/luckperms.admin.controller.ts`（`/luckperms/admin/...`）

现有默认权限：
- 前端路由使用 `config.manage`
- 控制器中使用 `DEFAULT_PERMISSIONS.MANAGE_CONFIG`

建议拆分：
- `config.view.authme`：查看 AuthMe 同步状态、配置摘要；
- `config.manage.authme`：修改 AuthMe 相关配置、手动触发同步任务等；
- `config.view.luckperms`：查看 LuckPerms 同步状态、数据摘要；
- `config.manage.luckperms`：修改 LuckPerms 相关配置、触发同步；
- 若有统一“游戏数据同步管理”页面，可抽象出：
  - `config.view.external-sync`
  - `config.manage.external-sync`

### 7. Minecraft 服务器与 Beacon（ServerStatus / Beacon*）

关联前端：
- `frontend/src/views/admin/ServerStatus/MinecraftServerStatusView.vue`
- `frontend/src/views/admin/Beacon/BeaconMtrLogsView.vue`
- `frontend/src/views/admin/Beacon/BeaconAdvancementsView.vue`
- `frontend/src/views/admin/Beacon/BeaconStatsView.vue`

关联后端：
- `backend/src/minecraft/minecraft-server.controller.ts`（`/admin/minecraft/servers` + Beacon 相关子路由）

现有默认权限：
- 前后端均使用：`minecraft.manage.servers`

建议拆分：
- `minecraft.view.servers`：查看服务器列表、基本状态、基础配置（只读）；
- `minecraft.manage.servers`：创建/更新/删除服务器配置、修改自动 Ping 设置等；
- `minecraft.manage.mcsm-control`：MCSM 相关操作（执行命令、启动/停止/重启/kill 实例等危险操作）；
- `beacon.view.status`：查看 Beacon 状态与在线玩家信息；
- `beacon.view.logs`：查看 Beacon MTR 日志、玩家会话/统计/成就/NBT 等，只读数据查询；
- `beacon.manage.connection`：手动 connect/disconnect/reconnect 等连接操作；
- `beacon.admin.force-update`：`/beacon/force-update` 等高强度任务，仅超级管理员使用。

### 8. Verification 管理（验证码/验证规则等）

关联前端：
- `frontend/src/views/admin/Verification/VerificationConsole.vue`

关联后端：
- `backend/src/auth/controllers/verification-admin.controller.ts`（`/auth/admin/verification/...`）

现有默认权限：
- 控制器中使用 `DEFAULT_PERMISSIONS.MANAGE_CONFIG` 或 `MANAGE_USERS`（混合）
- 前端路由上使用 `auth.manage.users`

建议拆分：
- `config.view.verification`：查看当前验证码/验证规则配置、统计等；
- `config.manage.verification`：修改验证规则、开关某些功能（如开放注册开关、登录策略等）；
- 若有公共配置项（如邮件模板、验证码限流等），可归入更通用的：
  - `config.manage.auth-policy`：登录/注册策略相关配置；
  - `config.manage.security`：安全相关全局配置。

### 9. Portal 门户首页配置

关联前端：
- `frontend/src/views/admin/Portal/PortalHomeConfig.vue`

关联后端：
- `backend/src/portal-config/portal-config.controller.ts`（`/admin/portal/config`）

现有默认权限：
- `portal.manage.home`

建议拆分：
- `portal.view.home-config`：查看门户首页草稿配置（导航、卡片、背景等）；
- `portal.manage.home-content`：修改英雄区标题、副标题、背景轮播、导航菜单、卡片内容等；
- `portal.manage.home-visibility`：调整卡片可见性（访客可见/角色可见/指定用户等），带访问控制属性；
- 若以后有“发布草稿”动作，可加：
  - `portal.manage.home-publish`：草稿→正式发布。

### 10. OAuth 管理（Providers / Accounts / Logs / Stats）

关联前端：
- `frontend/src/views/admin/OAuth/OAuthProvidersView.vue`
- `frontend/src/views/admin/OAuth/OAuthAccountsView.vue`
- `frontend/src/views/admin/OAuth/OAuthLogsView.vue`
- `frontend/src/views/admin/OAuth/OAuthStatsView.vue`

关联后端：
- `backend/src/oauth/controllers/oauth-admin.controller.ts`（`/auth/oauth/...`）

现有默认权限：
- `auth.manage.oauth`

建议拆分：
- `oauth.view.providers`：查看 OAuth Provider 列表（只读配置展示）；
- `oauth.manage.providers`：创建/更新/删除 Provider、启用/停用等；
- `oauth.view.accounts`：查看 OAuth 绑定账户列表（可按用户/Provider 查询）；
- `oauth.manage.accounts`：解除绑定、清理异常绑定记录等；
- `oauth.view.logs`：查看 OAuth 日志列表（包含 IP、UA、结果等审计信息）；
- `oauth.view.stats`：查看 OAuth 相关数据统计（按 Provider 等维度）；
- 若某些统计包含敏感隐私聚合信息，可考虑将 `oauth.view.stats` 设为更高等级权限。

### 11. 配置管理控制台（ConfigConsole）

关联前端：
- `frontend/src/views/admin/Config/ConfigConsole.vue`

关联后端：
- `backend/src/config/config.controller.ts`（`/config/admin/...`）
- 以及各模块内部的配置接口（如 AuthMe/LuckPerms/Verification 等）。

现有默认权限：
- 前端路由使用 `config.manage`
- 控制器中也多处使用 `DEFAULT_PERMISSIONS.MANAGE_CONFIG`

建议拆分（更细化的统一入口概念）：
- `config.view.general`：只读查看所有配置（用于观察当前环境配置）；
- `config.manage.general`：编辑通用配置项（非安全、非用户信息类，如站点名称、基础显示设置等）；
- `config.manage.security`：安全敏感配置（登录策略、验证规则、限流、邮件安全等），可复用与 Verification 相关权限；
- `config.manage.integrations`：第三方集成相关配置（AuthMe、LuckPerms、邮件、短信、OAuth Provider 等）的统一抽象；
- 具体子模块仍然保留精细权限，如前文的：
  - `config.manage.authme`
  - `config.manage.luckperms`
  - `oauth.manage.providers` 等。

## 三、汇总：建议新增/拆分的权限节点列表（首版）

> 以下为在现有基础上建议新增或拆分出的权限 key，后续可根据实际需要增删：

- Portal / 管理概览
  - `portal.view.admin-dashboard`
  - `portal.view.admin-stats`
- 用户 & 玩家
  - `auth.view.users`
  - `auth.manage.users`
  - `auth.admin.user-security`
  - `auth.manage.user-permissions`
  - `auth.view.players`
  - `auth.manage.players`
- RBAC
  - `auth.view.rbac`
  - `auth.manage.roles`
  - `auth.manage.permissions`
  - `auth.manage.permission-labels`
  - `auth.admin.self-permissions`
- 附件
  - `assets.view.attachments`
  - `assets.manage.attachments`
  - `assets.admin.attachments-public`
- 数据同步 / 外部服务
  - `config.view.authme`
  - `config.manage.authme`
  - `config.view.luckperms`
  - `config.manage.luckperms`
  - （可选）`config.view.external-sync`
  - （可选）`config.manage.external-sync`
- Minecraft / Beacon
  - `minecraft.view.servers`
  - `minecraft.manage.servers`
  - `minecraft.manage.mcsm-control`
  - `beacon.view.status`
  - `beacon.view.logs`
  - `beacon.manage.connection`
  - `beacon.admin.force-update`
- Verification / 安全策略
  - `config.view.verification`
  - `config.manage.verification`
  - `config.manage.auth-policy`
  - `config.manage.security`
- Portal 首页配置
  - `portal.view.home-config`
  - `portal.manage.home-content`
  - `portal.manage.home-visibility`
  - `portal.manage.home-publish`
- OAuth 管理
  - `oauth.view.providers`
  - `oauth.manage.providers`
  - `oauth.view.accounts`
  - `oauth.manage.accounts`
  - `oauth.view.logs`
  - `oauth.view.stats`
- 通用配置
  - `config.view.general`
  - `config.manage.general`
  - `config.manage.integrations`

## 四、与现有默认权限的映射建议

在当前实现中，系统角色的默认权限策略为：

- ADMIN：
  - 由 `RolesService.ensureDefaultRolesAndPermissions()` 自动授予 `ALL_PERMISSION_KEYS`，即：
    - 所有旧权限 key（`DEFAULT_PERMISSIONS`）；
    - 所有新的细粒度权限 key（`GRANULAR_PERMISSION_KEYS` / `PERMISSIONS.*`）。
  - 这样可以保证在开发环境中新增权限时，管理员无需手工更新角色即可拥有全部后台能力。
- MODERATOR：
  - 保留旧有的粗粒度权限：`auth.manage.users`、`auth.manage.contact-channels`（后续可视需要调整为细粒度组合）。
- PLAYER：
  - 默认不授予任何后台管理权限。

如果将来需要为非 admin 角色拆分出更细的默认权限组合，可以在同一个 `ensureDefaultRolesAndPermissions()` 中继续扩展映射逻辑。

### 开发环境迁移脚本

为方便在已有开发数据库中平滑切换到新权限体系，新增了一个仅用于开发环境的迁移脚本：

- 命令：`pnpm -C backend migrate:permissions:dev`
- 实现位置：`backend/scripts/migrate-permissions-dev.ts`
- 主要行为：
  - 重新执行 `RolesService.ensureDefaultRolesAndPermissions()`；
  - 补齐所有权限 key（旧 + 新）；
  - 确保 `admin` 角色绑定 `ALL_PERMISSION_KEYS`；
  - 确保系统角色（`admin` / `moderator` / `player`）存在。

推荐在切换权限设计或拉取最新代码后，在开发环境手工执行一次上述命令，然后重新登录后台，确认前端各管理页面入口已经按新权限生效。

## 五、后续实施建议

1. 先确认本文件中的权限粒度和命名是否符合预期（尤其是哪些算“危险操作”需要单独权限）。  
2. 在 Prisma 中增加这些新权限 key（批量插入），并在 `RolesService.ensureDefaultRolesAndPermissions()` 中维护默认映射。  
3. 按模块逐步修改后端控制器上的 `@RequirePermissions`，从大权限拆成更细的权限点。  
4. 同步调整前端 `router` 中的 `meta.requiresPermissions` 以及界面按钮级别的显隐逻辑。  
5. 最后根据实际运营情况，再抽象出常用角色模板（如运营、客服、服主、技术运维等），配置对应的权限组合。
