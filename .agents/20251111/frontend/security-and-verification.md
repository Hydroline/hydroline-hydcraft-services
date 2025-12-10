# 2025-11-11 前端实施清单：账户安全与身份验证改造

本页汇总“登录忘记密码（验证码+邮箱）”、“Profile 新增『身份验证/账户安全』页面”、“邮箱多绑定（主/副）”、“手机号（预留）”、“配置开关动态渲染”、“管理员用户详情展示邮箱绑定信息”等前端工作。

## 页面与交互
- 登录对话框（`AuthDialog.vue`）：
  - [ ] 在邮箱登录区域添加“忘记密码”入口
  - [ ] 弹出找回密码对话框：
    - Step 1：输入邮箱 -> 发送验证码（展示『已发送到 xxx √』提示，含倒计时重发）
    - Step 2：填写验证码 + 新密码 -> 提交 -> 成功提示并关闭
  - [ ] 失败错误信息国际化/本地化（沿用 `translateAuthErrorMessage`）

- Profile：新增菜单『身份验证』（或『账户安全』）
  - 位置：`/src/views/user/Profile/` 新增视图与侧边栏入口（`ProfileSidebar.vue`）
  - [ ] 区块 1：重置密码（邮箱验证码）
  - [ ] 区块 2：邮箱管理
    - 列表展示绑定的邮箱（主/副、验证状态）
    - 添加邮箱 -> 发送验证码 -> 验证通过 -> 可设为主邮箱
    - 设为主邮箱（主邮箱在顶部）
    - 删除副邮箱
  - [ ] 区块 3：手机号管理（预留）
    - 若未启用手机号验证（来自配置），则不渲染此区块

- Profile 基础信息页（`ProfileInfoBasicView.vue`）：
  - [ ] 编辑模式下移除邮箱/手机号的修改入口，仅展示；引导用户去『身份验证』页管理

- 管理端用户详情对话框：
  - [ ] 展示用户邮箱绑定信息（主/副、是否验证）；手机号（若存在）

## 配置开关（前端渲染）
- 从后端配置读取：（命名空间 `security.verification`）
  - `enableEmailVerification`（默认 true）
  - `enablePhoneVerification`（默认 false）
  - `enablePasswordReset`（默认 true）
- [ ] 将开关注入 `feature` 或 `portal-config` store，并在相关组件中按需渲染/禁用

## Store 与 API 对接
- `auth` store：
  - [ ] `forgotPassword(email)` -> POST `/auth/password/forgot`
  - [ ] `confirmPasswordReset({ email, code, password })` -> POST `/auth/password/confirm`
  - [ ] （保留现有登录后改密 API）

- `user`/`auth` store（或新建 `contacts` store）：
  - [ ] `listContacts(channel='email')` -> 列出绑定邮箱
  - [ ] `addEmail(email)` -> 添加邮箱并触发验证码发送
  - [ ] `verifyEmail({ email|contactId, code })` -> 验证绑定
  - [ ] `setPrimaryEmail(contactId)` -> 设主
  - [ ] `removeEmail(contactId)` -> 删除

## 复用与组件化
- [ ] 新建 `CodeSendDialog.vue` 通用组件：
  - props: `visible`, `targetHint`, `onSend`, `onConfirm` 等
  - 展示“已发送到 xxx √”，倒计时与重发按钮
  - 用于登录忘记密码、邮箱新增验证等场景

## 文案与校验
- [ ] 新密码强度和长度校验（本地提示：至少 8 位）
- [ ] 邮箱格式校验
- [ ] 失败错误提示（APIError -> 翻译）

## 任务清单（前端）
- [ ] 登录对话框：忘记密码入口 + 找回流程对话框
- [ ] 新增 `CodeSendDialog.vue` 通用验证码对话框
- [ ] Profile：新增『身份验证』页面 + 侧边栏入口
- [ ] Profile 基础信息页：移除邮箱/手机号编辑
- [ ] Store：新增/扩展 actions 对接后端接口
- [ ] 配置开关接入并控制渲染
- [ ] 管理端用户详情对话框：邮箱绑定信息展示
- [ ] 单元/端到端测试要点：
  - 找回密码 happy path
  - 添加副邮箱并设为主
  - 配置开关关闭时元素不渲染
