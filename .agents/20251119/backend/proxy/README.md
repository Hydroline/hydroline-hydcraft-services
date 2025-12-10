# OAuth Proxy Serverless 设计规范

本规范用于约定 OAuth Proxy 中转服务（例如部署在腾讯云 Serverless）的请求/响应格式，以便 `backend/src/lib/proxy/oauth-proxy-client.ts` 能够稳定调用。

## 环境变量

后端通过以下环境变量配置中转服务：

- `OAUTH_PROXY_URL`（或兼容 `PROXY_URL`）：中转服务 HTTP 入口地址（`POST`）。
- `OAUTH_PROXY_KEY`（或兼容 `PROXY_KEY`）：中转服务鉴权密钥，将通过请求头 `x-proxy-key` 传入。

## 后端调用约定

当某个 OAuth Provider 的 `settings.providerProxyEnabled === true` 且以上环境变量存在时：

- 所有对该 Provider 配置的 OAuth HTTP 请求（token 交换、用户信息、头像等）将不再直连目标地址，而是改为向 `OAUTH_PROXY_URL` 发送一个 `POST` 请求。
- 中转服务根据收到的参数，在 Serverless 环境中发起真正的外部请求，并将结果原样或按规范包装后返回。

## 请求格式

`POST {OAUTH_PROXY_URL}`，`Content-Type: application/json`

请求头：

- `x-proxy-key: <OAUTH_PROXY_KEY>` 鉴权用，服务端必须验证。

请求体 JSON：

```jsonc
{
  "url": "https://oauth2.googleapis.com/token",      // 必填，目标 URL
  "method": "POST",                                // 必填，请求方法，默认 GET
  "headers": {                                       // 可选，转发给目标服务的请求头
    "Content-Type": "application/x-www-form-urlencoded",
    "Authorization": "Bearer ..."
  },
  "bodyType": "form" | "raw",                     // 可选，请求体类型
  "body": "client_id=...&code=..."                 // 可选，请求体字符串（若为 form 则为序列化字符串）
}
```

说明：

- `url`：可以是 OAuth token endpoint、userinfo endpoint 等。
- `method`：目前主要为 `GET` / `POST`，但不限制；中转服务应当原样使用。
- `headers`：只包含发给目标 OAuth 提供方的头部，不含 `x-proxy-key`。
- `bodyType`：
  - `form`：表示 `body` 内容是 `application/x-www-form-urlencoded` 的字符串；
  - `raw`：表示 `body` 原样透传（二进制场景可不使用 proxy，或后续扩展为 base64 编码）。
- `body`：
  - 目前约定为字符串；如有需要可扩展为 `null | string`。

## 响应格式

Serverless 中转服务应将目标 HTTP 响应包装为：

```jsonc
{
  "ok": true,                             // 是否为 2xx
  "status": 200,                          // 目标响应的 HTTP 状态码
  "headers": {                            // 目标响应头（可做白名单过滤）
    "content-type": "application/json"
  },
  "bodyType": "json" | "text" | "binary",
  "body": "..."                          // JSON 字符串 / 文本 / base64（二进制）
}
```

约定：

- 若目标请求失败（如网络错误、超时等），Serverless 应返回 `ok: false`，并设置合理的 `status`（如 500），以及可读的 `body` 文本描述原因。
- 对于 JSON 响应：
  - `bodyType: "json"`，`body` 为 JSON 字符串（`JSON.stringify` 后）；
- 对于文本响应：
  - `bodyType: "text"`，`body` 为 UTF-8 文本；
- 对于二进制（例如头像图片）：
  - `bodyType: "binary"`，`body` 为 base64 编码字符串，同时在 `headers["content-type"]` 中返回正确的 MIME 类型。

## 错误约定

当中转服务本身鉴权失败或其他内部错误时，应返回 HTTP 4xx/5xx，并使用如下结构：

```jsonc
{
  "ok": false,
  "status": 401,
  "error": "Invalid proxy key",
  "bodyType": "text",
  "body": "Invalid proxy key"
}
```

后端会将 `ok === false` 且 `status >= 400` 的情况视为上游错误，并在 OAuth 流程中转化为 `UnauthorizedException` 等 NestJS 异常。

## 参考测试用例

以下为可用于实现中转服务的输入/输出示例。

### 用例 1：Google OAuth Token 交换

**请求体**：

```jsonc
{
  "url": "https://oauth2.googleapis.com/token",
  "method": "POST",
  "headers": {
    "Content-Type": "application/x-www-form-urlencoded"
  },
  "bodyType": "form",
  "body": "client_id=xxx&client_secret=yyy&code=zzz&grant_type=authorization_code&redirect_uri=https%3A%2F%2Fexample.com%2Foauth%2Fproviders%2Fgoogle%2Fcallback"
}
```

**期望目标响应（Google 原始响应）**：

```jsonc
{
  "access_token": "ya29.a0Af...",
  "expires_in": 3599,
  "refresh_token": "1//0g...",
  "scope": "openid email profile",
  "token_type": "Bearer",
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij..."
}
```

**中转服务响应**：

```jsonc
{
  "ok": true,
  "status": 200,
  "headers": {
    "content-type": "application/json"
  },
  "bodyType": "json",
  "body": "{\n  \"access_token\": \"ya29.a0Af...\",\n  \"expires_in\": 3599,\n  \"refresh_token\": \"1//0g...\",\n  \"scope\": \"openid email profile\",\n  \"token_type\": \"Bearer\",\n  \"id_token\": \"eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...\"\n}"
}
```

### 用例 2：Google UserInfo 获取

**请求体**：

```jsonc
{
  "url": "https://www.googleapis.com/oauth2/v3/userinfo",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer ya29.a0Af..."
  },
  "bodyType": "raw",
  "body": null
}
```

**目标响应（Google 原始响应）**：

```jsonc
{
  "sub": "110169484474386276334",
  "name": "Jane Doe",
  "given_name": "Jane",
  "family_name": "Doe",
  "picture": "https://lh3.googleusercontent.com/a-/AOh14Gg...",
  "email": "janedoe@example.com",
  "email_verified": true,
  "locale": "en"
}
```

**中转服务响应**：

```jsonc
{
  "ok": true,
  "status": 200,
  "headers": {
    "content-type": "application/json"
  },
  "bodyType": "json",
  "body": "{\n  \"sub\": \"110169484474386276334\",\n  \"name\": \"Jane Doe\",\n  \"given_name\": \"Jane\",\n  \"family_name\": \"Doe\",\n  \"picture\": \"https://lh3.googleusercontent.com/a-/AOh14Gg...\",\n  \"email\": \"janedoe@example.com\",\n  \"email_verified\": true,\n  \"locale\": \"en\"\n}"
}
```

### 用例 3：头像图片获取

**请求体**：

```jsonc
{
  "url": "https://graph.microsoft.com/v1.0/me/photo/$value",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..."
  },
  "bodyType": "raw",
  "body": null
}
```

**目标响应（二进制图片）**：HTTP 200，`Content-Type: image/jpeg`，Body 为图片二进制。

**中转服务响应**：

```jsonc
{
  "ok": true,
  "status": 200,
  "headers": {
    "content-type": "image/jpeg"
  },
  "bodyType": "binary",
  "body": "<BASE64_ENCODED_IMAGE>"
}
```

实现提示：

- Serverless 侧可以使用 Node.js 原生 `fetch` 或 axios 发起外部 HTTP 请求；
- 注意隐藏/清洗响应中的敏感头部（如 `set-cookie`），仅保留 `content-type`、`cache-control` 等必要字段；
- 建议增加超时控制和简单重试策略，以避免挂死。
