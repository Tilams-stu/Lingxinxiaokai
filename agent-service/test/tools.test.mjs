import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSupportTools } from '../dist/tools.js';

test('createLocalSupportTools exposes only local knowledge and grounding support tools', () => {
  const tools = createLocalSupportTools();
  assert.deepEqual(tools.map((tool) => tool.name), ['mental_support_knowledge', 'grounding_exercise']);
  assert.equal(tools.some((tool) => /bash|shell|file|network|fetch|database/i.test(tool.name)), false);
});

test('grounding tool returns a local sensory exercise without external side effects', async () => {
  const exercise = await createLocalSupportTools()[1].execute('test', {}, undefined);
  assert.match(exercise.content[0].text, /5.*4.*3.*2.*1/);
});
