import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Agent, type StreamFn } from '@earendil-works/pi-agent-core';
import { streamSimple } from '@earendil-works/pi-ai/api/openai-completions';
import { SessionContextManager, type ContextMessage, type ContextResult } from './context.js';
import { resolveDeepSeekV4Flash } from './model.js';
import { classifyRisk, crisisResources } from './safety.js';
import { createLocalSupportTools } from './tools.js';

export type TurnEvent = { type: 'analysis' | 'delta'; content: string } | { type: 'error'; message: string };
export interface TurnRequest { mode: 'companion' | 'popsci'; input: string; stateSnapshot: Record<string, unknown>; messages?: ContextMessage[]; summary?: string; }
export interface ServiceDependencies {
  streamNormalTurn?: (request: TurnRequest) => AsyncIterable<TurnEvent>;
  apiKey?: string;
  maxRequestBytes?: number;
}

const systemPrompt = '\u4f60\u662f\u672c\u5730\u5b9e\u9a8c\u6027\u5fc3\u7406\u652f\u6301\u52a9\u624b\u3002\u63d0\u4f9b\u5171\u60c5\u3001\u975e\u8bca\u65ad\u6027\u652f\u6301\u548c\u53ef\u884c\u7684\u4e0b\u4e00\u6b65\uff1b\u4e0d\u505a\u533b\u7597\u8bca\u65ad\u3002\u53ea\u4f7f\u7528\u63d0\u4f9b\u7684\u672c\u5730\u652f\u6301\u5de5\u5177\u3002';

export function buildModelContext(context: ContextResult): string {
  const transcript = context.recentMessages.map((message) => `${message.role === 'user' ? '\u7528\u6237' : '\u52a9\u624b'}: ${message.content}`).join('\n');
  return [
    '\u5fc3\u7406\u652f\u6301\u6458\u8981:', context.summary || '\uff08\u65e0\uff09',
    '\u4fdd\u7559\u7684\u6700\u8fd1\u5bf9\u8bdd:', transcript || '\uff08\u65e0\uff09',
    '\u6700\u65b0\u72b6\u6001\u5feb\u7167:', JSON.stringify(context.stateSnapshot),
    '\u5f53\u524d\u8f93\u5165:', context.currentInput
  ].join('\n');
}

export function assistantTerminalFailure(message: { stopReason: string; errorMessage?: string }): string | undefined {
  if (message.stopReason !== 'error' && message.stopReason !== 'aborted') return undefined;
  return message.errorMessage ?? 'agent unavailable';
}

function toSse(response: ServerResponse, event: string, payload: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) throw new Error('request body exceeds limit');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validTurn(value: unknown): value is TurnRequest {
  if (typeof value !== 'object' || value === null) return false;
  const turn = value as Partial<TurnRequest>;
  return (turn.mode === 'companion' || turn.mode === 'popsci') && typeof turn.input === 'string' && typeof turn.stateSnapshot === 'object' && turn.stateSnapshot !== null &&
    (turn.summary === undefined || typeof turn.summary === 'string') &&
    (turn.messages === undefined || (Array.isArray(turn.messages) && turn.messages.every((message) =>
      typeof message === 'object' && message !== null && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')));
}

function passiveObservation(messages: ContextMessage[], input: string): Record<string, string> {
  // Conversation text is intentionally not interpreted as clinical, safety, or evidence data.
  // Until a separately reviewed extractor exists, unstructured input remains unknown.
  void messages;
  void input;
  return {
    emotions: 'unknown',
    concerns: 'unknown',
    functioning: 'unknown',
    protectiveFactors: 'unknown',
    evidenceSufficiency: 'unknown',
    followUpTarget: 'unknown'
  };
}

function checkpointSummary(turn: TurnRequest): string {
  const manager = new SessionContextManager({ contextWindow: 1_000_000 });
  for (const message of turn.messages ?? []) manager.addMessage(message);
  return manager.buildContext(turn.stateSnapshot, turn.input, turn.summary).summary;
}

class AsyncEventQueue {
  private values: TurnEvent[] = [];
  private waiters: Array<(result: IteratorResult<TurnEvent>) => void> = [];
  private closed = false;
  push(value: TurnEvent): void { const waiter = this.waiters.shift(); if (waiter) waiter({ value, done: false }); else this.values.push(value); }
  close(): void { this.closed = true; for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true }); }
  async *iterate(): AsyncIterable<TurnEvent> {
    while (this.values.length || !this.closed) {
      if (this.values.length) yield this.values.shift()!;
      else yield* await new Promise<AsyncIterable<TurnEvent>>((resolve) => this.waiters.push((item) => resolve(item.done ? (async function* () {})() : (async function* () { yield item.value; })())));
    }
  }
}

async function* piTurn(request: TurnRequest, apiKey: string): AsyncIterable<TurnEvent> {
  const manager = new SessionContextManager({ contextWindow: 1_000_000 });
  for (const message of request.messages ?? []) manager.addMessage(message);
  const context = manager.buildContext(request.stateSnapshot, request.input, request.summary);
  const queue = new AsyncEventQueue();
  const agent = new Agent({ initialState: { systemPrompt, model: resolveDeepSeekV4Flash({ apiKey }), thinkingLevel: 'low', tools: createLocalSupportTools() }, streamFn: streamSimple as StreamFn, getApiKey: () => apiKey });
  agent.subscribe((event) => {
    if (event.type === 'message_update') {
      const update = event.assistantMessageEvent;
      if (update.type === 'thinking_delta') queue.push({ type: 'analysis', content: update.delta });
      if (update.type === 'text_delta') queue.push({ type: 'delta', content: update.delta });
    }
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const failure = assistantTerminalFailure(event.message);
      if (failure) queue.push({ type: 'error', message: failure });
    }
  });
  void agent.prompt(buildModelContext(context)).catch((error: unknown) => queue.push({ type: 'error', message: error instanceof Error ? error.message : 'agent unavailable' })).finally(() => queue.close());
  yield* queue.iterate();
}

export function createService(dependencies: ServiceDependencies = {}): Server {
  const streamNormalTurn = dependencies.streamNormalTurn ?? ((request: TurnRequest) => piTurn(request, dependencies.apiKey ?? process.env.DEEPSEEK_API_KEY ?? ''));
  const maxRequestBytes = dependencies.maxRequestBytes ?? 64 * 1024;
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') { response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ status: 'ok' })); return; }
    if (request.method !== 'POST' || request.url !== '/turn') { response.writeHead(404).end(); return; }
    let turn: TurnRequest;
    try { const parsed = await readJson(request, maxRequestBytes); if (!validTurn(parsed)) throw new Error('mode, input, stateSnapshot, and valid messages are required'); turn = parsed; }
    catch (error) { response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'invalid request' })); return; }
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
    try {
      const risk = classifyRisk(turn.input);
      if (risk.level === 'high' || risk.level === 'imminent') toSse(response, 'delta', { content: crisisResources(risk.level).join('\n') });
      else {
        let failed = false;
        for await (const event of streamNormalTurn(turn)) {
          if (event.type === 'error') { failed = true; toSse(response, 'error', { message: event.message }); }
          else toSse(response, event.type, { content: event.content });
        }
        if (!failed && turn.mode === 'companion') {
          toSse(response, 'result', {
            stateSnapshot: passiveObservation(turn.messages ?? [], turn.input),
            checkpointSummary: checkpointSummary(turn)
          });
        }
      }
    } catch (error) { toSse(response, 'error', { message: error instanceof Error ? error.message : 'agent unavailable' }); }
    finally { toSse(response, 'done', {}); response.end(); }
  });
}
