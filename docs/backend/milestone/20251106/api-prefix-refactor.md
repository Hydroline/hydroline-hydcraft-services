# 2025-11-06 API 路径前缀调整（后端）

## 变更摘要
- 在 `main.ts` 中设置全局 `app.setGlobalPrefix('api')`，统一由框架自动附加 `/api` 路径前缀。
- `auth`、`authme`、`luckperms` 等控制器移除手写的 `api/` 前缀，路由定义保持业务语义路径。

## 影响范围
- 所有通过 NestJS 控制器暴露的接口仍然以 `/api/...` 形式对外提供，但代码层面不再重复拼接。
- 与认证和 LuckPerms 管理相关的接口在应用启动后自动映射为 `/api/auth/**`、`/api/authme/**`、`/api/luckperms/**`。

## 验证建议
```bash
pnpm --filter @hydroline/backend dev
# 浏览器访问 http://localhost:3000/api/auth/features 等接口确认 404 已消除
```

## 环境变量清单
> 以下配置来自仓库介绍，便于本地或测试环境快速启动。

```bash
# Database（PostgreSQL）
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hydcraft?schema=public"

# BetterAuth
BETTER_AUTH_SECRET="your-better-auth-secret-key-change-this-in-production"
BETTER_AUTH_URL="http://localhost:3000"

# JWT
JWT_SECRET="your-jwt-secret-key-change-this-in-production"
```

- 运行数据库命令前请执行 `pnpm backend:db:generate` 生成 Prisma Client。
- 启动后端服务时如缺少上述变量会导致 Prisma 初始化失败。
