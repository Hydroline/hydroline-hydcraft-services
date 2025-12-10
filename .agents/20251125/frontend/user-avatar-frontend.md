# 用户头像上传功能 - 前端规划（2025-11-25）

## 目标

- 在 `/profile/basic` 页面上实现用户头像上传与更新。
- 复用后端提供的统一附件 URL 能力，前端不手写 host。
- 使用 Nuxt UI 的 `FileUpload` 组件完成上传交互。

## 一、整体交互流程

1. 用户打开 `/profile/basic` 页面。
2. 页面通过现有 API 获取当前用户信息，其中包含：
   - `avatarAttachmentId: string | null`（后端新增字段）。
   - `avatarUrl: string | null`（后端根据 URL lib 生成的完整头像 URL）。
3. 页面展示：
   - 若 `avatarUrl` 存在，显示该 URL 对应的图片。
   - 若为空，则显示默认头像占位图。
4. 用户点击头像区域：
   - 弹出一个对话框（Dialog / Modal）。
   - Dialog 内容中放置 Nuxt UI 的 `FileUpload` 组件，仅允许上传单张图片。
5. 用户从本地选择图片：
   - 前端在 `FileUpload` 的回调中拿到文件信息。
   - 构造 `FormData`，字段名与后端约定（例如 `avatar`）。
6. 前端调用头像上传 API（例如 `PATCH /users/me/avatar`）：
   - 请求头附带认证信息（例如 Bearer Token）。
   - 请求体为 `multipart/form-data`。
7. 上传成功：
   - 从响应中获取最新用户数据（包含新的 `avatarAttachmentId` 和 `avatarUrl`）。
   - 更新前端用户状态（全局 store 或 composable，如 `useCurrentUser()` 等）。
   - 关闭 Dialog，并刷新头像展示区域。

## 二、页面集成点：`/profile/basic`

### 路由 & 组件

- 前端当前没有专门的「用户模块」，用户信息主要由 auth 相关逻辑提供。
- 头像功能将在前端路由页面 `/profile/basic` 对应的组件内实现：
  - 添加一个头像展示组件（例如 `ProfileAvatar`）。
  - 添加一个上传 Dialog（例如 `ProfileAvatarUploadDialog`）。

### 数据来源

- 使用现有的「当前用户」获取方式（具体实现依赖现有前端）：
  - 例如通过 composable：`useCurrentUser()` / `useAuthUser()` / 统一 API 钩子等。
- 调整点：
  - 后端在用户信息结构中新增：
    - `avatarAttachmentId`：供前端了解当前头像是否存在。
    - `avatarUrl`：直接用作 `<img :src="avatarUrl" />` 或 Nuxt Image 的源。

## 三、Nuxt UI `FileUpload` 集成方案

### 组件选择

- 采用 Nuxt UI 官方组件：
  - 文档链接：`https://ui.nuxt.com/docs/components/file-upload`。
- 使用方式（概念上）：
  - 在 Dialog 中嵌入 `<UFileUpload v-model="files" ... />` 或相应用法。

### 上传约束

- 限制为单文件上传：
  - 只允许选择一张头像图片。
- 类型限制：
  - 仅允许 `image/*`（或更精细如 `image/jpeg`, `image/png`, `image/webp` 等）。
- 大小限制：
  - 前端可限制大小（例如不超过 2MB 或 5MB），超出则在本地提示错误。

### 调用后端接口

- 在 `FileUpload` 完成文件选择后：
  - 通过 JS 创建 `FormData`：
    - `formData.append('avatar', file)`（字段名与后端约定）。
  - 使用现有的 API 调用封装（例如 `$fetch`/Axios 封装）：
    - 调用后端 `PATCH /users/me/avatar` 或约定好的头像上传接口。
  - 接口返回最新用户数据后：
    - 更新全局用户状态。
    - 修改本地展示的 `avatarUrl`。

## 四、与后端 URL lib 的协作方式

### 原则

- 前端不自行拼接 host 或 `/attachments/public/:id`。
- 所有具体 URL 的 host 和根路径由后端统一通过 URL lib 生成。

### 前端使用方式

- 直接使用后端返回的：
  - `avatarUrl` 字段作为 `<img>` 的 `src`。
  - 若后端暂时仅返回 `avatarAttachmentId`，则：
    - 前端可以通过一个简单 helper 来拼 `/attachments/public/:id`，但仍依赖浏览器当前 host。
    - 更推荐在后端即时生成 `avatarUrl`，前端只负责展示。

## 五、状态管理与 UI 细节

### 状态管理

- 根据当前项目使用的技术栈：
  - 如果有全局用户 store（例如 Pinia / Zustand / 其他），在头像上传成功后更新 store。
  - 如果通过 composable 管理用户数据，则在成功后触发重新拉取或直接覆盖响应数据。

### UI 细节

- 头像点击区域：
  - 鼠标 hover 时可显示“更换头像”的提示文案。
  - 若无头像，显示默认轮廓图或初始字母头像。
- 上传 Dialog：
  - 显示当前选中的图片预览。
  - 提供“确定上传”和“取消”按钮。
  - 上传时显示 loading 状态，防止重复提交。
- 错误处理：
  - 上传失败时给出错误提示（例如“上传失败，请稍后重试”）。
  - 对文件类型/大小超出限制的情况，直接在前端弹出轻量提示，而不是走接口。

## 六、与后端实现的对齐点（为后续一次性实现做准备）

- 依赖后端提供：
  - 头像上传接口：
    - 路径（示例）：`PATCH /users/me/avatar`。
    - 请求：`multipart/form-data`，字段名 `avatar`。
    - 响应：包含最新用户信息（含 `avatarAttachmentId` 和 `avatarUrl`）。
  - 用户信息接口：
    - 在现有用户信息响应中补充 `avatarAttachmentId` 和 `avatarUrl` 字段。
  - 统一 URL lib：
    - 保证 `avatarUrl` 的 host 与 Portal Hero 背景等统一，基于 `APP_PUBLIC_BASE_URL` 等 env。

## 七、后续实现顺序建议（前端）

1. 等后端完成公共 URL lib 与用户头像接口的 MVP 实现，并确认字段命名与返回结构。
2. 在 `/profile/basic` 页面中：
   - 抽出头像展示组件。
   - 整合 Nuxt UI 的 `FileUpload` 组件以及 Dialog。
3. 接入后端接口：
   - 实现调用头像上传 API 的逻辑。
   - 更新用户状态并刷新头像。
4. 视需要做补充优化：
   - 添加简单的裁剪或预览能力（可作为后续增强，而非 MVP 必要项）。

> 以上规划与后端“方案 A：用附件 ID 引用 + URL lib 拼接”保持一致，前端以 `/profile/basic` 作为入口页面，通过 Nuxt UI 提供良好的头像上传体验。在后端完成一次性实现后，前端可以按此规划逐步接入。

