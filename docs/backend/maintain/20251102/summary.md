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
