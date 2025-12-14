# 交通系统模块 TODO

## 后端

- [x] 在 `HydrolineBeaconClient`/Pool 中扩展 `query_mtr_entities`、`get_mtr_railway_snapshot` 等事件支持，并允许自定义 payload/响应泛型。
- [x] 创建 `RailwayBannerSlide`、`RailwayEntitySnapshot`、`RailwayRouteSnapshot`、`RailwayRecommendation` Prisma 模型并执行迁移。
- [x] 编写 `TransportationRailwaySyncService`：按 Beacon 服务器/维度轮询 `query_mtr_entities`，落库、比对 `last_updated`，并触发线路 geometry 刷新。
- [x] 接入 MessagePack 解码，生成 `RailwayRouteSnapshot.geometry`（Leaflet polyline points）+ `schedule_summary`，并缓存 `last_deployed`。
- [x] 构建 `TransportationRailwayMetricsService`，统计最新注册、推荐线路、整体计数并写入 Redis。
- [x] 实现 `/transportation/railway/overview`、`/routes`, `/routes/:id`, `/stations`, `/depots` API（含分页、筛选、来源 server 信息）。
- [x] 新增 Banner CRUD 接口与 `routes/:id/refresh` 管理端操作，接入新的权限校验。
- [x] 在 `config`/`permissions` 模块注册 `transportation.railway.manage-banners` 与 `transportation.railway.force-refresh` 等权限常量；同步 RBAC seeding。
- [x] 为新服务添加 Prometheus 指标、日志以及健康检查，确保 `synced_at` 异常可观察。

## 前端（用户态）

- [x] 在 `UserShell` 导航和 `vue-router` 中新增 `Transportation` 路由（铁路 Tab 启用、航空 Tab disabled），布局 `max-w-8xl`。
- [x] 构建 `TransportationRailwayOverviewView`：轮播 Banner + 管理设置按钮（基于权限）、统计卡、最新更新区块、推荐线路区块、Dynmap 预览。
- [x] 封装 `useTransportationRailwayStore`（Pinia）管理 overview/列表/详情数据、banner CRUD、刷新状态及错误提示。
- [x] 新建 `TransportationRailwayRouteDetailView`：展示线路元信息、Dynmap polyline、站点/平台表、发车时间表、来源服务器信息。
- [x] 复用/扩展 `DynmapMapController`，支持以后端提供的 geometry 数据绘制 polyline 并在站点处渲染 markers。
- [x] 在航空 Tab 中展示 disabled 提示，并保留未来路由占位。

## 前端（管理态）

- [x] 新增 `AdminTransportationRailwayBannerView`，提供 Banner 列表、创建/编辑/排序/上下线功能，并复用附件选择器。
- [x] 为“线路刷新”或“同步日志”准备管理入口（可在 banner 页面添加“跳转 Beacon 状态”链接或独立页面）。

## 其他

- [x] 更新文档（README/agents 记要）以反映交通模块、API 与权限。必要时在 `/docs` 目录新增 `transportation.md`。
- [x] 规划 Playwright 端到端检查：至少覆盖铁路概览加载、线路详情地图渲染、Banner 管理权限限制。
- [x] 评估生产环境 Dynmap/Beacon 访问频率，添加配置项（CRON、缓存 TTL、推荐数量）。
