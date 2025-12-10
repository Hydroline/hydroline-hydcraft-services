# AuthMe 集成接口自测脚本

> 需提前在 KV 中开启 `authmeLoginEnabled`/`authmeRegisterEnabled` 并准备有效的 AuthMe 账号 (`<AUTHME_ID>`/`<AUTHME_PASS>`)，下列命令默认 API 基础地址 `http://localhost:3000`。

## 1. AuthMe 注册
```bash
curl -i http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "AUTHME",
    "authmeId": "<AUTHME_ID>",
    "password": "<AUTHME_PASS>",
    "rememberMe": true
  }'
```
- 期待响应：`200`，`data.tokens.accessToken` 非空，`data.user.authmeBinding.authmeUsername` 匹配输入。
- 若账号不存在 => `400` + `AUTHME_ACCOUNT_NOT_FOUND`。

## 2. AuthMe 登录
```bash
curl -i http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "AUTHME",
    "authmeId": "<AUTHME_ID>",
    "password": "<AUTHME_PASS>",
    "rememberMe": false
  }'
```
- 期待响应：`data.tokens.accessToken` 为新的 session token，可携带 `Authorization: Bearer <token>` 请求 `/auth/session`。
- 若未绑定 => `400` + `AUTHME_NOT_BOUND`。

## 3. 绑定 / 解绑
```bash
ACCESS_TOKEN="<登录获取的 token>"
# 绑定
curl -i http://localhost:3000/api/authme/bind \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"authmeId": "<AUTHME_ID>", "password": "<AUTHME_PASS>"}'

# 解绑
curl -i -X DELETE http://localhost:3000/api/authme/bind \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
- 成功响应：`{ "user": { ... , "authmeBinding": null|{...} } }`
- 高并发/多次请求命中限流 => `429`。

## 4. 功能开关 & 健康检查
```bash
curl -s http://localhost:3000/api/auth/features | jq
curl -s http://localhost:3000/api/auth/health/authme | jq
```

## 5. 断联演练
1. 暂时在 KV 中设定 `authme.db.enabled=false`；等待 15s；
2. 重新调用 `/api/auth/login` (AUTHME) 或 `/api/authme/bind`；应返回 503 + `AuthMe 数据库暂时不可用...`。
