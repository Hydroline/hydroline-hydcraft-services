# 需求规划 Todo

- [x] 梳理现有公司/个体户模型（前后端数据结构、API、视图）
- [x] 设计新增数据点（用户名下公司数、个体户数、加入职员数）及 Dashboard 展示方案
- [x] 将“提交注册申请”功能嵌入 `UModal` 并确认交互、表单字段（名称/行业/类型/介绍/法人选择）
- [x] 规划法人选择下拉/搜索（复用用户列表 API 或新增接口）
- [ ] 修复 `CompanyDashboardView` 的响应式依赖错误（`inviteKeyword` 等提前声明），确保统计卡片、列表稳定渲染
- [ ] 细化申请/邀请/入职 Modal 的字段与交互（只保留名称/类型/行业/法人/简介/介绍，避免多余编号、邮箱、电话），并在弹窗内加入 Motion V 模糊/渐显效果
- [ ] 确保后台 `CreateCompanyApplicationDto` 及前端表单只暴露必要字段：公司名称、行业、公司类型、详细介绍、法人，个体户开关，去掉编号/联系邮箱/电话
- [ ] 统一职位体系为“权责主体”视角（法人/董事/监事/经理/职员等），同步政府备案字段与 `CompanyPosition`；后台按此结构展示公司详情，参考 `userdetail.vue`
- [ ] 进一步定义职位用途：董事会成员可审批，法人对外承担，经理负责运营，职员执行，监事审计；在前端提供下拉选项并将角色/岗位信息发送给后台
- [ ] 打通玩家申请公司与个体户流程：前端申请入口、后台表单/接口、法人邀请、普通玩家加入公司/个体户都可走统一接口，保证 `companyStore` 能同步更新
- [ ] 后台管理员直接创建公司和个体户（`/admin/company/registry` 页面新增 Modal/表单），不再依赖申请流程同时能指定法人与持有人
- [ ] 增设后台个体户管理模块；管理员可查看公司/个体户详情时看到注册人、法人、下属职员及其职位、职业（延伸权限与岗位信息）
- [ ] 支持普通玩家在公司/个体户界面查阅可申请主体并主动发送入职申请（dashboard、法人邀请、入职推荐逻辑一致）
- [ ] 保持公司/个体户数据与官网 `Hydroline` 主题一致：Form、Card、Modal 样式尽量沿用已有组件，少用 `UCard`，多用 `UModal` + `Motion` 的 blur/opacity 过渡
- [ ] 补全中国工商标准的行业与公司类型数据：`CompanyService.ensureBaselineMetadata` 使用 `ensure` 方法自动填充 `companyIndustry` 与 `companyType`
- [ ] 概览页 (`/company`) 新增 ECharts 全服注册量统计（公司 vs 个体户），调用 `/companies/statistics/registrations`，参考 `/server` 页的深色/刷新样式并包装 `Motion`
