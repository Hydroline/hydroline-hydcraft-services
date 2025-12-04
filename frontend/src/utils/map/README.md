# Hydcraft Dynmap Leaflet Util

以 Leaflet 为基础，为接入 Hydcraft 服务器的 Dynmap 瓦片提供统一的工具层。核心目标是：像使用高德地图 JS API 一样，调用一个入口即可获得配置完成的地图实例和常用的坐标转换方法。

## 当前能力

- 读取 `VITE_DYNMAP_TILE_BASE_URL`，自动拼装 `world/flat` 瓦片路径、缩放前缀以及 `zzzzz_*_*` 文件名规则。
- 自动应用 Dynmap `mapzoom`、`tilescale`、`maptoworld/worldtomap` 配置，放大/缩小时瓦片级别与官方站一致，不会再出现“越放大越模糊”的情况。
- 暴露 `DynmapMapController`，负责创建、销毁地图实例，并提供 `centerOnBlock`/`flyToBlock` 等便捷方法。
- 内置 MC X/Z ↔ Leaflet LatLng 的互转方法，可依赖 Dynmap 的投影矩阵保持与 LiveAtlas 完全一致。

## TODO & 规划

1. **自动探测地图配置**：从 Dynmap `dynmap_config.json` 拉取 `maptoworld/worldtomap`，支持非默认世界/地图。
2. **同步玩家实时坐标**：封装一个轻量轮询器，从 Portal API 拉取玩家位置信息并触发 `centerOnBlock`。
3. **叠加交互层**：封装绘制范围、标记、热力图等 API，并接入权限控制，避免重复实现。
4. **状态与错误上报**：暴露初始化/加载失败事件，方便外部展示兜底提示或自动重试。
5. **单元/组件测试**：待 Portal 暴露模拟数据接口后，补充针对瓦片 URL、坐标转换的测试用例。
