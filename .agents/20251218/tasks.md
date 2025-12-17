# 2025-12-18 任务拆解

## 1. 后端 MTR 数据拆分 & 同步流程
- [x] 参考 `DatabaseManager` 设计，将 `transportation_railway_entities` 拆分为 route/platform/station/depot/rail/log 等独立模型
- [x] 更新 Prisma schema 及同步服务，Beacon 拉取时写入对应新表
- [x] 重写 `TransportationRailwayRouteDetailService`、站点/车厂接口，使其读取新表并保持上下行/geometry 逻辑
- [x] 确认新的 REST 接口字段保持兼容，必要时补充转换层
- [x] 校验 Beacon payload 中的大整数/ID，同步落库时保持精度

## 2. 路线详情页新增 MTR 日志面板
- [ ] 在前端增加日志 UI（头像、跳转按钮）
- [ ] 接入 Beacon MTR Log Socket 事件实时获取数据
- [ ] 封装独立数据流，不与 existing REST API 混用
- [ ] 点击日志项跳转至相应玩家/路线页面

## 3. 上下行与平台映射增强
- [ ] 后端提供上下行区分及 platformId 列表
- [ ] 前端根据方向切换 stop 列表与平台信息
- [ ] 对于单向线路隐藏方向切换控件
- [ ] 在路线详情中同步方向与 geometry 展示

## 4. 站点与车厂展示改版
- [ ] “平台 & 关联车厂”区域改为“站点”列表
- [ ] 列表展示站点颜色、停靠站台、停留时间
- [ ] 车厂信息以文案+箭头方式置顶
- [ ] 为站点/车厂添加跳转链接

## 5. 新增站点/车厂页面与路由
- [ ] 后端提供 `/transportation/railway/:type/mtr/depots|stations` 详情接口
- [ ] 前端创建新的 Vue 视图（含地图面板）
- [ ] 引入专用 map 组件文件（站点/车厂）
- [ ] 页面风格与路线详情保持一致

## 6. 地图组件拆分与复用
- [ ] 将 `RailwayMapPanel.vue` 拆分出 station/depot 版本
- [ ] 复用外层蒙版及控制 UI
- [ ] 支持绘制站点 bounds、平台位置与车厂范围
- [ ] 更新 `map.ts` 相关 helper，必要时拆分

## 7. 链接互通与构建校验
- [ ] 路线详情可跳转到站点/车厂视图
- [ ] 站点/车厂页可跳回路线详情
- [ ] 完成所有更改后运行 `pnpm build`（前后端）验证
- [ ] 记录未跑测试的原因（如无要求）
