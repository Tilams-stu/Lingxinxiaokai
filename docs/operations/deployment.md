# 部署与发布

本项目当前定位为本地实验。Flask 是唯一公开服务；Node Pi Agent 只能绑定 loopback，不能直接对外暴露。

## 发布前准备

```powershell
npm.cmd ci --prefix agent-service
npm.cmd test --prefix agent-service
python -m venv templates\.venv
templates\.venv\Scripts\python.exe -m pip install -r templates\requirements.txt
$env:PYTHONPATH = "$PWD\templates"
templates\.venv\Scripts\python.exe -m pytest tests\backend -q
npm.cmd ci --prefix web
npm.cmd run build --prefix web
```

将 `templates/.env.example` 复制为私有 `templates/.env`，填写强随机 `SECRET_KEY` 和有效 `DEEPSEEK_API_KEY`。不要把 `.env`、SQLite、备份或导出数据放入发布包或静态目录。

## 本地/演示启动

```powershell
# 终端 1：Pi Agent（loopback）
scripts\start-agent-service.bat

# 终端 2：Flask
scripts\start-backend.bat
```

先确认 Node 健康检查 `http://127.0.0.1:8787/health`，再打开 Flask 的 `http://127.0.0.1:5000`。

## 反向代理与 HTTPS

- 生产/演示入口应由 HTTPS 终止，设置 `SESSION_COOKIE_SECURE=true`。
- 只有可信反向代理会覆盖转发头时才开启 `TRUST_PROXY_HEADERS=true`。
- 代理必须关闭 `text/event-stream` 缓冲，保证 `delta` 实时转发。
- 无论 Flask 如何对外监听，`AGENT_HOST` 始终必须是 `127.0.0.1`、`localhost` 或 `::1`。

## 发布后人工检查

1. 检查 Flask 与 Node 的两个健康接口。
2. 注册测试账号，分别测试陪伴与科普。
3. 检查“状态回顾”在信息不足与有明确表达时的展示。
4. 检查科普资料卡来源行。
5. 人工复核 `12356`、`110`、`120` 与校园支持资源文本后，再测试固定危机回复。

该实验项目不应被部署为无人值守的医疗、危机干预或正式心理测评服务。
