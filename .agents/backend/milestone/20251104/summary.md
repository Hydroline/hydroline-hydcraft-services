# 2025-11-04 AuthMe 集成改造（后端）

## 交付要点
- 新增全局 `AuthmeModule`，封装 `authme-lib` 连接池、配置热更新、健康检查与指标 (`authme.db.connected`/`authme.db.query_time_ms`/`authme.verify.failed`)；对 `$SHA$` 密码执行两段 SHA256 校验并提供基础查询 API。
- `authme.db`/`feature.auth` 两个 KV 命名空间接入配置服务：支持动态重载 MySQL 连接、功能开关；新增 `AuthFeatureService` 暴露登录/注册/绑定开关供业务层与前端消费。
- `user_authme_binding` 表：记录 `user_id`、`authme_username_lower`、`authme_realname`、`bound_at`、`bound_by_user_id`、`bound_by_ip`，并在绑定/解绑时写入 `LifecycleEventType.ACCOUNT_BIND/ACCOUNT_UNBIND` 审计。
- 认证接口扩展：
  - `POST /api/auth/register` & `POST /api/auth/login`：支持 `mode: EMAIL|AUTHME`，`AuthMe` 流程下走账号校验/绑定检测，生成 BetterAuth 会话或内部 Session。
  - `POST /api/authme/bind` / `DELETE /api/authme/bind`：已登录用户绑定/解绑 AuthMe；均受 `AuthGuard` + `AuthmeRateLimitGuard` 保护（IP 10/min、用户 20/min）。
  - `GET /api/auth/features`：返回 KV 特性开关，供前端切换 UI。
  - `GET /api/auth/health/authme`：公开 AuthMe DB 健康状态。
- `AuthService` 重构：统一注册/登录逻辑、AuthMe 登录采用自建 Session；旧版 `/auth/signup|signin` 仍兼容。
- `UsersService.getSessionUser` 输出 `authmeBinding`，前端可展示绑定状态。
- Jest 单测覆盖 `authme-lib` health/密码流程，`pnpm --filter @hydroline/backend test` 通过。

## KV 配置 Schema
### `authme.db`
```jsonc
{
  "host": "server2.aurlemon.top",
  "port": 3306,
  "database": "h2_authme",
  "user": "h2_authme",
  "password": "***",
  "charset": "utf8mb4",
  "pool": { "min": 0, "max": 10, "idleMillis": 30000, "acquireTimeoutMillis": 10000 },
  "connectTimeoutMillis": 5000,
  "readonly": false,
  "enabled": true
}
```
- 更新任意字段后 15s 内自动重建连接池。

### `feature.auth`
```jsonc
{
  "emailVerificationEnabled": false,
  "authmeRegisterEnabled": true,
  "authmeLoginEnabled": true,
  "authmeBindingEnabled": true
}
```
- 前端通过 `/api/auth/features` 实时获取。

## API 速览
| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| POST | `/api/auth/register` | `mode=EMAIL` 走原注册、`mode=AUTHME` 校验后自动绑定 |
| POST | `/api/auth/login` | `mode=EMAIL` 走 BetterAuth，`mode=AUTHME` 依赖绑定 + AuthMe 校验 |
| GET  | `/api/auth/features` | 返回功能开关 |
| GET  | `/api/auth/health/authme` | AuthMe DB 健康信息 |
| POST | `/api/authme/bind` | 登录用户 AuthMe 绑定（速率限制） |
| DELETE | `/api/authme/bind` | 解除绑定 |

## 故障排查
1. **AuthMe DB 不可用**：`AuthmeService.health()` 返回 `{ ok:false, stage }`；业务侧捕获 `AuthmeError`，前端展示统一 `safeMessage`。
2. **绑定冲突 / 未绑定**：`AuthmeBindingService` 抛出 `BusinessValidationError` (`BINDING_CONFLICT` / `AUTHME_NOT_BOUND`)，HTTP 400。
3. **速率限制**：`AuthmeRateLimitGuard` 对 `/api/authme/*` 按 IP / 用户记数，命中后返回 429。
4. **配置更新**：确认 KV 命名空间写入正确 JSON；`Authme` 日志包含 `AuthMe connection pool refreshed`，否则检查 `normalizeConfig` 警告。

## 命令 & 测试
```bash
pnpm --filter @hydroline/backend db:generate
pnpm --filter @hydroline/backend test
pnpm --filter @hydroline/backend dev
```
- Jest：`src/authme/lib/authme-lib.spec.ts`
- 端到端 curl 示例见 `e2e.md`
