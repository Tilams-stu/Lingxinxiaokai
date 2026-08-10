# 部署与发布

## 发布前准备

- 使用 Python 3.12 和 `templates/requirements.txt` 中的锁定版本。
- 在 `web` 使用 Node.js 22、npm 10 安装锁文件依赖并完成构建。
- 将 `templates/.env.example` 复制为服务器私有的 `templates/.env`，填入真实密钥。
- 备份 SQLite；确认旧库没有重复学号。
- 运行后端测试、TypeScript 检查、前端构建和依赖审计。

## 构建前端

```powershell
Set-Location web
npm.cmd ci
npx.cmd tsc --noEmit
npm.cmd run build
```

`web/vite.config.ts` 将输出写入 `templates/dist` 并清理旧哈希文件。发布包必须同时包含 Flask 源码、传统页面、`templates/assets` 和新构建的 `templates/dist`。

## Windows 本地/演示启动

```powershell
scripts\start-backend.bat
```

这个入口适合开发和演示，不是生产进程管理器。

## Linux + Gunicorn

Gunicorn 不支持 Windows。Linux 环境从仓库根目录执行：

```bash
python3.12 -m venv templates/.venv
templates/.venv/bin/python -m pip install -r templates/requirements.txt
templates/.venv/bin/gunicorn -c configs/gunicorn_conf.py server:app
```

`configs/gunicorn_conf.py` 会把工作目录切换到 `templates`，默认监听 `0.0.0.0:5000`，使用 1 个 worker 和 2 个线程。可配置：

| 变量 | 默认值 |
| --- | --- |
| `GUNICORN_BIND` | `0.0.0.0:5000` |
| `GUNICORN_WORKERS` | `1` |
| `GUNICORN_THREADS` | `2` |
| `GUNICORN_LOGLEVEL` | `info` |
| `GUNICORN_ERROR_LOG` | `-` |
| `GUNICORN_ACCESS_LOG` | `-` |

保持单 worker 是当前 SQLite 和内存限流设计的保守基线。扩大并发前需要单独评估共享限流存储和数据库方案。

## HTTPS 与反向代理

- 正式站点必须使用 HTTPS，并设置 `SESSION_COOKIE_SECURE=true`。
- `TRUST_PROXY_HEADERS` 默认关闭。只有 Flask 仅能被可信反向代理访问，且代理会覆盖客户端转发头时才能开启。
- 反向代理需关闭 SSE 响应缓冲或允许持续刷新，避免聊天片段积压到请求结束才显示。
- CORS 只用于 Vite 开发来源。生产页面应与 API 同源。
- 不把 `.env`、数据库、备份、日志或导出 JSON 放入 Web 可访问目录。

## 发布顺序

1. 记录当前提交和依赖锁文件。
2. 停止写入并备份数据库。
3. 安装后端依赖，执行前端干净构建。
4. 运行全部验收命令。
5. 部署代码和 `templates/dist`，保留服务器私有 `.env` 与数据目录。
6. 启动进程，检查 `/api/health`、登录、两种聊天、危机固定回复和管理员权限。
7. 观察脱敏错误日志；不要记录聊天正文或上游完整响应。

回滚时优先回滚代码和构建产物。数据库迁移是向前且幂等的；只有确认数据格式不兼容时才从发布前备份恢复。

危机联系方式以[南开大学党委学生工作部公开信息](https://xgb.nankai.edu.cn/news/content/id/875.html)为依据，运维负责人应在每次正式发布前复核。
