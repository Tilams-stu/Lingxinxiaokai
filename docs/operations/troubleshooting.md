# 常见故障排查

## 后端没有启动

先从仓库根目录执行：

```powershell
scripts\start-backend.bat
```

常见原因：

- `templates/.venv` 不存在：重新创建虚拟环境并安装 `templates/requirements.txt`。
- `templates/.env` 不存在：从 `.env.example` 复制并填写。
- 提示密钥无效：`SECRET_KEY` 或 `DEEPSEEK_API_KEY` 仍为空或占位值，这是有意的安全阻断。
- 5000 端口被占用：用 `Get-NetTCPConnection -LocalPort 5000` 找到监听进程，确认归属后再处理，或在 `.env` 修改 `PORT`。
- 从错误目录运行旧脚本：使用根目录 `scripts\start-backend.bat`；兼容入口也会按脚本位置解析路径。

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/health
```

## 注册或登录失败

- 注册称呼必须为 3–32 个无空白可见字符，密码至少 8 位。
- 学号和称呼都必须唯一；重复学号返回“该学号已注册”。
- 登录必须同时输入注册时的称呼、学号和密码。
- 401 表示凭据错误或 Session 失效；403 表示已经登录但没有管理员权限。
- 429 表示触发限流，等待窗口结束，不要反复重试。
- 页面提示“无法连接服务”时，先检查 Flask，而不是重新注册账号。

项目没有预置通用账号或测试密码。忘记密码当前没有自助重置功能，需要负责人按新的安全流程单独处理，不能从数据库找回明文密码。

## 启动时报重复学号

这是迁移安全阻断，不是 SQLite 损坏。保持服务停止，先备份数据库，再在副本中核对重复记录的真实归属。不要删除聊天记录、随机改学号或移除唯一索引来绕过启动。

## Vue 页面缺失或返回 503

说明 `templates/dist/index.html` 不存在。重新构建：

```powershell
Set-Location web
npm.cmd install
npm.cmd run build
```

## Vite/Rolldown 原生模块不匹配

这通常发生在开发服务器仍占用 `web/node_modules` 时安装了另一版 Vite。先正常停止该项目的 Vite 进程，再在 `web` 目录按锁文件重装：

```powershell
Set-Location web
npm.cmd ci
npm.cmd run build
```

不要使用 `npm audit fix --force`。如仍失败，记录 `node --version`、`npm.cmd --version`、`npm.cmd ls vite` 和完整报错，再比较 `package-lock.json`。

## 聊天返回 502

`/api/health` 正常但聊天 502，通常是 DeepSeek 密钥、网络、基地址或上游服务问题。检查 `.env` 是否有多余引号/空格，并从服务器验证到 `DEEPSEEK_BASE_URL` 的网络连通性。对外错误经过脱敏，详细排查不要打印密钥、请求正文或上游完整响应。

## 流式聊天不逐段显示

- 直接访问 Flask 本地端口确认是否由反向代理引起。
- 检查代理是否缓存或缓冲 `text/event-stream`。
- 浏览器开发者工具中应看到若干 `delta`，最后一个 `done`。
- 上游异常时可能先收到 `error`，随后收到唯一 `done`。

## pytest 临时目录权限问题

根目录 `pytest.ini` 使用 `.pytest_tmp`。如 Windows 报旧的 `templates/.pytest_tmp` 无访问权限，那是历史沙箱目录，不影响当前测试；不要强行提升权限删除，确认当前命令没有显式传入旧 `--basetemp` 即可。
