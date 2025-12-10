# 2025-11-02 后端里程碑总结

## 本次交付要点
- [x] 新增附件系统数据模型与业务模块：`AttachmentFolder`、`Attachment`、`AttachmentTag`、`AttachmentTagging`、`AttachmentShareToken`，支持文件夹层级、标签打标、外链分享、软删除。记录上传用户并自动维护默认“System”帐号作为种子资源持有者。
- [x] 创建 `AttachmentsModule`（`/attachments` 路由），包含：
  - 列表、上传（multipart）、更新、删除接口；
  - 文件夹、标签增删改查；
  - 分享链接生成 `/attachments/:id/share` 与公开访问 `/attachments/public/:id`；
  - 本地磁盘存储于 `backend/uploads`，默认忽略在 Git 中。
- [x] 新增权限点 `assets.manage.attachments` 并自动挂载到管理员角色。
- [x] 构建聚合门户接口模块 `PortalModule`：
  - `GET /portal/home`（可选认证）：返回首页 Hero 背景、导航链接、卡片与用户快照；
  - `GET /portal/admin/overview`（需 `auth.manage.users`）：返回用户/玩家映射、附件统计、未绑定玩家占位数据。
- [x] 启动时通过 `AttachmentsService.ensureSeededAttachment` 把前端示例背景 `image_home_background_240730.webp` 种入附件系统，打上 `hero.home` 标签并公开访问。
- [x] 引入 `ConfigModule` + KV 存储（`ConfigNamespace`/`ConfigEntry`），统一管理门户导航、客户端配置等非核心参数，并新增权限点 `config.manage`。
- [x] 为前端提供集中链接配置，通过 `portal.navigation` 命名空间读取导航按钮，弃用环境变量依赖。
- [x] 提供可选身份守卫 `OptionalAuthGuard`，允许首页聚合接口在登录态存在时带上用户上下文。

## 数据迁移提示
- 新增迁移：`backend/prisma/migrations/20251102_config_and_attachments/migration.sql`，覆盖附件相关表与 KV 配置表结构。
- 执行 `pnpm --filter @hydroline/backend db:generate` 更新 Prisma Client。
- 建议在具备数据库连接的环境下运行 `pnpm --filter @hydroline/backend prisma migrate deploy`（或 `prisma migrate dev`）以实际落盘上述迁移。
- 附件物理文件存放在 `backend/uploads`，若部署环境需要云存储，可在 `AttachmentsService` 中替换为对象存储 SDK。

## 新增接口概览
| 方法 | 路径 | 说明 | 权限 |
| ---- | ---- | ---- | ---- |
| GET | `/attachments` | 查询附件列表，支持 folder/tag 过滤 | `assets.manage.attachments` |
| POST | `/attachments` | 上传文件（multipart），可选标签/文件夹/公开 | `assets.manage.attachments` |
| PATCH | `/attachments/:id` | 更新附件元数据、标签、公开状态 | `assets.manage.attachments` |
| DELETE | `/attachments/:id` | 软删除附件 | `assets.manage.attachments` |
| GET | `/attachments/folders/all` | 获取全部文件夹 | `assets.manage.attachments` |
| POST | `/attachments/folders` | 新建文件夹 | `assets.manage.attachments` |
| POST | `/attachments/:id/share` | 生成临时外链（默认 60 分钟） | `assets.manage.attachments` |
| GET | `/attachments/public/:id` | 公开附件下载 | 无 |
| GET | `/attachments/share/:token` | 分享令牌访问 | 无 |
| GET | `/portal/home` | 首页聚合数据（Hero、导航、卡片、用户快照） | 可选登录 |
| GET | `/portal/admin/overview` | 后台仪表（用户+附件统计） | `auth.manage.users` |
| GET | `/config/namespaces` | 列出全部命名空间及配置项数量 | `config.manage` |
| POST | `/config/namespaces` | 新建命名空间 | `config.manage` |
| PATCH | `/config/namespaces/:id` | 更新命名空间信息 | `config.manage` |
| DELETE | `/config/namespaces/:id` | 删除空命名空间 | `config.manage` |
| GET | `/config/namespaces/:id/entries` | 查看命名空间下的配置项 | `config.manage` |
| POST | `/config/namespaces/:id/entries` | 新增配置项（JSON 值） | `config.manage` |
| PATCH | `/config/entries/:entryId` | 更新配置项值或描述 | `config.manage` |
| DELETE | `/config/entries/:entryId` | 删除配置项 | `config.manage` |

## 后续建议
1. **Minecraft 信息聚合**：规划 `/portal/home` 返回服务器在线人数、动态卡片内容，与附件一并缓存。
2. **附件存储抽象**：进一步提炼存储适配层，必要时对接腾讯云 COS / Cloudflare R2。
3. **分享令牌管理**：增加令牌失效清理定时任务 & 管理接口。
4. **图像处理**：头像、背景可集成图像压缩/缩略图生成，减轻前端加载压力。
5. **KV 配置治理**：根据业务拓展更多命名空间（例如客户端 CDN 设置、公告栏配置），并补齐 API 文档、错误码说明。

## 迁移与测试记录（2025-11-02）
- 生成 Prisma Client：`pnpm --filter @hydroline/backend db:generate`
- 鉴于当前环境未配置 PostgreSQL，`prisma migrate deploy` 尚未执行；需在实际数据库可用后运行以应用 `20251102_config_and_attachments` 迁移。
- 未追加后端自动化测试；待数据库可连接时，建议通过 `pnpm --filter @hydroline/backend prisma migrate deploy` + 接口调用验证 `/config/*`、`/portal/home`、`/attachments` 等新能力。
