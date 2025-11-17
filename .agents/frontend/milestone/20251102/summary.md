# 2025-11-02 后台界面调整总结

## 完成事项
- 重构 `AdminOverview`：保留两张核心卡片（关键指标、运营快照），在概览内合并附件与未绑定玩家摘要，并提供跳转到管理页的按钮。
- 新增后台专页：
  - `admin/users` 读取 `/auth/users`，支持关键字检索与分页展示。
  - `admin/attachments` 读取 `/attachments`，展示目录、标签、公开状态与公开链接。
  - `admin/rbac` 搭建角色/权限列表，同时标注用户组、部门模块待后端接口完成后接入。
- 调整 `AdminShell` 导航，新增“用户与玩家”“附件系统”“RBAC 管理”菜单，并在进入后台时预加载概览数据。
- 更新里程碑实现文档与 TODO 列表，记录设计规范、接口依赖及后续迭代建议。

## 现状与限制
- 部门 / 用户组尚无后端 Schema 与 API，页面内以提示卡说明待办事项，未引入模拟数据。
- 角色与权限列表同步自 `/auth/roles`、`/auth/permissions`；暂未开放编辑操作，按钮保持禁用态。

## 验证
- 本地运行 `pnpm start` 与 `pnpm dev --host --port 4173` 后，通过 Playwright 完成以下流程：
  1. 登录默认管理员账号并访问后台总览，截图：`/tmp/playwright-mcp-output/1762068061092/playwright-admin-overview-updated.png`
  2. 进入 `用户与玩家`、`附件系统` 页面，确认数据加载成功。
  3. 打开 `RBAC 管理`，切换到“权限列表”标签，截图：`/tmp/playwright-mcp-output/1762068061092/playwright-admin-rbac.png`
- `pnpm --filter @hydroline/frontend build` 通过（`vue-tsc` + `vite build`）。

## 后续建议
- 待后端提供用户组、部门相关数据结构与接口后，补全页面交互与批量授权功能。
- 适时补充附件上传/删除等操作入口，与后台权限管控联动。
- 为 `admin/users` 增加用户详情抽屉与角色分配操作，减少在多个页面间切换的成本。
