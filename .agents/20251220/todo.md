# 2025-12-20 Railway 预计算落库（去缓存）TODO

## A. 数据库 / Prisma

- [ ] 设计并新增 Prisma models：
  - [ ] `TransportationRailwayRailGraphSnapshot`（Phase 2 可延后）
  - [ ] `TransportationRailwayRouteGeometrySnapshot`
  - [ ] `TransportationRailwayStationMapSnapshot`
- [ ] 创建 migration 并生成 Prisma Client（`pnpm -C backend prisma migrate dev` / `migrate deploy` 视环境而定）
- [ ] 给关键查询加索引（至少覆盖唯一键与常用过滤：`serverId/railwayMod/dimensionContext/entityId`）

## B. Sync Job：计算阶段接入

- [ ] 在 `TransportationRailwaySyncService.syncServer()` 增加 `computeSnapshotsForServer(server, syncMarker)` 阶段
- [ ] 计算阶段按 `dimensionContext` 分组串行执行
- [ ] 加并发限制（route 与 station 计算分别限流，默认 1~2）
- [ ] 写入进度到 `TransportationRailwaySyncJob.message`（或新增 compute 子任务表）
- [ ] 失败落库（route/station 快照 status=FAILED + errorMessage），并允许下次 sync 只重算失败/过期项

## C. Route Geometry Snapshot（核心）

- [ ] 抽取/复用现有 “rails -> graph -> finder -> geometry” 逻辑用于离线批量计算
- [ ] route 快照落库内容：
  - [ ] 2D polyline（x/z）与现有返回结构可对齐
  - [ ] 3D path nodes（x/y/z + nodeId）
  - [ ] path edges（from/to + metadata）
  - [ ] stops / bounds / generatedAt / sourceSyncedAt
- [ ] 支持维度缺失的 fallback（与现有 `buildFallbackGeometry` 行为一致）

## D. Station Map Snapshot（不改前端）

- [ ] 用“预计算的 route geometry 快照”组装 `StationRouteMapPayload`
- [ ] station 快照落库内容：
  - [ ] `payload` 完全等同于现有 `ready.data`
  - [ ] `generatedAt/sourceSyncedAt`

## E. API：移除缓存但保持接口一致

- [ ] `TransportationRailwayStationMapService`：
  - [ ] 移除 `RedisService` 注入与全部 `redis.get/set/del` 调用
  - [ ] 改为查询 `station_map_snapshots`：
    - [ ] 有快照：返回 `{status:'ready', data: payload}`
    - [ ] 无快照：返回 `{status:'pending'}`
  - [ ] 保持 key 分组、颜色、paths/stops 结构不变（前端零改动）
- [ ] `TransportationModule` 移除 `RedisModule` import（transportation 不依赖缓存）

## F. 运维 / 回滚预案

- [ ] 提供一次性 backfill 手段（可复用 sync job 或新增 admin endpoint/脚本）：
  - [ ] 仅在需要时执行：为历史数据补齐 route/station 快照
- [ ] 回滚策略：
  - [ ] 保留旧逻辑分支（feature flag）或保留旧 service 实现，确保出现问题可快速切回（不影响前端）

## G. 验证清单（不改前端）

- [ ] 确认 `GET /transportation/railway/stations/:railwayType/:stationId/map` 返回结构与字段完全一致
- [ ] 确认接口耗时显著下降（预期接近 DB 查询耗时）
- [ ] 确认 transportation/railway 不再写入任何 `railway:*` cache key
- [ ] 确认 sync job 在大数据量下不会长时间阻塞（有并发限制与让出事件循环）

