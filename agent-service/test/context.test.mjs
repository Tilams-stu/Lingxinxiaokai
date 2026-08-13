import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionContextManager } from '../dist/context.js';

test('SessionContextManager compacts at the context-window token threshold while retaining recent messages', () => {
  const manager = new SessionContextManager({ contextWindow: 70, reserveTokens: 16, keepRecentTokens: 20, countTokens: (text) => text.length });
  manager.addMessage({ role: 'user', content: 'old distress' });
  manager.addMessage({ role: 'assistant', content: 'old support' });
  manager.addMessage({ role: 'user', content: 'recent message' });

  const context = manager.buildContext({ mood: 'anxious' }, 'current input');

  assert.match(context.summary, /old distress/);
  assert.deepEqual(context.recentMessages, [{ role: 'user', content: 'recent message' }]);
  assert.deepEqual(context.stateSnapshot, { mood: 'anxious' });
  assert.equal(context.currentInput, 'current input');
});
