# TODO List - Hydroline Beacon 接入（Backend）

- [ ] 建模/配置
  - [x] 在「服务端状态」配置实体新增 Hydroline Beacon 访问信息字段：`endpoint`（含协议、IP/域名+端口）、`accessKey`（必填）、可选 `pollIntervalMs`、`timeoutMs`、`maxRetry`、`cacheTtlSec` 等运行参数；编辑/新增时校验格式与必填，保存时加密/隐藏 Key。（当前已在 Prisma `MinecraftServer` 中新增 `beaconEndpoint/beaconKey/beaconEnabled/beaconRequestTimeoutMs/beaconMaxRetry`，并在 DTO 与 Service 中接入，Key 不回传）
  - [x] 统一在配置加载处注入 Hydroline Beacon client，保证删除/禁用服务端时清理对应的心跳/轮询任务。（目前通过 `prepareBeaconClient` 按需构造 client，删除/禁用时不再建立连接）
  - [x] 后台接口全部展示给管理员；非管理员用户前台隐藏（鉴权中间件需识别角色并返回 403）。（Hydroline Beacon API 均挂载在受 `AuthGuard + PermissionsGuard` 保护的 `MinecraftServerController` 下，仅持有 `minecraft.manage.servers` 权限的管理员可访问）

- [ ] 库抽象（放置于 `backend/src/lib/hydroline-beacon/`）
  - [x] 抽象 client：基于 Socket.IO 长连接（插件为 netty-socketio 2.0.9，兼容 v1/v2），在后端维持与每个已启用 Beacon 的服务器的“信道”；统一封装连接管理（自动重连、心跳）、请求构造、认证（携带 Key）、超时与重试、指数退避及错误分类（网络错误/业务错误）；客户端依赖建议锁定 `socket.io-client@2.x`，ACK 语义为 v1/v2（单参数 Map）。
  - [x] 在 client 之上提供「HTTP 友好」调用接口：所有 Socket.IO 事件通过库方法暴露为 Promise 风格调用（如 `emitWithAck(event, payload)`），供 Nest 的 HTTP Controller/定时任务复用，实现前端通过 HTTP 轮询访问，而不是直接使用 WebSocket。
  - [x] 模块化方法（至少）
    - [x] `pingHeartbeat(serverId)`：心跳与服务器运行状态（加载时间、在线玩家数、TPS 等信号）；结果写入缓存以供快速展示。（当前通过 `getBeaconStatus` 封装 `get_status` + `list_online_players` 暴露心跳信息，暂不写入缓存）
    - [x] `fetchMtrLogs(serverId, filters)`：带筛选参数的 MTR 审计日志拉取；支持分页/时间范围/玩家/操作类型过滤。
    - [x] `fetchAdvancements(serverId, playerId)`：玩家成就；数据量大，支持分片/分页；提供缓存键策略与 TTL。（当前版本一次性返回全量，可通过前端分页视图消化）
    - [x] `fetchStats(serverId, playerId)`：玩家统计；同样支持缓存与分片；必要时拆分为基础指标与增量数据接口。（目前提供全量 stats，前端做关键字段筛选）
    - [x] `fetchPlayerSessions(serverId, filters)`：玩家会话 JOIN/QUIT 记录，支持日期/时间戳范围与分页。
    - [x] `fetchPlayerNbt(serverId, playerId)`、`lookupPlayerIdentity(serverId, playerId/name)`：原始 NBT 与身份映射。
    - [x] `triggerForceUpdate(serverId)`：触发插件的全量 Diff 扫描。
  - [ ] 在库内抽象 Redis fallback：当远端超时/失败时，优先读 Redis 中最近一次成功数据；成功请求后回写，TTL 可配置（默认 5-10 分钟），并记录数据时间戳以在前端提示是否为「缓存」数据。当前后台接口阶段先不启用缓存，只预埋能力供后续使用（已有 Redis 模块可复用）。 （根据你最新指示，本阶段禁止使用 Redis，预留为后续任务）
  - [ ] 设计可注入的存储接口（Redis client/metric logger），便于测试与后续替换。

- [ ] 数据建模/配置扩展
  - [x] 在 Prisma 的 `MinecraftServer` 模型中新增 Hydroline Beacon 相关字段（命名以实际实现为准，例如）：
    - [x] `beaconEndpoint`：Beacon Socket.IO 服务端地址（`http://host:port` 或 `https://domain`，不包含 path）。
    - [x] `beaconKey`：访问密钥（字符串，长度不限制但建议 32-64 字节）。
    - [x] `beaconEnabled`：是否启用 Beacon 集成（默认 `false`，避免误连）。
    - [x] 可选运行参数：`beaconRequestTimeoutMs`、`beaconMaxRetry` 等。
  - [x] 同步更新 `CreateMinecraftServerDto` / `UpdateMinecraftServerDto` 以及前后端交互类型（隐藏密钥，只返回 `beaconConfigured: boolean`；与现有 `mcsmApiKey` 的处理方式保持一致）。
  - [x] 在 `MinecraftServerService` 的 `toCreatePayload` / `toUpdatePayload` / `stripSecret` 中接入上述字段，保证：
    - [x] 更新时支持“保持原密钥不变”（前端不传或传特殊占位符）；
    - [x] 删除/禁用服务器时能识别 Beacon 状态，用于后续关闭信道或清理缓存。

- [ ] API/服务层
  - [x] 新增路由/用例（挂载在现有 `MinecraftServerController` 之下，前缀形如 `/admin/minecraft/servers/:id/beacon/...`）：
    - [x] `GET /status`：服务器状态心跳展示（调用 `get_status` + `list_online_players`），返回字段包含：
      - [x] `online_player_count`、`server_max_players`、`interval_time_ticks`/`interval_time_seconds`、`mtr_logs_total`、`advancements_total`、`stats_total`（参考 `server_status.json`）。
      - [x] 后端生成字段：`lastHeartbeatAt`（本次请求时间）、`fromCache` 等。
    - [x] `GET /mtr-logs`：MTR 审计日志列表（调用 `get_player_mtr_logs`），支持查询参数：
      - [x] `playerUuid` / `playerName`、`page`、`pageSize`、`singleDate`（YYYY-MM-DD）、`startDate`、`endDate`、可选 `changeType`。
      - [x] 返回 `total`、`records[]`，字段参考 `mtr_logs_page1.json`：`id`、`player_name`、`player_uuid`、`change_type`、`timestamp`、`source_file_path`、`dimension_context`、`class_name`、`position`、`entry_name` 等。
    - [x] `GET /mtr-logs/:logId`：MTR 日志详情（调用 `get_mtr_log_detail`），直接透传原始体供前端 JSON 展示。
    - [x] `GET /players/:playerId/advancements`：玩家成就（调用 `get_player_advancements`），支持 `playerUuid`/`playerName`；返回 `advancements` map（value 为 JSON 字符串，需在后端解析为结构化对象或保留原字符串并标注）。
    - [x] `GET /players/:playerId/stats`：玩家统计（调用 `get_player_stats`），返回 `stats` map（key 格式参考样例，value 为 long）。
    - [x] `GET /players/:playerId/sessions`：玩家会话列表（调用 `get_player_sessions`），支持 `page`、`pageSize`、`singleDate`、`startDate`、`endDate`、`eventType`（JOIN/QUIT）、可选 `playerUuid`/`playerName`。
    - [x] `GET /players/:playerId/nbt`：玩家 NBT 原始体（调用 `get_player_nbt`）。
    - [x] `GET /players/lookup`：玩家身份查询（调用 `lookup_player_identity`，支持 `playerUuid`/`playerName`）。
    - [x] `POST /force-update`：触发插件的全量 Diff 扫描（调用 `force_update`），返回是否成功入队。
  - [x] 均使用 Beacon client，并为未来缓存做好入口（统一在服务层处理缓存/降级逻辑，Controller 只负责参数映射与响应包装）。

- [ ] 服务层降级/扩展
  - [ ] 在服务层加入降级策略：
    - [ ] 远端不可达时立即返回缓存并标记 `fromCache=true`，无缓存则返回明确的错误码/提示（当前阶段可直接返回错误，后续启用缓存时落地）。
    - [ ] 大数据接口（Stats/Advancements）采用队列式批量抓取或流式分页，避免一次性压垮 Beacon。
  - [ ] 记录观测：prometheus/metrics 日志（请求耗时、命中率、远端失败率、缓存命中率），便于后期调优。

- [ ] 调度/心跳（后端内部）
  - [ ] 评估是否需要在后端维护周期性心跳任务（例如 `MinecraftPingScheduler` 类似），定期调用 `get_status` 并将结果缓存到 Redis 或内存，以减轻前端高频轮询对插件的直接压力：
    - [ ] 若启用：根据 `interval_time_seconds` 与本地配置确定心跳周期，避免与插件内部扫描周期发生“共振”。
    - [x] 若不启用：前端 HTTP 请求直接透传到 Beacon client，由客户端自身的超时与重试机制兜底。
  - [x] 当服务器被禁用或删除时，关闭对应的 Socket.IO 信道、释放资源。

- [ ] 安全性/健壮性
  - [x] 对 Key 做最小暴露（不在接口回传）；服务端端到端校验（签名/Authorization header）。
  - [x] 防抖/限流：心跳与日志拉取频率上限（默认心跳 5s，重试退避，支持配置）。
  - [x] 为 HTTP 轮询设置独立的超时（例如 3-5s）与全局 fallback 限制，防止阻塞请求池。

- [ ] 开发前置/依赖确认
  - [x] 阅读 `examples/` 下的测试 JS、`docs` 中返回用例，校准字段名与请求/响应结构，补充类型定义。
  - [ ] 确认 Redis 连接与命名空间；如已有现成封装，复用并补充缓存 key 规范。
  - [x] 事件全集（来自文档，需全部对接）：`force_update`、`get_player_advancements`、`get_player_stats`、`list_online_players`、`get_server_time`、`get_player_mtr_logs`、`get_mtr_log_detail`、`get_player_sessions`、`get_status`、`get_player_nbt`、`lookup_player_identity`。

- 已确认决策（根据你刚才的回复，已打钩）
  - [x] Beacon 接入模型：直接在现有 `MinecraftServer` 表上新增 Beacon 字段（endpoint/key/enabled/timeout/cacheTtl 等），不单独建 Beacon Server 表；如未来需要再拆分迁移。
  - [x] 插件侧接口形态：当前仅提供 Socket.IO 事件，无额外 HTTP 网关；所有请求 payload 携带 `key` 字段用于鉴权。
  - [x] 心跳/状态展示：后端/前端参考 examples `server_status.json` 和相关事件输出，优先把服务端给到的字段都展示出来，不强行裁剪；再在其上附加本地生成的 `lastHeartbeatAt`、`fromCache`、`cachedAt` 等元信息。
  - [x] MTR 审计日志：需要分页和筛选能力，分页默认 `pageSize = 50`；筛选支持玩家（`playerUuid`/`playerName`）、时间维度（`singleDate`/`startDate`/`endDate`）以及后续可扩展的 `change_type`、`class_name`、`dimension_context` 等字段；暂不做导出接口。
  - [x] 玩家成就/统计默认字段：你对具体表头没有强约束，后端/前端可以按 best practice 先挑选一批核心字段（其余通过 JSON 详情查看），后续再依据真实数据与运营需求调整。

- 待确认（仍需你后续补充或一起拍板）
  - [ ] 玩家成就/统计接口在插件侧是否计划增加分页或增量参数（当前从文档看是全量返回）；若未来打算支持，是否要在后端预留 query 参数占位以便平滑升级？
  - [ ] Redis 的可用性与命名空间/前缀约定；Stats/Advancements 缓存默认 TTL、最大缓存条目限制有无既定标准？是否允许针对不同接口设置不同 TTL（例如 MTR 日志更短、Stats 更长）？
