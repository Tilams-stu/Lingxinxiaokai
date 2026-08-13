import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';

const knowledge = '情绪困扰值得被认真对待。可以先描述此刻的感受、身体反应与最需要的支持；这不是诊断，也不能替代专业医疗帮助。';
const grounding = '尝试 5-4-3-2-1：说出 5 个你看到的东西、4 个你能触摸到的感觉、3 种听到的声音、2 种闻到的气味、1 种能尝到的味道，然后做一次缓慢呼吸。';

export function createLocalSupportTools(): AgentTool[] {
  return [
    {
      name: 'mental_support_knowledge', label: 'Mental-support knowledge', description: 'Return local psychoeducation and support framing.', parameters: Type.Object({}),
      execute: async () => ({ content: [{ type: 'text', text: knowledge }], details: {} })
    },
    {
      name: 'grounding_exercise', label: 'Grounding exercise', description: 'Return a local grounding exercise.', parameters: Type.Object({}),
      execute: async () => ({ content: [{ type: 'text', text: grounding }], details: {} })
    }
  ];
}
