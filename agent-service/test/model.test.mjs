import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeepSeekV4Flash } from '../dist/model.js';

test('resolveDeepSeekV4Flash normalises the V4 Flash model to a Pi OpenAI-compatible definition', () => {
  const model = resolveDeepSeekV4Flash({ apiKey: 'test-key' });

  assert.deepEqual(model, {
    provider: 'deepseek',
    id: 'deepseek-v4-flash',
    api: 'openai-completions',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'test-key',
    contextWindow: 1_000_000,
    maxTokens: 16_384,
    reasoning: true,
    thinkingLevelMap: { off: null, low: 'low', high: 'high', xhigh: 'max' },
    input: ['text'],
    name: 'DeepSeek V4 Flash',
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: true }
  });
});
