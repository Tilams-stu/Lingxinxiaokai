import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { assistantTerminalFailure, buildModelContext, createService } from '../dist/service.js';

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

test('POST /turn emits one companion result before done after a successful turn', async () => {
  const service = createService({ streamNormalTurn: async function* () {
    yield { type: 'analysis', content: 'planning response' };
    yield { type: 'delta', content: '你好' };
  } });
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'companion', input: 'hello', stateSnapshot: {} }) });
    const body = await response.text();
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.match(body, /event: analysis\ndata: {"content":"planning response"}/);
    assert.match(body, /event: delta\ndata: {"content":"你好"}/);
    const result = JSON.parse(body.match(/event: result\ndata: (.+)/)[1]);
    assert.deepEqual(Object.keys(result.stateSnapshot).sort(), ['concerns', 'emotions', 'evidenceSufficiency', 'followUpTarget', 'functioning', 'protectiveFactors']);
    assert.deepEqual(result.stateSnapshot, {
      emotions: 'unknown', concerns: 'unknown', functioning: 'unknown', protectiveFactors: 'unknown', evidenceSufficiency: 'unknown', followUpTarget: 'unknown'
    });
    assert.ok(result.checkpointSummary.length <= 80);
    assert.ok(body.indexOf('event: result') < body.indexOf('event: done'));
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

test('assistantTerminalFailure maps an aborted Pi assistant turn to an SSE error message', () => {
  assert.equal(assistantTerminalFailure({ stopReason: 'aborted', errorMessage: 'client disconnected' }), 'client disconnected');
});

test('POST /turn rejects malformed conversation messages before beginning SSE', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () {} }));
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'companion', input: 'hello', stateSnapshot: {}, messages: [{ role: 'tool', content: 'invalid' }] }) });
    assert.equal(response.status, 400);
  } finally { server.close(); }
});

test('POST /turn requires companion or popsci mode before beginning SSE', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () {} }));
  try {
    for (const mode of [undefined, 'assessment', 7]) {
      const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, input: 'hello', stateSnapshot: {} }) });
      assert.equal(response.status, 400);
    }
  } finally { server.close(); }
});

test('POST /turn accepts companion and popsci modes', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () { yield { type: 'delta', content: 'reply' }; } }));
  try {
    for (const mode of ['companion', 'popsci']) {
      const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, input: 'hello', stateSnapshot: {} }) });
      assert.equal(response.status, 200);
    }
  } finally { server.close(); }
});

test('POST /turn rejects a request body that exceeds the configured byte limit', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () {}, maxRequestBytes: 64 }));
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'companion', input: 'a'.repeat(100), stateSnapshot: {} }) });
    assert.equal(response.status, 400);
  } finally { server.close(); }
});

test('POST /turn never emits a result for high or imminent risk', async () => {
  let normalTurns = 0;
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () { normalTurns += 1; yield { type: 'delta', content: 'must not run' }; } }));
  try {
    for (const input of ['我想自杀，不想活了', '我现在就想自杀，已经准备好了']) {
      const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'companion', input, stateSnapshot: {} }) });
      const body = await response.text();
      assert.match(body, /当地急救电话 120/);
      assert.doesNotMatch(body, /event: result/);
      assert.match(body, /event: done/);
    }
    assert.equal(normalTurns, 0);
  } finally { server.close(); }
});

test('POST /turn emits error then one done event when the agent stream fails', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () { throw new Error('provider unavailable'); } }));
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'companion', input: 'hello', stateSnapshot: {} }) });
    const body = await response.text();
    assert.match(body, /event: error\ndata: {"message":"provider unavailable"}/);
    assert.doesNotMatch(body, /event: result/);
    assert.equal((body.match(/event: done/g) ?? []).length, 1);
  } finally { server.close(); }
});

test('POST /turn never emits a result after an aborted agent stream', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () { yield { type: 'error', message: 'client disconnected' }; } }));
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'companion', input: 'hello', stateSnapshot: {} }) });
    const body = await response.text();
    assert.match(body, /event: error\ndata: {"message":"client disconnected"}/);
    assert.doesNotMatch(body, /event: result/);
    assert.match(body, /event: done/);
  } finally { server.close(); }
});

test('POST /turn never emits a result for a successful popsci turn', async () => {
  const { server, baseUrl } = await start(createService({ streamNormalTurn: async function* () { yield { type: 'delta', content: 'explanation' }; } }));
  try {
    const response = await fetch(`${baseUrl}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'popsci', input: 'what is stress?', stateSnapshot: {} }) });
    const body = await response.text();
    assert.doesNotMatch(body, /event: result/);
    assert.match(body, /event: done/);
  } finally { server.close(); }
});
