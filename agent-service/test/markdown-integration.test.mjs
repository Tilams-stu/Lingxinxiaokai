import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pages = [
  '../../templates/index（心理陪伴）.html',
  '../../templates/index（心理科普）.html'
];

test('chat pages render assistant Markdown instead of replacing it with plain text', async () => {
  for (const page of pages) {
    const source = await readFile(new URL(page, import.meta.url), 'utf8');
    assert.match(source, /LxMarkdown\.render\(/);
    assert.match(source, /role === 'assistant'\) messageBody\.innerHTML = md\(content\)/);
  }
});

test('admin page exposes read-only user search and session inspection contracts', async () => {
  const source = await readFile(new URL('../../web/src/views/AdminView.vue', import.meta.url), 'utf8');
  assert.match(source, /\/api\/users['"`]/);
  assert.match(source, /\/api\/users\//);
  assert.match(source, /session_id/);
  assert.match(source, /chat_count/);
  assert.match(source, /搜索|search/i);
  assert.match(source, /导出/);
});

test('companion assessment page renders collection progress before safe state fields', async () => {
  const source = await readFile(new URL('../../templates/index（心理陪伴）.html', import.meta.url), 'utf8');
  assert.match(source, /status === ['"`]collecting['"`]/);
  assert.match(source, /remaining/);
  assert.match(source, /还需要/);
  assert.match(source, /暂无明确提及/);
});
