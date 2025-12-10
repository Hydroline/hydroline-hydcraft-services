# 用户头像上传功能 - 后端规划（2025-11-25）

## 目标

- 复用现有附件系统，实现用户头像存储与访问。
- 统一图片 URL 生成逻辑，避免直接在业务代码中拼接 host。
- 为后续前端 `/profile/basic` 页面提供稳定的头像 API 能力。

## 一、复用现有附件系统的能力

### 已有能力

- `AttachmentsService`
  - 负责附件的上传、物理存储和目录管理：
    - 使用 `ATTACHMENTS_DIR` 或默认 `../uploads` 作为根目录。
    - 基于 `attachmentFolder` 的 `path` 字段管理逻辑目录。
  - 管理可见性和权限：
    - 使用 `AttachmentVisibilityMode` 和文件夹继承逻辑控制 `public/restricted`。
  - 附件序列化：
    - `serializeAttachment(...)` 返回 `AttachmentSummary`，其中有：
      - `publicUrl: visibilityState.isPublic ? '/attachments/public/:id' : null`。
- 对外查询方法
  - `getAttachmentOrThrow(id: string)`：
    - 统一校验附件是否存在且未删除。
    - 自动 include `folder`、`owner`、`tags` 等关系。
    - 可直接给门户配置、用户头像等模块复用。
  - `ensureSeededAttachment(...)`：
    - 内部使用 `resolveFolderByPath(...)`，可以作为创建/查找固定路径文件夹（如 `userAvatar`）的参考。

### 可直接复用点

- 上传逻辑：
  - 使用已有 `AttachmentsController.upload` + `AttachmentsService.uploadAttachment`。
  - 对于头像上传，只需在调用时约束：
    - 固定目标文件夹（例如 `userAvatar` 路径）。
    - 设置为 public 以便生成 `publicUrl`。
- 查询逻辑：
  - 使用 `getAttachmentOrThrow` 获取附件信息（包括 `publicUrl`）。
  - 序列化后交给 URL 工具生成完整外链。

## 二、统一的公共 URL 工具（后端）

### 背景：现有 Hero 背景图 URL 逻辑

- `PortalConfigService` 中：
  - 构造 `baseUrl`：
    - `process.env.APP_PUBLIC_BASE_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000'`。
  - 私有方法 `toPublicUrl(pathname: string)`：
    - `return new URL(pathname, this.baseUrl).toString();`
  - Hero 背景图解析：
    - `resolveBackground` 中通过 `this.attachmentsService.getAttachmentOrThrow` 拿到附件。
    - 使用 `this.toPublicUrl('/attachments/public/${attachment.id}')` 生成完整 `imageUrl`。
- 问题：
  - URL 拼接逻辑被封装在 `PortalConfigService` 内部，其他模块无法复用。
  - 若 host 变更，需要多处修改或复制逻辑。

### 规划：公共 URL lib

- 新增一个公共 URL 工具模块（位置示例）：
  - `backend/src/lib/shared/public-url.util.ts`（具体路径可结合现有 lib 结构微调）。
- 功能：
  - 基于 env 生成基础地址：
    - 优先读取 `APP_PUBLIC_BASE_URL`。
    - 兜底读取 `BETTER_AUTH_URL`。
    - 如果都不存在则 fallback `http://localhost:3000`。
  - 导出方法：
    - `buildPublicUrl(pathname: string): string`
      - 内部：`new URL(pathname, baseUrl).toString()`。
- 改造点（MVP）：
  - `PortalConfigService` 中：
    - 删除/简化内部 `baseUrl` 字段和 `toPublicUrl` 方法。
    - 改为调用 `buildPublicUrl('/attachments/public/${attachment.id}')`。
  - 通过此改造验证公共 URL 工具的可用性与兼容性。

## 三、附件 URL Helper 抽象

### 需求

- 现在 `AttachmentSummary` 已经提供 `publicUrl`（相对路径）。
- 在不同业务（Hero 背景 / 用户头像 / 其他前端图片）中，都需要「附件 → 完整 URL」的转换逻辑。

### 规划

- 新增一个附件 URL 帮助方法（可以同样放在 `lib/shared` 下）：
  - 输入：
    - A：`AttachmentSummary` 或至少包含 `publicUrl` 字段的对象；或
    - B：`publicUrl: string | null`。
  - 输出：
    - 完整的外部 URL：
      - 若 `publicUrl` 为空（非 public 或未配置），则返回 `null`。
      - 若有值，则调用 `buildPublicUrl(publicUrl)`。
- 使用场景：
  - Hero 背景：
    - 改造 `resolveBackground` 从 `this.toPublicUrl('/attachments/public/${attachment.id}')` 转为：
      - 使用 serialize 后的 `publicUrl` → helper → `imageUrl`。
  - 用户头像：
    - 后端用户 API 返回头像数据时，通过 helper 生成完整 `avatarUrl`。
  - 后续其他需要展示附件图片的模块也可统一复用。

## 四、用户头像数据模型与 API 设计（偏好方案 A）

> 你更倾向方案 A：用户实体中保留附件 ID 引用，通过 URL lib 生成完整 URL，而不是直接保存固定 host 的 URL 字符串。

### 数据模型规划

- 用户实体（示意）：
  - 新增字段：
    - `avatarAttachmentId: string | null`：引用附件表中的记录。
  - 不直接在数据库中保存完整 `avatarUrl` 字符串。
- API 返回模型：
  - 在用户信息响应中增加：
    - `avatarAttachmentId: string | null`。
    - `avatarUrl: string | null`（由后端计算，返回完整 URL，方便前端使用）。
  - `avatarUrl` 生成方式：
    - 若 `avatarAttachmentId` 存在：
      - 从附件中获取 `publicUrl`（`/attachments/public/:id`）。
      - 使用公共 URL helper 生成完整外链。
    - 若不存在或非 public：
      - 返回 `null` 或统一的默认头像 URL（后续可扩展）。

### 头像上传接口规划（后端）

- 路由设计（示例）：
  - `PATCH /users/me/avatar` 或 `POST /users/me/avatar`。
  - 使用 `multipart/form-data`，字段名为 `avatar`。
- 内部实现：
  1. 通过登录态获取当前用户 ID。
  2. 根据约定的头像文件夹路径（例如 `['userAvatar']` 或分层路径）调用附件上传逻辑：
     - 参数中固定 `folder` 或使用 `resolveFolderByPath` 之类的包装方法。
     - 设定 `visibilityMode` 为 `public`，保证可通过 `/attachments/public/:id` 访问。
  3. 上传成功后：
     - 将新的附件 `id` 写入用户表的 `avatarAttachmentId` 字段。
     - 使用附件 URL helper 计算出 `avatarUrl`。
     - 返回包含 `avatarAttachmentId` 与 `avatarUrl` 的用户信息。
  4. 旧头像附件的处理：
     - MVP 阶段可以先不删除旧附件，只更新引用。
     - 后续可增加定期清理或在更新时删除旧附件的逻辑。

### 用户模块现状与对接方式

- 当前后端没有单独的「用户模块」，主要通过 auth 相关逻辑管理用户。
- 未来实现头像功能时，将在现有 auth/用户查询的返回结构中增加 `avatarAttachmentId` 与 `avatarUrl`，同时增加独立的头像上传路由，复用 `AttachmentsService`。

## 五、头像文件夹策略（userAvatar）

### 目录规划

- 逻辑文件夹：
  - 默认使用 `attachmentFolder` 中一个专门的文件夹，如：
    - 根目录下创建 `userAvatar`；或
    - 多层路径，如 `['users', 'avatars']`。
- 创建策略：
  - 借鉴 `ensureSeededAttachment` 中现有的文件夹路径解析逻辑：
    - 如果路径不存在，则自动创建对应的 `attachmentFolder`。
  - 上传头像时：
    - 始终将头像附件上传到该固定路径下，便于后续运维与清理。

### 可见性策略

- 默认设为 public：
  - 头像通常需要在多个上下文中展示，包括部分无需强鉴权的场景。
- 若后续需要严格控制访问：
  - 可以在 folder 维度设置为 restricted，再结合令牌/签名 URL 等方式扩展。

## 六、与前端 `/profile/basic` 的接口契合

- 后端职责：
  - 提供获取当前用户信息的接口（可用于 `/profile/basic` 页面加载），内含：
    - `avatarAttachmentId`。
    - `avatarUrl`（完整 URL）。
  - 提供头像上传接口，响应中返回最新用户信息。
- 前端职责（在单独的前端文档中详细说明）：
  - `/profile/basic` 页面中：
    - 点击头像弹出上传弹窗。
    - 使用 Nuxt UI `FileUpload` 组件上传头像到后端接口。
    - 接口成功后刷新用户信息状态，更新页面展示。

## 七、MVP 与后续迁移步骤

### MVP 步骤（后端）

1. 新建公共 URL 工具模块（`buildPublicUrl(pathname)`），基于 env 生成完整 URL。
2. 在 `PortalConfigService` 中改造 Hero 背景 URL 逻辑：
   - 改用公共 URL 工具生成 `imageUrl`。
   - 验证与现有前端兼容。

### 后续完整实现前的准备

1. 抽象附件 URL helper，基于 `AttachmentSummary.publicUrl` → 完整 URL。
2. 设计并实现用户头像上传接口：
   - 使用现有 `AttachmentsService.uploadAttachment` 逻辑。
   - 引入固定 `userAvatar` 文件夹概念。
3. 修改用户信息相关 API，增加 `avatarAttachmentId` 与 `avatarUrl` 字段。
4. 对照前端 `/profile/basic` 需求，补充必要的 DTO、路由与权限控制。

> 以上为后端侧的完整规划，遵循你偏好的「方案 A：使用附件 ID 引用 + URL lib 拼接」，确保 host 可通过 env 配置，便于未来集中迁移与维护。

