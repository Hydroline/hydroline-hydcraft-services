# 2025-11-11 后端实施清单：账户安全与身份验证改造

本页汇总“忘记密码（验证码+邮件）”、“多邮箱绑定（主/副）”、“手机号预留接入”、“配置开关（控制显示/启用）”、“管理员查看邮箱绑定信息”相关的后端改造计划与任务清单。

## 目标与范围
- 登录页“忘记密码”：未登录用户可通过邮箱接收验证码，重置密码。
- 支持用户绑定多个邮箱；可设置主邮箱；副邮箱可用于找回密码。
- 预留手机号绑定/验证能力（允许在配置中开关，未启用不渲染前端元素）。
- 配置中心新增验证相关开关，便于后台控制：是否启用邮箱验证 / 手机号验证 / 密码找回。
- 统一验证码逻辑（10 分钟有效），邮件模板化。
- 管理员用户详情对话框可查看邮箱绑定信息：是否验证、主/副状态。

## 数据模型与存量兼容
- 继续保留 `User.email` / `User.emailVerified` 作为兼容字段（主邮箱）。
- 使用已存在的联系人模型：
  - `ContactChannel`：新增/确保存在 `email` 与 `phone` 两条渠道，`isVerifiable=true`。
  - `UserContact`：用于保存多个邮箱/手机号，字段 `isPrimary`/`verification`/`verifiedAt` 已满足需求。
- 兼容策略：
  - 主邮箱沿用 `User.email`；当设置主邮箱时，保持 `User.email` 与对应 `UserContact` 同步。
  - 找回密码支持通过 `User.email` 或任意 `UserContact(channel=email)` 匹配。

## 配置开关（ConfigNamespace/ConfigEntry）
命名空间：`security.verification`
- `enableEmailVerification`: boolean，默认 true
- `enablePhoneVerification`: boolean，默认 false（预留）
- `enablePasswordReset`: boolean，默认 true
- `emailCodeTtlMinutes`: number，默认 10
- `rateLimitPerEmailPerHour`: number，默认 5（初期可不强约束，仅日志警告）

引导初始化（OnModuleInit）：
- 在 `config.bootstrap.ts` 中确保 `security.verification` 命名空间与上述条目存在。

## 验证码与密码找回 API
保持现有登录态改密接口，新增未登录场景：
- POST `/auth/password/forgot`：请求发送验证码
  - body: `{ email: string }`
  - 行为：
    - 若 `enablePasswordReset=false`，返回 400。
    - 查找用户：`User.email == email` 或 `UserContact(channel=email,value=email)` -> 定位到 userId；
    - 生成验证码，存入 `Verification` 表，`identifier = password:email.toLowerCase()`；
    - 发送邮件，模板 `password-code.html`；
    - 响应 `{ success: true }`（不暴露是否存在用户）。
- POST `/auth/password/confirm`：使用验证码重置密码
  - body: `{ email: string, code: string, password: string }`
  - 校验验证码有效性与 TTL；匹配后删除；更新用户密码，`passwordNeedsReset=false`，`passwordUpdatedAt=now()`。
  - 响应 `{ success: true }`。

接口安全与速率：
- 短期内先按 email-key 做简单频控（基于 `Verification` 近一小时计数）；到阈值则 429/400。
- 记录 IP/UA 到日志，便于后续完善。

## 多邮箱绑定 API
需要登录态：
- GET `/auth/contacts/email`：列出当前用户邮箱联系人（含主/副、验证状态）。
- POST `/auth/contacts/email`：添加邮箱（进入 `PENDING` 验证状态，发送验证码）。
- POST `/auth/contacts/email/verify`：使用验证码完成验证（置 `VERIFIED`，可选同步为主邮箱）。
- PATCH `/auth/contacts/email/:contactId/primary`：设为主邮箱（同步到 `User.email`）。
- DELETE `/auth/contacts/email/:contactId`：移除副邮箱（禁止删除主）。

手机号绑定 API（预留，受开关控制，若未启用则 400）：
- GET/POST/VERIFY/PATCH/DELETE 同上（channel=phone），短信发送接口暂留空实现或 TODO。

## 管理端用户详情（接口准备）
- 扩展现有用户详情 DTO：附带 `contacts` -> 仅 email/phone 的列表，包含 `isPrimary`、`verification`、`verifiedAt`。
- 若尚无专门端点，可在现有 admin 用户详情接口中 include。

## 邮件发送与模板
- 已有 `MailService` 基于 `SMTP_*` 环境变量。
- 模板：`backend/src/mail/templates/password-code.html`（已创建）。
- 短期内可在 `AuthService` 中用内联 + 模板二选一（后续抽象 TemplateRenderer）。

## 环境变量
- 新增 `backend/.env.sample`（已创建），包含 `SMTP_*`、`MAIL_FROM`、`DEFAULT_ADMIN_PASSWORD` 示例。

## 任务清单（后端）
- [ ] Bootstrap：`security.verification` 命名空间 + 默认条目
- [ ] Seed/Ensure `ContactChannel`：`email`、`phone`
- [ ] API：`POST /auth/password/forgot` 与 `POST /auth/password/confirm`
- [ ] 速率限制（轻量）：每邮箱每小时 <= N 次
- [ ] API：邮箱联系人 CRUD + 验证 + 设主
- [ ] 同步主邮箱到 `User.email`；联动 `User.emailVerified`
- [ ] 管理端用户详情：附带 email/phone 联系人列表
- [ ] 单元测试：验证码生成/比对、过期、重复请求覆盖
- [ ] 文档：接口说明与错误码表

## 接受标准（后端）
- 未登录忘记密码流程闭环：请求验证码 -> 验证 -> 重置成功
- 多邮箱：可添加、验证、设主；副邮箱可用于找回密码
- 配置开关变更立即生效；未启用的功能返回 400/禁用
- 邮件可正确发送（本地需配置 SMTP）
