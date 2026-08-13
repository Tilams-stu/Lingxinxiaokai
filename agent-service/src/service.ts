import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Agent } from '@earendil-works/pi-agent-core';
import { streamSimple } from '@earendil-works/pi-ai/api/openai-completions';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import { SessionContextManager, type ContextMessage } from './context.js';
import { resolveDeepSeekV4Flash } from './model.js';
import { classifyRisk, crisisResources } from './safety.js';
import { createLocalSupportTools } from './tools.js';

export type TurnEvent = { type: 'analysis' | 'delta'; content: string };
export interface TurnRequest { input: string; stateSnapshot: Record<string, unknown>; messages?: ContextMessage[]; }
export interface ServiceDependencies {
  streamNormalTurn?: (request: TurnRequest) => AsyncIterable<TurnEvent>;
  apiKey?: string;
}

const systemPrompt = '你是本地实验性心理支持助手。提供共情、非诊断性的支持和可行的下一步；不做医疗诊断。只使用提供的本地支持工具。';

function toSse(response: ServerResponse, event: string, payload: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validTurn(value: unknown): value is TurnRequest {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string' &&
    typeof (value as { stateSnapshot?: unknown }).stateSnapshot === 'object' && (value as { stateSnapshot?: unknown }).stateSnapshot !== null;
}

async function* piTurn(request: TurnRequest, apiKey: string): AsyncIterable<TurnEvent> {
  const manager = new SessionContextManager({ contextWindow: 1_000_000 });
  for (const message of request.messages ?? []) manager.addMessage(message);
  const context = manager.buildContext(request.stateSnapshot, request.input);
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: resolveDeepSeekV4Flash({ apiKey }),
      thinkingLevel: 'low',
      tools: createLocalSupportTools(),
      messages: [
        ...(context.summary ? [{ role: 'user' as const, content: `心理支持摘要：\n${context.summary}`, timestamp: Date.now() }] : []),
        ...context.recentMessages.filter((message) => message.role === 'user').map((message) => ({ role: 'user' as const, content: message.content, timestamp: Date.now() }))
      ]
    },
    streamFn: streamSimple as StreamFn,
    getApiKey: () => apiKey
  });
  const events: TurnEvent[] = [];
  agent.subscribe((event) => {
    if (event.type === 'message_update') {
      const update = event.assistantMessageEvent;
      if (update.type === 'thinking_delta') events.push({ type: 'analysis', content: update.delta });
      if (update.type === 'text_delta') events.push({ type: 'delta', content: update.delta });
    }
  });
  await agent.prompt(context.currentInput);
  yield* events;
}

export function createService(dependencies: ServiceDependencies = {}): Server {
  const streamNormalTurn = dependencies.streamNormalTurn ?? ((request: TurnRequest) => piTurn(request, dependencies.apiKey ?? process.env.DEEPSEEK_API_KEY ?? ''));
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
    let turn: TurnRequest;
    try {
      const parsed = await readJson(request);
      if (!validTurn(parsed)) throw new Error('input and stateSnapshot are required');
      turn = parsed;
    } catch (error) {
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'invalid request' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
    try {
      const risk = classifyRisk(turn.input);
      if (risk.level !== 'low') {
        toSse(response, 'delta', { content: crisisResources(risk.level).join('\n') });
      } else {
        for await (const event of streamNormalTurn(turn)) toSse(response, event.type, { content: event.content });
      }
    } catch (error) {
      toSse(response, 'error', { message: error instanceof Error ? error.message : 'agent unavailable' });
    } finally {
      toSse(response, 'done', {});
      response.end();
    }
  });
}
