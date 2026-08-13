# HTTP API

所有公开 API 位于 Flask 的 `/api` 下，使用 Session Cookie；浏览器请求需携带 `credentials: "include"`。

## `POST /api/chat`

```json
{
  "mode": "companion",
  "session_id": "companion-001",
  "message": "最近因为考试有些焦虑，睡不好。",
  "stream": true
}
```

- `mode` 只能是 `companion` 或 `popsci`。
- `session_id` 为 1–128 位字母、数字、下划线或连字符。
- `message` 不能为空，最多 4,000 字符。
- 不允许提交 `messages` 或 `history`；服务端拥有会话历史。
- 同一用户同一会话正在运行时返回 `409 {"error":"session_busy"}`。

非流式成功响应：`{"reply":"..."}`。

流式响应使用 `text/event-stream`：

```text
event: delta
data: {"content":"回复片段"}

event: error
data: {"message":"local agent unavailable"}

event: done
data: {}
```

`analysis` 可作为内部进度事件出现；客户端不应把它视为诊断或向用户展示。每轮只发送一个 `done`。科普资料卡命中时，`delta` 可额外带 `sources` 数组。

## `GET /api/assessment?session_id=...`

仅陪伴模式使用。返回最新展示安全状态和免责声明：

```json
{
  "status": "ready",
  "assessment": {
    "state": {
      "emotions": "焦虑",
      "concerns": "学业或考试；睡眠",
      "functioning": "unknown",
      "protectiveFactors": "提到可联系的支持",
      "evidenceSufficiency": "有限",
      "followUpTarget": "睡眠情况与对日常的影响"
    },
    "created_at": "2026-08-13T00:00:00Z"
  },
  "disclaimer": "This experimental conversation state is not a medical assessment or diagnosis."
}
```

无可展示快照时：`{"status":"insufficient","assessment":null,...}`。此接口不返回内部证据、风险等级、模型思考内容或摘要。

## 其他接口

- `GET /api/health`：Flask 健康检查。
- `POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`：认证。
- `GET /api/users/me`、`GET /api/users/me/messages`、`DELETE /api/users/me/messages`：当前用户。
- `GET /api/users`、`GET /api/users/<id>/messages`、`GET /api/admin/export-all`：管理员接口。

旧 `POST /api/emotions/analyze`、`/api/deepseek/chat` 和浏览器提交完整历史的兼容路径已移除。
