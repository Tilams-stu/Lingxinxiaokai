# 开发与运行

## 环境

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
| `MAX_CHECKPOINT_CHARS` | Flask 持久化检查点的字符上限，默认 `80000` |

不要提交 `templates/.env`。Flask 不需要直接读取或使用 DeepSeek Provider；该密钥只由 `agent-service` 进程取得。

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
