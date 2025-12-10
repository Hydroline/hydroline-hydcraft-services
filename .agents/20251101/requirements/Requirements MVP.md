# hydroline-hydcraft-services （MVP 阶段）设计文档

# 后端
## 背景

| 模块名                          | 说明                                   | 语言 / 技术栈                 |
| ------------------------------- | -------------------------------------- | ----------------------------- |
| **hydroline-hydcraft-services** | 后端服务：API、权限、版本、配置分发    | Node.js / Flask / Spring Boot |
| **hydcraft-client-patcher**     | 客户端前置更新器：启动前更新与启动逻辑 | Java / Kotlin                 |
| **hydcraft-client-agent**       | 客户端运行时代理（Forge Mod）          | Java (Forge 1.20.1)           |

我们正在编写的后端服务属于 hydroline-hydcraft-services。Client Patcher 和 Client Agent 的运行都会基于本后端提供的接口数据。

| 模块          | 功能                                       |
| ------------- | ------------------------------------------ |
| 用户系统      | 登录验证 / 权限组 / 白名单管理             |
| 包管理        | 上传与记录客户端包信息（版本号、MD5、URL） |
| Manifest 生成 | 根据玩家权限动态返回对应包与下载源         |
| 配置下发      | 提供玩家选项配置 / agent 配置项            |
| 日志与统计    | 下载上报、agent 状态记录                   |
| 存储接口      | 对接 Cloudflare R2 / 腾讯 COS              |
| 鉴权          | JWT Token 验证                             |
| 后台管理      | 可选的管理面板接口                         |

## 目标

构建一个为 HydCraft 系统提供服务的后端，负责：

- 用户鉴权与权限管理；

针对 Patcher：

- 模组包、客户端版本与 Manifest 的生成；
- 下载源（CDN）分配；
- 玩家配置（自选包）下发；
- 下载与状态上报；

针对 Agent：

- 模块远程配置与日志上传。

## 语言

后端的框架已经搭建好，为 NestJS，配合 BetterAuth + Prisma。数据库为 PostgreSQL。站内的附件（图片等）文件存储使用腾讯云 COS。

R2、COS 是客户端更新源的。别搞混了。

我建议弄一个配置这些内容的配置文件或者 key-value 型的数据库存储，后面很多这种内容，不太适合全部放 env 里面。

## 核心功能模块定义

文件组织参照 NestJS 规范进行设计。

返回体强制全部一致。

{
"code": 0,
"message": "ok",
"timestamp": 1730432456,
"data": {}
}

| 字段        | 类型   | 说明                                  |
| ----------- | ------ | ------------------------------------- |
| `code`      | int    | 状态码，`0` 表示成功，非 `0` 表示错误 |
| `message`   | string | 状态描述或错误信息                    |
| `timestamp` | int    | 服务端时间戳（秒），统一对齐日志      |
| `data`      | object | 业务数据主体                          |

### 模块 1：用户系统（auth）

- 用户注册与登录（用户的注册登录除了在网站内，还可能在 Patcher 界面内）；
- JWT Token 生成；
- 用户基础信息表及其接口。用户基础信息十分的复杂，一定要分表提前设计好。

大概的用户信息如下。请注意，下方玩家和用户的意思一致。玩家更指 Minecraft 服务器内的身份。不过在我们的项目中，玩家一般等同于用户，但是在部分要素的系统设计上还是要区分开，就比如权限、账户绑定。总有没绑定 Minecraft 服务器内。
0. 每个用户一个uuid+accesstoken+refreshtoken（betterauth应该弄好了）。

1. 玩家 Minecraft ID、玩家 Nick。（此外还要 ID、Nick 都可能有很多个，不止一个，不过还是得有一个主 ID 和主 Nick。）
2. 玩家状态（离开、正常、未知、封禁、异常；此外：每种状态都要有对应的信息表解释，如果是封禁，为什么封禁？需要额外的分表记录玩家状态的信息。如果玩家被封禁，就是一个封禁事件，暂时称为“状态事件”，事件的具体原因是什么。如果是异常，为什么异常？如果是未知，为什么是未知？）。
3. 权限组（玩家的对应 Minecraft 插件 LuckPerms，网站的不需要和 Minecraft 服务器内一致，网站内的 RBAC 模块用 BetterAuth 的即可。如管理员或者具体的管理，此外也要设计好网站内各个模块的权限。对了我觉得一个用户可以同时有好几个权限组，就像加标签一样，而不是只能一个组里面待着）
4. 时间数据的登记：用户注册时间、玩家入服时间等。如果是退出服务器还要登记退出时间。（注意：如果是新用户，玩家入服时间和用户注册时间一致，但是老用户绑定就不一样了。）

5. 玩家联系方式（这个就多了，首先是联系方式有哪几种？然后是联系方式对应的值。这个自定义程度高一些。不过后台需要一个界面允许管理员先设置好，这个后面有很多值，建议多分几个表）

6. 玩家统一编号：PIIC。这个是类似身份证的自动生成的编号，暂时没啥用，看着好看。系统内通行还是用token的。【piic支持重新生成、也需要表记录弃用的用户id；piic对应每个用户的uuid即可。这个也得分表】

7. 用户的其它周围信息。比如生日、性别、格言等内容。

上面说的每一项内容，都需要一个《后台》能够以管理员身份（或者对应身份）进行修改、编辑、删除或者新增用户的。

默认用户：admin，密码admin123456。

此外，针对后端模块，设计好一定的接口，供后端访问。

### 模块 2：客户端接口（client）

- 提供给 Client Patcher 使用；
- 返回 Manifest（资源包清单，包含下载源、以及根据玩家的登录）；
- 返回玩家配置（选包结果、权限组、当前版本）；
- 接收下载报告（日志上报）。

#### manifest 响应结构

```json
{
  "client_version": "1.2.4",
  "packages": [
    {
      "id": "core",
      "url": "https://cdn.hydcraft.com/core.zip",
      "md5": "abc123"
    },
    {
      "id": "shaderPack",
      "url": "https://r2.cloudflare.com/shader.zip",
      "md5": "def456"
    }
  ],
  "sources": ["https://cos.tencent.com", "https://r2.cloudflare.com"],
  "agent_config": {
    "enable": true,
    "target_version": "1.20.1"
  }
}
```

### 模块 3：Agent 接口（agent）

- 提供运行时配置同步；
- 接收客户端状态（FPS、Ping、内存使用）；
- 上传日志与错误报告；
- 后期支持管理员下发命令。

### 模块 4：管理接口（admin）

- 上传新的客户端包或模组；
- 修改 manifest；
- 查询用户配置；
- 审核白名单；
- 生成版本更新记录。

### 模块 5：Manifest 构建模块（core/manifest_builder）

- 根据用户权限和配置生成 manifest；
- 按版本号区分；
- 可生成特定渠道的 manifest（COS / R2）。

### 模块 6：存储接口（core/storage）

- 抽象文件存储服务；
- 上传 / 生成签名 URL；
- 支持多渠道。

### 模块 7：日志与统计

- 记录 patcher 下载报告；
- 记录 agent 状态报告；
- 管理员可导出。

## 数据库表结构（简化）

| 表名           | 字段                                                  | 说明           |
| -------------- | ----------------------------------------------------- | -------------- |
| `users`        | uuid, username, password_hash, role, whitelist, token | 用户信息       |
| `packages`     | id, name, version, md5, urls, required_role           | 模组包信息     |
| `manifests`    | id, client_version, package_list, created_at          | 客户端版本清单 |
| `user_configs` | uuid, selected_packages, last_sync                    | 玩家配置       |
| `reports`      | uuid, version, timestamp, success_rate, source        | 下载上报日志   |
| `agent_status` | uuid, fps, ping, memory_usage, timestamp              | agent 状态记录 |

## 系统行为流

1. `patcher` 启动时 → 调用 `/client/manifest` 获取版本清单；
2. 下载更新完成后 → 调用 `/client/report` 上报状态；
3. 启动游戏后 → `agent` 定期调用 `/agent/config` 获取新配置；
4. `agent` 运行时 → 调用 `/agent/status` 上传状态；
5. 后端保存数据 → 可视化统计。

## 必须实现的模块清单（MVP）

- `/api/client/manifest`
- `/api/client/config`
- `/api/client/report`
- `/api/agent/config`
- `/api/agent/status`
- `/api/auth/login`
- manifest 构建模块
- 基础 ORM 模型（User, Package, Report）
- JWT 鉴权
- R2/COS 文件访问接口
