import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';

const knowledgeCards: Record<string, string> = {
  default: '这是心理支持信息，不是诊断。可以先用具体事实描述感受、身体反应和眼下最需要的支持；若困扰持续或影响学习生活，可联系学校心理中心或合格的心理健康专业人员。',
  anxiety: '焦虑时可先把注意力放回呼吸和环境：慢慢吸气、稍作停顿、再缓慢呼气，并把要处理的事情分成一个最小的下一步。',
  sleep: '睡眠困难时，尽量保持固定起床时间，睡前减少强光和刺激性内容；如果长期失眠或明显影响功能，请寻求专业评估。'
};

const supportResources = '中国地区可使用的本地支持资源：心理困扰可拨打全国统一心理援助热线 12356；紧急危险请拨打 110 或 120，或前往最近急诊。校园场景可联系学校心理中心、辅导员、校医院、宿舍管理人员或可信任的老师同学。';

export function createLocalSupportTools(): AgentTool[] {
  return [
    {
      name: 'lookup_psychoeducation', label: 'lookup_psychoeducation(topic)', description: 'Look up an approved local psychoeducation card by topic. No network access.',
      parameters: Type.Object({ topic: Type.Optional(Type.String()) }),
      execute: async (_id, params) => {
        const key = String((params as { topic?: string }).topic ?? 'default').trim().toLowerCase();
        return { content: [{ type: 'text', text: knowledgeCards[key] ?? knowledgeCards.default }], details: { source: 'local-approved-card' } };
      }
    },
    {
      name: 'get_support_resources', label: 'get_support_resources(region)', description: 'Return approved local crisis and campus support resources by region. No network access.',
      parameters: Type.Object({ region: Type.Optional(Type.String()) }),
      execute: async () => ({ content: [{ type: 'text', text: supportResources }], details: { source: 'local-approved-resources' } })
    }
  ];
}

export function sourceForLocalTool(toolName: string): { label: string; url: string } | undefined {
  return toolName === 'lookup_psychoeducation'
    ? { label: '\u672c\u5730\u5ba1\u6838\u5fc3\u7406\u79d1\u666e\u5361', url: 'https://www.nhc.gov.cn/' }
    : undefined;
}
