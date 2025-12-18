# 2025-12-19 车站详情：全屏地图移植 + 途经线路多线渲染（异步接口 + 缓存）规划

目标：

- 车站详情页地图功能与线路详情页“全屏地图体验”完全一致（按钮位置/样式、全屏遮罩、全屏左下角信息块、右上角退出按钮）
- 在车站地图中显示“所有途经线路”，并对“同名线路（按 name.split('||')[0].split('|')[0]）”做合并后按线路组渲染（不同线路组可不同颜色）
- 计算量大：后端独立新接口，采用“异步生成 + 缓存（Redis 优先，失败自动内存降级）”
- 约束：尽量不改动现有共用组件，避免影响 RouteDetail；如需共用能力，优先复制一份 station 专用实现。

---

## 一、前端：车站页全屏地图移植（1:1）

### 1) 复刻内容（严格对齐 RouteDetail）

- 地图容器右上角：全屏按钮（样式/定位与 RouteDetail 一致）
- 全屏层：
  - Teleport 到 body
  - 半透明背景 + blur
  - 地图铺满（考虑 header insetTop 与 content insetLeft 的计算逻辑一致）
  - 左下角信息块：沿用同一套 class / shadow / text-shadow / backdrop blur 的组合
  - 右上角退出按钮：同 RouteDetail 的“退出全屏”按钮样式

### 2) 车站全屏左下角信息块内容（按需求调整文本，不改风格）

- 标题：站名（StationName）
- 指标：
  - 换乘站数（= 途经线路组数量，合并同名后的数量）
  - 站台数（= detail.platforms.length）

说明：RouteDetail 的全屏信息块含 USelect（上行/下行）。车站页不需要方向选择，信息块保留结构与风格，去掉 USelect，避免引入额外交互。

### 3) 文件/组件策略（不影响现有线路页）

- 新增 station 专用全屏组件：复制现有 overlay 再改文案/props。
  - 来源参考：frontend/src/views/user/Transportation/railway/components/RailwayMapFullscreenOverlay.vue
  - 目标建议：frontend/src/views/user/Transportation/railway/components/RailwayStationMapFullscreenOverlay.vue
- StationDetailView 中：
  - 新增 `fullscreenMapOpen` 与 `goDetailedMap()`
  - 地图右上角加全屏按钮
  - 顶层挂载 station fullscreen overlay

---

## 二、前端：车站地图显示“所有途经线路（合并同名后）”

### 1) 为什么不能直接用现有 RailwayStationMapPanel

- RailwayStationMapPanel 当前是“站点范围 polygon + 站台线段 secondaryPaths + stop label”这种模式。
- 需求是“多条线路组，多色 polyline”，需要多线条、每条独立颜色。

### 2) 为什么不直接改 RailwayMapPanel / RailwayMap（避免影响 RouteDetail）

- 现有 RailwayMapPanel + RailwayMap（routeMap.ts）默认只有“主路线一种颜色 + secondary 一种颜色”。
- 为了不影响 RouteDetail：采用复制 station 专用 map 实现。

### 3) 复制实现策略（station 专用 map）

- 复制 routeMap.ts -> stationRoutesMap.ts（站点多线路渲染版本）
  - 目标建议：frontend/src/views/user/Transportation/railway/maps/stationRoutesMap.ts
  - 改造点：支持绘制 N 组 polyline，每组有独立 color / weight / opacity
  - 仍复用 dynmap controller：createHydcraftDynmapMap
- 复制 RailwayMapPanel.vue -> RailwayStationRoutesMapPanel.vue
  - 目标建议：frontend/src/views/user/Transportation/railway/components/RailwayStationRoutesMapPanel.vue
  - 使用 stationRoutesMap.ts 的 Map 类
  - props 接收后端返回的“线路组数组”（含 geometry 与 color），并负责 auto-focus 到所有线条 bounds

### 4) StationDetailView 的渲染切换

- 非全屏：地图区域渲染 RailwayStationRoutesMapPanel
- 全屏：overlay 内同样渲染 RailwayStationRoutesMapPanel（或传入同一套 props）

---

## 三、后端：车站多线路地图独立接口（异步 + 缓存）

### 1) 新接口（不与 route 共用）

建议新增：

- GET /transportation/railway/stations/:railwayType/:stationId/map
  - query: serverId, dimension(optional)
  - 返回：
    - { status: 'ready', data: StationRouteMapPayload }
    - 或 { status: 'pending', etaMs?: number }

说明：

- 第一次请求：若缓存命中直接 ready；若未命中则触发后台计算（不 await），并立即返回 pending
- 前端轮询：每隔 600~1200ms（或指数退避）重复 GET，直到 ready

（可选）如果希望更清晰，也可拆为：

- POST .../map/prepare（触发）
- GET .../map（读取）
  但一个 GET 也能实现“触发 + 读取”的最简版。

### 2) 计算逻辑（与 route 一致：查 rails 建图 + findRoute）

- 输入：stationId + serverId + railwayType + dimensionContext
- 步骤：
  1. 复用现有 getStationDetail 的“平台收集 + routeIds 获取”逻辑，得到 routes 列表
  2. 分组：key = route.name.split('||')[0].split('|')[0]
  3. 对每个组：
     - 收集组内 routeId 列表
     - 读取每条 route 的平台序列（platform_ids）
     - 对每条 route，按 routeDetail 的方式 buildGeometryFromRails（rails -> graph -> MtrRouteFinder）得到 geometry
     - 将组内多条 route 的 geometry.paths 组合为该组的 geometry（或直接输出一个 paths 数组）
     - 颜色策略：优先取组内第一条 route.color 非空值，否则 null

输出结构建议（示例）：

- StationRouteMapPayload:
  - stationId
  - serverId
  - railwayType
  - dimension
  - groups: Array<{
    keyName: string
    displayName: string
    color: number | null
    routeIds: string[]
    geometry: { source: 'rails' | 'fallback', paths: Array<{ points: Array<{x,z}>, segments?: ... }> }
    }>

### 3) 缓存策略（Redis 优先，失败内存自动降级）

现状：项目已有全局 CacheModule，Redis 连接失败会 fallback 到内存缓存：

- backend/src/lib/redis/redis.module.ts
- backend/src/lib/redis/redis.service.ts

建议缓存 key：

- station-map:${serverId}:${railwayType}:${dimensionContext}:${stationId}:${stationUpdatedAtOrBeaconUpdatedAt}

TTL：

- 以环境变量 REDIS_TTL 为兜底
- Station map 可独立配置一个更短 TTL（例如 5~30 分钟）避免长期陈旧

并发/击穿：

- pending 计算时，写入一个短 TTL 的 “inflight 标记” 避免重复计算
- inflightKey: station-map:inflight:${...}

失败降级：

- 计算异常：缓存一个短 TTL 的 error 结果（避免疯狂重算），同时让前端提示“地图生成失败，可重试”

---

## 四、落地顺序（建议）

1. 先做前端全屏移植（站名/换乘数/站台数），地图仍用现有 StationMapPanel，确保 UI 1:1 完成
2. 后端新增 station map 异步接口 + 缓存（先返回结构与 mock/简化 geometry，前端先打通轮询）
3. 前端新增 station 专用多线路地图面板（复制实现），接入后端真实数据
4. 调整性能与边界：缓存 key、TTL、inflight、防抖/退避

---

## TODO（执行清单）

### A. 前端：全屏移植

- [x] 新增 RailwayStationMapFullscreenOverlay.vue（复制 overlay，改左下角信息文案与 props）
- [x] RailwayStationDetailView.vue 增加 fullscreenMapOpen 状态与 goDetailedMap
- [x] RailwayStationDetailView.vue 地图右上角加入“全屏”按钮（样式与线路页一致）
- [x] overlay 左下角信息：站名 + 换乘站数 + 站台数（保持同样 class/style）
- [x] 退出全屏按钮与遮罩样式与线路页一致

### B. 后端：站点地图异步接口 + 缓存

- [x] 新增 controller 路由：GET transportation/railway/stations/:railwayType/:stationId/map
- [x] 新增 service 方法：buildStationRouteMap(serverId, stationId, railwayType, dimension?)
- [x] routes 分组：name.split('||')[0].split('|')[0]
- [x] 每组计算 geometry（复用 route 逻辑：rails->graph->finder）并产出颜色
- [x] RedisService 缓存 ready 结果；inflight 标记防重复计算
- [x] pending 响应规范 + 前端轮询建议间隔

### C. 前端：多线路渲染（复制，不改共用）

- [x] 新增 stationRoutesMap.ts（复制 routeMap.ts，多线多色绘制）
- [x] 新增 RailwayStationRoutesMapPanel.vue（复制 RailwayMapPanel，切换到 stationRoutesMap）
- [x] StationDetailView：切换地图组件为 RailwayStationRoutesMapPanel（接入异步接口数据）
- [x] 全屏 overlay 内也使用 RailwayStationRoutesMapPanel
- [x] 空态/加载态：pending 显示 loading 遮罩，与 RouteDetail 日志加载层类似风格即可

### D. 错误信息（英文 + 前端统一转换）

- [x] 后端接口返回的 error.message 保持英文（便于前端统一转换）
- [x] 新增 frontend/src/utils/errors/auth-error.ts 作为收敛点（auth-errors.ts 兼容 re-export）
- [x] 将车站地图接口可能出现的错误文案加入翻译表（如 Station not found / Invalid request 等）
