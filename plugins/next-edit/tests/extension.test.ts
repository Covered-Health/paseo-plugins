import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { nextEditPrediction } from '../client/extension.ts';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const name of ['window', 'document', 'MutationObserver', 'HTMLElement', 'Node', 'Window'] as const) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const pause = (ms = 600) => new Promise(resolve => setTimeout(resolve, ms));
function key(view: EditorView, name: string) { view.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); }
function editor(fetchFn: Parameters<typeof nextEditPrediction>[0]['fetchFn'], lsp = false) {
  let accepted = 0;
  const parent = document.createElement('div'); document.body.append(parent);
  const view = new EditorView({ parent, state: EditorState.create({ doc: 'one keep two', extensions: [nextEditPrediction({ fetchFn, onEdit() {} }), lsp ? Prec.highest(keymap.of([{ key: 'Tab', run: () => { accepted++; return true; } }])) : []] }) });
  // jsdom has no focus/selection layout; exercise the editor's focus gate explicitly.
  Object.defineProperty(view, 'hasFocus', { value: true });
  return { view, accepted: () => accepted, close: () => { view.destroy(); parent.remove(); } };
}
test('preview and Tab accept exact disjoint changes and predicted cursor', async () => {
  const { view, close } = editor(async () => ({ newText: 'ONE keep TWO!', cursorOffset: 4 }));
  try {
    view.dispatch({ changes: { from: view.state.doc.length, insert: '!' } });
    await pause();
    assert.ok(view.dom.querySelector('.paseo-next-edit'));
    key(view, 'Tab');
    assert.equal(view.state.doc.toString(), 'ONE keep TWO!');
    assert.equal(view.state.selection.main.head, 4);
  } finally { close(); }
});
test('LSP highest keymap wins over prediction', async () => {
  const item = editor(async () => ({ newText: 'changed', cursorOffset: 7 }), true);
  try {
    item.view.dispatch({ changes: { from: 0, insert: '!' } }); await pause(); key(item.view, 'Tab');
    assert.equal(item.accepted(), 1); assert.equal(item.view.state.doc.toString(), '!one keep two');
  } finally { item.close(); }
});
test('selection movement and destruction discard pending responses', async () => {
  let resolve!: (value: { newText: string; cursorOffset: number }) => void;
  const item = editor(() => new Promise(done => { resolve = done; }));
  item.view.dispatch({ changes: { from: 0, insert: '!' } }); await pause();
  item.view.dispatch({ selection: { anchor: 2 } }); resolve({ newText: 'stale', cursorOffset: 0 }); await pause(10);
  assert.equal(!!item.view.dom.querySelector('.paseo-next-edit'), false);
  item.close();
  const destroyed = editor(() => new Promise(done => { resolve = done; }));
  destroyed.view.dispatch({ changes: { from: 0, insert: '!' } }); await pause();
  destroyed.close(); resolve({ newText: 'late', cursorOffset: 0 }); await pause(10);
  assert.equal(document.querySelector('.paseo-next-edit'), null);
});
test('Escape cancels debounce and leaves normal Tab available', async () => {
  let calls = 0;
  const item = editor(async () => { calls++; return null; });
  try {
    item.view.dispatch({ changes: { from: 0, insert: '!' } }); key(item.view, 'Escape'); await pause();
    assert.equal(calls, 0); assert.equal(!!item.view.dom.querySelector('.paseo-next-edit'), false);
  } finally { item.close(); }
});

test('no-edit responses never render cursor-only predictions or consume Tab', async () => {
  const item = editor(async state => ({ newText: state.doc.toString(), cursorOffset: state.doc.length }));
  try {
    item.view.dispatch({ changes: { from: 0, insert: '!' }, selection: { anchor: 1 } }); await pause();
    assert.equal(!!item.view.dom.querySelector('.paseo-next-edit'), false);
    const event = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    item.view.contentDOM.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(item.view.state.selection.main.head, 1);
  } finally { item.close(); }
});

test('loading indicator follows only the current request and disappears on failure or removal', async () => {
  const requests: { resolve(value: null): void; reject(error: Error): void }[] = [];
  const item = editor(() => new Promise((resolve, reject) => requests.push({ resolve, reject })));
  const indicator = () => item.view.dom.querySelector<HTMLElement>('.paseo-next-edit-loading');
  try {
    item.view.dispatch({ changes: { from: 0, insert: 'a' } });
    assert.equal(indicator()?.hidden, true);
    await pause(); assert.equal(indicator()?.hidden, false);
    assert.equal(indicator()?.getAttribute('role'), 'status');
    item.view.dispatch({ changes: { from: 0, insert: 'b' } });
    assert.equal(indicator()?.hidden, true);
    await pause(); assert.equal(indicator()?.hidden, false);
    requests[0]!.resolve(null); await pause(10);
    assert.equal(indicator()?.hidden, false);
    requests[1]!.reject(new Error('offline')); await pause(10);
    assert.equal(indicator()?.hidden, true);
    item.view.dispatch({ changes: { from: 0, insert: 'c' } }); await pause();
    assert.equal(indicator()?.hidden, false);
    key(item.view, 'Escape'); assert.equal(indicator()?.hidden, true);
    requests[2]!.resolve(null); await pause(10);
  } finally { item.close(); }
  assert.equal(document.querySelector('.paseo-next-edit-loading'), null);
});
