# 常见问题

## Flask 能打开，聊天返回 502

先确认 Node 服务已启动：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

若失败，检查 `templates/.env` 中的 `DEEPSEEK_API_KEY`、`AGENT_HOST`、`AGENT_PORT` 与 `AGENT_BASE_URL`，然后重新运行 `scripts/start-agent-service.bat`。不要把密钥打印到终端或日志。

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
