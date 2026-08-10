# 聆心小开文档

这里汇总聆心小开的架构、开发、接口、数据和部署说明。文档内容以当前源码为准；修改功能、接口、配置或目录时，应同步更新对应说明。

## 文档索引

| 主题 | 文档 | 内容 |
| --- | --- | --- |
| 项目结构 | [项目架构](architecture.md) | Flask、Vue、传统页面、SQLite 与 DeepSeek 的关系 |
| 本地开发 | [开发说明](development.md) | 环境安装、配置、启动、测试和目录约定 |
| 接口 | [HTTP API](api.md) | 认证、用户、聊天、情绪分析和 SSE 契约 |
| 数据 | [数据库](database.md) | 表结构、索引、迁移、备份和恢复 |
| 部署 | [部署说明](operations/deployment.md) | 前端构建、Gunicorn、HTTPS 和发布流程 |
| 排障 | [故障排查](operations/troubleshooting.md) | 启动、登录、构建和 AI 上游问题 |
| 安全 | [API 与数据安全](security/API_SECURITY_GUIDE.md) | 权限、密钥、隐私、限流和发布检查 |
| AI | [AI 行为参考](reference/ai-behavior.md) | 提示词、模型参数、危机规则和修改流程 |
| 使用 | [用户使用说明](user-guide/README.md) | 注册、登录、页面入口和聊天记录 |
| 维护 | [项目交接清单](handover.md) | 发布验收、日常维护和已有技术约束 |

## 设计与实施记录

`superpowers/specs` 和 `superpowers/plans` 保存重要结构调整的设计与实施依据，不参与应用运行。
