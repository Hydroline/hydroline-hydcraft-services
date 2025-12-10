## TODO - 仪表盘 / 玩家档案 / 排行榜（前端）

> 仅规划与设计，不在本里程碑直接改动 Layout 和首页 Hero/动画；首页和 `UserShell` 只能“加内容”，禁止删改已有结构与样式。

- [x] 与产品/后端确认「玩家档案」实际路由（需求文档写 `/profile`，现有路由为 `/player`），决定是否：保留 `/player` 并新增 `/profile` 跳转，或直接统一为一个路径，然后更新导航文案与菜单。
- [x] 根据后端 20251121 文档敲定仪表盘返回结构，在 `frontend/src/types/portal.ts` 中扩展 `PortalHomeData`，新增用于仪表盘主卡片与服务器统计卡片的字段（例如 `dashboard`、`serverCards` 等），并确保与后端类型完全一致。
- [x] 扩展 `usePortalStore.fetchHome` 的返回类型与使用方式，避免前端写死任何仪表盘卡片的文案/数值：所有数值、标签、趋势方向等都从新字段中读取，缺失时优雅降级为占位/“暂无数据”。
- [x] 在 `frontend/src/views/user/Home/HomeView.vue` 的 `md:col-span-3` 区域实现 3 列主卡片（服务器情况 / 名下数据 / 申请流程），使用 `grid-cols-3` 响应式布局和现有 `UCard`/`UBadge` 组件，保持整体视觉风格，与 hero 区域完全解耦。
- [x] 在首页主卡片下方新增“服务器统计卡片”区域（仍位于 `HomeView.vue` 内），根据新返回的服务器指标动态渲染卡片（卡片标题、副标题、主数值、单位、趋势箭头/标签等），并继续使用简约但偏艺术字的标题样式。
- [x] 为首页背景图增加点击预览能力：不改动现有动画和布局，仅在背景图上包一层可点击区域，点击后打开一个全屏 `Modal`/对话框展示大图与描述，并支持 ESC / 点击遮罩关闭。

- [x] 重构 `frontend/src/views/user/Player/PlayerView.vue` 布局为类似 GitHub 的左右布局：左列（窄）包含最近登录 IP 小地图和玩家档案概要，右列（宽）展示名下数据和各类统计卡片，保证移动端单列回落效果良好。
- [x] 新增“最近登录 IP 小地图”组件（独立子组件，位于 `views/user/Player/components` 目录），从新接口（如 `GET /portal/player/login-map`）获取坐标聚合数据，使用轻量地图或自绘 SVG 实现点/热力分布，不在前端硬编码任何坐标或示例点。
- [x] 在玩家档案左侧补充用户信息卡片：展示 Minecraft ID、Minecraft 昵称、系统头像 + 玩家头颅（使用 `mc-heads` 链接）、PIIC 及其条形码、档案概要（地址/性别/地区/最近登录/是否绑定 AuthMe），所需字段全部来自 `auth` Store 和/或新自助接口。
- [x] 在玩家档案左侧下方新增“游戏内历史操作记录”列表（时间轴或表格），调用新接口（如 `GET /portal/player/actions?from&to&page`），支持分页与空状态展示，禁止在前端编造虚假记录。
- [x] 在玩家档案右侧新增“名下资产”卡片，展示玩家名下公司与铁路摘要信息（数量、主要资产、跳转链接），数据来自后端新接口（如 `GET /portal/player/assets`）或未来 `/company`、`/railway` 自身的 `me` 接口。
- [x] 在玩家档案右侧新增“所属行政区”卡片：优先使用用户档案中的地区字段与后端返回的行政区结构（如 `regionCountry/Province/City/District`），缺少时展示友好的“尚未填写”提示。
- [x] 整合现有“Minecraft 权限组”区块：将 `authmeBindings` + LuckPerms 信息重构为右侧卡片之一，保留当前徽章展示风格，并为未来“自助修改权限组”预留操作按钮区域。
- [x] 在玩家档案右侧新增操作区按钮：AuthMe 密码重置、强制登陆、请求调整权限组、申请强制重启服务器、跳转到 MTR 信息公开设置；每个按钮对应调用后端新接口（例如 `/portal/player/authme/reset-password`、`/portal/player/authme/force-login`、`/portal/player/server/restart-request` 等），并统一使用已有 `useUiStore` 的 Toast/Modal 反馈。
- [x] 在玩家档案右侧新增统计信息卡片：根据后端提供的统计（如飞行距离、累计在线时长、死亡次数、建造方块数等）绘制一到两个简单图表或条形列表，数据来自新接口（如 `GET /portal/player/stats?period=30d`），前端仅做展示与单位格式化。

- [x] 在 `frontend/src/router/index.ts` 中新增用户侧 `/rank` 路由（例如 `path: '/rank', name: 'rank'`），挂载到 `UserShell` 布局下，添加合适的 `meta.title` 与图标（如 `i-lucide-trophy`），不影响现有路由。
- [x] 新建 `frontend/src/views/user/Rank/RankView.vue`，实现基础结构：顶部标题 + 描述，左上角选择排行榜类别（下拉框），右上角选择统计周期（如全部/7天/30天/本赛季），下方为排行榜表格或卡片列表。
- [x] 接入新的排行榜接口：使用 `apiFetch` 调用 `GET /portal/rank/categories` 获取分类列表，调用 `GET /portal/rank/leaderboard?category=&period=&page=` 获取具体排行榜数据，并在前端高亮当前登录用户的行（可通过 `GET /portal/rank/me` 或对比当前用户 ID）。
- [x] 为 `/rank` 页面设计加载态与空态：分类未加载时展示 Skeleton 或禁用控件；无排行榜数据时展示“暂无该统计数据”的提示，不在前端写死示例玩家。

- [x] 针对 `/`、`/player`、`/rank` 三个页面补充基础 Playwright 测试脚本（放在现有 e2e 测试结构中）：覆盖“未登录访问提示登录”“登录后仪表盘数据卡片渲染”“排行榜加载与当前用户高亮”三个 happy path，测试中始终依赖真实接口或后端 seed 数据，不伪造前端 Mock。
