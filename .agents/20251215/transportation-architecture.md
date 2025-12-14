# 交通系统模块总体规划

## 1. 背景与数据源

- Hydroline Beacon 插件已在 SQLite 内维护 `mtr_depots/platforms/routes/stations/signal_blocks/rails` 等表，同时透出 `query_mtr_entities` 与 `get_mtr_railway_snapshot` 事件；Provider 侧的 `RailwayData` MessagePack 快照可高效还原实时 topology、调度与 `last_deployed` 时间戳。
- Hydcraft 运营多台启用 Beacon 的服务端；Portal 需要聚合所有“已启用 Beacon 且配置了 MTR world 扫描”的服务器数据，对玩家呈现统一的交通（Transportation）模块，并保留来源 server 元数据供详情页展示。
- 航空、船舶等交通方式暂未提供数据。前端需在 UI 上预留入口并禁用点击，后端仅返回空列表，方便未来扩展。

## 2. 后端架构设计

### 2.1 数据建模

1. `RailwayBannerSlide`
   - 字段：`id`, `title`, `subtitle`, `attachmentId`, `ctaLink`, `order`, `isPublished`, `createdBy/updatedBy`, `createdAt/updatedAt`。
   - 与 `attachments` 的关联字段支持直接选取 Portal 附件库中的轮播背景图。
   - 仅管理员（新权限节点）可 CRUD。
2. `RailwayEntitySnapshot`
   - 以 `entity_type`（`'depot'|'station'|'route'|'platform'`）、`entity_id`, `dimension_context`, `server_id`, `payload`（JSONB）、`last_updated`, `synced_at` 为主要字段。
   - `server_id` 指向 `MinecraftServer` 记录，保障可追溯来源；`payload` 按 `query_mtr_entities` 的结构化 JSON 原样存储，额外派生 `name`, `transport_mode`, `color` 做索引，便于检索。
3. `RailwayRouteSnapshot`
   - 存储来自 `get_mtr_railway_snapshot` 中每条线路的拓扑、`platform_ids`、`stations` 对应 bounding box 以及 `last_deployed`。
   - 保存 `geometry`（LineString/GeoJSON）字段，用 Dynmap block 坐标序列（在服务侧计算）供前端直接绘制；`schedule_summary` 缓存 Provider `departures/frequencies` 统计结果，减少实时解析成本。
4. `RailwayRecommendation`
   - 生成“随机推荐线路”所需的缓存表，包含 `route_snapshot_id`, `reason`（如高人气、最近更新、随机）以及 `picked_at`。

### 2.2 同步与缓存策略

- **结构化同步 Job**：基于 `HydrolineBeaconPoolService` 扩展新事件类型（`query_mtr_entities`, `get_mtr_railway_snapshot`），按服务器逐一触达。默认每 5 分钟轮询一次 `depots/stations/routes/platforms`，并以 `last_updated` + `entity_id` 作为去重键增量写入 `RailwayEntitySnapshot`。`rails/signal-blocks` 体量大，仅在需要 route geometry 更新时触发（见下条）。
- **线路几何与快照刷新**：当 `RailwayEntitySnapshot` 中某条路线 `last_updated` 变化或调度 job 触发强制刷新时，使用 `get_mtr_railway_snapshot` 拿到对应维度的 MessagePack，解析出目标 `route_id` 的 `platform_ids` 与 `signalBlocks/rails` 节点，借助 `Dynmap` 投影工具在后端生成 `[x,z]` 序列，写入 `RailwayRouteSnapshot.geometry`。`last_deployed` 也一并写入，供前端判定实时程度。
- **推荐与指标聚合**：创建 `TransportationRailwayMetricsService` 定期统计：最近 `N` 条 `stations/routes/depots` 更新、总量、区间统计、热门线路等，写入 Redis（用于首页）并反哺 `RailwayRecommendation`。
- **Banner 配置缓存**：使用 Nest cache manager + Redis，将已发布 banner 列表缓存 5 分钟；管理员更新后主动刷新。

### 2.3 API 设计（均挂载在 `/transportation/railway`）

- `GET /transportation/railway/overview`
  - 返回：`banners`, `metrics`（总数、默认维度 `lastUpdated` Top 3）、`latest`（车厂/站点/线路的最近更新记录）、`recommendations`（含来源 server/维度）、`dimensions` 支持筛选。
  - 数据源：`RailwayBannerSlide` + Redis 中的聚合指标；若缓存失效则回退数据库 + Prisma 聚合。
- `GET /transportation/railway/routes`
  - 支持关键词、服务端、维度、运输模式、是否环线/高铁/轻轨等过滤与分页；主体数据来自 `RailwayEntitySnapshot` 的 `route` 记录。
  - 附带 `snapshotState`（`lastDeployed`, `syncedAt`, `server`）以及 `hasGeometry` 标记。
- `GET /transportation/railway/routes/:routeId`
  - 汇总 `RailwayRouteSnapshot`, 对应 `stations/platforms` payload, 所属 `server`，以及 `dynmap` 投影的 `geometry`（Leaflet 可直接绘制），`schedule_summary`，`depot` 列表。
  - 若 `geometry` 过期（`last_deployed` 新于 `snapshot.lastDeployed`）则触发后台刷新任务，同时返回旧数据并标记 `stale: true`。
- `GET /transportation/railway/stations`、`/depots`
  - 用于“最新注册”区块和后续详情弹窗，返回 `entity_id`, `name`, `dimension`, `lastUpdated`, `bounds`。
- `POST /transportation/railway/banners`（需要权限 `transportation.railway.manage-banners`）
  - 提供 CRUD + 排序接口；与附件服务复用 `attachmentId`。
- `POST /transportation/railway/routes/:id/refresh`
  - 管理员强制刷新某条线路的实时快照与 geometry，用于处理 Beacon 侧结构在 Portal 缓存未命中的情况。

## 3. 前端架构与交互

### 3.1 路由与导航

- 在 `UserShell` 主侧栏新增“交通系统”父级项，默认落地 `/transportation`。
- 新建路由结构：
  - `/transportation` → `TransportationLayout`（`max-w-8xl`，包含顶部选项卡“铁路”“航空”，“航空”按钮 `disabled` 并附提示）。
  - `/transportation/railway` → railway 概览页。
  - `/transportation/railway/routes/:routeId` → 线路详情页。
  - `/admin/transportation/railway/banners` → Banner 配置页面（复用 AdminShell，权限守卫）。

### 3.2 Railway 概览页（参考 `/company` 视觉）

- **Hero/Banner**：可水平全宽轮播图片，右上角展示“设置”按钮，按钮在拥有 `transportation.railway.manage-banners` 权限且 `authStore` 已登录时可点击。点击后弹出 `UModal`，包含：附件选择（调用现有附件选择器）、标题/副标题/跳转链接、上下线切换。普通访客仅能查看。
- **摘要统计卡片**：
  - “已注册车厂/站点/线路”计数；“过去 24h 更新”数量；“Beacon 接入服务器”数量。
  - 采用 `CompanyOverview` 同样的 `Card + Grid` 组件复用。
- **最新更新区块**：
  - 三列卡片显示 `last_updated` 最近的 `depots/stations/routes`，展示名称、所属维度、更新时间、来源服务器。可点击跳至详情（线路跳路由，站点/车厂使用抽屉/UModal 展示 `payload` 摘要）。
- **推荐线路区块**：
  - 双列 `UCard`，显示线路配色条、经过站点数量、运营模式、来源服务器和 `last_deployed`。每张卡可“查看动态地图”（跳转详情）。
- **Dynmap 预览**：
  - 在页面底部嵌入一个 `Leaflet` 视图，默认展示第一条推荐线路 geometry 预览，提供切换按钮以快速浏览不同推荐线路。利用 `DynmapMapController` + `L.polyline` 绘制 `geometry`。
- **航空入口**：选项卡/按钮 hover 提示“航空数据筹备中”，`disabled` 状态 visually consistent。

### 3.3 线路详情页

- 布局：左侧线路基本信息（名称、代号、配色、运营模式、所属服务器/维度/ Beacon ID、`lastUpdated` `lastDeployed`），右侧为地图 + 时间表。
- **地图展示**：
  - 复用 `DynmapMapController`，根据 `geometry` 渲染 polyline，并在 `stations` 位置打点（`platforms` / `stations` bounding box center）。
  - 提供“切换地图来源”下拉（未来 aviation/其他 server map switchover placeholder）。
  - `UModal` fallback: 若 geometry 缺失/过期，展示“正在尝试从 Beacon 刷新”提示。
- **时间表/调度**：
  - 读取 `schedule_summary`（含 `frequencies`, `departures`, `useRealTime`）并格式化为 timetable；`last_deployed` 过期 > 10 分钟 warning。
- **结构化详情**：
  - 表格展示 `platform_ids` 对应平台/站点 names, `dwell_time`, `custom_destinations`；
  - 车厂关联 (`route_ids` overlap) 以 tag 形式；
  - `signalBlock`/`rails` 解析 summary 只展示 aggregated numbers（如“节点 128 个、分岔 34 个”）。
- **来源信息**：
  - 服务器名称、Beacon endpoint、Dimension、最近一次 `synced_at`，提供“前往服务器页面”链接。

### 3.4 管理端配置

- 新增 `AdminTransportationRailwayBannerView`：
  - 列表 + 排序 + 批量上下线 + 在 `UModal` 中编辑幻灯片。
  - 使用现有 `UForm`、`AttachmentPicker`，保存后调用 `/transportation/railway/banners`。
- 在未来 tasks `TransportationRailwayRoutesAdminView` 预留 placeholder（list geometry refresh, manual sync trigger）。

## 4. 权限与依赖

- 新增权限常量：
  - `TRANSPORTATION_RAILWAY_VIEW`（用于未来 admin 监控页，如果只有 banner 管理可暂不落库）。
  - `TRANSPORTATION_RAILWAY_MANAGE_BANNERS` → `transportation.railway.manage-banners`，需要写入 `PERMISSIONS` 与前端 `useAuthStore.permissionKeys`。
  - `TRANSPORTATION_RAILWAY_FORCE_REFRESH` → 允许调用 `routes/:id/refresh`。
- 复用现有 Attachment 选择器 & Dynmap 工具；若路由详情还需 MessagePack 解码，可在后端引入 `@msgpack/msgpack`。
- 环境变量：
  - `RAILWAY_RECOMMENDATION_SIZE`, `RAILWAY_OVERVIEW_REFRESH_CRON`, `RAILWAY_SNAPSHOT_TTL` 等，可追加到 `config` 模块集中管理。
- 测试/监控：
  - Job 成功后写入 `transportation_railway_sync_total`、`transportation_railway_sync_failures_total` Prometheus 指标；
  - 在 `server-status` 面板追加“Beacon MTR Snapshot”健康检查（查看最近一次 `synced_at` 是否超时）。

## 5. 后续扩展 & 风险

- 需要处理多维度（`minecraft:overworld`, `minecraft:netease`, …）的坐标偏移：Dynmap 投影配置应与服务器 dimension 对应；后端 geometry 需记录 `dimension_context` 以便前端在 Leaflet 里切换世界。
- Beacon API 仍为 Socket.IO v2；`HydrolineBeaconClient` 需扩展事件枚举并提供通用 emit（`emitRaw`）支持自定义事件，避免每次升级都要修改类型。
- MessagePack payload 可能超过 3MB，应在后端限制 `get_mtr_railway_snapshot` 请求频率并缓存解码结果（基于 dimension + last_deployed）。
- 随机推荐内容需避免重复/冷启动，可 fallback 到“最近更新 Top N”并标记 `reason`。
- 航空入口后续可沿用相同数据流（Beacon Provider 未来 action），因此当前实现要保持模块化（`TransportationModule` + `RailwayModule` + future `AviationModule`）。
