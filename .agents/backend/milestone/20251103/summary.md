# 2025-11-03 后端门户配置重构

## 本次交付要点
- [x] `/portal/home` 响应结构重构：移除 `user`/`header`，Hero 背景支持多图并输出绝对 URL，导航按钮新增 `icon` 字段，卡片改为字符串 ID 数组。
- [x] 引入 `PortalConfigModule`，通过 KV 配置中心（`portal.home/config`）集中管理 Hero、导航与卡片可见性，提供增删改查接口：
  - `PATCH /admin/portal/config/hero` 更新副标题；
  - `POST|PATCH|DELETE|PATCH /hero/backgrounds[...]` 维护背景图、排序；
  - `POST|PATCH|DELETE|PATCH /navigation[...]` 维护导航项、排序；
  - `PATCH /cards/:id` 更新卡片可见性（支持角色 / 用户粒度和访客开启）。
- [x] 后端使用新权限 `portal.manage.home` 保护上述接口，并自动赋予管理员角色；默认配置包含卡片注册表及预设可见性。
- [x] 新增环境变量 `APP_PUBLIC_BASE_URL`，用于生成附件绝对访问地址；后端读取附件公开链接并在 Hero 背景中输出。
- [x] `PortalService` 改造为读取动态配置并依据用户角色 / 用户 ID 过滤可见卡片。

## 接口变更概览
| 方法 | 路径 | 说明 | 权限 |
| ---- | ---- | ---- | ---- |
| GET | `/portal/home` | 门户首页数据（hero/background[], navigation[], cards[]） | 可选登录 |
| GET | `/admin/portal/config` | 门户配置详情（含注册卡片） | `portal.manage.home` |
| PATCH | `/admin/portal/config/hero` | 更新 Hero 副标题 | `portal.manage.home` |
| POST | `/admin/portal/config/hero/backgrounds` | 新增 Hero 背景图 | `portal.manage.home` |
| PATCH | `/admin/portal/config/hero/backgrounds/:id` | 更新背景图附件 / 描述 | `portal.manage.home` |
| PATCH | `/admin/portal/config/hero/backgrounds/reorder` | 调整背景图顺序 | `portal.manage.home` |
| DELETE | `/admin/portal/config/hero/backgrounds/:id` | 删除背景图 | `portal.manage.home` |
| POST | `/admin/portal/config/navigation` | 新增导航链接 | `portal.manage.home` |
| PATCH | `/admin/portal/config/navigation/:id` | 更新导航项 | `portal.manage.home` |
| PATCH | `/admin/portal/config/navigation/reorder` | 调整导航顺序 | `portal.manage.home` |
| DELETE | `/admin/portal/config/navigation/:id` | 删除导航项 | `portal.manage.home` |
| PATCH | `/admin/portal/config/cards/:id` | 更新卡片可见性配置 | `portal.manage.home` |

## 配置存储结构
```jsonc
{
  "hero": {
    "subtitle": "ALPHA 测试阶段",
    "backgrounds": [
      {
        "id": "uuid",
        "attachmentId": "附件 ID",
        "description": "顶部标题",
        "imageUrl": "由 APP_PUBLIC_BASE_URL 拼接生成"
      }
    ]
  },
  "navigation": [
    {
      "id": "map_seven",
      "label": "地图（七周目）",
      "tooltip": "HydCraft 七周目地图浏览",
      "url": "https://map.hydcraft.com",
      "available": true,
      "icon": "i-heroicons-map"
    }
  ],
  "cards": {
    "profile": {
      "enabled": true,
      "allowGuests": false,
      "allowedRoles": [],
      "allowedUsers": []
    }
  }
}
```

## 环境变量
- 新增：`APP_PUBLIC_BASE_URL`（默认 `http://localhost:3000`），用于生成绝对资源路径。

## 数据初始化
- 提供一次性脚本 `pnpm --filter @hydroline/backend seed:portal-home` 初始化 `portal.home/config`：
  - 写入默认副标题、默认卡片可见性；
  - 若尚未设置背景图，则自动将前端资源 `image_home_background_240730.webp` 种入附件系统并登记为首张背景。
- 可按需多次运行，该脚本仅在缺少数据时才写入，避免运行时自动改写配置。

## 测试与验证
- `pnpm --filter @hydroline/backend build`
- 手动调用 `GET /portal/home` 验证响应结构。
- 管理端接口验证（本地环境）：按顺序执行背景图增删改、导航排序、卡片权限切换，确认 KV 配置正确更新。
