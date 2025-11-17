# 2025-11-15 Backend Summary

## OAuth 核心能力
- **Prisma Schema**：新增 `OAuthProvider`、`OAuthLog`、`OAuthState` 三张表，并在 `User`/`Account` 上增加关联，支持 provider 配置、操作日志和状态缓存。注意部署后执行 `pnpm prisma migrate deploy`。
- **OAuthModule**：`src/oauth` 目录新增 Module、Service 与 Controller，负责 provider 管理、日志统计、授权流、状态存储。
  - `OAuthProvidersService` 读取 env（`MICROSOFT_OAUTH_*`），并在表缺失时友好输出警告。
  - `OAuthFlowService` 负责启动/回调处理、账号绑定/登录、日志记录与 account upsert。
  - `OAuthLogService` 提供分页查询与日级统计用于 Admin UI。
  - `OAuthPublicController` 暴露 `/oauth/providers/:key/authorize|callback|result|bindings` 等路由。
  - `OAuthAdminController` 提供 provider CRUD、绑定列表、日志/统计接口（需 `auth.manage.oauth` 权限）。
- **AuthService**：新增 `createOauthUser`、`getFeatureFlags` OAuth provider 列表合并逻辑，以及公共 `createSessionForUser` 暴露给 OAuth 流程。
- **Feature Flags**：`AuthFeatureService` 返回 `oauthProviders`，`/auth/features` 会携带当前 Provider 列表。

## 权限 & 环境
- `DEFAULT_PERMISSIONS` 新增 `auth.manage.oauth`，管理员默认拥有该权限。
- `.env.sample` 文档化 Microsoft 所需的 `MICROSOFT_OAUTH_*` 变量，仍需配置 `BETTER_AUTH_URL` 用于回调模板。

## 其它
- `users-core.manager` session 载荷附带 `accounts`，供前端显示已绑定的 OAuth 信息。
- 后端 build (`pnpm build`) 通过。

## 运行提示
1. 运行 `pnpm prisma migrate deploy` 同步新表。
2. 配置 `.env` 中的 Microsoft 客户端信息重启后会自动创建默认 Provider；亦可在 Admin UI 内修改。
3. 前端登录/绑定流程会调用 `/oauth/...` 路由，需要保证 `BETTER_AUTH_URL` 与前端 `window.location.origin` 一致。
