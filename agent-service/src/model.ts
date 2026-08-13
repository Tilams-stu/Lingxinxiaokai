/**
 * Pi model composition lives here so application code does not depend on a
 * provider registry, CLI configuration, or browser-visible credentials.
 */
import type { Model } from '@earendil-works/pi-ai';

export type PiModelDefinition = Model<'openai-completions'> & {
  provider: 'deepseek';
  id: 'deepseek-v4-flash';
  api: 'openai-completions';
  baseUrl: 'https://api.deepseek.com/v1';
  apiKey: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
};

export function resolveDeepSeekV4Flash({ apiKey }: { apiKey: string }): PiModelDefinition {
  if (!apiKey.trim()) throw new Error('DEEPSEEK_API_KEY is required');
  return {
    provider: 'deepseek',
    id: 'deepseek-v4-flash',
    api: 'openai-completions',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey,
    contextWindow: 1_000_000,
    maxTokens: 16_384,
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      low: 'low',
      high: 'high',
      xhigh: 'max'
    },
    input: ['text'],
    name: 'DeepSeek V4 Flash',
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: true }
  };
}
