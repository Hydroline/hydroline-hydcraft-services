# 2025-12-20 RouteFinder/StationMap：落库预计算操作手册（前端零改动）

本文件用于记录把“在线寻路/建图”迁移到“sync job 离线预计算 + 落库”的具体操作步骤与自检点。

> 目标：站点地图接口不再现算，不再用缓存；正常情况下直接 `ready` 返回。

## 1) 代码改造完成后的执行顺序（建议）

- [ ] 1. 执行数据库迁移（生成 3 张 snapshot 表）
- [ ] 2. 部署后首次触发 railway sync job（或等待定时任务）
- [ ] 3. 观察 sync job 日志/状态，确认进入 compute 阶段并完成
- [ ] 4. 验证 snapshot 表有数据（按 serverId + railwayMod + dimensionContext）
- [ ] 5. 验证 API 直接读快照返回 `ready`

## 2) 核心自检点（必须）

- [ ] station map API 返回 JSON 结构不变（字段名/类型完全一致）
- [ ] station map API 不再写 Redis（不产生 `railway:*` key）
- [ ] station map API 不再触发“在线现算”（无长时间 CPU 占用、无 finder 日志）
- [ ] sync job 计算阶段有并发限制（route/station 计算不会把 Node 卡死）
- [ ] 失败项可恢复（快照 status=FAILED 也会落库，下次 sync 可重试）

## 3) 排查指南（常见问题）

### 3.1 API 一直 pending

优先检查：

- [ ] sync job 是否跑过 compute 阶段
- [ ] station 对应 `(serverId, railwayMod, dimensionContext, stationEntityId)` 的 station_map_snapshot 是否存在
- [ ] dimensionContext 是否一致（请求带 dimension 与落库 dimensionContext 是否匹配）

### 3.2 数据量过大导致 migration/查询慢

- [ ] 先用 MVP（只存 route/station snapshot），暂不落库 full rail graph snapshot
- [ ] 如果 JSONB 过大：再评估改为 Bytes + 压缩（gzip/zstd）存储

### 3.3 预计算与现有结果不一致

- [ ] route geometry 产出必须复用现有逻辑（同一套 finder、同一套 stops/bounds 计算）
- [ ] station map payload 组装必须与现有 `TransportationRailwayStationMapService` 对齐（同名线路分组、颜色策略、paths 合并策略）

