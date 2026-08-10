# HTTP API

## 通用约定

- 基础路径：同源 `/api`。
- 请求/响应编码：UTF-8 JSON；导出接口除外。
- 认证：Flask Session Cookie，浏览器必须使用 `credentials: include`。
- 成功响应禁止缓存；API 响应带 `Cache-Control: no-store, private`。
- 错误结构：`{"error":"错误码","message":"用户可读信息"}`。
- 常用状态码：400 参数错误、401 未登录/凭据错误、403 权限不足、409 唯一性冲突、413 内容过大、429 限流、502 AI 上游不可用。

## 认证

### `POST /api/auth/register`

```json
{
  "username": "testuser",
  "student_id": "20260001",
  "password": "至少八位密码"
}
```

- 称呼：3–32 个不含空白的可见字符，全局唯一。
- 学号：1–32 个不含空白的可见字符，全局唯一。
- 密码：至少 8 位，数据库只保存 Werkzeug 密码哈希。
- 成功：201，返回 `{"user": {...}}` 并建立 Session；不会返回 token。
- 限流：每 IP 每小时 5 次。

### `POST /api/auth/login`

请求字段与注册相同。称呼、学号和密码必须同时匹配。成功返回用户并刷新 Session；失败返回 401 `invalid_credentials`。限流为每 IP 每分钟 10 次。

### `POST /api/auth/logout`

清空 Session，返回 `{"ok":true}`。

## 用户与管理员

| 方法与路径 | 权限 | 说明 |
| --- | --- | --- |
| `GET /api/users/me` | 登录 | 当前用户资料，不含密码哈希 |
| `GET /api/users` | 管理员 | 用户列表和聊天条数 |
| `GET /api/users/me/messages?limit=200` | 登录 | 当前用户消息，limit 范围 1–2000 |
| `DELETE /api/users/me/messages?session_id=...` | 登录 | 删除当前用户指定会话 |
| `GET /api/users/<id>/messages?limit=100` | 管理员 | 指定用户消息，limit 范围 1–500 |
| `GET /api/admin/export-all` | 管理员 | 下载包含账号标识和聊天正文的 `chat_export.json` |

导出文件属于敏感数据，只能在授权设备上保存和传输。

## 聊天

### `POST /api/chat`

```json
{
  "mode": "companion",
  "session_id": "companion-20260810-001",
  "messages": [
    {"role": "user", "content": "最近有些焦虑"}
  ],
  "stream": true
}
```

约束：

- `mode` 只能是 `companion` 或 `popsci`。
- `session_id` 为 1–128 位字母、数字、下划线或连字符。
- `messages` 为 1–20 条；角色只能是 `user` 或 `assistant`；最后一条必须是 `user`。
- 每条内容不能为空，最长 4000 字符。
- `system` 消息会被拒绝。模型名、温度和令牌上限由服务端固定；当前实现会忽略未识别的顶层字段，客户端不应发送它们。
- 限流：每登录用户每分钟 30 次。

非流式成功响应：

```json
{"reply":"助手完整回复"}
```

流式响应的媒体类型为 `text/event-stream`，每帧使用一行 `data:` JSON：

```text
data: {"type":"delta","content":"片段"}

data: {"type":"error","message":"AI 服务暂时不可用"}

data: {"type":"done"}
```

正常结束或错误结束都只发送一次 `done`。只有拿到完整回复后才保存消息对；危机固定回复也会保存完整的一问一答。

## 情绪分析

### `POST /api/emotions/analyze`

```json
{"mode":"companion","text":"今天有点难过"}
```

- 需要登录；模式与聊天接口一致；文本最长 500 字符。
- 限流：每用户每分钟 10 次。
- 返回 `happy`、`sad`、`angry`、`calm`、`surprised`、`fear` 六个 0–1 分数。
- 分析结果是粗略展示，不是医学诊断；文本和结果不额外写入数据库。

## 健康检查

`GET /api/health` 无需登录、无限流，成功返回 `{"status":"ok"}`。它只证明 Flask 能响应，不会主动探测 DeepSeek。
