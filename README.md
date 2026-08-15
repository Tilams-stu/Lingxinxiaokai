<div align="center">
  <img src="./artifacts/logo-concepts/lingxin-logo-v1.png" alt="聆心小开 Logo" width="220" />
  <h1>聆心小开</h1>
  <p>面向校园场景的心理陪伴与心理科普 Web 应用</p>
  <p>
    <a href="#项目简介">项目简介</a> ·
    <a href="#界面预览">界面预览</a> ·
    <a href="#核心功能">核心功能</a> ·
    <a href="#技术架构">技术架构</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="#文档导航">文档导航</a>
  </p>
</div>

## 项目简介

聆心小开是一个轻量的校园心理服务应用，提供心理陪伴、心理科普、非诊断性的状态回顾和聊天记录管理等功能。项目采用 Flask、SQLite 与仅本机可访问的 Node Pi Agent 服务；AI 能力由服务端受控接入 DeepSeek V4 Flash。

项目保留了简单直接的本地实验运行方式：Flask 统一提供页面、接口和静态资源，Pi Agent 只监听回环地址并负责模型调用、上下文管理和安全预检。它不是医疗软件、正式心理咨询或正式心理测评系统。

## 核心功能

- **账号与会话**：学生可以使用称呼、学号和密码注册，通过 Flask Session Cookie 保持登录状态。
- **心理陪伴**：以温和、非评判的方式进行日常情绪陪伴；对话依次探索、澄清、反馈已表达的模式，只有用户明确征求建议时才给出一个可选的小行动。
- **心理科普**：以通俗、非诊断性的方式解释心理学知识，仅使用本地审核资料卡。
- **流式对话**：聊天接口支持 SSE，逐段展示经过 Markdown 渲染的 AI 回复。
- **聊天记录与上下文**：按用户和会话保存完整历史；Pi 按 token 保留近期原文、摘要检查点和最新状态快照，不按固定消息条数截断。
- **状态回顾**：仅复述用户明确表达的情绪、关切、日常功能、保护因素、信息充分度和后续关注目标；不生成量表分数、百分比、诊断或风险灯。
- **危机响应**：命中高/紧急风险表达时跳过普通 Agent，返回固定的 12356、110、120 与校园支持提示，不自动联系任何第三方。
- **管理员导出**：管理员可以在权限校验后导出用户与聊天数据；默认不包含状态快照和上下文摘要。

## 技术架构

```mermaid
flowchart LR
    Browser["浏览器"] --> Vue["Vue 3 页面"]
    Browser --> Legacy["传统聊天页面"]
    Vue --> Flask["Flask 应用 :5000"]
    Legacy --> Flask
    Flask --> SQLite[("SQLite")]
    Flask -->|"loopback SSE"| Pi["Node Pi agent-service :8787"]
    Pi --> DeepSeek["DeepSeek V4 Flash"]
    Flask --> Dist["Vue 构建产物"]
```

| 模块 | 技术与职责 |
| --- | --- |
| Flask 网关 | Python 3.12、Flask 3.1.3，负责路由、Session、权限、SQLite 持久化、SSE 转发与状态快照查询 |
| Pi Agent 服务 | Node.js、Pi `Agent` 与模型抽象，负责 DeepSeek V4 Flash 调用、安全预检、token 上下文管理和本地只读工具 |
| 数据库 | SQLite，保存用户、管理员权限、聊天消息、状态快照和上下文检查点 |
| Vue 前端 | Vue 3、Vue Router 4、TypeScript 5、Vite 8.1.5 |
| 传统页面 | 原生 HTML/CSS/JavaScript，提供心理陪伴和心理科普聊天界面 |
| AI 上游 | DeepSeek V4 Flash；Provider 仅在 Pi Agent 组合层配置，Flask 与浏览器不直接调用模型 Provider |
| 部署 | Flask 提供完整站点；Node Agent 只能监听 loopback；Linux 生产环境可使用 Gunicorn |

### 目录结构

```text
Lingxinxiaokai/
├─ agent-service/        # 本机 Pi Agent、模型适配、安全与上下文管理
├─ configs/              # Gunicorn 等部署配置
├─ docs/                 # 架构、开发、接口、数据库和运维文档
├─ scripts/              # 项目启动脚本
├─ templates/            # Flask 源码、传统页面、共享资源和 Vue 构建产物
├─ tests/backend/        # Flask 接口与安全回归测试
├─ web/                  # Vue/Vite 前端源码
├─ artifacts/            # Logo 候选稿与历史素材
├─ pytest.ini            # pytest 测试发现配置
└─ README.md
```

## 界面预览

<table>
  <tr>
    <td align="center" width="50%">
      <strong>登录与注册</strong><br><br>
      <img src="docs/assets/screenshots/login.png" alt="聆心小开登录与注册页面" />
    </td>
    <td align="center" width="50%">
      <strong>功能首页</strong><br><br>
      <img src="docs/assets/screenshots/home.png" alt="聆心小开功能首页" />
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>心理科普</strong><br><br>
      <img src="docs/assets/screenshots/psychology-info.png" alt="聆心小开心理科普页面" />
    </td>
    <td align="center" width="50%">
      <strong>心理陪伴</strong><br><br>
      <img src="docs/assets/screenshots/companion.png" alt="聆心小开心理陪伴页面" />
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <strong>管理员数据导出</strong><br><br>
      <img src="docs/assets/screenshots/admin.png" alt="聆心小开管理员数据导出页面" width="720" />
    </td>
  </tr>
</table>

## 快速开始

### 环境要求

- Python 3.12
- Node.js 22
- npm 10

以下命令以 Windows PowerShell 为例。

### 1. 安装后端依赖

```powershell
python -m venv templates\.venv
templates\.venv\Scripts\python.exe -m pip install -r templates\requirements.txt
```

### 2. 安装 Pi Agent 依赖

```powershell
npm.cmd ci --prefix agent-service
```

### 3. 配置环境变量

```powershell
Copy-Item templates\.env.example templates\.env
templates\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

编辑 `templates/.env`，至少设置生成的 `SECRET_KEY` 和有效的 `DEEPSEEK_API_KEY`。完整配置项见[开发文档](docs/development.md#环境变量)。不要提交该文件或在浏览器端暴露密钥。

### 4. 启动 Pi Agent 与后端

先在一个终端启动仅本机可访问的 Pi Agent：

```powershell
scripts\start-agent-service.bat
```

再在另一个终端启动 Flask：

```powershell
scripts\start-backend.bat
```

应用默认运行在 `http://127.0.0.1:5000`；Pi Agent 的健康检查地址为 `http://127.0.0.1:8787/health`。

### 5. 启动前端开发服务器（可选）

修改 Vue 页面时，在另一个终端执行：

```powershell
Set-Location web
npm.cmd install
npm.cmd run dev
```

Vite 默认运行在 `http://localhost:5173`，并将 `/api` 代理到 Flask。

## 页面入口

| 路径 | 内容 |
| --- | --- |
| `/login` | 登录与注册 |
| `/home` | Vue 首页 |
| `/info` | 心理科普聊天页 |
| `/companion` | 心理陪伴聊天页 |
| `/admin` | 管理员数据导出页 |
| `/api/health` | Flask 服务健康检查 |
| `http://127.0.0.1:8787/health` | Pi Agent 健康检查（仅本机） |

## 开发与验证

运行 Pi Agent 测试：

```powershell
npm.cmd test --prefix agent-service
```

运行 Flask 后端测试：

```powershell
templates\.venv\Scripts\python.exe -m pytest -q
```

检查并构建 Vue 前端：

```powershell
Set-Location web
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd audit --audit-level=high
```

构建结果输出到 `templates/dist`。该目录由 Vite 整体生成，不应手工修改其中的哈希文件。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [文档总览](docs/README.md) | 全部项目文档的统一入口 |
| [Pi Agent 服务](docs/pi-agent-service.md) | 本机 Agent、DeepSeek V4 Flash、上下文、工具与安全边界 |
| [项目架构](docs/architecture.md) | Flask、Pi、SQLite、页面路由、认证和聊天数据流 |
| [开发说明](docs/development.md) | 环境配置、本地启动、管理员命令和开发约定 |
| [HTTP API](docs/api.md) | 请求结构、响应格式、状态码和 SSE 事件 |
| [数据库](docs/database.md) | 表结构、索引、迁移、备份和恢复 |
| [部署说明](docs/operations/deployment.md) | 前端构建、Gunicorn、HTTPS 和发布流程 |
| [故障排查](docs/operations/troubleshooting.md) | 登录、启动、构建和 AI 上游问题 |
| [安全说明](docs/security/API_SECURITY_GUIDE.md) | 权限、密钥、隐私、限流和发布检查 |
| [AI 行为参考](docs/reference/ai-behavior.md) | 对话阶段、危机规则和修改流程 |
| [使用说明](docs/user-guide/README.md) | 注册、登录、聊天记录和功能入口 |
