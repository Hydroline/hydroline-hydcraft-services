# 2025-11-06 LuckPerms 权限集成（后端）

## 交付要点
- 新增全局 `LuckpermsModule`，封装 `MysqlLuckpermsLib` 连接池、健康检查与 Prometheus 指标（`luckperms_db_connected` / `luckperms_db_query_time_ms`）。
- `MysqlLuckpermsLib` 提供玩家基础信息 + 权限组聚合：读取 `luckperms_players`、`luckperms_user_permissions`，去重后返回主组与上下文信息，支持配置热更新与连接自动重建。
- `LuckpermsService` 从配置中心命名空间 `luckperms.db` 拉取 MySQL 连接，15 秒轮询刷新；对外提供 `getPlayerByUsername`/`getPlayerByUuid`/`listPlayers` 和健康检查。
- `UsersService.getSessionUser`/`getUserDetail`：在 AuthMe 绑定补充 `luckperms` 字段（`primaryGroup` + `groups[]`），前端可直接呈现权限标签；故障时降级为原始绑定数据。
- 管理端新增 `/api/luckperms/admin/overview`、`PATCH /api/luckperms/admin/config`，复用 `MANAGE_CONFIG` 权限即可查看/调整连接。

## KV 配置 Schema（命名空间 `luckperms.db`）
```jsonc
{
  "host": "server2.aurlemon.top",
  "port": 3306,
  "database": "h2_luckperms",
  "user": "h2_luckperms",
  "password": "bhzz24keNi8mwWZM",
  "charset": "utf8mb4",
  "pool": { "min": 0, "max": 10, "idleMillis": 30000, "acquireTimeoutMillis": 10000 },
  "connectTimeoutMillis": 5000,
  "readonly": false,
  "enabled": true
}
```
- 更新配置后最迟 15s 内重建连接池，日志包含 `LuckPerms connection pool refreshed`。
- 禁用（`enabled=false`）时后端与前端均会显示「LuckPerms 集成已停用」，并保留 AuthMe 绑定原始信息。

## 管理 API
| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/api/luckperms/admin/overview` | 返回健康状态、当前配置与系统时间。 |
| PATCH | `/api/luckperms/admin/config` | 更新 MySQL 连接信息，并触发热更新。 |

## 故障排查
1. **连接失败**：`LuckpermsService.health()` 返回 `{ ok:false, stage }`。常见 `stage=CONNECT`，检查主机/端口或安全组；`stage=AUTH` 时核对用户名与密码。
2. **权限组为空**：确认 `luckperms_user_permissions` 中是否存在 `group.*` 记录；同时检查服务是否启用（`enabled`）。
3. **前端未显示主组**：`UsersService` 会回退到原始数据；若需要诊断，请查看后端日志中 `LuckPerms query failed`。

## 验证建议
```bash
pnpm --filter @hydroline/backend build
pnpm --filter @hydroline/backend start
# 手动调用健康检查
curl -H "Authorization: Bearer <token>" https://<host>/api/luckperms/admin/overview
```
- 建议配合数据库实例手动校验：输入 `authme_realname`，确认响应中 `luckperms.primaryGroup` 与 `groups` 与实际一致。
