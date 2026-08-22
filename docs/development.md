# 开发与运行

## 环境要求

- Python 3.12
- Node.js 22
- npm 10

## 首次安装

```powershell
python -m venv templates\.venv
templates\.venv\Scripts\python.exe -m pip install -r templates\requirements.txt
npm.cmd ci --prefix agent-service
npm.cmd ci --prefix web
Copy-Item templates\.env.example templates\.env
```

## 环境变量

编辑 `templates/.env`：

| 变量 | 说明 |
| --- | --- |
| `SECRET_KEY` | Flask Session 的强随机密钥，必填 |
| `DEEPSEEK_API_KEY` | 仅 Node Pi Agent 使用，必填 |
| `AGENT_HOST` | Node 监听地址，默认 `127.0.0.1` |
| `AGENT_PORT` | Node 监听端口，默认 `8787` |
| `AGENT_BASE_URL` | Flask 到 Node 的 loopback 地址，默认 `http://127.0.0.1:8787` |
| `CHAT_DB_PATH` | 可选 SQLite 路径 |
| `APP_DEBUG` / `HOST` / `PORT` | Flask 本地运行设置 |
| `SESSION_COOKIE_NAME` | Session Cookie 名称，默认 `lx_session` |
| `SESSION_COOKIE_SECURE` / `SESSION_COOKIE_SAMESITE` | HTTPS Cookie 与跨站策略；本地默认 `false` / `Lax` |
| `SESSION_TTL` | 登录会话有效秒数，默认 `604800` |
| `TRUST_PROXY_HEADERS` | 是否信任反向代理头；仅可信代理覆写头时开启 |
| `DEV_FRONTEND_ORIGIN` | Vite 开发服务器允许的 CORS Origin，默认 `http://localhost:5173` |
| `MAX_CHECKPOINT_CHARS` | Flask 持久化检查点的字符上限，默认 `80000` |

不要提交 `templates/.env`。Flask 不需要直接读取或使用 DeepSeek Provider；该密钥只由 `agent-service` 进程取得。

## 管理员账号与查询

管理员没有单独的登录页，也没有默认管理员账号。先从 `/login` 注册普通账号，再在服务器终端授予数据库管理员标记：

```powershell
Set-Location templates
.venv\Scripts\python.exe -m flask --app server:app set-admin <username>
```

随后使用同一账号从 `/login` 登录，首页会显示“管理后台”入口，也可以直接打开 `/admin`。管理页提供称呼/学号搜索、用户列表、消息数量、按会话查看最近最多 500 条聊天，以及全量 JSON 导出。页面只读，不提供删除数据或修改权限的操作。

CLI 必须连接到与正在运行的 Flask 相同的 `CHAT_DB_PATH`；通常由同一份 `templates/.env` 提供。授权后建议退出并重新登录，再打开 `/admin`。普通用户即使手工输入 `/admin` 或调用管理员 API，后端仍返回 `403`。

撤销管理员权限：

```powershell
.venv\Scripts\python.exe -m flask --app server:app revoke-admin <username>
```

导出文件含敏感聊天正文，请只在受控设备保存和传递。

## 状态回顾门槛

`GET /api/assessment` 不使用独立计数字段，而是实时统计当前用户、当前会话中已经成功保存的用户消息。少于 8 次时返回 `collecting` 和剩余次数；达到 8 次且存在快照时返回 `ready`；达到 8 次但没有快照时返回 `insufficient`。门槛只是界面准备度，不代表量表信效度或诊断有效性。

## 启动顺序

```powershell
# 终端 1：Node Pi Agent，必须先启动
scripts\start-agent-service.bat

# 终端 2：Flask
scripts\start-backend.bat
```

在浏览器打开 `http://127.0.0.1:5000`。不要以 `file://` 直接打开聊天 HTML。

修改 Vue 页面时，可额外启动：

```powershell
npm.cmd run dev --prefix web
```

## 测试与构建

```powershell
npm.cmd test --prefix agent-service
$env:PYTHONPATH = "$PWD\templates"
templates\.venv\Scripts\python.exe -m pytest tests\backend -q
npm.cmd run build --prefix web
```

`web` 的生产构建输出在 `templates/dist`。传统聊天页是独立 HTML，不由 Vite 构建。
