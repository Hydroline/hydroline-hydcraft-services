# NestJS + BetterAuth 项目

这是一个使用 NestJS 和 BetterAuth 构建的认证服务项目。

## 功能特性

- ✅ NestJS 框架
- ✅ BetterAuth 认证系统
- ✅ Prisma ORM 和 SQLite 数据库
- ✅ JWT 令牌管理
- ✅ 邮箱密码认证
- ✅ 用户注册/登录/登出
- ✅ 路由保护
- ✅ TypeScript 支持

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 环境配置

复制 `.env` 文件并配置环境变量：

```bash
# Database
DATABASE_URL="file:./dev.db"

# BetterAuth Configuration
BETTER_AUTH_SECRET="your-better-auth-secret-key-change-this-in-production"
BETTER_AUTH_URL="http://localhost:3000"

# JWT Configuration
JWT_SECRET="your-jwt-secret-key-change-this-in-production"
```

### 3. 数据库迁移

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. 启动开发服务器

```bash
pnpm run dev
```

应用程序将在 `http://localhost:3000` 启动。

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
pnpm run dev

# 构建项目
pnpm run build

# 生产模式启动
pnpm run start:prod

# 运行测试
pnpm run test

# 数据库相关
npx prisma studio      # 打开数据库管理界面
pnpm run db:generate   # 生成 Prisma 客户端
pnpm run db:migrate    # 运行数据库迁移
pnpm run db:studio     # 打开 Prisma Studio
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
