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

仅陪伴模式使用。系统按当前用户、当前会话中已保存的 `role=user` 消息计数。少于 8 次时只返回准备进度，不公开早期状态快照：

```json
{
  "status": "collecting",
  "assessment": null,
  "progress": {
    "required": 8,
    "completed": 3,
    "remaining": 5
  },
  "disclaimer": "This experimental conversation state is not a medical assessment or diagnosis."
}
```

达到 8 次后返回最新展示安全状态和免责声明：

```json
{
  "status": "ready",
  "progress": {
    "required": 8,
    "completed": 8,
    "remaining": 0
  },
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

达到 8 次但没有可展示快照时：`{"status":"insufficient","assessment":null,"progress":{...},...}`。这通常表示历史数据没有状态快照，完成一轮新的陪伴对话后再试。

`progress.completed` 是实际成功保存的用户表达数，达到 8 后可以继续增长；`remaining` 最低为 0。助手消息、其他用户、其他会话、失败或未保存的请求都不计入。删除会话后，进度随消息、快照和检查点一并清零。此接口不返回内部证据、风险等级、模型思考内容或摘要；8 次门槛只控制展示准备度，不是量表有效性判断。

## 其他接口

- `GET /api/health`：Flask 健康检查。
- `POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`：认证。
- `GET /api/users/me`、`GET /api/users/me/messages`、`DELETE /api/users/me/messages`：当前用户。
- `GET /api/users`：管理员用户目录。每项包含 `id`、`username`、`student_id`、`is_admin`、`created_at`、`last_login` 和 `chat_count`。
- `GET /api/users/<id>/messages?limit=500`：管理员读取指定用户最近的消息；每项包含 `id`、`role`、`content`、`session_id` 和 `created_at`。`limit` 默认 100，并被限制在 1–500；接口按时间倒序返回，管理页再按会话分组并在会话内按时间正序展示。没有 `session_id` 的旧消息归入“历史未分组”。
- `GET /api/admin/export-all`：管理员下载全站聊天 JSON；导出包含用户资料和聊天正文，不包含状态快照、风险证据或 Pi 上下文摘要。

管理员接口需要已登录账号的 `is_admin` 数据库标记：未登录返回 `401`，普通用户返回 `403`。前端权限判断只负责导航体验，真正的访问控制始终由 Flask `admin_required` 完成。管理页固定请求 `limit=500`；如果 `chat_count` 大于实际加载数，会提示使用全量导出。

旧 `POST /api/emotions/analyze`、`/api/deepseek/chat` 和浏览器提交完整历史的兼容路径已移除。
