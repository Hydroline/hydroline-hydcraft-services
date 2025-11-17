# 管理员账户登陆失败问题排查记录（2025-11-02）

## 背景
- 前端使用 `admin@hydcraft.local / admin123456` 登录时提示密码错误。
- 数据库中 `users.password` 字段均为 `NULL`，管理员账号也无密码信息。

## 发现
- `AuthService.ensureDefaultAdmin` 仅检查管理员邮箱是否存在，若存在即直接返回，导致以下初始化逻辑被跳过：
  - 未创建 `accounts` 表中的凭证记录 -> 无密码哈希。
  - 未调用 `initializeUserRecords` -> Profile/PIIC 等缺省数据未补齐。
  - 未执行 `assignDefaultRole` -> 管理员缺少 `admin` 角色。
- 数据库现状（修复前）：
  - `users` 表中的管理员记录存在，但 `accounts` 表中无对应 `credential` 账户。
  - `user_roles` 表中也没有管理员的角色绑定。

## 修复
- 调整 `ensureDefaultAdmin`（[`backend/src/auth/auth.service.ts`](../../../../backend/src/auth/auth.service.ts:253)）：
  - 将管理员账户查找改为 `include: { accounts: true }`，并在用户已存在但缺少凭证或密码为空时补建/补写。
  - 使用 `better-auth/crypto` 的 `hashPassword` 与 `generateRandomString` 生成安全的密码哈希和账户标识。
  - 无论管理员是否新建，均调用 `initializeUserRecords` 与 `assignDefaultRole(DEFAULT_ROLES.ADMIN)`，保证基础资料与角色齐备。
- 手动启动后端一次（`pnpm start`）执行初始化逻辑，自动回填管理员的账户记录与密码哈希。

## 验证
- Playwright 实测步骤：
  1. 同时启动后端与前端（`pnpm start` / `pnpm dev --host --port 4173`）。
  2. 访问 `http://localhost:4173`，使用默认管理员账号登录。
  3. 登录成功后首页显示管理员资料（PIIC/角色信息已加载）。
- 截图：`/tmp/playwright-mcp-output/1762068061092/playwright-login-success.png`
- 数据库复核：
  - `accounts` 表新增管理员的 `credential` 记录，`password` 列为哈希值。
  - `user_roles` 表新增管理员与 `admin` 角色的绑定。

## 后续建议
- 由于历史测试账号可能同样缺少凭证，可按需运行一个脚本批量校验 `users` 与 `accounts` 的映射完整性。
- 若计划修改默认管理员密码，请同时更新 `DEFAULT_ADMIN_PASSWORD` 环境变量并重启后端，以便重新写入哈希。

---

# 管理员后台权限缺失排查记录（2025-11-02）

## 症状
- 管理后台页面发起 `GET /portal/admin/overview` 请求返回 403，后端异常信息为 `Missing permissions: auth.manage.users`。
- 前端控制台报错并中断页面渲染，同时日志提示 `App already provides property with key "usehead"`。

## 根因
- 历史运行中默认角色已存在，但 `ensureDefaultRolesAndPermissions` 不会为已存在的角色补齐新增的默认权限，导致 `admin` 角色缺少 `assets.manage.attachments`、`config.manage` 等权限。
- `PermissionsGuard` 仅检查 `userRole.rolePermissions`，遗漏了 `userRole.role.rolePermissions` 的嵌套结构，导致即便角色持有权限也无法识别。
- 前端在 `app.use(ui)` 之后再 `app.use(createHead())`，Nuxt UI 会先自注入 `head`，随后再次注入触发重复提供警告。

## 修复
- 扩展 `ensureDefaultRolesAndPermissions`（[`backend/src/auth/roles.service.ts`](../../../../backend/src/auth/roles.service.ts:184)）：
  - 在补齐默认权限后，全量维护默认角色与权限的映射，已存在的系统角色也会增量补齐缺失权限。
  - 复用一次 `findMany` 结果，避免重复查询并保持数据一致性。
- 修正权限守卫（[`backend/src/auth/permissions.guard.ts`](../../../../backend/src/auth/permissions.guard.ts:30)）：
  - 同时遍历 `userRole.rolePermissions` 与嵌套的 `userRole.role.rolePermissions`。
  - 排除空值，保证收集到完整的权限键集合。
- 前端启动顺序调整（[`frontend/src/main.ts`](../../../../frontend/src/main.ts:17)）：
  - 将 `app.use(head)` 置于 `app.use(ui)` 之前，复用单一的 `@unhead/vue` 实例，消除重复提供警告。

## 验证
- 重新启动后端/前端服务并使用 Playwright 执行登录 → 进入后台 → 读取概览数据，全流程无 403。
- 截图：`/tmp/playwright-mcp-output/1762068061092/playwright-admin-overview.png`。
- `curl` 调用 `GET /portal/admin/overview` 携带管理员 token 返回 200，列表包含管理员和测试用户。
- 前端控制台无 `Missing permissions` 或 `usehead` 警告。
