# 常见问题

## Flask 能打开，聊天返回 502

先确认 Node 服务已启动：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

若失败，检查 `templates/.env` 中的 `DEEPSEEK_API_KEY`、`AGENT_HOST`、`AGENT_PORT` 与 `AGENT_BASE_URL`，然后重新运行 `scripts/start-agent-service.bat`。不要把密钥打印到终端或日志。

`GET /health` 返回 200 只表示 Node 进程正在监听，不代表 DeepSeek 密钥有效。若 `/turn` 或 Flask 聊天返回 `Connection error`、`401` 或上游不可用，请在凭据平台确认密钥仍有效、账户有模型权限且网络可访问 `https://api.deepseek.com/v1`，然后重启 Agent。不要把密钥写进 README、截图或浏览器代码。

## Node 服务无法启动

确认 Node 22 与依赖：

```powershell
node --version
npm.cmd ci --prefix agent-service
```

`AGENT_HOST` 只能是 loopback 地址。端口被占用时可修改 `AGENT_PORT`，并同步修改 `AGENT_BASE_URL`。

## Flask 无法启动

确认 `templates/.venv`、`templates/.env` 存在，并使用 `scripts/start-backend.bat`。健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/health
```

## 流式回复没有逐段显示

确认浏览器访问的是 Flask 地址而非 `file://`。如使用反向代理，需要禁用对 `text/event-stream` 的缓冲；一轮正常结束应只收到一个 `done`。

## Vue 站点返回 503

构建前端：

```powershell
npm.cmd ci --prefix web
npm.cmd run build --prefix web
```

传统聊天页 `/info` 与 `/companion` 不依赖 Vite 构建。

## 登录成功但无法进入 `/admin`

管理员没有独立登录账号。确认已经从 `/login` 注册，并在与运行实例相同的数据库上执行 `set-admin <username>`。如果 `CHAT_DB_PATH` 不同，CLI 可能修改了另一份 SQLite。授权后退出并重新登录；普通用户调用管理员接口会得到 `403`。

## 状态回顾一直显示“还需要 n 条”

只有成功得到回复并写入数据库的用户消息才计数。失败请求、助手消息、其他会话或科普会话不会推进当前陪伴会话。达到 8 次仍无快照时会显示 `insufficient`，继续完成一轮新的陪伴对话后重试。
