import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearResults, getResults, setResults, subscribeResults } from '../client/results.ts';

test('navigation panels isolate hosts/workspaces, retain results and release subscriptions on cleanup', () => {
  let notifications = 0;
  const unsubscribe = subscribeResults(() => notifications++);
  const first = { title: 'Usages: a.py:1', status: '0 usage result(s).', targets: [], open() {} };
  const second = { ...first, title: 'Definition: b.py:2' };
  try {
    setResults('host-a', 'workspace-a', first);
    setResults('host-a', 'workspace-b', second);
    setResults('host-b', 'workspace-a', second);
    assert.equal(getResults('host-a', 'workspace-a'), first);
    assert.equal(getResults('host-a', 'workspace-b'), second);
    assert.equal(getResults('host-a', 'missing'), undefined);
    clearResults('host-a');
    assert.equal(getResults('host-a', 'workspace-a'), undefined);
    assert.equal(getResults('host-a', 'workspace-b'), undefined);
    assert.equal(getResults('host-b', 'workspace-a'), second);
    assert.equal(notifications, 4);
    unsubscribe();
    clearResults('host-b');
    assert.equal(notifications, 4);
  } finally { unsubscribe(); clearResults('host-a'); clearResults('host-b'); }
});
