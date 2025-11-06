# 2025-11-07 后端：`/auth/me` 拆分设计

## 现状
- `GET /auth/me` 返回合并后的用户对象（基础资料 + AuthMe 绑定 + LuckPerms 补充）
- `PATCH /auth/me` 更新所有资料字段（名称、邮箱、profile 扩展、extra 等）
- 前端同一视图内按 sidebar 条件渲染三个区域：基础资料、MC 绑定、会话管理

## 拆分目标
将当前大而全的 `me` 接口拆成 3 组，降低负载、提升扩展性：
1. 新增 controller 方法：`getCurrentUserBasic`, `updateCurrentUserBasic`, `getCurrentUserMinecraft`, `getCurrentUserSessions`。✅（已实现于 `src/auth/auth.controller.ts`）
2. UsersService 补充查询方法或直接 select。（当前直接复用 `getSessionUser`，后续可用 select 精简）
3. 复用现有 enrich 功能于 minecraft 端点。✅
4. 会话端点内部调用现有 list + enrich；保持返回结构一致。✅
5. 添加快速单元测试（可选）。
6. 标记旧端点 TODO 注释。
## 端点定义
### 1. 基础资料
- 路径：`/auth/me/basic`
- GET 响应：`{ user: { id, name, email, profile: { displayName, gender, birthday, motto, timezone, locale, extra }, createdAt, updatedAt, lastLoginAt, lastLoginIp, lastLoginIpLocation } }`
- PATCH 入参：与现有 `UpdateCurrentUserDto` 相同但仅允许基础资料字段；
- 返回：更新后的同样结构。
- 约束：不得返回 authmeBindings / luckperms 等与 MC 相关字段。

### 2. Minecraft 绑定
- 路径：`/auth/me/minecraft`
- GET 响应：`{ user: { id, authmeBindings: [...绑定 + IP 地理位置 + luckperms groups], luckperms?: [...], updatedAt } }`
- 逻辑：沿用 `enrichAuthmeBindings`；保留 LuckPerms 聚合。
- 禁止返回基础资料冗余字段（除 id/updatedAt 以便前端刷新快照）。

### 3. 会话管理
- 路径：`/auth/me/sessions`
- GET 响应：`{ sessions: [{ id, createdAt, updatedAt, expiresAt, ipAddress, ipLocation, userAgent, isCurrent }] }`
- 复用 `AuthController.listSessions` 逻辑；可内部调用 service 并增加 IP 解析。

## DTO 调整
- 现有 `UpdateCurrentUserDto` 保留；新增 `UpdateBasicProfileDto`（可直接复用或对不需要的字段加 `@ApiPropertyOptional()` 并限制校验）。暂时先复用原 DTO，后续精简。

## Service 层
- `UsersService.getSessionUser` -> 拆成：
  - 基础版：`getBasicProfile(userId)`（仅 select 基础资料相关列 + profile join）
  - Minecraft 版：`getMinecraftProfile(userId)`（返回绑定信息 + luckperms snapshot）
- 可通过 Prisma select 优化字段。

## 兼容策略
- 同步添加三个端点，保留原 `/auth/me` 不变；
- 前端迁移完成后：
  1. 观察一个版本周期日志（确认新端点无 4xx 频繁）
  2. 标记 `/auth/me` Deprecated（响应 Header `Deprecation`）
  3. 后续移除 enrich 逻辑，节省查询成本。

## 已完成结果摘要（2025-11-07）
- 新端点已就绪：
  - GET `/auth/me/basic`（基础资料裁剪字段）
  - PATCH `/auth/me/basic`（沿用 `UpdateCurrentUserDto`）
  - GET `/auth/me/minecraft`（返回 `authmeBindings` 富化 + `luckperms` 快照）
  - GET `/auth/me/sessions`（返回与 `/auth/sessions` 同结构）
- 后续优化：在 `UsersService` 引入 select 精简，降低不必要的字段序列化。

## 任务步骤
1. 新增 controller 方法：`getCurrentUserBasic`, `updateCurrentUserBasic`, `getCurrentUserMinecraft`, `getCurrentUserSessions`。
2. UsersService 补充查询方法或直接 select。
3. 复用现有 enrich 功能于 minecraft 端点。
4. 会话端点内部调用现有 list + enrich；保持返回结构一致。
5. 添加快速单元测试（可选）。
6. 标记旧端点 TODO 注释。

## 风险
- 复制逻辑可能导致权限校验遗漏 → 全部加 `@UseGuards(AuthGuard)`。
- Prisma 查询字段不全导致前端缺失 → 先保守返回完整，再逐渐裁剪。

## 回滚
- 若新端点出现错误，可直接暂时从路由移除；前端仍使用旧 `/auth/me`。

