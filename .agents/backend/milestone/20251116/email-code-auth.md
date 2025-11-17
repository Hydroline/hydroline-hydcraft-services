# 2025-11-16 Backend TODO List

- [x] 新增公开接口 `/auth/login/code`、`/auth/register/code`，校验邮箱并写入带过期时间的验证码记录（并使用邮件模板发送），每小时频控 5 次。
- [x] 为邮箱验证码登录引入 `EMAIL_CODE` 模式，校验验证码后创建会话并标记用户邮箱已验证。
- [x] 注册（邮箱与 AuthMe 两种模式）强制要求邮箱验证码，消费注册验证码后创建账号并将 `emailVerified` 设为 `true`。
- [x] 后端 DTO/校验规则同步调整，后台 `pnpm build` 通过。
