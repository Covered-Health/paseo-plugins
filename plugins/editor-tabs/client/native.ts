import { EditorView } from '@codemirror/view';
import type { EditorApi, Target } from '../shared/contracts.ts';
import { setResults, clearResults } from './results.ts';

type Pane = {
  serverId: string; workspaceId: string; target: { kind: string; path?: string };
  openFileInWorkspace(input: { location: { path: string; lineStart: number; lineEnd: number }; disposition: 'main' }): void;
};
type Fiber = { memoizedProps?: Record<string, unknown>; return?: Fiber | null };
export type Binding = { element: HTMLElement; view: EditorView; pane: Pane; path: string };
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

// shortcut: React's DOM fiber key and Paseo's pane context are private; fail closed if their shapes change.
export function nativePane(element: HTMLElement): Pane | undefined {
  const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
  let fiber = key ? (element as unknown as Record<string, Fiber>)[key] : undefined;
  for (let depth = 0; fiber && depth < 150; depth++, fiber = fiber.return ?? undefined) {
    const value = fiber.memoizedProps?.value;
    if (object(value) && typeof value.serverId === 'string' && typeof value.workspaceId === 'string' && object(value.target) && typeof value.openFileInWorkspace === 'function') return value as unknown as Pane;
  }
}
export function nativeEditors(hostId: string, workspaceId?: string): Binding[] {
  const bindings: Binding[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('[data-testid="file-source-editor"]')) {
    const pane = nativePane(element);
    if (!pane || pane.serverId !== hostId || (workspaceId && pane.workspaceId !== workspaceId) || pane.target.kind !== 'file' || !pane.target.path) continue;
    const view = EditorView.findFromDOM(element);
    if (view && !view.state.readOnly) bindings.push({ element, pane, view, path: pane.target.path });
  }
  return bindings;
}
export function editorBuffers(source: Binding, bindings = nativeEditors(source.pane.serverId, source.pane.workspaceId)) {
  const buffers = new Map<string, string>();
  for (const binding of bindings) {
    const text = binding.view.state.sliceDoc();
    if (binding.path !== source.path && buffers.has(binding.path) && buffers.get(binding.path) !== text) throw new Error('Another file has differing buffers in multiple native panes. Save or reconcile those panes first.');
    buffers.set(binding.path, text);
  }
  buffers.set(source.path, source.view.state.sliceDoc());
  return [...buffers].map(([path, text]) => ({ path, text }));
}
export class NativeNavigation {
  private editorId = `native-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private sessions = new Set<string>();
  private stopped = false;
  private request = 0;
  private busy = false;
  private pending = new Set<() => void>();
  constructor(private api: EditorApi, readonly hostId: string, private openResults: (workspaceId: string) => void, private notify: (message: string, error?: boolean) => void) {
    document.addEventListener('keydown', this.key, true);
    document.addEventListener('mousedown', this.mouse, true);
  }
  update(api: EditorApi, notify: (message: string, error?: boolean) => void) { this.api = api; this.notify = notify; }
  private binding(event: Event) {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-testid="file-source-editor"]') : null;
    return element ? nativeEditors(this.hostId).find(binding => binding.element === element) : undefined;
  }
  private key = (event: KeyboardEvent) => {
    if (event.key !== 'F12' || event.altKey || event.ctrlKey || event.metaKey) return;
    const binding = this.binding(event); if (!binding) return;
    event.preventDefault(); event.stopImmediatePropagation(); void this.navigate(binding, event.shiftKey ? 'references' : 'definition');
  };
  private mouse = (event: MouseEvent) => {
    if (event.button !== 0 || !(event.metaKey || event.ctrlKey)) return;
    const binding = this.binding(event); if (!binding) return;
    const offset = binding.view.posAtCoords({ x: event.clientX, y: event.clientY }); if (offset === null) return;
    binding.view.dispatch({ selection: { anchor: offset } });
    event.preventDefault(); event.stopImmediatePropagation(); void this.navigate(binding, 'definition');
  };
  private async destination(source: Binding, target: Target) {
    if (this.stopped) return;
    const found = new Promise<Binding>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const stop = () => { observer.disconnect(); clearTimeout(timer); this.pending.delete(cancel); };
      const cancel = () => { stop(); reject(new Error('Native navigation stopped.')); };
      const check = () => {
        const binding = nativeEditors(this.hostId, source.pane.workspaceId).find(binding => binding.path === target.path && binding.element.getClientRects().length > 0 && getComputedStyle(binding.element).visibility !== 'hidden');
        if (binding) { stop(); resolve(binding); }
      };
      const observer = new MutationObserver(check); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'data-state'] });
      this.pending.add(cancel); timer = setTimeout(() => { stop(); reject(new Error('Paseo did not expose the destination editor. Native adapter may need updating.')); }, 5000);
      source.pane.openFileInWorkspace({ location: { path: target.path, lineStart: target.range.start.line + 1, lineEnd: target.range.end.line + 1 }, disposition: 'main' });
      // React commits/effects run before the next task, including an already mounted destination.
      setTimeout(check, 0);
    });
    const binding = await found;
    const offset = (point: Target['range']['start']) => {
      if (point.line >= binding.view.state.doc.lines) throw new Error('Destination changed; rerun navigation.');
      const line = binding.view.state.doc.line(point.line + 1);
      if (point.character > line.length) throw new Error('Destination changed; rerun navigation.');
      return line.from + point.character;
    };
    binding.view.dispatch({ selection: { anchor: offset(target.range.start), head: offset(target.range.end) }, scrollIntoView: true }); binding.view.focus();
  }
  async navigate(source: Binding, kind: 'definition' | 'references') {
    if (this.stopped || this.busy) return;
    this.busy = true; const request = ++this.request;
    const state = source.view.state;
    const head = state.selection.main.head, line = state.doc.lineAt(head);
    const publish = (status: string, targets: Target[] = []) => {
      if (this.stopped || request !== this.request) return;
      setResults(this.hostId, source.pane.workspaceId, {
        title: `${kind === 'definition' ? 'Definition' : 'Usages'}: ${source.path}:${line.number}`,
        status, targets,
        open: target => { void this.destination(source, target).catch(error => { publish(String(error)); this.notify(String(error), true); }); },
      });
    };
    try {
      publish(`Finding ${kind === 'definition' ? 'definition' : 'usages'}…`);
      const buffers = editorBuffers(source);
      this.sessions.add(source.pane.workspaceId);
      const response = await this.api.lookup({ workspaceId: source.pane.workspaceId, editorId: this.editorId, path: source.path, buffers, position: { line: line.number - 1, character: head - line.from }, kind });
      if (this.stopped || request !== this.request) return;
      if (!source.element.isConnected || source.view.state.doc !== state.doc || source.view.state.selection.main.head !== head) { throw new Error('Editor changed during lookup; rerun navigation.'); }
      publish(`${response.targets.length} ${kind === 'definition' ? 'definition' : 'usage'} result(s).${response.omitted ? ` ${response.omitted} external, unavailable or excess targets omitted.` : ''}`, response.targets);
      if (response.targets.length === 1) await this.destination(source, response.targets[0]);
      else if (response.targets.length > 1) this.openResults(source.pane.workspaceId);
      else this.notify(`No ${kind === 'definition' ? 'definition' : 'usages'} found.${response.omitted ? ` ${response.omitted} targets outside the workspace or unavailable.` : ''}`);
    } catch (error) { if (!this.stopped && request === this.request) { const message = error instanceof Error ? error.message : String(error); publish(message); this.notify(message, true); } }
    finally { this.busy = false; }
  }
  async dispose() {
    this.stopped = true; this.request++; for (const cancel of [...this.pending]) cancel();
    document.removeEventListener('keydown', this.key, true); document.removeEventListener('mousedown', this.mouse, true);
    clearResults(this.hostId);
    await Promise.all([...this.sessions].map(workspaceId => this.api.release({ workspaceId, editorId: this.editorId }).catch(() => {})));
  }
}
