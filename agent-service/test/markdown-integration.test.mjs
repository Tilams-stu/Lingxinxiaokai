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
