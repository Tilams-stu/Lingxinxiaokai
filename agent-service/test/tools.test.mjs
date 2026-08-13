import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSupportTools, sourceForLocalTool } from '../dist/tools.js';

test('createLocalSupportTools exposes only local psychoeducation and support-resource tools', () => {
  const tools = createLocalSupportTools();
  assert.deepEqual(tools.map((tool) => tool.name), ['lookup_psychoeducation', 'get_support_resources']);
  assert.equal(tools.some((tool) => /bash|shell|file|network|fetch|database/i.test(tool.name)), false);
});

test('support-resource tool returns local crisis and campus contacts without external side effects', async () => {
  const resources = await createLocalSupportTools()[1].execute('test', { region: '中国' }, undefined);
  assert.match(resources.content[0].text, /12356/);
  assert.match(resources.content[0].text, /110.*120/);
  assert.match(resources.content[0].text, /学校心理中心/);
});

test('approved psychoeducation tool has display-safe local source metadata', () => {
  assert.deepEqual(sourceForLocalTool('lookup_psychoeducation'), { label: '本地审核心理科普卡', url: 'https://www.nhc.gov.cn/' });
  assert.equal(sourceForLocalTool('get_support_resources'), undefined);
});
