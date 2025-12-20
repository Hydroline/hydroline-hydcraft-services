# LuckPerms / AuthMe 缓存迁移计划

## 背景
1. 现有 `AuthmeService` / `LuckpermsService` 均通过 mysql2 直连外部数据库，频繁被门户页面、后台管理和排行同步调用，会严重依赖网络与主机资源。
2. 需求：新增 Prisma 表做缓存，门户/管理/排行接口从站内数据库拉缓存，定时同步外部状态；登录/注册/绑定等关键动作仍直连，确保准实时和安全。
3. 需要评估所有调用，并区分“必须直连”与“可使用缓存”的场景；生成落地方案后写入本文件并配 Markdown 待办列表便于打钩。

## 1. 仍需直连的服务 + 接口（必须维持现有逻辑）
| 服务 | 包含的接口 | 备注 |
| --- | --- | --- |
| `AuthService` (`/auth/register`, `/auth/login`, `/authme/bind`, `/authme/bind`/`unbind`) | `registerWithAuthme`, `loginWithAuthme`, `bindAuthme`, `unbindAuthme` | 认证流程必须实时验证密码/绑定，继续走 `authmeService.verifyCredentials`、`luckpermsService.getPlayerByUsername` 等；不动用缓存。 |
| `PlayerAutomationService` | `submitAuthmePasswordReset`、`submitAuthmeForceLogin`、`submitPermissionGroupAdjustment` | 验证 AuthMe 密码、LuckPerms 分组变化的过程都需要确保当前状态，短周期重试，继续直连并复用现有 `authmeService`/`luckpermsService`。 |
| `AuthmeBindingService.bindUser` | 管理端/系统自动绑定时调用 `resolvePlayerUuid`，抢占 uuid 需要调用 LuckPerms 即时数据。 |
| `PlayersService.bindPlayerToUser` | 管理员绑定玩家时仍得读取 `authmeService.getAccount` 以写入绑定信息。 |

> 上述模块仍使用当前 `authme`/`luckperms` 直连库，缓存不会影响它们，后续在文档中额外注明“跳过缓存”即可。

## 2. 可以迁移到缓存的服务 + 接口（只读数据）
- `PlayerService`（`/player/*`）
  - `getPlayerPortalData`、`getPlayerMinecraftData`、`getPlayerSummary`、`getPlayerBiography` 等全都通过 `buildAuthmeBindingPayloads` + `buildLuckpermsSnapshots`。 这些接口只展示玩家状态，可以改为 `AuthmeCacheService` / `LuckpermsCacheService` 提供的数据，再用 `lookupLocationWithCache` 等处理。
  - `getAuthmePlayerProfile`、`getPlayerLoggedStatus`、`fetchAuthmeRecommendationEntries` 也是重复查询 `authmeService`，适合从 Prisma 缓存读（若缓存缺失再 fallback）。
- `PlayersService`（`/auth/players`）
  - `listPlayers`、`getPlayerDetail`、`getHistoryByUsername` 等目前直接 `authmeService.getAccount`，可以转而读取 `AuthmeCache`。【绑定历史记录依然从本地 `authmeBindingHistory`】
- `UsersService` / `UsersController`（`/auth/users` 系列集合）
  - `listUsers`、`getUserDetail`、`updateAuthmeBinding`、`createAuthmeBindingAdmin`、`composeAuthmeBindingSnapshots` 等在展示绑定信息时读取 `authmeService` / `luckpermsService`；可调整 `composeAuthmeBindingSnapshots` 让 snapshot 逻辑优先走缓存表，再决定是否 fallback。
- `RankSyncService`（`/rank/sync` + Cron）
  - `loadAuthmeAccounts`、`fetchAuthmeAccountsByNames` 会频繁请求 `authmeService.getAccount`。缓存可以把 `AuthmeUser` 基本字段打到 Prisma 表，`RankSyncService` 读取缓存来填充 `map`，再在缓存缺失时重试直连。
- `PlayerAutomationService` 之外的 read-only 描述如 `Authme` 健康 `getAuthmeHealth` 可以继续使用现有 `health()`，不必缓存。

## 3. 缓存架构草案
1. 新增 Prisma 模型：
   - `AuthmeAccountCache`：`id`, `username`, `usernameLower (unique)`, `realname`, `uuid`, `ip`, `regip`, `lastlogin`, `regdate`, `contexts` 等常用字段，`updatedAt`, `sourceUpdatedAt`（记录同步时间）。
   - `LuckpermsPlayerCache`：`id`, `username`, `usernameLower`, `uuid`, `primaryGroup`, `groups Json`, `contexts Json`, `lastSyncedAt`。
2. 新增服务 `AuthmeCacheService` / `LuckpermsCacheService`：封装 Prisma 查询 + TTL 判断，提供 `getAccount`, `getPlayersByNames`, `getPlayerByUuid`, `listCachedPlayers` 等接口，并在缓存未命中时支持回退到原来的实时服务。
3. 同步机制：
   - 增加 `AuthmeCacheSyncService` / `LuckpermsCacheSyncService`，使用 cron 或 netty `@Cron` 定时拉取（比如每 30s、10s√?），通过现有 `AuthmeService.listPlayers` 和 `LuckpermsService.listPlayers` 分页查全表，写入 Prisma；可加 `config` 控制每次拉多少页。可复用 `LoadConfig` 中的 pool。也可做 `event` 触发（例如 `AuthmeService` 写入 config 后重新拉）。
   - 同步时对比 `updatedAt`，只更新变动账户，确保 `AuthmeCacheService` 可对外暴露 `lastSyncedAt`。可以用 `Prisma.upsert` + `Batch` 逻辑。
4. 使用缓存：
   - `PlayerService.buildAuthmeBindingPayloads` 等函数首先尝试 `AuthmeCacheService.getAccount`，再 fallback `authmeService.getAccount`。
   - `buildLuckpermsSnapshots` 读取 `LuckpermsCacheService`，并收集 `groupDisplayName`/`priority` 仍从 `LuckpermsService` 的 metadata（因为 config 中的 labels/priority在 LuckpermsService 本地缓存中）。
   - `RankSyncService`、`PlayersService`、`UsersService` 等统一依赖缓存，并在配置显式禁用缓存时退回直连。可以用 `ConfigService` expose 开关。

## 4. 迁移步骤建议
1. 设计 Prisma schema，并把 `AuthmeAccountCache` / `LuckpermsPlayerCache` 加入迁移，生成 `prisma migrate dev`。
2. 实现基础 CacheService + Prisma repository，让它们暴露 `getByUsername`, `getByUuid`, `listRecent`, `markSynced` 等方法。写单元测试确保重试逻辑。⚠️ 需谨慎控制 `groups Json` 结构。
3. 创建同步任务：一个 `@Cron` job 每分钟分页拉取 `Authme` `listPlayers`，另一个 job 拉取 `Luckperms` `listPlayers`；考虑用 `ConfigService` 将分页大小、拉取速度暴露出来以便调整。
4. 调整调用方：
   - `PlayerService`、`PlayersService`、`UsersService`、`RankSyncService` 等先尝试从 cache 读取，再在必要时 fallback。
   - 显示页面（portal/admin）在没有缓存时可以给出“数据同步中”提示，避免请求卡死。
5. 监控和回退：
   - 把新的缓存表写入 `Prisma` logs，记录 `lastSyncedAt`。
   - 若 `AuthmeService` 直接查询失败，应写入 error log 并继续提供缓存内容。

## 5. SQL 结构参考（基于 `.agents/20251220/example` 目录下的 dump）
- `h2_authme.sql`：`authme` 表包含 `username`/`realname`/`password`/`ip`/`lastlogin`/`regdate`/`regip` 等字段，是我们同步的核心数据源，唯一索引为 `username`。
- `h2_luckperms.sql`：`luckperms_players`、`luckperms_user_permissions` 等表记录 UUID、用户名、主组和 `group.%` 权限，与 `LuckpermsService` 当前的查询结构一致；`luckperms_group_permissions` 则储存组的元数据。同源结构能直接转换为 Prisma cache 表。

## 6. 统一定时数据拉取库（30 分钟频率）
1. **新需求摘要**  
   - 所有缓存数据（AuthMe / LuckPerms / Rank）由统一的定时拉取服务驻守，启动时若已有数据超过 30 分钟就先拉一次，并在整点与每 30 分自动触发。  
   - Rank 同步间隔从 1 小时改为 30 分钟，且其依赖的 AuthMe 信息直接用本地缓存（避免重复直连）。  
   - 新服务要可复用、易配置，在不同 sync job 之间共用 scheduling 逻辑，便于维护和拓展。
2. **库设计思路**  
   - 在 `backend/src/lib/sync` 新建 `scheduled-fetch.service.ts`（+ interface/types），封装：初始化上次拉取时间、判断是否需要立即拉取、计算下一次整点/30 分触发时刻、调用注册的 `SyncTask` 回调（传入任务标识、期望频率、是否为启动触发）。  
   - 每个 `SyncTask` 用 `registerTask({ name, frequencyMs: 30 * 60 * 1000, handler })` 注册，handler 负责调用对应数据源（如 `AuthmeCacheSyncService.sync()`、`LuckpermsCacheSyncService.sync()`、`RankSnapshotService.syncFromCache()`）。库内统一用 `setInterval` + `setTimeout` 保证在 30 分/整点调度。
   - Service 也负责在任务失败时记录 metrics/log，并提供 `isRunning(task)`、`lastRunAt(task)` 等信息，供 admin page 或调试使用。
3. **定时任务策略**  
   - 服务启动后：  
     * 读取 `lastSyncedAt`（可存 config 表或缓存表一列），如果为空或超过 30 分钟，则立即 `handler({ reason: 'startup' })`。  
     * 设定两个 timers：一个在下一个整点（分钟为 0）触发，另一个在下一个 30 分（分钟为 30）触发，并持续每 30 分钟循环。  
     * `RankSyncService` 的 cron 改为这个库托管：同步完成后更新 `rankPlayerSnapshot` + `server.lastRankSyncedAt`，并将 `Authme` 信息直接由 cache 表供给（在 `loadAuthmeAccounts` 中读取统一 cache service 而不是 `AuthmeService`）。  
   - `PlayerService` / `UsersService` / `PlayersService` / `RankSyncService` 依赖的缓存同步逻辑都借助这个库去启动（类似 `ScheduledFetchService.registerTask('authme-cache', handler)`）。同步的 result 可先写入 `Prisma` cache 表，再供各个 `CacheService` 读取。

## 7. 待办（方便自己打勾）
- [ ] 重新确认所有调用 `AuthmeService` / `LuckpermsService` 的模块与接口，并分类（本文件已列出；若遗漏再补）。
- [ ] 设计 Prisma cache 表结构并生成 migration 草案（AuthMe + LuckPerms + Rank snapshot metadata）。
- [ ] 实现 `AuthmeCacheService`、`LuckpermsCacheService`、统一的 `ScheduledFetchService` 以及对应的 `CacheSyncService`（由新库调度、30 分钟一次）。
- [ ] 修改 `PlayerService`、`PlayersService`、`UsersService`、`RankSyncService` 等调用点优先使用缓存并增加直连 fallback；`RankSyncService` 的 AuthMe 信息直接从缓存表抓取。
- [ ] 确保同步日志/指标完善，失败时自动降级直连并通过 admin page/日志输出当前同步状态。
