# Auth 模块阶段性总结（2025-11-01）

## 任务完成情况
- [x] 拆分并重构 Prisma Schema，覆盖用户档案、Minecraft 账号、状态事件、生命周期事件、联系方式、角色/权限等表结构；数据库 provider 调整为 PostgreSQL 并同步生成 Prisma Client。
- [x] 新增 `PrismaModule` 与 `PrismaService` 统一数据库访问；注册全局 `ValidationPipe`、响应拦截器、异常过滤器，确保返回体符合 `{code,message,timestamp,data}` 规范。
- [x] 接入 BetterAuth 邮箱+密码流程，封装注册、登录、登出、Session 查询、刷新逻辑，支持默认管理员引导和角色挂载。
- [x] 建立后台用户资料接口，涵盖档案更新、Minecraft 身份管理、状态事件／生命周期事件记录、联系方式 CRUD、PIIC 重新生成及历史追踪。
- [x] 构建 RBAC 体系，包含权限点、角色维护、角色授权、用户角色分配，初始化内置管理员/管理员助手/玩家角色与默认权限。
- [ ] 补写接口文档与部署配置说明（待撰写）
- [x] 使用 Playwright 进行端到端验证并记录结果（本地对 `/auth/signup`、`/auth/signin`、`/auth/session`、`/auth/signout` 成功走通）

## 主要改动概览
- `prisma/schema.prisma`：新增多枚举与 10+ 张业务表，满足用户状态、生命周期、联系方式、PIIC、角色权限等需求；保持 BetterAuth 兼容。
- `src/main.ts`：注册全局管道、拦截器、异常过滤器，启用 Prisma 优雅退出；输出统一日志。
- `src/lib`：新增 `transform.interceptor.ts` 和 `http-exception.filter.ts`，包裹所有响应/错误；保留 BetterAuth 配置。
- `src/prisma`：提供全局 `PrismaModule`/`PrismaService` 供依赖注入。
- `src/auth` 模块：
  - `auth.service.ts` 重写为 BetterAuth + Prisma 协调层，含默认管理员注入、Token 包装、Refresh 回落逻辑。
  - 新增 `users.service.ts`、`contact-channels.service.ts`、`roles.service.ts`、`permissions.guard.ts` 等服务与守卫；实现玩家信息、状态事件、联系方式、PIIC、RBAC 的全量业务逻辑。
  - Controllers 拆分为 `auth.controller.ts`（认证）/`users.controller.ts`（后台用户）/`roles.controller.ts`/`contact-channels.controller.ts`。
  - DTO 目录下补充 15+ 个校验模型（注册/登录/权限/状态/联系方式等）。
- `tsconfig.json`：补充 DOM lib 与 include 范围，确保类型拓展生效。
- `package.json`：新增 `class-validator`、`class-transformer` 依赖。

## 新增/调整的核心接口
- 公开认证接口：`POST /auth/signup`、`POST /auth/signin`、`POST /auth/refresh`、`POST /auth/signout`、`GET /auth/session`。
- 后台管理接口（需 `auth.manage.users`）：
  - `GET /auth/users`、`GET /auth/users/:id`、`PATCH /auth/users/:id/profile`。
  - Minecraft 身份：`POST /auth/users/:id/minecraft-profiles`、`PATCH`/`DELETE` 对应资源。
  - 状态 & 生命周期：`POST /auth/users/:id/status-events`、`POST /auth/users/:id/lifecycle-events`。
  - 联系方式：`POST /auth/users/:id/contacts`、`PATCH`/`DELETE`。
  - PIIC：`POST /auth/users/:id/piic/regenerate`。
  - 角色挂载：`POST /auth/users/:id/roles`。
- 联系方式渠道（需 `auth.manage.contact-channels`）：`GET/POST/PATCH/DELETE /auth/contact-channels`。
- 角色/权限管理（需 `auth.manage.roles`）：`GET/POST/PATCH/DELETE /auth/roles` 与 `GET/POST/PATCH/DELETE /auth/permissions`。

## 数据模型要点
- 用户扩展信息：`UserProfile`（生日、性别、格言、PIIC、主 Minecraft Profile）、`UserPiicHistory` 追踪历史。
- 玩家身份：`UserMinecraftProfile` 支持多条记录、主身份标记、来源枚举（MANUAL/AUTHME/LUCKPERMS/MOJANG/IMPORT）。
- 状态事件：`UserStatusEvent` + `UserStatusSnapshot`，搭配 `PlayerStatus`/`StatusSource` 枚举。
- 生命周期：`UserLifecycleEvent` 记录注册/入服/离服/绑定等关键节点。
- 联系方式：`ContactChannel`（可定制验证规则） + `UserContact`（多值、主联系方式、验证状态）。
- RBAC：`Role`、`Permission`、`RolePermission`、`UserRole`，允许多角色标签式授权。

## 待办与建议
1. **写文档**：整理接口字段说明、示例、RBAC 权限表、状态枚举定义（计划补到 `docs/backend/requirements` 或新的 API 文档）。
2. **环境准备**：当前缺少 PostgreSQL 实例。建议使用 Docker Desktop（WSL 集成）或云数据库，完成 `prisma migrate dev` 并设置 `.env`。
3. **E2E 验证**：数据库就绪后，使用 `pnpm dev` 启动服务 + Playwright（或 `page.request`）走完注册/登录/后台接口调用流程，验证权限与响应格式。
4. **后续扩展**：
   - 接入 LuckPerms/AuthMe，同步 Minecraft 侧权限与账号；
   - 丰富状态事件原因枚举、加入封禁/异常处理策略；
   - 准备 OAuth Provider（GitHub/Google）配置与回调。

## Playwright 验证记录（2025-11-01）
- 执行 `fetch` 流程覆盖：`POST /auth/signup`、`POST /auth/signin`、`GET /auth/session`、`POST /auth/signout`；
- 验证新返回结构 `{code,message,timestamp,data}` 与 RBAC 默认角色挂载；
- signout 后二次访问 `GET /auth/session` 返回 401，符合预期；
- 所有请求均使用本地 Nest 服务（http://127.0.0.1:3000），输出保存在 `/tmp/hc_backend.log`。

## 运行指引（本地）
1. 安装依赖：`pnpm install`
2. 准备 PostgreSQL：
   - 例如 Docker：`docker run --name hydcraft-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16`
   - 更新 `backend/.env` 中 `DATABASE_URL`
3. Prisma 同步：`pnpm prisma migrate dev`
4. 启动服务：`pnpm start:dev`
5. 管理员默认账户：`admin@hydcraft.local / admin123456`
