import { createServer } from 'node:http';
import { Agent } from '@earendil-works/pi-agent-core';
import { streamSimple } from '@earendil-works/pi-ai/api/openai-completions';
import { SessionContextManager } from './context.js';
import { buildAgentSystemPrompt, deriveCompanionDialoguePolicy } from './dialogue.js';
import { resolveDeepSeekV4Flash } from './model.js';
import { classifyRisk, crisisResources } from './safety.js';
import { createLocalSupportTools, sourceForLocalTool } from './tools.js';
const safetyPrompt = '\u4f60\u662f\u5b89\u5168\u9884\u68c0\u5668\u3002\u53ea\u5224\u65ad\u5f53\u524d\u8f93\u5165\u4e2d\u662f\u5426\u660e\u786e\u63d0\u5230\u81ea\u6211\u4f24\u5bb3\u3001\u81ea\u6740\u610f\u5ff5\u3001\u5f53\u524d\u610f\u56fe\u3001\u8ba1\u5212\u6216\u624b\u6bb5\u3002\u4e0d\u505a\u8bca\u65ad\u3001\u4e0d\u8f93\u51fa\u8bc1\u636e\u3001\u4e0d\u63a8\u6d4b\u672a\u8bf4\u660e\u7684\u4e8b\u5b9e\u3002\u53ea\u8fd4\u56de JSON: {"level":"none|uncertain|concern|high|imminent"}\u3002\u53ea\u6709\u660e\u786e\u7684\u5f53\u524d\u610f\u56fe\u4e14\u5df2\u8bf4\u660e\u8ba1\u5212\u6216\u624b\u6bb5\u624d\u53ef\u7528 imminent\uff1b\u81ea\u6211\u4f24\u5bb3\u610f\u5ff5\u4f7f\u7528 high\u3002';
const riskRank = { none: 0, uncertain: 1, concern: 2, high: 3, imminent: 4 };
export { buildAgentSystemPrompt, deriveCompanionDialoguePolicy } from './dialogue.js';
function extractText(content) {
    return content.filter((item) => item.type === 'text' && typeof item.text === 'string').map((item) => item.text).join('');
}
async function piSafetyPreflight(input, apiKey) {
    try {
        const model = resolveDeepSeekV4Flash({ apiKey });
        const stream = await streamSimple(model, {
            systemPrompt: safetyPrompt,
            messages: [{ role: 'user', content: input, timestamp: Date.now() }]
        }, { reasoning: 'high', maxTokens: 512 });
        for await (const event of stream) {
            if (event.type !== 'done')
                continue;
            const parsed = JSON.parse(extractText(event.message.content));
            if (parsed && typeof parsed === 'object' && typeof parsed.level === 'string' && parsed.level in riskRank) {
                return { level: parsed.level, available: true };
            }
        }
    }
    catch { /* deterministic rules remain the minimum safety floor */ }
    return { level: 'none', available: false };
}
export function buildModelContext(context) {
    const transcript = context.recentMessages.map((message) => `${message.role === 'user' ? '\u7528\u6237' : '\u52a9\u624b'}: ${message.content}`).join('\n');
    return [
        '\u5fc3\u7406\u652f\u6301\u6458\u8981:', context.summary || '\uff08\u65e0\uff09',
        '\u4fdd\u7559\u7684\u6700\u8fd1\u5bf9\u8bdd:', transcript || '\uff08\u65e0\uff09',
        '\u6700\u65b0\u72b6\u6001\u5feb\u7167:', JSON.stringify(context.stateSnapshot),
        '\u5f53\u524d\u8f93\u5165:', context.currentInput
    ].join('\n');
}
export function assistantTerminalFailure(message) {
    if (message.stopReason !== 'error' && message.stopReason !== 'aborted')
        return undefined;
    return message.errorMessage ?? 'agent unavailable';
}
function toSse(response, event, payload) {
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}
async function readJson(request, maxBytes) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maxBytes)
            throw new Error('request body exceeds limit');
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function validTurn(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const turn = value;
    return (turn.mode === 'companion' || turn.mode === 'popsci') && typeof turn.input === 'string' && typeof turn.stateSnapshot === 'object' && turn.stateSnapshot !== null &&
        (turn.summary === undefined || typeof turn.summary === 'string') &&
        (turn.messages === undefined || (Array.isArray(turn.messages) && turn.messages.every((message) => typeof message === 'object' && message !== null && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')));
}
function passiveObservation(messages, input) {
    // This is deliberately a transparent, keyword-level recollection—not an LLM score,
    // diagnosis, risk label, or inference beyond words the user supplied in this session.
    // Assistant text is excluded so the recap cannot turn its own suggestions into user facts.
    const recentUserText = messages
        .filter((message) => message.role === 'user')
        .slice(-8)
        .map((message) => message.content);
    const observationText = [...recentUserText, input].join('\n');
    const emotions = [
        [/\u7126\u8651|\u7d27\u5f20|\u62c5\u5fc3|\u5bb3\u6015|\u6050\u614c/i, '\u7126\u8651'],
        [/\u96be\u8fc7|\u4f24\u5fc3|\u4f4e\u843d|\u60c5\u7eea\u4f4e\u843d|\u54ed/i, '\u96be\u8fc7'],
        [/\u610f\u6012|\u751f\u6c14|\u70e6\u8e81/i, '\u610f\u6012'],
        [/\u5f00\u5fc3|\u9ad8\u5174|\u6109\u5feb/i, '\u6109\u5feb'],
    ].filter(([pattern]) => pattern.test(observationText)).map(([, label]) => label);
    const concerns = [
        [/\u5b66\u4e1a|\u8003\u8bd5|\u4f5c\u4e1a/i, '\u5b66\u4e1a\u6216\u8003\u8bd5'],
        [/\u5931\u7720|\u7761\u4e0d\u597d|\u7761\u4e0d\u7740|\u7761\u7720/i, '\u7761\u7720'],
        [/\u4eba\u9645|\u5b64\u7acb|\u540c\u5b66\u5173\u7cfb|\u670b\u53cb\u5173\u7cfb/i, '\u4eba\u9645\u5173\u7cfb'],
        [/\u604b\u7231|\u5206\u624b|\u611f\u60c5/i, '\u4eb2\u5bc6\u5173\u7cfb'],
    ].filter(([pattern]) => pattern.test(observationText)).map(([, label]) => label);
    const functioning = /\u65e0\u6cd5\u5b66\u4e60|\u5f71\u54cd\u5b66\u4e60|\u65e0\u6cd5\u5de5\u4f5c|\u8d77\u4e0d\u6765\u5e8a|\u65e5\u5e38\u53d7\u5f71\u54cd/i.test(observationText)
        ? '\u63d0\u5230\u5b66\u4e60\u6216\u65e5\u5e38\u53d7\u5f71\u54cd' : 'unknown';
    const protectiveFactors = /\u670b\u53cb|\u5bb6\u4eba|\u8001\u5e08|\u5bfc\u5458|\u5fc3\u7406\u4e2d\u5fc3|\u6c42\u52a9/i.test(observationText)
        ? '\u63d0\u5230\u53ef\u8054\u7cfb\u7684\u652f\u6301' : 'unknown';
    const hasContext = emotions.length > 0 || concerns.length > 0 || functioning !== 'unknown' || protectiveFactors !== 'unknown';
    return {
        emotions: emotions.join('\uff1b') || 'unknown',
        concerns: concerns.join('\uff1b') || 'unknown',
        functioning,
        protectiveFactors,
        evidenceSufficiency: hasContext ? '\u6709\u9650' : 'insufficient',
        followUpTarget: concerns.includes('\u7761\u7720') ? '\u7761\u7720\u60c5\u51b5\u4e0e\u5bf9\u65e5\u5e38\u7684\u5f71\u54cd' : emotions.length ? '\u8fd9\u79cd\u611f\u53d7\u51fa\u73b0\u7684\u65f6\u95f4\u548c\u5f71\u54cd' : 'unknown'
    };
}
function checkpointSummary(turn) {
    const manager = new SessionContextManager({ contextWindow: 1_000_000 });
    for (const message of turn.messages ?? [])
        manager.addMessage(message);
    return manager.buildContext(turn.stateSnapshot, turn.input, turn.summary).summary;
}
class AsyncEventQueue {
    values = [];
    waiters = [];
    closed = false;
    push(value) { const waiter = this.waiters.shift(); if (waiter)
        waiter({ value, done: false });
    else
        this.values.push(value); }
    close() { this.closed = true; for (const waiter of this.waiters.splice(0))
        waiter({ value: undefined, done: true }); }
    async *iterate() {
        while (this.values.length || !this.closed) {
            if (this.values.length)
                yield this.values.shift();
            else
                yield* await new Promise((resolve) => this.waiters.push((item) => resolve(item.done ? (async function* () { })() : (async function* () { yield item.value; })())));
        }
    }
}
async function* piTurn(request, apiKey) {
    const manager = new SessionContextManager({ contextWindow: 1_000_000 });
    for (const message of request.messages ?? [])
        manager.addMessage(message);
    const context = manager.buildContext(request.stateSnapshot, request.input, request.summary);
    const queue = new AsyncEventQueue();
    const sources = [];
    let completedTurns = 0;
    const policy = request.mode === 'companion'
        ? deriveCompanionDialoguePolicy(request.messages ?? [], request.input)
        : undefined;
    const agent = new Agent({
        initialState: { systemPrompt: buildAgentSystemPrompt(request.mode, policy), model: resolveDeepSeekV4Flash({ apiKey }), thinkingLevel: 'off', tools: createLocalSupportTools() },
        streamFn: streamSimple,
        getApiKey: () => apiKey,
        shouldStopAfterTurn: () => ++completedTurns >= 2
    });
    agent.subscribe((event) => {
        if (event.type === 'message_update') {
            const update = event.assistantMessageEvent;
            if (update.type === 'thinking_delta')
                queue.push({ type: 'analysis', content: update.delta });
            if (update.type === 'text_delta')
                queue.push({ type: 'delta', content: update.delta });
        }
        if (event.type === 'message_end' && event.message.role === 'assistant') {
            const failure = assistantTerminalFailure(event.message);
            if (failure)
                queue.push({ type: 'error', message: failure });
        }
        if (event.type === 'tool_execution_end' && !event.isError) {
            const source = sourceForLocalTool(event.toolName);
            if (source && !sources.some((item) => item.label === source.label))
                sources.push(source);
        }
    });
    void agent.prompt(buildModelContext(context)).catch((error) => queue.push({ type: 'error', message: error instanceof Error ? error.message : 'agent unavailable' })).finally(() => queue.close());
    for await (const event of queue.iterate()) {
        if (event.type === 'delta' && request.mode === 'popsci' && sources.length)
            yield { ...event, sources: [...sources] };
        else
            yield event;
    }
}
export function createService(dependencies = {}) {
    const streamNormalTurn = dependencies.streamNormalTurn ?? ((request) => piTurn(request, dependencies.apiKey ?? process.env.DEEPSEEK_API_KEY ?? ''));
    const preflightSafety = dependencies.preflightSafety ?? ((input) => piSafetyPreflight(input, dependencies.apiKey ?? process.env.DEEPSEEK_API_KEY ?? ''));
    const maxRequestBytes = dependencies.maxRequestBytes ?? 64 * 1024;
    return createServer(async (request, response) => {
        if (request.method === 'GET' && request.url === '/health') {
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ status: 'ok' }));
            return;
        }
        if (request.method !== 'POST' || request.url !== '/turn') {
            response.writeHead(404).end();
            return;
        }
        let turn;
        try {
            const parsed = await readJson(request, maxRequestBytes);
            if (!validTurn(parsed))
                throw new Error('mode, input, stateSnapshot, and valid messages are required');
            turn = parsed;
        }
        catch (error) {
            response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'invalid request' }));
            return;
        }
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
        try {
            const ruleRisk = classifyRisk(turn.input);
            const modelRisk = ruleRisk.level === 'high' || ruleRisk.level === 'imminent'
                ? { level: 'none', available: false }
                : await preflightSafety(turn.input);
            const risk = modelRisk.available && riskRank[modelRisk.level] > riskRank[ruleRisk.level]
                ? { level: modelRisk.level, reasons: ['structured safety preflight raised risk'] }
                : ruleRisk;
            if (risk.level === 'high' || risk.level === 'imminent')
                toSse(response, 'delta', { content: crisisResources(risk.level).join('\n') });
            else {
                let failed = false;
                for await (const event of streamNormalTurn(turn)) {
                    if (event.type === 'error') {
                        failed = true;
                        toSse(response, 'error', { message: event.message });
                    }
                    else
                        toSse(response, event.type, { content: event.content, ...(event.sources?.length ? { sources: event.sources } : {}) });
                }
                if (!failed && turn.mode === 'companion') {
                    toSse(response, 'result', {
                        stateSnapshot: passiveObservation(turn.messages ?? [], turn.input),
                        checkpointSummary: checkpointSummary(turn)
                    });
                }
            }
        }
        catch (error) {
            toSse(response, 'error', { message: error instanceof Error ? error.message : 'agent unavailable' });
        }
        finally {
            toSse(response, 'done', {});
            response.end();
        }
    });
}
