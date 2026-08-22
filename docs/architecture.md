# 架构

```mermaid
flowchart TD
  Browser -->|/api/chat| Flask
  Browser -->|/info /companion| Flask
  Admin[管理员页面] -->|用户目录 / 最近消息 / 导出| Flask
  Flask --> SQLite
  Flask -->|POST /turn, loopback only| Pi[Node agent-service]
  Pi --> DeepSeek[DeepSeek V4 Flash]
  Pi --> Cards[本地审核资料卡]
```

## 职责划分

| 组件 | 职责 |
| --- | --- |
| `templates/app.py` | Flask 应用、认证、会话忙锁、公开 SSE、危机最小规则 |
| `templates/gateway.py` | 只允许 loopback 的 Node SSE 网关 |
| `templates/db.py` | SQLite schema、完整消息、状态快照、上下文检查点的原子写入 |
| `agent-service/` | Pi Agent、DeepSeek 模型组合、安全预检、本地工具、token 上下文管理 |
| `templates/index（心理陪伴）.html` | 陪伴对话与“状态回顾”界面 |
| `templates/index（心理科普）.html` | 科普对话与资料来源行 |

Flask 不持有模型 Provider 实现，也不把 API key 返回给浏览器。`AGENT_BASE_URL` 必须是 `127.0.0.1`、`localhost` 或 `::1` 的 HTTP 地址；否则应用启动时拒绝配置。

## 一轮对话

1. 浏览器仅提交模式、会话 ID、当前消息和是否流式输出。
2. Flask 以用户 ID 与会话 ID 读取完整消息、最近状态快照和检查点，并以会话忙锁防止并发写入。
3. Node 先运行确定性风险规则；非高风险时执行结构化高推理安全预检，预检只能提高风险等级。
4. 普通请求由 Pi Agent 以关闭思考的聊天模型处理；本地工具最多两批。
5. Flask 转发 `analysis`、`delta`、`error`、`done` SSE。陪伴模式在完成时原子保存回复、展示安全的状态快照和必要检查点。

高/紧急风险不会进入普通 Agent 或工具循环。完整历史不会被删除；压缩只影响送入模型的上下文。

## 状态回顾与管理员查询

- 状态回顾进度由 Flask 实时统计当前用户、当前会话的已保存用户消息。少于 8 次时只公开 `collecting` 和剩余次数；达到门槛后才读取最新展示安全快照。
- 管理员仍从普通登录页进入系统，权限由数据库 `is_admin` 标记和 Flask `admin_required` 校验。Vue 管理页只读，按称呼/学号过滤用户，并将最近最多 500 条消息按 `session_id` 分组。
- 管理员查询和全量导出均不读取 `assessment_snapshots.evidence_json` 或 `context_checkpoints.summary`。
