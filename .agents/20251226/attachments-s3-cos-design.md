# 附件系统：本地存储 ↔ S3/COS 对象存储接入（设计稿）

日期：2025-12-26

## 0. 背景与现状

当前附件系统在后端以“本地文件系统”为唯一真实存储实现：

- 上传：`multer.memoryStorage()` 将文件读入内存，再由 `AttachmentsService` 以 `fs.writeFile()` 落盘。
- 下载：`/attachments/public/:id` 与 `/attachments/share/:token` 由后端 `createReadStream()` 读取本地文件直出。
- 存储根目录：由 `ATTACHMENTS_DIR` 指定，否则默认 `../uploads`（项目根的 `uploads/`）。
- 数据库：`Attachment.storageKey` 保存相对路径；`Attachment.externalUrl` 字段存在但当前未使用。

问题：
1) 需要支持通用 S3（可对接腾讯云 COS / MinIO / R2 等）
2) 需要双向迁移：本地→对象存储、对象存储→本地
3) 需要支持“自定义源站域名（回源 CDN）”作为统一访问域名
4) 上传需改为“流式直通”，禁止 `memoryStorage` 全量进内存
5) 修复：附件被删除后，引用它的业务模块仍返回不可用链接（铁路系统 logo 典型）

本设计稿只做规划，不修改现有代码。

---

## 1. Requirements（需求）

### 1.1 核心需求（必须）

R1. 双向迁移脚本
- R1.1 提供“本地 uploads → 对象存储”迁移脚本（单独执行、可重复运行、可恢复）
- R1.2 提供“对象存储 → 本地 uploads”迁移脚本（同上）
- R1.3 脚本需要支持：并发控制、dry-run、跳过缺失文件、输出统计、可选仅迁移未删除附件

R2. 通用 S3 兼容
- R2.1 存储层抽象为可插拔适配器：`local` 与 `s3` 至少两种实现
- R2.2 `s3` 适配器使用通用 S3 协议（AWS SDK v3），通过 `endpoint` 配置兼容 COS

R3. 统一访问域名（回源 CDN）
- R3.1 支持配置 `ATTACHMENTS_PUBLIC_BASE_URL`（自定义源站域名/回源域名）
- R3.2 若未配置该域名：允许回退到“对象存储原始访问域名/endpoint + bucket 规则”或继续走后端代理 URL
- R3.3 业务侧获取附件 URL 时，不再手写拼接 `/attachments/public/:id`，改为统一走附件服务提供的“安全 URL 解析”

R4. 上传改为流式直通
- R4.1 禁止 `multer.memoryStorage()`（避免 64MB 甚至更大文件导致内存占用与 GC 抖动）
- R4.2 上传链路需“边读边写”，在 `local` 写入文件流，在 `s3` 走流式上传（必要时 multipart）
- R4.3 仍保持现有 API 语义（`POST /attachments` multipart），尽量减少前端改动

R5. 引用一致性（删除后不再返回坏链接）
- R5.1 所有引用 `AttachmentId` 的模块都必须能正确处理“附件不存在/已删除/文件缺失”的情况
- R5.2 针对铁路系统 logo 的场景：当 `logoAttachmentId` 指向失效附件时，API 返回 `null`（或不返回 URL），并可选地在后台清理该字段（置空）

### 1.2 非目标（本次不做/不承诺）

N1. 不引入复杂的图片处理、缩略图、转码等
N2. 不新增额外 UI 页面/复杂管理功能
N3. 不强制实现“私有附件的签名直链下载”（可作为后续增强项）；现有分享 token 下载仍可走后端

---

## 2. 设计：存储适配层（Storage Adapter）

目标：把“写本地/读本地”从 `AttachmentsService` 中抽离，使其对存储后端无感。

### 2.1 建议接口（TypeScript 伪代码）

```ts
interface AttachmentStorage {
  putObject(params: {
    key: string;               // storageKey
    contentType?: string;
    contentLength?: number;
    body: NodeJS.ReadableStream;
  }): Promise<{ etag?: string; versionId?: string }>;

  getObjectStream(key: string): Promise<NodeJS.ReadableStream>;

  headObject(key: string): Promise<{ exists: boolean; size?: number }>;

  deleteObject(key: string): Promise<void>;

  // 用于生成“直链 URL”（公共附件）；如果存储后端不支持或未配置 baseUrl，则返回 null
  getPublicUrl?(key: string): string | null;
}
```

实现：
- `LocalAttachmentStorage`：`putObject` 使用 `fs.createWriteStream()`；`getObjectStream` 使用 `fs.createReadStream()`。
- `S3AttachmentStorage`：使用 `@aws-sdk/client-s3`，支持 `endpoint/region/credentials`。
  - 上传：优先 `PutObjectCommand`（小文件）；大文件可选 `@aws-sdk/lib-storage` multipart。
  - 下载：`GetObjectCommand` 返回 `Body` 作为 stream。

### 2.2 storageKey 规则

保持现状：`storageKey` 仍作为对象 key（例如 `root/xxx.png`、`some/folder/xxx.png`）。
迁移脚本与新上传都沿用该规则，确保 DB 不需要大范围改动。

---

## 3. 设计：URL 生成策略（自定义源站域名 / 回源 CDN）

### 3.1 统一的 URL 输出

新增统一方法（服务内/工具函数）：
- `resolvePublicAttachmentUrl(attachmentId): Promise<string | null>`
  - 若附件记录不存在、已删除、或存储对象不存在 → `null`
  - 若为 public：
    - 若配置了 `ATTACHMENTS_PUBLIC_BASE_URL`：返回 `${baseUrl}/${storageKey}`（注意去重 `/`）
    - 否则若 storage 适配器可生成直链：返回其结果
    - 否则回退：返回 `/attachments/public/:id`（继续后端代理）

这样可以满足你的要求：
- 你配置自定义源站域名后，系统“全部用该域名”输出公共附件 URL
- 没配置时，也能回退到 COS 原始链接或后端代理（避免不可用）

### 3.2 关于私有/受限附件

当前系统有 restricted/inherit/public 可见性。为了不扩大范围：
- public 附件：可直链（CDN/自定义源站域名）
- restricted 附件：默认仍走后端受控下载（share token / 登录鉴权），可后续再做签名 URL

---

## 4. 设计：上传改为流式直通（替换 multer.memoryStorage）

### 4.1 推荐方案：Busboy（Express）

原因：
- 直接从 HTTP 请求流读取 multipart file stream
- 可做文件大小限制/字段解析
- 不把整个文件加载到内存

实现要点（规划）：
1) `POST /attachments` 不再用 `FileInterceptor + memoryStorage`
2) 在 controller 中用 Busboy 解析 multipart：
   - 读取 `file` 字段的 stream，立即 pipe 到 `storage.putObject({ body: fileStream })`
   - 同时解析其他字段（name、folderId、tagKeys、visibility 等）
3) 传输限制：
   - 最大文件大小（现为 64MB）：在 Busboy `limits.fileSize` 中限制
   - 超限立即中断并返回 413/400
4) 计算 hash：
   - 不再对 `buffer` 计算 sha256；改为在流上 `crypto.createHash('sha256')` 增量更新
   - 同时将流分流到 storage（需要 tee）：可用 `stream.PassThrough` + `pipeline` 组合

### 4.2 Local 与 S3 的流式写入

- Local：`fileStream -> fs.createWriteStream(physicalPath)`
- S3：`fileStream -> S3 PutObject`（body 可直接是 stream）

---

## 5. 设计：删除后引用一致性（所有模块不返回坏链接）

### 5.1 现状问题

当前多个业务模块直接拼接：`buildPublicUrl(`/attachments/public/${id}`)`。
当附件被“软删除”（`deletedAt` 非空）或文件缺失时：
- `/attachments/public/:id` 会 404
- 业务模块仍返回旧链接，前端显示破图

### 5.2 统一修复策略（建议两层防线）

S1. 输出层防线（推荐、必须做）
- 所有业务模块在输出“可公开访问的附件 URL”时，必须调用 `AttachmentsService` 的统一解析方法（见 3.1）。
- 解析方法会检查：记录是否存在、是否 deleted、存储对象是否存在。
- 不存在则返回 `null`（或不给该字段），前端可以自然降级。

S2. 数据层防线（可选增强，但对你提到的铁路场景很有价值）
- 在执行 `deleteAttachment(attachmentId)` 时，额外做“引用清理”：
  - `User.avatarAttachmentId == attachmentId` → 置空
  - `Company.logoAttachmentId == attachmentId` → 置空
  - `TransportationRailwaySystem.logoAttachmentId == attachmentId` → 置空
- 好处：避免长期悬挂引用；也能减少业务逻辑分支。
- 注意：如果未来还有更多引用字段，需要维护一个“引用清理清单”。

### 5.3 需要触达的模块清单（来自当前代码扫描）

以下位置当前在手工拼接 public URL，需要改为走统一解析：
- `portal-config.service.ts`
- `auth/helpers/user-avatar.helper.ts`
- `transportation/railway/services/railway-system.service.ts`
- `transportation/railway/route-detail/impl/railway-route-detail.impl.ts`
- `company/company.service.ts`
- `player/player.service.ts`

---

## 6. ENV 设计（并将来需要更新 backend/.env.sample）

现有 `backend/.env.sample` 只有本地附件目录 `ATTACHMENTS_DIR`，不足以支持对象存储与 CDN 域名。

### 6.1 新增/调整建议

#### 6.1.1 通用开关
- `ATTACHMENTS_STORAGE_DRIVER`：`local` | `s3`（默认 `local`）
- `ATTACHMENTS_PUBLIC_BASE_URL`：例如 `https://assets.example.com`（你配置的自定义源站域名/回源域名）
- `ATTACHMENTS_DELIVERY_MODE`：`direct` | `proxy`
  - `direct`：public 附件优先输出 `${ATTACHMENTS_PUBLIC_BASE_URL}/${storageKey}`
  - `proxy`：public 附件仍输出 `/attachments/public/:id`（可作为紧急回退）

#### 6.1.2 Local Driver
- `ATTACHMENTS_DIR`：沿用（本地存储根目录）

#### 6.1.3 S3 Driver（兼容 COS）
- `S3_ENDPOINT`：例如 COS 的 S3 兼容 endpoint
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`：`true|false`（默认 `false`，但对某些 S3 兼容服务有用）
- `S3_KEY_PREFIX`：例如 `uploads/`（可选，用于把对象放到 bucket 的子目录）

> 说明：如果你配置了 `ATTACHMENTS_PUBLIC_BASE_URL`，则 public URL 不需要依赖 endpoint/bucket 的可公开拼接规则；对象存储只负责存数据。

### 6.2 对 backend/.env.sample 的要求

未来实现时需要把上述变量补充到 `backend/.env.sample`，并保留现有注释风格（中文说明 + 默认值）。

---

## 7. 迁移脚本设计

目标：提供两个“可独立执行”的脚本，支持多次运行与断点恢复。

### 7.1 脚本 A：本地 → 对象存储

建议文件：`backend/scripts/migrate-attachments-local-to-s3.ts`

流程：
1) 读取 DB 中附件列表（可配置范围：仅 `deletedAt=null` / 包含 deleted）
2) 对每条附件：
   - 计算本地文件路径：`ATTACHMENTS_DIR + storageKey`
   - 若文件不存在：记录并跳过（可配置是否报错退出）
   - 上传到 S3：对象 key = `storageKey`（或 `${S3_KEY_PREFIX}${storageKey}`）
   - 可选：写回 `externalUrl`（若选择 DB 存直链）或仅做统计
3) 输出统计：成功/跳过/失败数量

特性：
- 并发：例如 4~16
- 支持 `--dry-run`
- 支持 `--resume`：根据 `headObject` 判断已存在则跳过

### 7.2 脚本 B：对象存储 → 本地

建议文件：`backend/scripts/migrate-attachments-s3-to-local.ts`

流程：
1) 读取 DB 附件列表
2) 对每条附件：
   - 从 S3 `getObjectStream(storageKey)`
   - 写入本地 `ATTACHMENTS_DIR/storageKey`（确保目录存在）
   - 可选：校验 size/hash

同样支持：并发、dry-run、resume（本地已存在则跳过或覆盖）。

---

## 8. TODO List（任务清单）

### P0（必须，先打通）
1) 抽象 `AttachmentStorage` 接口与 `local/s3` 两个实现
2) 重构 `AttachmentsService`：上传/下载/exists 统一走 storage adapter
3) 替换上传实现为“流式直通”（Busboy），去掉 `multer.memoryStorage`
4) 新增统一 URL 解析方法：public 输出遵循 `ATTACHMENTS_PUBLIC_BASE_URL` 与回退策略
5) 修复引用一致性：
   - 改造所有手工拼 public URL 的模块，改用统一解析
   - 铁路系统 logo：失效时返回 `null`（必要时服务端自动置空字段）

### P1（迁移与可运维）
6) 编写迁移脚本：本地→S3、S3→本地（支持 dry-run/resume/并发）
7) 更新 `backend/.env.sample`：补齐 S3/COS 与 public base URL 相关配置
8) 文档：补充“如何配置 COS S3 兼容 + 自定义源站域名”的说明（短 README）

### P2（质量保障/后续增强）
9) 增加最小化测试：
   - storage adapter 单测（local mock + s3 mock）
   - URL 解析对 deleted/missing 的行为
10) 可选：restricted 附件的签名 URL（如确有需要）

---

## 9. 风险与注意事项

- 流式上传需要处理 multipart 字段顺序、异常中断与清理（本地半写文件/S3 半上传）。
- “直链域名”与“后端代理 URL”并存时，必须清晰区分 public vs restricted。
- 迁移脚本应避免一次性把全量文件读入内存；所有处理必须是流式。

