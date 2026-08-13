# API 与数据安全

## 认证、权限与数据

- 认证仅使用签名 Flask Session Cookie；不在浏览器保存 token，也不支持 Bearer Token 登录。
- 普通用户只能读取或删除自己的会话；用户列表、其他用户消息和导出仅管理员可用。
- 聊天正文保存在 SQLite；管理员导出不包含状态快照或 Pi 上下文摘要。
- 删除会话会同步删除其消息、状态快照与上下文检查点。

## 密钥与网络边界

- `templates/.env`、SQLite、备份和导出文件不得提交 Git 或放入 Web 目录。
- `SECRET_KEY` 必须使用强随机值。`DEEPSEEK_API_KEY` 只由本机 `agent-service` 进程读取，绝不返回给浏览器。
- Flask 仅接受 loopback `AGENT_BASE_URL`，防止把私有会话历史发送给远程主机。
- 浏览器只调用 Flask `/api/*`；Node Agent 不对浏览器公开。

## AI 边界

- 浏览器不能提交 `history` 或 `messages`，避免伪造服务端会话上下文。
- Node 仅开放两个本地只读工具；没有 Bash、文件、网络、数据库或任意 HTTP 工具。
- 风险规则是最低防线；结构化预检只能提高规则等级。高/紧急风险不调用普通 Agent 或工具。
- `/api/assessment` 仅返回展示安全的六项状态，不返回内部证据、风险等级、模型思考或摘要。

## 发布检查

```powershell
git diff --check
npm.cmd test --prefix agent-service
$env:PYTHONPATH = "$PWD\templates"
templates\.venv\Scripts\python.exe -m pytest tests\backend -q
```

正式 HTTPS 环境设置 `SESSION_COOKIE_SECURE=true`；仅当反向代理可信并会覆写转发头时才设置 `TRUST_PROXY_HEADERS=true`。
