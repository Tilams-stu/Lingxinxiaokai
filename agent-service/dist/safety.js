const imminentPatterns = [
    /(?:现在|此刻|马上|立刻).{0,12}(?:自杀|结束生命|伤害自己)/,
    /(?:自杀|结束生命|伤害自己).{0,12}(?:准备好了|已经准备|正在)/,
    /(?:i\s*(?:am|'m)\s*(?:going to|about to)|right now).{0,30}(?:kill myself|hurt myself)/i
];
const highPatterns = [
    /(?:想自杀|不想活了|结束生命|伤害自己|自残)/,
    /(?:suicid(?:e|al)|kill myself|hurt myself|self-harm)/i
];
export function classifyRisk(input) {
    if (imminentPatterns.some((pattern) => pattern.test(input)))
        return { level: 'imminent', reasons: ['explicit current self-harm intent'] };
    if (highPatterns.some((pattern) => pattern.test(input)))
        return { level: 'high', reasons: ['self-harm ideation'] };
    return { level: 'low', reasons: [] };
}
export function crisisResources(level) {
    return [
        '如有立即危险，请立刻拨打当地急救电话 120 或报警电话 110，或前往最近急诊。',
        '请尽量不要独处，联系一位可信任的人陪伴你，并移开可能伤害自己的物品。'
    ];
}
