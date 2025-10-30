# Hydroline Hydcraft Services# Hydroline Hydcraft Services# NestJS + BetterAuth 项目



A pnpm workspace that brings together the Hydroline Hydcraft backend API (NestJS + BetterAuth) and the Vue 3 SPA frontend. The repository uses a single lockfile and shared tooling while keeping service-specific configs inside each package.



## Repository LayoutHydroline Hydcraft Services is a monorepo that hosts the backend APIs and the frontend SPA for the Hydcraft platform. The backend is built with NestJS and BetterAuth, and the frontend is powered by Vue 3 with Vite.这是一个使用 NestJS 和 BetterAuth 构建的认证服务项目。



```

.

├── backend/   # NestJS REST API with BetterAuth and Prisma## Project Layout## 功能特性

├── frontend/  # Vue 3 + Vite SPA (TypeScript)

├── package.json

├── pnpm-lock.yaml

└── pnpm-workspace.yaml```- ✅ NestJS 框架

```

.- ✅ BetterAuth 认证系统

## Prerequisites

├── backend/   # NestJS + BetterAuth API service- ✅ Prisma ORM 和 SQLite 数据库

- Node.js 20+

- pnpm 9+└── frontend/  # Vue 3 SPA built with Vite- ✅ JWT 令牌管理



Install all dependencies from the repo root:```- ✅ 邮箱密码认证



```bash- ✅ 用户注册/登录/登出

pnpm install

```- `LICENSE` remains at the repository root.- ✅ 路由保护



## Workspace Scripts- `.gitignore` in the repository root covers shared artifacts, while each app manages its own additional ignores as needed.- ✅ TypeScript 支持



Run these from the repository root:



```bash## Backend (NestJS + BetterAuth)## 快速开始

# Start both dev servers in parallel (backend + frontend)

pnpm run dev



# Backend helpers```### 1. 安装依赖

pnpm run backend:dev

pnpm run backend:buildcd backend

pnpm run backend:db:generate

pnpm run backend:db:migratepnpm install        # install dependencies```bash

pnpm run backend:db:studio

pnpm run backend:testpnpm prisma migrate dev  # run database migrations (SQLite by default)pnpm install



# Frontend helperspnpm run start:dev  # start the backend in watch mode```

pnpm run frontend:dev

pnpm run frontend:build```

pnpm run frontend:type-check

pnpm run frontend:lint### 2. 环境配置

pnpm run frontend:format

pnpm run frontend:format:writeUseful scripts:

```

- `pnpm run test` – run unit tests复制 `.env` 文件并配置环境变量：

Each package still exposes its own scripts (`backend/package.json`, `frontend/package.json`) for more granular control. See `backend/README.md` for detailed API documentation and auth flow notes.

- `pnpm run build` – build the backend for production

## Development Tips

- `pnpm prisma studio` – inspect the SQLite database via Prisma Studio```bash

- Backend runs on port `3000` by default (`backend/.env`).

- Frontend Vite dev server runs on port `5173` by default; use `pnpm run frontend:dev -- --host` to expose it on your LAN.# Database

- Prisma currently targets SQLite for local development—switch `DATABASE_URL` when you're ready for PostgreSQL/MySQL.

- ESLint and Prettier are configured per package; run `frontend:lint` / `frontend:format` or `backend` equivalents as needed.The backend README (`backend/README.md`) contains in-depth API documentation and auth flow details.DATABASE_URL="file:./dev.db"



Happy hacking! 💧


## Frontend (Vue 3 + Vite)# BetterAuth Configuration

BETTER_AUTH_SECRET="your-better-auth-secret-key-change-this-in-production"

```BETTER_AUTH_URL="http://localhost:3000"

cd frontend

pnpm install        # install dependencies (already run by the initializer)# JWT Configuration

pnpm run dev        # start the Vite dev serverJWT_SECRET="your-jwt-secret-key-change-this-in-production"

pnpm run build      # build the SPA for production```

```

### 3. 数据库迁移

The Vite dev server runs on port 5173 by default. Use `pnpm run dev -- --host` to expose the dev server on your network.

```bash

## Development Workflownpx prisma generate

npx prisma migrate dev

1. Start the backend API (port 3000 by default): `cd backend && pnpm run start:dev````

2. Start the frontend SPA (port 5173 by default): `cd frontend && pnpm run dev`

3. Configure environment variables in `backend/.env` and (optionally) `frontend/.env`.### 4. 启动开发服务器



## Next Steps```bash

pnpm run start:dev

- Wire the frontend to the backend APIs (e.g., axios/fetch wrappers with auth headers).```

- Configure shared tooling (formatters, linting) across the monorepo if desired.

- Set up CI workflows to build and test both apps.应用程序将在 `http://localhost:3000` 启动。

- Switch the backend database provider from SQLite to PostgreSQL/MySQL when moving toward production.

## API 端点

### 认证相关

- `POST /auth/signup` - 用户注册

  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "name": "用户名"
  }
  ```

- `POST /auth/signin` - 用户登录

  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

- `POST /auth/signout` - 用户登出
  - 需要 Bearer Token 认证

- `GET /auth/session` - 获取当前会话
  - 需要 Bearer Token 认证

### 其他路由

- `GET /` - 公开路由
- `GET /protected` - 受保护路由（需要认证）

## 认证流程

1. 用户使用 `/auth/signup` 注册账户
2. 使用 `/auth/signin` 登录获取 JWT 令牌
3. 在请求头中携带 `Authorization: Bearer <token>` 访问受保护的路由
4. 使用 `/auth/signout` 登出

## 项目结构

```
src/
├── auth/           # 认证模块
│   ├── auth.controller.ts  # 认证控制器
│   ├── auth.service.ts     # 认证服务
│   ├── auth.module.ts      # 认证模块
│   └── auth.guard.ts       # 认证守卫
├── lib/
│   └── auth.ts     # BetterAuth 配置
├── app.controller.ts
├── app.module.ts
├── app.service.ts
└── main.ts
```

## 开发命令

```bash
# 开发模式启动
pnpm run start:dev

# 构建项目
pnpm run build

# 生产模式启动
pnpm run start:prod

# 运行测试
pnpm run test

# 数据库相关
npx prisma studio      # 打开数据库管理界面
npx prisma generate    # 生成 Prisma 客户端
npx prisma migrate dev # 运行数据库迁移
```

## 技术栈

- **框架**: NestJS
- **认证**: BetterAuth
- **数据库**: SQLite (开发环境)
- **ORM**: Prisma
- **语言**: TypeScript
- **包管理器**: pnpm

## 下一步

1. 配置 OAuth 提供商（GitHub、Google 等）
2. 添加邮箱验证功能
3. 实现密码重置
4. 添加用户权限和角色管理
5. 部署到生产环境时切换到 PostgreSQL

## 贡献

欢迎提交 Issue 和 Pull Request！

  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
