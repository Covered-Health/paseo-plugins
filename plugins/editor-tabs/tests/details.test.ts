import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hoverText, signatureInfo } from '../server/details.ts';

test('hover normalizes LSP content forms without rendering HTML', () => {
  assert.equal(hoverText(null), null);
  assert.equal(hoverText({ contents: '' }), null);
  assert.equal(hoverText({ contents: { kind: 'markdown', value: '```python\n(value) x: int\n```\nDocs' } }), '(value) x: int\nDocs');
  assert.equal(hoverText({ contents: [{ language: 'typescript', value: 'const x: number' }, 'Docs'] }), 'const x: number\n\nDocs');
  assert.equal(hoverText({ contents: '<script>alert(1)</script>' }), '<script>alert(1)</script>');
  assert.throws(() => hoverText({ contents: { value: 42 } }));
});

test('signature help selects overloads and active parameters using UTF-16 offsets or labels', () => {
  assert.equal(signatureInfo(null), null);
  assert.equal(signatureInfo({ signatures: [] }), null);
  const value = signatureInfo({ activeSignature: 1, activeParameter: 0, signatures: [{ label: 'other()' }, { label: 'greet(name: str, count: int)', activeParameter: 1, documentation: { kind: 'plaintext', value: 'Repeat a greeting.' }, parameters: [{ label: 'name: str' }, { label: [17, 27], documentation: 'How many' }] }] });
  assert.deepEqual(value, { label: 'greet(name: str, count: int)', parameter: [17, 27], documentation: 'Repeat a greeting.\n\nHow many', index: 1, count: 2 });
  const label = 'fn(😀: str, count: int)';
  const from = label.indexOf('count'), to = label.length - 1;
  assert.deepEqual(signatureInfo({ signatures: [{ label, parameters: [{ label: [from, to] }] }] })?.parameter, [from, to]);
  assert.deepEqual(signatureInfo({ signatures: [{ label, parameters: [{ label: 'count: int' }] }] })?.parameter, [from, to]);
  assert.equal(signatureInfo({ signatures: [{ label, parameters: [{ label: [99, 100] }] }] })?.parameter, undefined);
});
