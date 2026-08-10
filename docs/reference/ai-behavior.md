# AI 行为参考

## 唯一事实来源

运行中的服务端提示词、模型参数、危机关键词和固定干预回复都定义在 `templates/ai_service.py`。本文只解释边界，不复制完整提示词，避免文档与代码再次分叉。

- `SYSTEM_PROMPTS`：`companion` 和 `popsci` 两种模式的服务端提示词。
- `_body`：模型名、温度、最大令牌数和 system 消息注入。
- `CRISIS_PATTERN`：当前危机表达检测规则。
- `CRISIS_REPLY`：不经过 DeepSeek 的固定干预内容。
- `analyze_emotions`：六维情绪分数解析和 0–1 归一化。

浏览器提交的 `system` 角色会被拒绝。浏览器不负责保存提示词，也不应提交模型、温度、令牌上限或跳过持久化参数。

## 修改流程

修改 AI 行为时应同时完成：

1. 在 `tests/backend/test_app.py` 增加或调整回归测试。
2. 修改 `templates/ai_service.py` 或 `templates/app.py`。
3. 验证两种模式、非流式、SSE、危机绕过、持久化和上游异常。
4. 如接口契约变化，同步更新 `docs/api.md`；如安全规则变化，同步更新安全说明。
5. 危机联系方式必须重新核验公开来源，不能只修改模型提示词。

AI 输出不是医学诊断。情绪分数即使结构稳定，也只代表模型对文本的粗略估计。
