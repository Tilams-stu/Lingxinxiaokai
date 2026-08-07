# 聆心小开

心理陪伴与心理科普应用，采用 Flask 后端、Vue 3 + Vite 前端，并保留两套旧版业务页面供现有部署使用。

仓库地址：<https://github.com/Tilams-stu/Lingxinxiaokai>

## 目录结构

| 目录 | 用途 |
| --- | --- |
| `templates/` | Flask 后端、旧版业务页面、静态资源和运行入口 |
| `web/` | Vue 3 + Vite 前端源码 |
| `web/public/` | 前端构建时复制到 `templates/dist/` 的公共资源 |
| `configs/` | Gunicorn 和部署相关配置 |
| `docs/` | 提示词、使用文档、运维材料和安全说明 |
| `assets/` | 不属于具体页面的维护图片资源 |
| `artifacts/` | 截图等项目证据材料 |
| `templates/dist/` | 前端构建产物，供 Flask 直接提供 SPA 入口 |

`archive/` 只用于本地保存迁移前的 Git 历史，不属于新仓库内容。

## 本地运行

### Flask 后端

```powershell
cd templates
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# 编辑 .env，填写实际配置
python server.py
```

默认地址为 <http://127.0.0.1:5000>。

### 前端构建

```powershell
cd web
npm ci
npm run build
```

构建输出写入 `templates/dist/`。前端开发联调可运行 `npm run dev`，Vite 会把 `/api` 代理到 `http://127.0.0.1:5000`。

### Gunicorn

从仓库根目录执行：

```bash
gunicorn -c configs/gunicorn_conf.py server:app
```

配置文件会自动把工作目录切换到 `templates/`。生产环境应由反向代理提供 HTTPS，并通过环境变量配置密钥和上游服务。

## 环境变量

复制 `templates/.env.example` 为 `templates/.env`，填写 `SECRET_KEY`、AI 上游和 TTS 配置。`templates/.env` 已被忽略，不能提交到 Git。

## 运行数据

聊天数据库位于 `templates/data/`，聊天日志位于 `templates/logs/`。这些内容包含用户数据，默认不纳入版本控制。

## 入口说明

- `/`、`/login`、`/home`、`/admin`：Vue SPA 入口和管理页。
- `/index（心理陪伴）.html`：心理陪伴页面。
- `/index（心理科普）.html`：心理科普页面。
- `/api/health`：后端健康检查。

仓库虽然设置为 private，仍应在部署前轮换曾经出现在源码或实验文件中的旧凭据，并避免把真实 `.env` 提交到 Git 历史。
