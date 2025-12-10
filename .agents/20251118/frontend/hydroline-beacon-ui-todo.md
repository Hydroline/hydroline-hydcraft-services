# TODO List - Hydroline Beacon UI（Frontend）

- [ ] 导航/信息架构
  - [x] 左侧导航新增分组「服务端信息」，内含 3 个页面：`MTR 审计日志`、`玩家成就`、`玩家统计`；保持与现有 LuckPerms/服务器状态风格一致的简洁表格布局。顶部使用 USelect 选择服务端（每个服务端都有 Beacon）。
  - [x] 在服务端配置编辑页新增输入项：Hydroline Beacon 地址（带协议、端口）与 Key，支持显隐切换与校验。
  - [x] 前台非管理员用户不可见相关导航与页面（鉴权守卫/路由守卫）。
  - [x] 服务端选择器复用现有 `useMinecraftServerStore` 提供的数据结构（id、displayName、internalCode、host 等），在 UI 上标识哪些服务器已经配置了 Beacon（例如追加「Beacon 已配置」Tag）。

- [ ] 服务器状态/心跳展示
  - [x] 在「查看」dialog 内展示：已加载服务器时间（uptime/启动时间）、在线玩家数、TPS/性能信号、最后心跳时间、是否使用缓存数据；轮询刷新（心跳频率与后端保持一致）。
  - [ ] 明确缓存/降级提示：若数据来自 Redis 缓存，表头加徽标或 Chip 说明「缓存数据 • 时间戳」；普通用户数据可用非实时（可展示最近更新时间）。
  - [x] 根据 `examples/output/server_status.json` 以及后端约定字段，设计状态展示的字段映射：
    - [x] 数量类：`mtr_logs_total`、`advancements_total`、`stats_total`、`online_player_count`、`server_max_players`。
    - [x] 周期类：`interval_time_ticks`、`interval_time_seconds`，以及后端返回的 `lastHeartbeatAt`、`fromCache`、`cachedAt`。
  - [x] 心跳轮询采用 HTTP 方式（非 WebSocket）：在详情 dialog 打开时启动定时器，调用后端 `/admin/minecraft/servers/:id/beacon/status`，关闭 dialog 时停止轮询，避免内存泄漏。

- [ ] MTR 审计日志页面
  - [x] 表格字段（根据 Beacon 返回对齐）：时间、玩家（名/UUID）、动作/线路、站点/世界/坐标、附加描述；支持分页。
  - [x] 顶部筛选：时间范围、玩家、动作类型、站点/世界等；触发后刷新表格并显示当前筛选标签。
  - [x] 行点击或操作按钮弹出 JSON 详情（原始体），方便调试。
  - [x] USelect 切换服务端后按所选服务端拉取 `get_player_mtr_logs` / `get_mtr_log_detail`。
  - [x] 结合 `examples/output/mtr_logs_page1.json` 明确字段映射：
    - [x] 时间：`timestamp`。
    - [x] 玩家：`player_name` + `player_uuid`（副标题/tooltip）。
    - [x] 动作类型：`change_type`（CREATE/EDIT/DELETE 等）。
    - [x] 上下文：`class_name`、`dimension_context`、`position`、`source_file_path`、`entry_name`。
  - [x] 筛选参数与前端表单：
    - [x] 时间：单日 `singleDate`、日期范围 `startDate`/`endDate`（YYYY-MM-DD）。
    - [x] 玩家：`playerUuid` / `playerName`（二选一，统一表单）。
    - [x] 分页：`page`、`pageSize`。
    - [x] 预留扩展：`change_type`、`class_name`、`dimension_context`，若插件侧后续提供。

- [ ] 玩家成就页面
  - [x] 表格：玩家、成就键/名称、状态（已完成/进行中）、完成时间、世界/维度；分页与搜索玩家。（当前版本以玩家筛选 + 成就列表形式呈现，完成时间通过解析 criteria 推导，世界/维度暂无专门字段）
  - [x] 点击玩家或行展示完整 JSON（后端返回原始体）；支持展开图标查看详情。
  - [x] 数据量大时添加加载占位和空态提示，保持表格简洁（避免复杂卡片）。
  - [x] 通过 USelect 选择服务端后调用 `get_player_advancements`；若前端非管理员，可按需降频或使用后端缓存。
  - [x] 根据 `examples/output/advancements_*.json` 设计前端处理逻辑：
    - [x] 后端返回 `advancements` map，value 为 JSON 字符串，前端需解析为对象，提取 `done`、`criteria` 中的时间戳等关键信息。
    - [x] 列表层：可以只展示部分字段（例如成就 ID、是否完成、首个 criteria 时间），点击行后在 dialog/json viewer 内展示完整结构。
    - [x] 玩家维度：通过顶部选择玩家（输入框或下拉）+ 服务端选择；暂不预做跨玩家聚合。

- [ ] 玩家统计页面
  - [x] 表格：玩家、关键统计（如死亡/击杀/行走距离/在线时长等核心字段），可配置显示哪些统计；分页与搜索玩家。（当前版本按玩家筛选展示关键前缀统计）
  - [x] 支持「查看全部统计」按钮弹出 JSON（全量体），确保不会截断字段。
  - [ ] 需要标示缓存数据来源与时间戳；普通用户展示可非实时。
  - [x] 通过 USelect 选择服务端后调用 `get_player_stats`。
  - [x] 根据 `examples/output/stats_*.json` 明确字段处理方式：
    - [x] `stats` 为 map，key 如 `stats:minecraft:broken` 等；前端需根据约定列表映射为更友好的展示名称（例如「破坏方块总数」）；
    - [ ] 支持在页面顶部增加「显示字段」多选下拉，用于控制表格中展示哪些统计，避免列数过多。（当前版本按固定前缀筛选一组关键字段）
  - [x] 玩家维度展示策略：
    - [x] 初版可从后端直接按玩家拉取统计（按玩家搜索），不实现全局“所有玩家统计列表”以避免一次性数据量过大；
    - [ ] 后续如要支持统计看板，再在 TODO 中拆出新的聚合接口与页面。

- [ ] 交互/状态管理
  - [x] 使用已有的 table 组件/样式；组件超过 800 行拆分：表格主体、筛选面板、详情弹窗分别组件化。（当前各页面控制在合理长度，必要时再拆分）
  - [x] 处理加载/错误/空数据状态；请求失败时提示原因（远端不可达/仅缓存）。
  - [x] 复用后端接口参数：分页/筛选/排序字段与后端约定保持一致；封装成统一的 service 层调用。
  - [x] 所有 Beacon 接口均需有入口（后台数据全覆盖）：`get_status`、`list_online_players`、`get_server_time`、`get_player_mtr_logs`/`detail`、`get_player_advancements`、`get_player_stats`、`get_player_sessions`、`get_player_nbt`、`lookup_player_identity`、`force_update`（仅管理员按钮）。
  - [x] 前端 API/Store 设计：
    - [x] 在 `frontend/src/types/minecraft.ts` 中补充 Beacon 相关类型（状态 DTO、日志条目 DTO、成就/统计 DTO、会话 DTO 等），与后端保持字段一致。
    - [x] 在 `frontend/src/stores` 或 `frontend/src/api` 下新增 Beacon 专用 service 封装（目前复用 `useMinecraftServerStore` 中的 Beacon 方法），统一与 `/admin/minecraft/servers/:id/beacon/...` 路径交互。
    - [x] 与现有 `MinecraftServerStatusView` 交互：在服务器卡片/详情中增加 Beacon 状态区块，并在编辑表单中提供 Beacon 配置项。
    - [x] 在「玩家目录」「玩家详情」相关视图中增加入口（按钮或链接），可直接跳转到 Beacon 的 MTR/成就/统计页面，并自动携带当前玩家（以及默认服务器）的筛选条件。

- 已确认决策（根据你刚才的回复，已打钩）
  - [x] 左侧导航：单独开一个分组「服务端信息」，将 Beacon 的 3 个页面全部挂在该分组下，避免与现有 LuckPerms/服务器状态混淆。
  - [x] 心跳展示：参考 Beacon 事件和 examples output 中的字段（如 `server_status.json` 等），尽量把返回字段全部在 UI 中展示出来，再叠加「来源于缓存」「最后更新时间」等提示，不再额外精简指标列表。
  - [x] MTR 日志筛选器与分页：需要时间范围（单日/起止日期）、玩家（名/UUID）以及其它可用维度的筛选，分页能力必需；默认分页大小为 50。
  - [x] 成就/统计表格默认字段：你对具体字段组合没有强约束，前端可以按 best practice 选一批核心字段做成表头（其余通过 JSON 详情查看），后续再根据真实使用情况调整。
  - [x] 三个页面的 URL 路径与路由命名：采用 `/admin/beacon/mtr-logs`、`/admin/beacon/advancements`、`/admin/beacon/stats` 这样的路径结构，归属于「服务端信息」分组。
  - [x] 玩家联动：需要与现有「玩家目录」「玩家详情」联动，在玩家详情中提供入口跳转到 Beacon MTR/成就/统计页面，并自动带上玩家（以及服务器）的筛选条件。
  - [x] MTR 日志导出：当前不需要导出 JSON/CSV 等功能，页面只需提供筛选 + 表格 + 详情 JSON 即可。

- 待确认（仍需你后续补充或一起拍板）
  - [ ] 每个页面的必需表头字段是否需要多语言/文案约定（例如使用 i18n key，而不是写死中文），还是暂时保持与内部使用一致的中文文案即可？
  - [ ] 颜色/标签规范是否全部复用现有设计系统中的 Tag/Badge 颜色映射，还是对 Beacon 特有的状态（例如「缓存数据」「离线」）单独指定颜色？
