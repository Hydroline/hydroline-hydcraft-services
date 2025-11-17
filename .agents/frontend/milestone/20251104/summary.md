# 2025-11-04 AuthMe 集成改造（前端）

## 交付概览
- 登录对话框：加入「邮箱 / AuthMe」模式切换；AuthMe 登录会提示绑定要求，并在 KV (`feature.auth`) 未开启时自动降级。
- 注册对话框：单选「常规注册 / 使用 AuthMe 注册」，AuthMe 模式下仅需输入 AuthMe 账号 + 密码，提交后直接走新 `/api/auth/register`。
- 账号设置页 (`ProfileInfoView`)：新增 AuthMe 绑定卡片，可实时查看绑定状态、执行绑定/解绑，错误态和速率限制反馈展示；绑定开关与按钮禁用基于 `authmeBindingEnabled`。
- 新增 `useFeatureStore`：应用启动即拉取 `/api/auth/features`，驱动所有 UI 可见性开关。
- `auth` Store：重构为 `register/login + bindAuthme/unbindAuthme` 行为，兼容旧方法；所有请求走新的 `/api/auth/*`、`/api/authme/*` API，并在成功后刷新本地用户缓存。

## 关键交互
| 场景 | 入口 | 说明 |
| ---- | ---- | ---- |
| AuthMe 登录 | 首页右上角「登录」→ Tab 切换 | 非绑定账号会收到 `AUTHME_NOT_BOUND` 提示，引导去绑定或改用邮箱。 |
| AuthMe 注册 | 登录对话框 Tab=注册 | 成功后立即同步 Portal 数据并关闭对话框。 |
| 绑定/解绑 | 用户信息页 → AuthMe 卡片 | 表单提交受 `bindingEnabled` 控制，所有错误均使用后端 `safeMessage`。 |

## 运行验证
```bash
pnpm --filter @hydroline/frontend build
# dist/index.html 可直接由静态服务或 file:// 打开验证 UI
```
- 构建后可用 Playwright/浏览器手动切换登录/注册模式，测试错误提示与按钮状态。
