# 开发环境与工作流

## 基准环境

| 工具 | 基准版本 |
| --- | --- |
| Python | 3.12 |
| Node.js | 22 |
| npm | 10 |
| Flask | 3.1.3 |
| pytest | 9.1.1 |
| Vite | 8.1.5（精确锁定） |

后端唯一虚拟环境是 `templates/.venv`。启动脚本不会自动安装或升级依赖。

## 首次安装

在仓库根目录执行：

```powershell
python -m venv templates\.venv
templates\.venv\Scripts\python.exe -m pip install --upgrade pip
templates\.venv\Scripts\python.exe -m pip install -r templates\requirements.txt

Set-Location web
npm.cmd install
Set-Location ..

Copy-Item templates\.env.example templates\.env
```

随后编辑 `templates/.env`。不要提交这个文件。

## 环境变量

| 变量 | 默认值/要求 | 说明 |
| --- | --- | --- |
| `SECRET_KEY` | 必填，不能是占位值 | Session 签名密钥；使用至少 32 字节随机值 |
| `DEEPSEEK_API_KEY` | 必填，不能是占位值 | DeepSeek 凭据 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | DeepSeek API 基地址 |
| `MODEL_NAME` | `deepseek-chat` | 服务端使用的模型名 |
| `CHAT_DB_PATH` | `templates/data/chat.db` | SQLite 绝对或相对路径 |
| `APP_DEBUG` | `false` | 仅本地排障时临时开启 |
| `HOST` | `127.0.0.1` | Flask 本地监听地址 |
| `PORT` | `5000` | Flask 本地监听端口 |
| `SESSION_COOKIE_SECURE` | `false` | HTTPS 生产环境应设为 `true` |
| `SESSION_COOKIE_SAMESITE` | `Lax` | Cookie SameSite 策略 |
| `SESSION_TTL` | `604800` | Session 生命周期（秒） |
| `TRUST_PROXY_HEADERS` | `false` | 只在可信反向代理后开启 |
| `DEV_FRONTEND_ORIGIN` | `http://localhost:5173` | 开发环境允许携带 Cookie 的前端来源 |

Gunicorn 的 `GUNICORN_*` 变量见 [部署说明](operations/deployment.md)。

## 本地启动

终端一：

```powershell
scripts\start-backend.bat
```

终端二（只在修改 Vue 时需要）：

```powershell
Set-Location web
npm.cmd run dev
```

传统页面始终通过 Flask 的 5000 端口访问。Vue 开发页面使用 Vite 端口；不要用文件协议直接打开 HTML。

## 管理员权限

先注册普通账号，再在 `templates` 目录执行：

```powershell
Set-Location templates
.\.venv\Scripts\python.exe -m flask --app server set-admin <称呼>
.\.venv\Scripts\python.exe -m flask --app server revoke-admin <称呼>
```

命令只按精确称呼修改数据库。权限变更后刷新页面即可从数据库读取新权限；不要直接改 Cookie，也不要用姓名或学号推断管理员。

## 测试与构建

根目录后端测试：

```powershell
templates\.venv\Scripts\python.exe -m pytest -q
```

`pytest.ini` 负责把 `templates` 加入导入路径并从 `tests` 发现测试。测试使用临时 SQLite 和 mock 上游，不会读写正式数据库。

前端检查：

```powershell
Set-Location web
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd audit --audit-level=high
```

Vite 构建会整体更新 `templates/dist`。修改 Vue 源码后应提交对应的新构建产物；不要手工编辑哈希文件。

## 文件放置约定

- 后端业务实现：`templates/*.py`。
- Vue 页面和组件：`web/src`；Vue 公共图标：`web/public`。
- 传统页面共享脚本：`templates/assets`。
- 自动化测试：`tests/backend`。
- 部署配置：`configs`；项目脚本：`scripts`。
- 说明文档：`docs`；非运行时过程材料：`artifacts`。
- 本地数据、日志、虚拟环境、`.env` 和依赖目录必须保持 Git 忽略。

新增后端模块时，应通过 `create_app(test_config)` 保持可测试性。行为变更先增加失败测试，再实现最小修改。
