# 2025-11-15 Frontend Summary

## 管理端
- 新增 `OAuth` 菜单组（Provider 管理 / 绑定记录 / OAuth 日志 / 数据统计），路由定义于 `src/router/index.ts`，需要 `auth.manage.oauth` 权限。
- `src/stores/oauth.ts` 提供 Admin API 调用（provider CRUD、账户/日志/统计）与公共 OAuth 流程（authorize/result/unbind）。
- Provider 管理页（`views/admin/OAuth/OAuthProvidersView.vue`）
  - 展示/创建/编辑 Provider，支持 env bootstrap 的 Microsoft Provider。
  - 表单 UI 改为显式 label，启用状态通过 `USwitch` 控制。
- 绑定记录、日志、统计页面分别在 `views/admin/OAuth/OAuthAccountsView.vue`、`OAuthLogsView.vue`、`OAuthStatsView.vue`，复用 Pinia store。

## 用户端
- 登录对话框 `AuthDialog.vue`：
  - 当 feature flags 提供可用 OAuth Provider 时显示按钮，点击发起 `/oauth/providers/:key/authorize` 流程。
  - 继续保留邮箱/AuthMe 登录。新增 `resolveProviderIcon` 并在按钮中使用 `UIcon`。
- 新增 `OAuthCallbackView.vue` 处理授权结果：调用 `/oauth/providers/:key/result`，根据返回的 `tokens` 或 `binding` 更新 Auth store/Portal store 并提示用户。
- 个人资料安全页 `ProfileInfoSecurityView.vue` 引入 `ProfileOAuthBindingsSection`，展示各 Provider 状态并支持绑定/解绑（认证态调用 Pinia store）。

## 注意事项
- OAuth Callback 必须部署在 `/oauth/callback` 路由上，与后端配置的 redirect URI 保持一致。
- Pinia `oauth` store 的 `startFlow` 在未登录状态仅支持 LOGIN 模式；BIND 模式必须携带 token。
