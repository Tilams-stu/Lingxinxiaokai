import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionContextManager } from '../dist/context.js';

test('SessionContextManager compacts at the context-window token threshold while retaining recent messages', () => {
  const manager = new SessionContextManager({ contextWindow: 70, reserveTokens: 16, keepRecentTokens: 20, countTokens: (text) => text.length });
  manager.addMessage({ role: 'user', content: 'old distress' });
  manager.addMessage({ role: 'assistant', content: 'old support' });
  manager.addMessage({ role: 'user', content: 'recent message' });

  const context = manager.buildContext({ mood: 'anxious' }, 'current input');

  assert.ok(context.summary.length <= 20);
  assert.deepEqual(context.recentMessages, [{ role: 'user', content: 'recent message' }]);
  assert.deepEqual(context.stateSnapshot, { mood: 'anxious' });
  assert.equal(context.currentInput, 'current input');
});

test('SessionContextManager bounds a persisted summary before combining it with compacted history', () => {
  const manager = new SessionContextManager({ contextWindow: 80, reserveTokens: 16, keepRecentTokens: 20, countTokens: (text) => text.length });
  manager.addMessage({ role: 'user', content: 'old message' });

  const context = manager.buildContext({ mood: 'anxious' }, 'now', 'persisted summary that is deliberately far too long');

  assert.ok(context.summary.length <= 20);
  assert.match(context.summary, /far too long/);
});
