# 2025-11-02 前端实现说明

## 首页（用户端）
- 采用 `UserShell` 布局，Header 左侧保留 Minecraft 实时状态区域，并提供固定的侧边菜单按钮；中间标题根据 Hero 区域滚动状态在 `idleTitle`（背景描述）与 `activeTitle`（Hydroline）之间平滑切换；右侧整合消息入口、主题切换与用户菜单。
- Hero 区域读取 `/portal/home` 的背景图与描述，通过 `IntersectionObserver` 控制模糊渐变，背景资源来自后端附件系统的公开链接。
- 导航按钮与轮播指示点读取后端 `portal.navigation` 命名空间的 KV 配置，管理端可直接增删改；缺省时回落到内置占位，入口禁用并半透明显示。
- 动态卡片：当前实现“个人资料”卡片展示真实数据，其余卡片以 `placeholder` 状态呈现，等待后续接口对接即可热加载。
- Footer 预留隐私政策、备案号等信息位，Logo 使用 `frontend/src/assets/resources/Hydroline_Logo_Normal.svg`。

## 登录/主题与状态管理
- `AuthDialog` 提供登录/注册 Tab，登录成功后刷新聚合数据并关闭弹窗；注册 Tab 暂为占位（提示联系管理员）。组件内部预留了 SSO 注释。
- `ui` Store 统一处理主题模式（浅色/深色/系统）以及全局加载条展示、登录弹窗开关、Hero 可视状态。
- `auth` Store 管理访问令牌与会话，动态引入 `portal` Store 完成登出后的数据清理。`OptionalAuthGuard` 支持未登录访问首页。

## 后台（Admin）
- `AdminShell` 提供独立布局（顶部工具条 + 响应式侧边栏），并在侧栏紧凑展示附件统计卡与菜单；当路由位于子页面（如配置中心）时自动高亮对应项。
- `AdminOverview` 视图展示两块核心内容：
  - 关键指标卡（用户总数 / 附件存量 / 待绑定玩家）并提供一键跳转入口；
  - 运营快照卡整合最新用户、近期附件与待处理玩家的精简列表。
- 新增管理子页面：
  - `admin/users`：分页表格接入 `/auth/users` 接口，可关键字搜索邮箱/名称/PIIC；
  - `admin/attachments`：读取 `/attachments` 列表，展示公开状态、目录、标签与公开链接；
  - `admin/rbac`：合并角色&权限视图，实时展示 `/auth/roles` 与 `/auth/permissions` 数据，并预留“用户组/部门”占位提示后端待开发功能。
- `ConfigConsole` 视图提供命名空间/配置项的双栏管理：左侧展示命名空间列表与创建表单，右侧列出 JSON 配置项，支持编辑、删除与新增。

## 目录与组件
- `layouts/user`、`layouts/admin` 拆分普通业务与后台业务骨架；`router/modules` 不再使用，改为集中导出 `userRoutes`/`adminRoutes`。
- 公共组件新增：`AppLoadingBar`、`ThemeToggle`、`UserAvatar`、`AuthDialog`。
- Store 划分：`auth`（BetterAuth 会话）、`ui`（主题/状态）、`portal`（聚合接口数据）。配置界面通过直连 API 操作 KV，变更后即可刷新导航等前端展示。

## 注意事项
- 前端请求统一通过 `apiFetch`，自动拼接 `VITE_API_BASE_URL`（默认 `http://localhost:3000`）。后台返回的相对路径（如 `/attachments/public/:id`）会由前端补全基址。
- 主题状态在 `main.ts` 初始化时即时执行；如在 SSR 环境，需要改为懒加载。
- 登录对话框自动触发全局加载条；若后续页面也调用接口，请复用 `uiStore.startLoading/stopLoading` 保持视觉一致。
- 若要扩展侧边菜单，可在 `AdminShell` 的 `menu` 配置追加条目，或后续考虑改造为服务端驱动。
