import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { buildModelContext, createService } from '../dist/service.js';

async function start(service) {
  const server = service.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('GET /health reports the loopback service as healthy', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () {} }));
  try {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally { server.close(); }
});

test('POST /turn streams analysis, delta, and one done event from the injected Pi stream', async () => {
  const service = createService({ streamNormalTurn: async function* () {
    yield { type: 'analysis', content: 'planning response' };
    yield { type: 'delta', content: '你好' };
  } });
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'hello', stateSnapshot: {} }) });
    const body = await response.text();
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.match(body, /event: analysis\ndata: {"content":"planning response"}/);
    assert.match(body, /event: delta\ndata: {"content":"你好"}/);
    assert.equal((body.match(/event: done/g) ?? []).length, 1);
  } finally { server.close(); }
});

test('buildModelContext includes summary, both speaker roles, latest state snapshot, and current input', () => {
  const modelContext = buildModelContext({
    summary: 'earlier support summary',
    recentMessages: [{ role: 'user', content: 'I am worried' }, { role: 'assistant', content: 'I hear you' }],
    stateSnapshot: { mood: 'anxious' },
    currentInput: 'What should I do now?'
  });

  assert.match(modelContext, /earlier support summary/);
  assert.match(modelContext, /用户: I am worried/);
  assert.match(modelContext, /助手: I hear you/);
  assert.match(modelContext, /"mood":"anxious"/);
  assert.match(modelContext, /What should I do now/);
});

test('POST /turn rejects malformed conversation messages before beginning SSE', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () {} }));
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'hello', stateSnapshot: {}, messages: [{ role: 'tool', content: 'invalid' }] }) });
    assert.equal(response.status, 400);
  } finally { server.close(); }
});

test('POST /turn rejects a request body that exceeds the configured byte limit', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () {}, maxRequestBytes: 64 }));
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'a'.repeat(100), stateSnapshot: {} }) });
    assert.equal(response.status, 400);
  } finally { server.close(); }
});

test('POST /turn returns fixed crisis resources without invoking normal tools for imminent risk', async () => {
  let normalTurns = 0;
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () { normalTurns += 1; yield { type: 'delta', content: 'must not run' }; } }));
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: '我现在就想自杀，已经准备好了', stateSnapshot: {} }) });
    const body = await response.text();
    assert.equal(normalTurns, 0);
    assert.match(body, /当地急救电话 120/);
    assert.match(body, /event: done/);
  } finally { server.close(); }
});

test('POST /turn emits error then one done event when the agent stream fails', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () { throw new Error('provider unavailable'); } }));
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'hello', stateSnapshot: {} }) });
    const body = await response.text();
    assert.match(body, /event: error\ndata: {"message":"provider unavailable"}/);
    assert.equal((body.match(/event: done/g) ?? []).length, 1);
  } finally { server.close(); }
});
