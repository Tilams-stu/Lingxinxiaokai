const currentIntent = /(?:现在|此刻|马上|立刻|今天).{0,16}(?:自杀|结束生命|伤害自己|自残)|(?:自杀|结束生命|伤害自己|自残).{0,16}(?:现在|此刻|马上|立刻|今天)|(?:right now|about to).{0,30}(?:kill myself|hurt myself)/i;
const planOrMeans = /(?:计划|方案|准备好了|已经准备|药|刀|跳楼|绳|工具|正在实施|means|plan|pills|knife)/i;
const selfHarm = /(?:想自杀|不想活了|结束生命|伤害自己|自残|suicid(?:e|al)|kill myself|hurt myself|self-harm)/i;
const distress = /(?:焦虑|难过|伤心|失眠|睡不好|害怕|崩溃|压力|depress|anxious|panic)/i;
const uncertainty = /(?:不知道|说不清|不确定|也许|可能|unsure|not sure)/i;
export function classifyRisk(input) {
    if (currentIntent.test(input) && planOrMeans.test(input))
        return { level: 'imminent', reasons: ['current self-harm intent with plan or means'] };
    if (currentIntent.test(input))
        return { level: 'imminent', reasons: ['explicit current self-harm intent'] };
    if (selfHarm.test(input))
        return { level: 'high', reasons: ['self-harm ideation'] };
    if (distress.test(input))
        return { level: 'concern', reasons: ['emotional distress'] };
    if (uncertainty.test(input))
        return { level: 'uncertain', reasons: ['unclear emotional state'] };
    return { level: 'none', reasons: [] };
}
export function crisisResources(level) {
    return [
        '如有立即危险，请立刻拨打当地急救电话 120 或报警电话 110，或前往最近急诊。',
        '心理援助可拨打全国统一心理援助热线 12356；也请联系学校心理中心、辅导员、校医院或可信任的人陪伴你。',
        '请尽量不要独处，并移开可能伤害自己的物品。'
    ];
}
