# 2025-11-01 Auth & User Domain Milestone

## 工作范围
- 基于 BetterAuth + Prisma 打造完整鉴权、用户、权限、玩家信息系统。
- 覆盖注册/登录、令牌刷新、角色标签、状态事件、联系方式、PIIC 等需求。
- 统一 API 返回结构，准备后台管理接口与未来 LuckPerms/AuthMe 对接的基础。

## 任务清单
- [x] 重构 Prisma schema（PostgreSQL）并拆分用户相关表，生成迁移/初始数据。
- [x] 建立 NestJS PrismaService、全局响应拦截器/异常过滤器。
- [x] 整合 BetterAuth 流程：注册、登录、刷新、登出、会话查询。
- [x] 实现后台用户资料接口：Minecraft 身份、状态事件、生命周期、联系方式、PIIC 管理。
- [x] 实现权限与 RBAC：角色、权限点、守卫与默认管理员。
- [x] 编写/更新文档与配置说明，含接口列举与使用指南。
- [x] 使用 Playwright 进行端到端验证并记录结果。

## 里程碑交付物
- 更新后的数据库 schema 与迁移。
- NestJS 模块与控制器/服务改造。
- `docs/backend/milestone/20251101/summary.md` 完成总结（含完成项打勾）。
- Playwright 验证记录。
