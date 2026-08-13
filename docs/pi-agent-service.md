# Pi 轻量心理支持 Agent（本地实验）

本项目将 Flask 保持为唯一对浏览器公开的服务。Node `agent-service` 只绑定 loopback，使用 Pi 的 `Agent`、模型抽象和 token 驱动的上下文管理来调用 DeepSeek V4 Flash；浏览器、Flask 业务层和 SQLite 均不直接调用模型 Provider。

## 启动

1. 复制 `templates/.env.example` 为 `templates/.env`，设置强随机 `SECRET_KEY` 和有效 `DEEPSEEK_API_KEY`。
2. 安装 Node 依赖：`npm.cmd ci --prefix agent-service`。
3. 在一个终端运行 `scripts/start-agent-service.bat`。服务仅监听 `127.0.0.1:8787`（可在 `.env` 调整 loopback 端口）。
4. 在另一个终端运行 `scripts/start-backend.bat`，再打开 Flask 地址。

可分别验证：`GET http://127.0.0.1:8787/health` 与 `GET /api/health`。Node 不提供可从浏览器访问的模型端点；Flask 会拒绝非 loopback 的 `AGENT_BASE_URL`。

## 当前边界

- 模式仅有 `companion`（陪伴与状态回顾）和 `popsci`（心理科普）。浏览器只发送本轮 `message`、`mode`、`session_id`；完整历史由 Flask 按已登录用户和会话重建。
- Pi 上下文按 token 管理，不以 40 条消息截断。默认保留约 20k token 的近期原文、16,384 token 输出预留和可持久化摘要检查点；完整聊天记录不会因压缩而删除。
- 只开放本地只读工具 `lookup_psychoeducation(topic)` 与 `get_support_resources(region)`；每轮至多两批工具调用。没有 Bash、文件、网络搜索、HTTP、数据库或 CLI 工具。
- `companion` 状态回顾只复述用户本轮明确写出的主题，字段为情绪、关切、日常功能、保护因素、信息充分度和后续关注目标；没有量表分数、百分比、诊断或风险灯。科普模式不保存该快照。
- 普通聊天关闭思考模式；每轮先执行短的结构化高推理安全预检。它只可提高确定性规则给出的风险等级，预检不可用时自动退回确定性规则。高/紧急风险跳过普通 Agent 和工具循环，输出固定的 12356、110、120 与校内支持提示；系统不会自动联系任何第三方。规则只是最低防线，不能代替人工危机干预。

## 数据与隐私

Flask 在一个事务中保存完成的用户/助手消息、陪伴模式快照及必要的摘要检查点。`/api/assessment` 只返回展示安全的六项状态和免责声明；导出接口默认不包含快照或摘要。此项目仅供本地实验，不是医疗软件、正式心理咨询或心理测评系统。

## 开发验证

```powershell
npm.cmd test --prefix agent-service
$env:PYTHONPATH = "$PWD\templates"
python -m pytest tests\backend -q
```

DeepSeek V4 Flash 使用 `deepseek-v4-flash` 与 OpenAI-compatible Chat Completions base URL `https://api.deepseek.com/v1`；模型 Provider 的组合只在 `agent-service/src/model.ts` 中完成。
