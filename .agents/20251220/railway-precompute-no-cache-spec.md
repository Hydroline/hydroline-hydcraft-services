# 2025-12-20 Transportation/Railway：Sync Job 预计算 + 落库（移除缓存，前端零改动）方案

## 0. 背景（现状与痛点）

当前站点相关慢请求的根因不是数据库本身，而是“请求时重计算”：

- `GET /transportation/railway/stations/:railwayType/:stationId/map`
  - 为站点途经的多条线路做几何计算
  - 每条线路计算都要：读取 rails JSON -> 构建 rail graph -> `MtrRouteFinder` 寻路 -> 组装 `geometry.points/segments/stops`
- 为避免每次现算，目前该接口用 `RedisService`（`cache-manager`）缓存：
  - station-map 的 ready/inflight/error
  - route-geometry 的几何结果

你的目标是：

- Transportation 模块 **不再使用任何缓存**（Redis/内存都不再用于 railway 数据链路）。
- **前端代码完全不改**（接口结构与字段保持一致）。
- 把重计算全部前移到 sync job：让 API 变成“查表返回”，避免 1 分钟等待。

## 1. 约束与验收标准

### 1.1 约束（硬性）

- 不修改任何前端代码。
- 不再写/读任何 railway 相关 cache（现有 `railway:station-map:*`、`railway:route-geometry:*` 都停止使用）。
- 计算产物需要同时覆盖：
  1) 2D polyline（`x/z`，与现有 `StationRouteMapPayload.groups[].paths` 结构一致）
  2) rail graph 的“真实节点信息”（包含 `x/y/z` + 连接关系）

### 1.2 验收（你关心的结果）

- station map 请求时间从“分钟级”降到“毫秒~秒级”（只剩 DB 读取与 JSON 反序列化）。
- 即使 route 数量多、rails 节点多，也不会把 API 卡住；计算成本只在 sync job 中出现。

## 2. 总体方案（把在线现算改成离线预算）

把“站点地图接口需要的数据”拆成 3 类预计算产物，并在 sync job 中生成并落库：

1) **Rail Graph Snapshot（按 server + railwayMod + dimensionContext）**
   - 内容：positions（nodeId->x/y/z）、adjacency（nodeId->neighborIds）、connections metadata（可选但建议保留）
   - 目的：后续计算 route path 时不再反复解析 rails JSON，且满足你要求的“真实节点 + 连接关系”

2) **Route Geometry Snapshot（按 route）**
   - 内容：
     - 对前端可用的 2D 几何：points/paths（x/z）、segments（若现有返回需要）、stops、bounds
     - 你要求的“真实节点”：pathNodes3d（nodeId + x/y/z 序列）、pathEdges（from/to + metadata）
   - 目的：route detail 与 station map 都能直接取数据，不再跑 finder

3) **Station Route Map Snapshot（按 station）**
   - 内容：直接保存 `StationRouteMapPayload`（现有接口 `ready.data` 结构）
   - 目的：`GET .../map` 只读快照表即可做到前端零改动

## 3. 数据库设计建议（Prisma/Postgres）

> 你说“新表存什么我不管”，这里给出推荐结构，主要目标是：可索引、可增量更新、可观测、可失败恢复。

### 3.1 `transportation_railway_rail_graph_snapshots`

- 唯一键：`(serverId, railwayMod, dimensionContext)`
- 字段建议：
  - `positions`：JSONB 或 Bytes（可选压缩）
  - `adjacency`：JSONB 或 Bytes
  - `connections`：JSONB 或 Bytes（建议保留，至少保留 `preferredCurve/railType/...`）
  - `nodeCount`, `edgeCount`
  - `sourceSyncedAt`（基于哪次 rails 同步生成）
  - `generatedAt`

### 3.2 `transportation_railway_route_geometry_snapshots`

- 唯一键：`(serverId, railwayMod, dimensionContext, routeEntityId)`
- 字段建议：
  - `geometry2d`：JSONB（能直接组装现有 API 返回）
  - `stops`：JSONB（与 station-map stops 一致）
  - `bounds`：JSONB
  - `pathNodes3d`：JSONB/Bytes（nodeId + x/y/z 序列）
  - `pathEdges`：JSONB/Bytes（from/to + metadata）
  - `status`：`READY | FAILED`
  - `errorMessage`：string | null
  - `sourceSyncedAt`, `generatedAt`

### 3.3 `transportation_railway_station_map_snapshots`

- 唯一键：`(serverId, railwayMod, dimensionContext, stationEntityId)`
- 字段建议：
  - `payload`：JSONB（完整等同于 `StationRouteMapPayload`）
  - `sourceSyncedAt`, `generatedAt`

## 4. Sync Job 改造（分批限流，避免卡死）

### 4.1 挂载点

在 `backend/src/transportation/railway/railway-sync.service.ts` 的 `syncServer(server)` 完成所有 category 同步后，追加阶段：

- `computeSnapshotsForServer(server, syncMarker)`

### 4.2 推荐计算顺序

按 dimensionContext 分组处理（避免串图）：

1) 识别本次 sync 涉及的 `dimensionContext`（建议基于 `syncedAt = syncMarker` 的 rails/routes/platforms/stations 记录）
2) 对每个 dimensionContext：
   - 生成/更新 rail graph snapshot（一次）
   - 批量生成 route geometry snapshots（多条）
   - 批量生成 station map snapshots（多站）

### 4.3 并发与批处理（必须做）

建议默认策略（配置化）：

- dimensionContext 串行
- route 计算并发：1~2
- station map 计算并发：1~2
- 每处理 N 条 route/station 让出事件循环（避免 Node 长时间占用）
- 持续写入进度到 `TransportationRailwaySyncJob.message`（或新增 compute 子任务表）

### 4.4 失败与恢复

- graph snapshot 失败：该维度直接跳过 route/station 计算（避免半成品）
- 单条 route/station 失败：落库 `FAILED + errorMessage`，继续下一个
- 下次 sync 只重算：
  - `sourceSyncedAt` 落后于当前 syncMarker 的项
  - 或 status=FAILED 的项（可加退避/次数上限）

## 5. API 改造（保持前端完全一致）

### 5.1 `GET /transportation/railway/stations/:railwayType/:stationId/map`

返回结构不变：

- `{ status: 'pending' }`
- `{ status: 'ready', data: StationRouteMapPayload }`

改造后逻辑：

- 查询 `transportation_railway_station_map_snapshots.payload`
  - 有：直接 `ready`
  - 无：返回 `pending`（仅发生在首次部署/计算失败/数据尚未生成）
- 绝不触发在线计算
- 不使用任何 Redis/内存缓存

### 5.2 可选增强（不影响前端）

为了进一步缩短 route detail 等接口的响应：

- `getRouteDetail` 可优先读取 `route_geometry_snapshots`，不存在再走旧逻辑回退

## 6. 移除 Transportation 模块缓存依赖（代码层）

按“transportation 不用缓存”的要求：

- `backend/src/transportation/transportation.module.ts` 移除 `RedisModule` import（`backend/src/app.module.ts` 已全局引入，transportation 不需要依赖它）
- `TransportationRailwayStationMapService` 去掉 `RedisService` 注入，改用 `PrismaService` 查询 snapshot 表

> 注意：项目其他模块可以继续用 Redis；这里只保证 transportation/railway 链路不再用缓存。

## 7. 分期落地（建议先 MVP）

### MVP（先把慢接口打下来）

- 先落 2 张表：
  - `transportation_railway_route_geometry_snapshots`
  - `transportation_railway_station_map_snapshots`
- sync job 完成同步后：
  - 用现有 route 计算逻辑离线算所有 routes 的 geometry 并落库（先不做 graph snapshot）
  - 再离线组装 station map payload 并落库
- station-map endpoint 改为只读 station map snapshot
- 删除/禁用 railway 相关 cache 逻辑

### Phase 2（让 sync job 也更快）

- 增加 `transportation_railway_rail_graph_snapshots`：
  - 每个 dimensionContext 建图一次，route 全部复用
  - 同时满足“真实节点 + 连接关系”的长期诉求

## 8. 风险与注意事项

- rail graph 全量落库可能非常大：建议先做 MVP 验证体量与收益，再决定 JSONB vs Bytes 压缩。
- snapshot 必须绑定 `sourceSyncedAt` 防止用旧 rails 算新路线。
- 冷启动期间 station-map 可能 `pending`，但必须保证“不会触发在线现算”。

