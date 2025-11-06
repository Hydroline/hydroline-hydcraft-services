# 2025-11-06 API 路径前缀调整（前端）

## 变更摘要
- `apiFetch` 默认将相对路径规范化为 `/api/...`，并允许通过 `VITE_API_BASE_URL` 自定义域名。
- 所有调用 `apiFetch` 的模块去除手写 `/api`，保持业务路径，例如 `/auth/me`、`/luckperms/admin/overview`。

## 使用说明
- `VITE_API_BASE_URL` 建议填写服务根地址（如 `https://example.com`），无需附带 `/api`。
- 若需调用第三方完整 URL，可直接传入 `http` 开头的绝对路径，函数会跳过前缀拼接。

## 验证建议
```bash
pnpm --filter @hydroline/frontend dev
# 确认浏览器网络请求统一为 https://<host>/api/... 路径
```
