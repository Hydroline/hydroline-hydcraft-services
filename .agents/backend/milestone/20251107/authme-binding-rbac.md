# 2025-11-07 后端：AuthMe 绑定流转 & RBAC 提升 Todo

## 背景与目标
- 将 AuthMe 玩家绑定从一次性记录升级为可追溯的「流转」信息，能按玩家/用户查看全部绑定历史；
- 拆分管理员后台的「用户」与「玩家(AuthMe)」接口，前者聚焦站内账号，后者聚焦 Minecraft/AuthMe 数据；
- 为管理员补齐必备操作：删除用户、修改绑定关系、重置密码、调整玩家绑定记录；
- 升级 RBAC：支持多权限组叠加、可空权限的标签化管理、列出全部权限节点，允许管理员自助申请；
- 考虑 AuthMe 数据库不稳定，所有读取/同步操作需有降级与重试策略。

## Todo List

### 一、现状调研与方案敲定
- [x] 梳理现有 `UserAuthmeBinding`、`User`、`Role` 相关 Prisma schema 以及 `admin` 控制器，产出影响面清单。
- [x] 评估 AuthMe（MySQL?）连接状态与 ORM 入口，记录失败时当前行为，为设计重试/熔断做依据。
- [x] 与前端确认用户/玩家列表需要的字段、分页、筛选、操作项，确保 API 规范先行。

### 二、AuthMe 绑定流转能力
- [x] 数据建模：新增 `AuthmeBindingHistory`（playerId/authmeId、userId、operatorId、action、reason、timestamp、payload），并为现有绑定关系补充 `status`/`primaryBinding`/`lastSyncedAt`。
- [x] 写迁移脚本：将当前 `UserAuthmeBinding` 记录回填到 `AuthmeBindingHistory`，保证历史链从「首次绑定」开始。
- [x] Service & Repository：
  - [x] 创建 `AuthmeBindingHistoryService`，封装记录写入、查询（按 userId / authmeId / paging）。
  - [x] 扩展 `AuthmeSyncService`（或等价模块）在绑定/解绑/修改时自动写入历史，并标记操作者。
- [x] API：
  - [x] `GET /admin/users/:id/bindings/history` 返回用户维度流转；
  - [x] `GET /admin/authme/:id/history` 返回玩家维度流转；
  - [x] 统一响应结构（事件、操作者、事件源、备注）。
- [x] 可靠性：若 AuthMe DB 不可用，提供缓存/最近一次快照；失败时在响应中附带告警信息。

### 三、用户 vs 玩家接口拆分
- [x] 新建 `AdminPlayersController`：
  - [x] `GET /admin/players`：直接读 AuthMe DB，支持分页/用户名/UUID 模糊查询；
  - [x] 返回字段含：AuthMe 用户、最近登录、IP、绑定状态、关联站内用户（可为空）、最新流转事件。
- [x] 扩展 `AdminUsersController`：
  - [x] `GET /admin/users`：仅站内账号，附加当前绑定摘要（primary player、绑定数量、最近状态）；
  - [x] `PUT /admin/users/:id/bindings`：允许管理员重新指定主绑定或解绑玩家。
- [x] 错误处理：AuthMe 连接失败时 `players` 列表需明确 `sourceStatus=degraded`，并记录 audit log。

### 四、管理员操作完善
- [x] 删除用户：实现 `DELETE /admin/users/:id`（软删+审计），并处理关联绑定/会话。
- [x] 修改绑定信息：提供 `PATCH /admin/users/:id/bindings/:bindingId`，可编辑备注、primary 标识、标签。
- [x] 重置密码：`POST /admin/users/:id/reset-password`，生成临时口令或触发邮件，记录操作者。
- [x] 绑定流转手动补录：当 AuthMe DB 波动时，允许 `POST /admin/players/:id/history` 由管理员手动登记事件。
- [x] Swagger / OpenAPI 文档同步更新，禁止留下“等待功能完善”描述。

### 五、RBAC 强化
- [x] 数据建模：
  - [x] 允许 `RoleAssignment` 一对多：同一用户可挂多个角色；
  - [x] 新增 `PermissionLabel`（可空权限数组），供玩家标签化展示；
  - [x] 新建 `PermissionCatalog` 列出全部节点、模块、描述、默认可见性。
- [x] API：
  - [x] `GET /admin/rbac/catalog`：列出所有权限，支持关键词/模块过滤；
  - [x] `POST /admin/rbac/self-assign`：管理员可自助申请节点，带审批/二次确认；
  - [x] `POST/PUT /admin/rbac/labels`：增删改 Label，允许空权限；
  - [x] `PUT /admin/users/:id/roles`：改为接受角色数组；写审计日志。
- [x] 校验：叠加角色后权限集合需去重，冲突策略（显式 deny 优先）。
- [x] 审计：所有 RBAC 变更写入 `AdminAuditLog`，包含 diff。

### 六、可观测性
- [x] 为 AuthMe 同步与 RBAC 变更添加结构化日志 + 监控指标（成功率、延迟、失败原因）。

### 七、交付检查
- [ ] 更新 `docs/backend` API 参考，附上新端点示例与字段（users / players / rbac 自助 / 角色标签编辑 / 绑定历史）。
- [ ] 回顾待办并逐项勾选，确认无“等待功能完善”或占位符描述遗留。

### 八、新增补充需求（2025-11-07 用户反馈）
- [x] 确认多角色已通过 `user_roles` 表支持；仅需前端批量分配调用 `POST /auth/users/:id/roles`。
- [x] 权限标签允许空权限：已验证 `CreatePermissionLabelDto.permissionKeys` 可为空数组。
- [ ] 增加接口：批量自助申请权限返回差异（当前拥有 vs 请求新增），方便前端高亮缺失节点。
- [ ] 增加接口：`GET /auth/users/:id/roles`（若详情未返回完整集合时兜底）—— 当前 `GET /auth/users/:id` 已含角色，可视情况省略。
- [ ] 增加接口：`DELETE /auth/users/:id/roles` 支持移除单个或多个角色（当前仅覆盖“分配”不可移除）。
- [ ] 增加接口：`DELETE /auth/users/:id/permission-labels` 移除标签（现只有分配）。
- [ ] 增加接口：`PATCH /auth/users/:id/bindings/:bindingId` 已存在；确认是否需要支持解绑（DELETE）。
- [ ] 增加接口：`DELETE /auth/users/:id/bindings/:bindingId` 解绑并写历史（统一使用 AuthmeBindingHistory）。
- [ ] 增加接口：`POST /auth/players/:username/bind` 直接将玩家与指定用户绑定（目前只能在用户侧操作，需要玩家视角）。
- [ ] 增加接口：`GET /auth/players/:username` 返回单玩家详情（含绑定与最新事件），当前仅列表与历史。
- [ ] 增加接口：权限合并预览 `POST /auth/rbac/preview` 输入角色数组 + 标签数组，返回最终权限集合（前端在编辑界面实时展示）。
- [ ] 增加接口：管理员自授权限时允许附加备注字段（audit payload）。
- [ ] 增加接口：导出权限目录 `GET /auth/permissions/catalog/export?format=csv|json`。
- [ ] 增加指标：`authme_binding_history_events_total` 已存在，再加失败计数器 `authme_binding_history_fail_total`。

### 九、风险与边界
- AuthMe 数据库不可用时：玩家列表返回 `sourceStatus=degraded` 已实现，后续需缓存最近 1 次成功快照（内存或 Redis）。
- 自助权限滥用风险：需在审计中标记 `selfManaged: true` 并支持后续批量撤销脚本。
- 角色/权限删除需校验是否被引用；目前角色删除阻止被分配用户，权限删除阻止被角色引用，后续还需阻止被标签引用。

### 十、下一步实施优先级（后端）
1. 解绑与玩家视角绑定 API（完成功能闭环）
2. 角色 / 标签移除接口（前端编辑所需）
3. 权限合并预览接口（提升前端交互）
4. 自助申请差异返回与备注支持（审计合规）
5. 权限目录导出与指标补充（可观测性）
