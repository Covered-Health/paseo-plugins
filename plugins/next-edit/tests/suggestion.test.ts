import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editSpan, recentDiff } from '../client/suggestion.ts';
import { request, result, preferences } from '../shared/prediction.ts';
test('keeps unchanged text between disjoint edits and preserves Unicode', () => {
  for (const [before, after] of [['one keep two', 'ONE keep TWO'], ['😀abc', '😁xyz'], ['same', 'same'], ['', 'new'], ['old', '']]) {
    const span = editSpan(before!, after!);
    assert.equal(before!.slice(0, span.from) + span.insert + before!.slice(span.to), after);
  }
});
test('history is a unified hunk without duplicate file headers', () => {
  const diff = recentDiff('a\nb\n', 'a\nc\n');
  assert.match(diff, /@@ -1,2 \+1,2 @@/); assert.match(diff, /-b\n\+c/); assert.doesNotMatch(diff, /--- buffer/);
});
test('validates offsets and endpoints, defaults disabled', () => {
  assert.equal(preferences.schema.parse({}).enabled, false);
  assert.equal(request.safeParse({ path: 'a', text: '', cursorOffset: 1, history: [] }).success, false);
  assert.equal(result.safeParse({ newText: '', cursorOffset: 1 }).success, false);
  assert.equal(preferences.schema.safeParse({ proxyUrl: 'file:///etc/passwd' }).success, false);
});
