export type RiskLevel = 'none' | 'uncertain' | 'concern' | 'high' | 'imminent';

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}

const currentIntent = /(?:\u73b0\u5728|\u6b64\u523b|\u9a6c\u4e0a|\u7acb\u523b|\u4eca\u5929).{0,16}(?:\u81ea\u6740|\u7ed3\u675f\u751f\u547d|\u4f24\u5bb3\u81ea\u5df1|\u81ea\u6b8b)|(?:\u81ea\u6740|\u7ed3\u675f\u751f\u547d|\u4f24\u5bb3\u81ea\u5df1|\u81ea\u6b8b).{0,16}(?:\u73b0\u5728|\u6b64\u523b|\u9a6c\u4e0a|\u7acb\u523b|\u4eca\u5929)|(?:right now|about to).{0,30}(?:kill myself|hurt myself)/i;
const planOrMeans = /(?:\u8ba1\u5212|\u65b9\u6848|\u51c6\u5907\u597d\u4e86|\u5df2\u7ecf\u51c6\u5907|\u836f|\u5200|\u8df3\u697c|\u7ef3|\u5de5\u5177|\u6b63\u5728\u5b9e\u65bd|means|plan|pills|knife)/i;
const deniesPlan = /(?:\u6ca1\u6709|\u5c1a\u672a|\u8fd8\u6ca1|\u5e76\u65e0).{0,8}(?:\u8ba1\u5212|\u51c6\u5907|\u65b9\u6848|means|plan)/i;
const selfHarm = /(?:\u60f3\u81ea\u6740|\u4e0d\u60f3\u6d3b\u4e86|\u7ed3\u675f\u751f\u547d|\u4f24\u5bb3\u81ea\u5df1|\u81ea\u6b8b|suicid(?:e|al)|kill myself|hurt myself|self-harm)/i;
const distress = /(?:\u7126\u8651|\u96be\u8fc7|\u4f24\u5fc3|\u5931\u7720|\u7761\u4e0d\u597d|\u5bb3\u6015|\u5d29\u6e83|\u538b\u529b|depress|anxious|panic)/i;
const uncertainty = /(?:\u4e0d\u77e5\u9053|\u8bf4\u4e0d\u6e05|\u4e0d\u786e\u5b9a|\u4e5f\u8bb8|\u53ef\u80fd|unsure|not sure)/i;

export function classifyRisk(input: string): RiskAssessment {
  if (currentIntent.test(input) && planOrMeans.test(input) && !deniesPlan.test(input)) return { level: 'imminent', reasons: ['current self-harm intent with plan or means'] };
  if (currentIntent.test(input)) return { level: 'high', reasons: ['explicit current self-harm intent without stated plan or means'] };
  if (selfHarm.test(input)) return { level: 'high', reasons: ['self-harm ideation'] };
  if (distress.test(input)) return { level: 'concern', reasons: ['emotional distress'] };
  if (uncertainty.test(input)) return { level: 'uncertain', reasons: ['unclear emotional state'] };
  return { level: 'none', reasons: [] };
}

export function crisisResources(_level: Extract<RiskLevel, 'high' | 'imminent'>): string[] {
  return [
    '\u5982\u6709\u7acb\u5373\u5371\u9669\uff0c\u8bf7\u7acb\u523b\u62e8\u6253\u5f53\u5730\u6025\u6551\u7535\u8bdd 120 \u6216\u62a5\u8b66\u7535\u8bdd 110\uff0c\u6216\u524d\u5f80\u6700\u8fd1\u6025\u8bca\u3002',
    '\u5fc3\u7406\u63f4\u52a9\u53ef\u62e8\u6253\u5168\u56fd\u7edf\u4e00\u5fc3\u7406\u63f4\u52a9\u70ed\u7ebf 12356\uff1b\u4e5f\u8bf7\u8054\u7cfb\u5b66\u6821\u5fc3\u7406\u4e2d\u5fc3\u3001\u8f85\u5bfc\u5458\u3001\u6821\u533b\u9662\u6216\u53ef\u4fe1\u4efb\u7684\u4eba\u966a\u4f34\u4f60\u3002',
    '\u8bf7\u5c3d\u91cf\u4e0d\u8981\u72ec\u5904\uff0c\u5e76\u79fb\u5f00\u53ef\u80fd\u4f24\u5bb3\u81ea\u5df1\u7684\u7269\u54c1\u3002'
  ];
}
