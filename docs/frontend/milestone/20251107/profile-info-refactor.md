# 2025-11-07 前端：Profile Info 拆分与 UA 展示

## 目标
- /profile/info 页面：
  - 会话卡片不再直接显示原始 UA，改为解析后显示「设备类型 + 平台」；
  - IP 前增加 UIcon 图标区分 PC / 平板 / 手机；
- 将现有基于 aside 的 3 个条件渲染卡片拆分成 3 个独立路由页，以便后续扩展：
  - /profile/info/basic 基础资料
  - /profile/info/minecraft 服务器账户（AuthMe/LuckPerms）
  - /profile/info/sessions 会话管理

## 变更范围
- 组件：`frontend/src/views/user/Profile/ProfileInfoView.vue`（作为模板复制三份，分别裁剪为单卡片页面）
- 路由：`frontend/src/router/index.ts`（新增 3 个子路由）
- 会话卡片：`frontend/src/views/user/Profile/components/sections/SessionsSection.vue`（UA 解析 + 图标）
- 依赖：新增 `ua-parser-js`

## 路由与组件方案
- 复制 `ProfileInfoView.vue` 为：
  - `ProfileInfoBasicView.vue`：仅保留 `<BasicSection/>` 相关逻辑与表单保存；
  - `ProfileInfoMinecraftView.vue`：仅保留 `<MinecraftSection/>` 与绑定弹窗逻辑；
  - `ProfileInfoSessionsView.vue`：仅保留 `<SessionsSection/>` 与列表/终止逻辑；
- `ProfileSidebar` 仍复用，但不再通过 `activeSection` 切换显示，而是点击后进行路由跳转：
  - 父组件拦截 `update:activeId`，根据 id `basic|minecraft|sessions` `router.push` 到对应路径；

## UA 解析与图标
- 在 `SessionsSection` 中：
  - 使用 `ua-parser-js` 解析 `userAgent`:
    - 设备类型：mobile / tablet / desktop（无则推断为 desktop）
    - 平台：OS 名称，如 iOS、Android、Windows、macOS、Linux
  - 展示为：`{设备类型中文}/{平台}`，如「手机/Android」「平板/iPadOS」「桌面/macOS」
  - IP 左侧使用 `UIcon`：
    - 手机：`i-lucide-smartphone`
    - 平板：`i-lucide-tablet`
    - 桌面：`i-lucide-monitor`

## 后续与后端的适配
- 后端 `GET /auth/me` 将拆分为三个端点（见后端文档），前端三个页面分别调用：
  - basic：`GET /auth/me/basic` + `PATCH /auth/me/basic`（仅基础资料字段）
  - minecraft：`GET /auth/me/minecraft`（含 authmeBindings+luckperms 信息）
  - sessions：`GET /auth/me/sessions`（或沿用 `GET /auth/sessions`）
- 暂时保留现有 `GET /auth/me` 调用路径，完成后替换为拆分端点。

## 任务清单
1) 新建三个视图文件并裁剪逻辑 ✅ `ProfileInfoBasicView.vue` `ProfileInfoMinecraftView.vue` `ProfileInfoSessionsView.vue`
2) 更新路由与侧边栏点击跳转 ✅ 新增 `profile.info.basic/minecraft/sessions` 并将原 `profile.info` 重定向到 basic
3) 引入 `ua-parser-js`，在 `SessionsSection` 解析 UA 并替换展示，增加图标 ✅ 已安装与展示（手机/平板/桌面 + OS）
4) 跑前端构建并验证 UI ✅ 构建通过
5) 等后端端点拆分就绪后，替换 API 路径与数据映射（下一步：前端 API store 拆分调用）

## 风险与回滚
- 复制拆分需谨慎删除无关逻辑，避免漏掉表单/弹窗/会话交互；
- 若出现路由 404，可临时保留原 `profile/info` 指向 `basic` 重定向。

## 已完成结果摘要（2025-11-07）
- 前端视图拆分完成，原多卡片聚合视图保持为重定向入口；
- 会话卡片展示已优化：不再显示完整 UA 字符串，改为 `设备类型/平台`，并在 IP 与 UA 行前加入设备图标；
- 后端新增拆分端点：`/auth/me/basic`、`/auth/me/minecraft`、`/auth/me/sessions`，暂未在前端调用；
- 下一步：调整 `auth.store` 将 `fetchCurrentUser` 拆分为基础资料专用方法，Minecraft 绑定与会话页使用新端点，逐步停用旧 `/auth/me`。
