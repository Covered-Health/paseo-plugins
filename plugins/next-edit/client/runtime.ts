import type { EditorView } from '@codemirror/view';
import source from './ai-source.js';
import { moduleIds } from './metro.ts';
export async function hostRuntime(view: EditorView) {
  const requireHost = (globalThis as typeof globalThis & { __r?: (id: number) => unknown }).__r;
  if (!requireHost) throw new Error('Paseo CodeMirror module loader is unavailable');
  let state: typeof import('@codemirror/state') | undefined, hostView: typeof import('@codemirror/view') | undefined;
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
    const url = new URL(script.src, document.baseURI);
    if (url.origin !== location.origin) continue;
    const response = await fetch(url.href);
    if (!response.ok) continue;
    const text = await response.text();
    for (const id of moduleIds(text, 'EditorState')) {
      const candidate = requireHost(id) as typeof state;
      if (candidate?.EditorState === view.state.constructor) { state = candidate; break; }
    }
    for (const id of moduleIds(text, 'EditorView')) {
      const candidate = requireHost(id) as typeof hostView;
      if (candidate?.EditorView === view.constructor) { hostView = candidate; break; }
    }
    if (state && hostView) break;
  }
  if (!state || !hostView) throw new Error('Cannot find matching host CodeMirror modules');
  const modules: Record<string, unknown> = { '@codemirror/state': state, '@codemirror/view': hostView };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected CodeMirror dependency: ${name}`);
    return modules[name];
  }, module, module.exports);
  return { state, view: hostView, ai: module.exports as typeof import('./extension.ts') };
}
