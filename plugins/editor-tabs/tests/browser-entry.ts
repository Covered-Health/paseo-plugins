import { createElement, createContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { NativeNavigation, nativeEditors } from '../client/native.ts';
import { getResults, subscribeResults } from '../client/results.ts';
import type { EditorApi } from '../shared/contracts.ts';

const workspaceId = new URL(location.href).searchParams.get('workspaceId');
if (!workspaceId) throw new Error('Missing workspaceId');
const hostId = 'native-browser-proof';
const base = 'plugins/editor-tabs/tests/fixtures/';
let nextResponse: Awaited<ReturnType<EditorApi['lookup']>> | Error | undefined;
const openedPanels: string[] = [];
const notices: { message: string; error?: boolean }[] = [];
const api: EditorApi = {
  lookup: input => {
    const response = nextResponse; nextResponse = undefined;
    return response instanceof Error ? Promise.reject(response) : response ? Promise.resolve(response) : call('lookup', input);
  }, release: input => call('release', input),
};
async function call(method: string, input: unknown) {
  const response = await fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, input }) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error); return body;
}
const Pane = createContext<unknown>(null);
const opened: string[] = [];
function HostEditor({ path, line }: { path: string; line: number }) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  useEffect(() => {
    let stopped = false;
    void fetch('/fixtures/' + path.split('/').at(-1)).then(response => response.text()).then(text => {
      if (stopped) return;
      const editor = new EditorView({ parent: parent.current!, state: EditorState.create({ doc: text }) }); view.current = editor;
      const row = editor.state.doc.line(Math.min(line, editor.state.doc.lines)); editor.dispatch({ selection: { anchor: row.from } });
    });
    return () => { stopped = true; view.current?.destroy(); };
  }, [path]);
  return createElement('div', { ref: parent, 'data-testid': 'file-source-editor', style: { height: '400px' } });
}
function NativeHost() {
  const [paths, setPaths] = useState([base + 'usage.py']);
  const [active, setActive] = useState(base + 'usage.py');
  const [line, setLine] = useState(1);
  function openFileInWorkspace(input: { location: { path: string; lineStart: number }; disposition: string }) {
    opened.push(input.location.path);
    setPaths(paths => paths.includes(input.location.path) ? paths : [...paths, input.location.path]); setActive(input.location.path); setLine(input.location.lineStart);
  }
  return createElement('div', null,
    createElement('nav', { 'aria-label': 'Native file tabs' }, paths.map(path => createElement('button', { key: path, onClick: () => setActive(path), 'aria-selected': active === path }, path))),
    paths.map(path => createElement(Pane.Provider, { key: path, value: { serverId: hostId, workspaceId, target: { kind: 'file', path }, openFileInWorkspace } },
      createElement('section', { style: { display: path === active ? 'block' : 'none' } }, createElement(HostEditor, { path, line })))),
  );
}
// Native-shaped host plus a DOM results consumer; production renders ResultsPanel through Paseo.
function Results() {
  const result = useSyncExternalStore(subscribeResults, () => getResults(hostId, workspaceId!));
  return createElement('aside', { 'data-navigation-results': '', 'aria-label': 'Navigation', style: { width: '320px' } },
    createElement('h2', null, 'Navigation'),
    createElement('div', { role: 'status' }, result?.status ?? 'No navigation yet'),
    result?.targets.map((target, index) => createElement('button', { key: index, onClick: () => result.open(target) }, `${target.path}:${target.range.start.line + 1}:${target.range.start.character + 1}`)));
}
const root = createRoot(document.getElementById('root')!);
root.render(createElement('div', { style: { display: 'flex' } }, createElement('main', { style: { flex: 1 } }, createElement(NativeHost)), createElement(Results)));
const adapter = new NativeNavigation(api, hostId, id => openedPanels.push(id), (message, error) => notices.push({ message, error }));
async function runChecks() {
  const assert = (value: unknown, detail: string) => { if (!value) throw new Error(detail); };
  const until = async (check: () => boolean, detail: string) => { const deadline = Date.now() + 15_000; while (!check()) { if (Date.now() > deadline) throw new Error(`Timed out: ${detail}`); await new Promise(resolve => setTimeout(resolve, 25)); } };
  const find = (suffix: string) => nativeEditors(hostId).find(binding => binding.path.endsWith(suffix));
  const status = () => document.querySelector('[data-navigation-results] [role=status]')?.textContent ?? '';
  const key = (view: EditorView, shift = false) => { const event = new KeyboardEvent('keydown', { key: 'F12', code: 'F12', keyCode: 123, shiftKey: shift, bubbles: true, cancelable: true }); view.contentDOM.dispatchEvent(event); return event.defaultPrevented; };
  const cursor = (view: EditorView, name: string) => { const offset = view.state.doc.toString().lastIndexOf(name); view.dispatch({ selection: { anchor: offset + 1 } }); view.focus(); };
  const selected = (suffix: string, word: string) => { const binding = find(suffix); return !!binding && binding.view.state.sliceDoc(binding.view.state.selection.main.from, binding.view.state.selection.main.to) === word; };
  const checks: string[] = [];
  await until(() => !!find('usage.py'), 'native editor mount');
  const usage = find('usage.py')!;
  cursor(usage.view, 'greet'); assert(key(usage.view), 'Native F12 not handled');
  await until(() => selected('symbol.py', 'greet'), 'native destination tab and selection');
  assert(opened.includes(base + 'symbol.py'), 'Did not use native openFileInWorkspace callback');
  checks.push('Python F12 opens a native tab and selects the symbol');
  const symbol = find('symbol.py')!;
  cursor(symbol.view, 'greet'); key(symbol.view, true);
  await until(() => status().includes('2 usage'), 'native Python usages');
  const result = [...document.querySelectorAll<HTMLButtonElement>('[data-navigation-results] button')].find(button => button.textContent?.endsWith('usage.py:2:11'))!;
  assert(result, 'Missing usage result'); result.click();
  await until(() => selected('usage.py', 'greet'), 'usage result native tab');
  checks.push('Shift+F12 and usage result use native tabs');
  const change = (view: EditorView, text: string) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  const symbolText = symbol.view.state.sliceDoc(), usageText = usage.view.state.sliceDoc();
  try {
    change(symbol.view, '\n' + symbolText.replaceAll('greet', 'welcome')); change(usage.view, usageText.replaceAll('greet', 'welcome'));
    cursor(usage.view, 'welcome'); key(usage.view);
    await until(() => selected('symbol.py', 'welcome'), 'unsaved native Python buffers');
    assert(symbol.view.state.doc.lineAt(symbol.view.state.selection.main.from).number === 2, 'Ignored unsaved target line');
    checks.push('unsaved Python symbols across native buffers');
  } finally { change(symbol.view, symbolText); change(usage.view, usageText); }
  const focusUsage = async () => { [...document.querySelectorAll<HTMLButtonElement>('nav button')].find(button => button.textContent === usage.path)!.click(); await until(() => usage.element.getClientRects().length > 0, 'native usage tab visibility'); };
  await focusUsage();
  const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  usage.view.contentDOM.dispatchEvent(context);
  assert(!context.defaultPrevented, 'Replaced native context menu');
  checks.push('native context menu is left untouched');
  await focusUsage(); symbol.view.dispatch({ selection: { anchor: 0 } }); cursor(usage.view, 'greet');
  const click = usage.view.coordsAtPos(usage.view.state.selection.main.head)!;
  usage.view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { clientX: click.left, clientY: (click.top + click.bottom) / 2, metaKey: true, button: 0, bubbles: true, cancelable: true }));
  await until(() => selected('symbol.py', 'greet'), 'Cmd-click native definition');
  checks.push('Cmd-click on native editor');
  assert(openedPanels.length === 1 && openedPanels.every(id => id === workspaceId), 'Navigation did not open the workspace results panel');
  assert(!document.querySelector('[data-editor-navigation]'), 'Floating navigation popup remains');
  checks.push('only multiple results select the navigation panel');
  nextResponse = { targets: [], omitted: 0 };
  cursor(symbol.view, 'greet'); key(symbol.view, true);
  await until(() => status().includes('0 usage'), 'empty results in panel');
  nextResponse = new Error('Config probe error'); key(symbol.view, true);
  await until(() => status().includes('Config probe error'), 'errors in panel');
  assert(!document.querySelector('[data-navigation-results] button'), 'Old results survived a failed lookup');
  assert(openedPanels.length === 1, 'Empty results or errors selected navigation panel');
  assert(notices.at(-2)?.message.includes('No usages') && notices.at(-1)?.error, 'Missing empty/error butter bars');
  checks.push('empty results and errors show notices without selecting the panel');
  nextResponse = { targets: [{ path: symbol.path, range: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } } }], omitted: 0 };
  cursor(usage.view, 'greet'); key(usage.view, true);
  await until(() => selected('symbol.py', 'greet'), 'single usage opens directly');
  assert(openedPanels.length === 1, 'Single usage selected navigation panel');
  const alien = document.createElement('div'); alien.setAttribute('data-testid', 'file-source-editor'); document.body.append(alien);
  const standalone = new EditorView({ parent: alien, state: EditorState.create({ doc: 'greet()' }) });
  assert(!key(standalone), 'Intercepted editor without a matching host pane'); standalone.destroy(); alien.remove();
  checks.push('unrecognized editors are left untouched');
  await adapter.dispose(); assert(!key(usage.view), 'Listeners survived plugin cleanup');
  checks.push('cleanup removes injected listeners');
  return checks;
}
Object.assign(window, { proof: { runChecks, dispose: async () => { await adapter.dispose(); root.unmount(); } } });
