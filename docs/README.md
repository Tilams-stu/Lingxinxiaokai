# 项目文档

## 当前实现

| 文档 | 内容 |
| --- | --- |
| [架构](architecture.md) | Flask、Pi、SQLite、管理员查询和状态回顾的数据流 |
| [Pi Agent 服务](pi-agent-service.md) | 本机 Node 服务、DeepSeek V4 Flash、工具、上下文与安全边界 |
| [HTTP API](api.md) | 认证、聊天、状态回顾、管理员查询、SSE 契约和错误码 |
| [开发与运行](development.md) | 安装、环境变量、管理员授权、启动与验证 |
| [数据库与隐私](database.md) | 表、原子写入、回顾进度、导出与删除边界 |
| [AI 行为边界](reference/ai-behavior.md) | 对话阶段、状态回顾、风险处理与禁止项 |
| [使用说明](user-guide/README.md) | 注册登录、聊天、8 次回顾门槛和管理员入口 |

## 运维与安全

| 文档 | 内容 |
| --- | --- |
| [部署与发布](operations/deployment.md) | 构建、启动、HTTPS、管理员与 0/7/8 轮人工验收 |
| [故障排查](operations/troubleshooting.md) | Flask、Node、DeepSeek、管理员权限和回顾进度问题 |
| [API 与数据安全](security/API_SECURITY_GUIDE.md) | 权限、密钥、隐私、限流和发布检查 |
| [交接清单](handover.md) | 维护职责、验收项目、已知限制和禁止恢复的旧实现 |

`superpowers/specs/` 与 `superpowers/plans/` 保存历史设计和实施记录，不作为当前运行手册。历史文档如果与以上内容冲突，以代码、自动测试和本页列出的当前实现文档为准。
