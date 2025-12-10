## TODO - 仪表盘 / 玩家档案 / 排行榜（后端）

> 目标：为前端的仪表盘（`/`）、玩家档案（`/player` / `/profile`）、排行榜（`/rank`）提供稳定、无 Mock 的 API 支撑，先设计清晰的聚合接口，再按 MVP 逐步实现。

- [x] 与前端确认「玩家档案」实际 URL 与导航文案（`/player` vs `/profile`），确定对应的 API 命名与权限策略（例如统一以 `PortalPlayer` 作为聚合服务，路径前缀 `/portal/player`）。

- [x] 扩展门户首页数据结构：在 `PortalService.getHomePortal` 的返回值中新增 `dashboard` 字段，包含：
  - `serverOverview`：当前主要 Minecraft 服务器汇总信息（在线玩家总数、最大人数、平均延迟、主要版本等）；
  - `userOverview`：当前登录用户名下资产摘要（公司数、铁路数、绑定的 AuthMe 账号数等；无相关模型时对应字段可为 `null` 或 `0`，不得伪造）；
  - `applicationOverview`：玩家发起的各类申请数量统计（进行中 / 已通过 / 被驳回），便于首页“申请流程”卡片展示。
- [x] 为首页动态卡片设计后端结构：在 `getHomePortal` 中新增 `serverCards: Array<{ id; title; description?; value; unit?; trend?; trendLabel?; badge?; }>`，使用已有数值格式化工具（如 `formatNumber`）输出字符串化数值，用 `id` 与 `PortalConfig` 中的卡片注册表关联。
- [x] 更新 `backend/src/portal-config/portal-config.types.ts` 与 `portal-config.constants.ts`，为新出现的仪表盘卡片 ID 增加注册信息（名称、描述、默认可见性），并确保 `/admin/portal/config` 中的卡片配置可以控制这些卡片是否对不同角色/用户可见。

- [x] 设计并实现玩家档案聚合接口（建议加入 `PortalController` 或单独 `PlayerPortalController`）：
  - `GET /portal/player/summary`：返回当前登录用户的档案概要（系统用户信息、Minecraft Profile、PIIC、最近登录时间与 IP、地区信息、是否已绑定 AuthMe 等），内部复用 `UsersService.getSessionUser` 与 `IpLocationService`。
  - `GET /portal/player/login-map`：根据 AuthMe 绑定记录、会话记录（`authSession`）和/或 IP 历史表，聚合最近一段时间内的登录 IP 所在地区，返回一组坐标/区域 + 计数，供前端绘制小地图；若缺乏经纬度，可先返回地区字符串及映射表占位，为后续地理编码预留空间。
  - `GET /portal/player/actions`：基于现有 Beacon/Minecraft 日志或 AuthMe 历史（如 `authmeBindingHistory`、玩家会话日志），按时间倒序返回“游戏内历史操作记录”，包括事件类型、时间、服务器、备注等信息，支持分页。
- [x] 提供玩家名下资产与行政区信息接口：
  - `GET /portal/player/assets`：整合玩家名下公司、铁路等资产信息（若公司/铁路模型尚未落地，可先仅返回已有的 Minecraft Profile / AuthMe 绑定数量，字段留空而非构造虚假列表）；
  - `GET /portal/player/region`：返回玩家所属行政区信息与管理机构（如国家、省、市、区以及对应管理方标识），优先读取用户档案中的地址/地区字段，其次可从外部行政区模块获取。
- [x] 为玩家档案提供服务器账户与统计接口：
  - `GET /portal/player/minecraft`：在现有 `GET /auth/me/minecraft` 的基础上，封装/裁剪出专用于玩家档案页的数据结构（AuthMe 绑定 + LuckPerms 权限组），避免前端直接依赖内部字段命名；
  - `GET /portal/player/stats`：利用 Hydroline Beacon 或现有统计表聚合当前玩家的核心统计（飞行距离、累计在线时长、死亡次数、建造量等），支持按周期（如 `period=7d/30d/all`）过滤。

- [x] 实现玩家自助操作接口（权限控制需谨慎）：
  - `POST /portal/player/authme/reset-password`：接受经过身份验证的请求，调用 `AuthmeService` 触发密码重置流程（例如生成一次性密码或标记为待重置），并记录审计日志；
  - `POST /portal/player/authme/force-login`：为玩家提供“强制登陆/解卡”操作，通过 AuthMe API 或内部标记实现一次性的登录解锁，同时记录事件；
  - `POST /portal/player/permissions/request-change`：接受玩家对自身 LuckPerms 权限组调整的申请（例如从 A 组申请到 B 组），将请求写入审批队列或工单表，由管理员审核；
  - `POST /portal/player/server/restart-request`：为“炸服了申请强制重启”提供提交入口，记录申请人、目标服务器、理由和时间，不直接在接口中执行重启，而是交由后台任务或管理员审核。

- [x] 设计并实现排行榜接口（建议新建 `RankService` + 控制器，模块可挂在 `portal` 或 `minecraft` 名下）：
  - `GET /portal/rank/categories`：返回一组可用排行榜类别（ID、名称、描述、单位、支持的时间粒度），其中类别内部与 Beacon/Minecraft 指标映射（如在线时长、飞行距离等）；
  - `GET /portal/rank/leaderboard`：接受参数 `category`、`period`、分页参数等，返回对应排行榜的条目列表（玩家 UUID/昵称、展示名、数值、排名、上次排名等），利用 Beacon 或预聚合表计算；
  - `GET /portal/rank/me`：在指定排行榜下返回当前登录用户的名次及前后若干名，用于前端高亮当前玩家。
- [x] 为排行榜与玩家档案接口补充必要的权限与限流策略：普通排行榜查询可向所有登录用户开放（或部分接口对未登录用户只读开放），涉及密码重置、权限组申请、重启申请等接口必须绑定登录态，并适当绑定 RBAC 权限或增加速率限制。

- [x] 更新 Swagger 文档与 `.agents/backend/requirements/Requirements MVP.md` 中的接口汇总：为新增的 `/portal/home` 扩展字段、`/portal/player/*`、`/portal/rank/*` 接口补充简要说明与示例响应结构，确保前后端对齐时有统一参照。
- [x] 通过 `pnpm --filter backend build` 或现有构建命令完成一次后端编译自检，确保新增/扩展接口与类型定义不会破坏现有模块（不要求在本里程碑内完成数据填充逻辑的所有细节，但类型和依赖需保持正确）。
