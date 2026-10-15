import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hoverText } from '../server/details.ts';

test('hover normalizes LSP content forms without rendering HTML', () => {
  assert.equal(hoverText(null), null);
  assert.equal(hoverText({ contents: '' }), null);
  assert.equal(hoverText({ contents: { kind: 'markdown', value: '```python\n(value) x: int\n```\nDocs' } }), '(value) x: int\nDocs');
  assert.equal(hoverText({ contents: [{ language: 'typescript', value: 'const x: number' }, 'Docs'] }), 'const x: number\n\nDocs');
  assert.equal(hoverText({ contents: '<script>alert(1)</script>' }), '<script>alert(1)</script>');
  assert.throws(() => hoverText({ contents: { value: 42 } }));
});
