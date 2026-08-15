import type { ContextMessage } from './context.js';

export type DialogueStage = 'explore' | 'clarify' | 'reflect' | 'micro_action';

export interface CompanionDialoguePolicy {
  stage: DialogueStage;
  userTurns: number;
  allowsAdvice: boolean;
  allowsPsychoeducation: boolean;
}

const adviceRequest = /\u600e\u4e48\u505a|\u600e\u4e48\u529e|\u5982\u4f55\u505a|\u600e\u6837\u7f13\u89e3|\u6709\u4ec0\u4e48\u529e\u6cd5|\u7ed9.*\u5efa\u8bae|\u9700\u8981.*\u5efa\u8bae|\u80fd.*\u5e2e.*\u5417/i;
const explanationRequest = /\u4e3a\u4ec0\u4e48|\u600e\u4e48\u4f1a\u8fd9\u6837|\u662f\u4ec0\u4e48\u539f\u56e0|\u5fc3\u7406\u673a\u5236|\u89e3\u91ca\u4e00\u4e0b/i;

export function deriveCompanionDialoguePolicy(messages: ContextMessage[], input: string): CompanionDialoguePolicy {
  const userTurns = messages.filter((message) => message.role === 'user').length + 1;
  if (adviceRequest.test(input)) return { stage: 'micro_action', userTurns, allowsAdvice: true, allowsPsychoeducation: false };
  if (userTurns < 3) return { stage: 'explore', userTurns, allowsAdvice: false, allowsPsychoeducation: false };
  if (userTurns <= 5) return { stage: 'clarify', userTurns, allowsAdvice: false, allowsPsychoeducation: false };
  return { stage: 'reflect', userTurns, allowsAdvice: false, allowsPsychoeducation: explanationRequest.test(input) };
}

const basePrompt = '你是本地实验性心理支持助手。提供温暖、非诊断性的心理陪伴；不作医疗诊断，不贴疾病标签，不据此判定安全风险。只使用提供的本地只读支持工具。';

export function buildAgentSystemPrompt(mode: 'companion' | 'popsci', policy?: CompanionDialoguePolicy): string {
  if (mode === 'popsci') return `${basePrompt}\n当前模式是心理科普：用通俗、审慎的语言回答问题，在有帮助时查询本地审核科普卡，不把科普写成对用户的诊断或处方。`;

  const current = policy ?? deriveCompanionDialoguePolicy([], '');
  const stagePrompt: Record<DialogueStage, string> = {
    explore: '当前阶段：探索。本轮先用 1–2 句针对用户原话的共情反映，然后只问一个开放式问题来了解这段经历。不要主动提供方法或清单，不要分析心理机制，不要一次问多个问题。',
    clarify: '当前阶段：澄清。简短反映用户已经说出的重点，然后只问一个与当前话题直接相关的具体问题（时间、触发情境、身体感受、影响或已有应对之一）。不要主动提供方法或清单，不要一次问多个问题。',
    reflect: '当前阶段：反馈。简短总结只基于用户已表达的模式和困扰。除非用户明确问“为什么”或要求解释，不主动讲解心理知识；不主动提供方法或清单。以一个自然的后续问题邀请用户继续。',
    micro_action: '当前阶段：小行动。用一句共情确认开场，只给一个小、具体、可选的尝试，不要列多个方法、不要讲课。用一个问题确认这个尝试对用户是否合适。'
  };
  const explanation = current.allowsPsychoeducation
    ? '用户本轮明确要求解释：可用不带诊断的日常语言简短解释，但仍不给方法清单。'
    : '';
  return `${basePrompt}\n当前模式是心理陪伴，用户已表达 ${current.userTurns} 个回合。${stagePrompt[current.stage]}${explanation}\n回复保持自然的两段以内、不超过 4 句，不使用多项列表，不要假装专业心理咨询师。`;
}
