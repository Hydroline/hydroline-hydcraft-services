# 2025-11-03 前端门户首页与后台配置重构

## 交付概览
- [x] 门户首页 (`HomeView`):
  - Hero 背景支持轮播，使用后端下发的 `background[]` 切换图片；顶部标题展示当前背景描述；
  - 导航按钮以图标为主，Tooltip 显示名称/提示，指示点在多图时才展示；
  - 卡片区域改为 3 列 2 行栅格，仅根据 `cards` 字符串数组渲染，`profile` 卡片整合登陆态信息并链接到 `/profile`。
- [x] 用户壳层 (`UserShell`)：
  - 顶栏标题实时显示 `HomeView` 推送的背景描述；
  - 用户头像与昵称改用认证存储，不再依赖 `/portal/home`。
- [x] 新增后台页面 `Admin / Portal HomeConfig`：
  - 可视化维护 hero 副标题、背景图（含排序）、导航链接、卡片可见性；
  - 支持角色/用户精细化配置卡片访问，调用新接口实时保存。

## 主要界面
- 用户门户：首页轮播背景、图标化导航、卡片网格。
- 后台配置：Hero 背景管理卡片、导航列表编辑、新增表单与卡片权限面板。

## 构建与验证
- `pnpm --filter @hydroline/frontend type-check`
- `pnpm --filter @hydroline/frontend build`
- 使用 Playwright 打开 `dist/index.html` 检查打包页面骨架（本地 file 协议需配合静态服务加载资源）。
