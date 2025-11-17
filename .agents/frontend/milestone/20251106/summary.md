# 2025-11-06 LuckPerms 权限展示（前端）

## 交付概览
- 玩家档案页 (`ProfileView`) 新增「Minecraft 权限组」卡片：从会话用户的 `authmeBindings[].luckperms` 数据渲染主组与继承组，提供头像、账号以及权限标签展示。
- 用户信息页 (`ProfileInfoView`) 中的 AuthMe 卡片整合 LuckPerms 信息，绑定列表支持实时显示主组与上下文（server/world/expiry），统一透传到 `MinecraftSection`。
- 新增管理页面 `/admin/luckperms`：复用配置中心权限，可查看 LuckPerms MySQL 状态、调整连接配置并触发刷新，UI 结构与 AuthMe 状态页一致。
- 创建 `@/utils/luckperms` 辅助方法，负责解析后端返回的权限组、上下文和人类可读的提示文案，供多个视图共享。
- 管理侧导航（AdminShell）追加「LuckPerms 管理」入口，保持信息同步模块的导航一致性。

## 交互细节
| 场景 | 行为 | 说明 |
| ---- | ---- | ---- |
| 玩家档案 | 展示权限标签 | 主组使用实心主色徽章，继承组使用柔和徽章，悬停可查看上下文与过期时间。 |
| 用户信息 → 绑定列表 | 查看/解绑 | LuckPerms 信息与 AuthMe 同卡片展示，后台服务不可用时提示“尚未同步 LuckPerms 权限数据”。 |
| 管理端 LuckPerms | 保存配置 | 提交表单即调用 `/api/luckperms/admin/config`，成功后自动刷新健康状态。 |

## 运行验证
```bash
pnpm --filter @hydroline/frontend build
pnpm --filter @hydroline/frontend preview -- --host
# 访问 http://localhost:4173/admin/luckperms 检查配置页面
```
- 建议配合真实账户登录后查看玩家档案页，确认权限组标签与 LuckPerms 数据一致。
