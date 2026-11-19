import type { EditorView } from '@codemirror/view';
type Pane = {
  serverId: string; workspaceId: string; target: { kind: string; path?: string };
  openTab?(target: Pane['target']): void;
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
    // shortcut: CodeMirror stores its view on a private DOM tile; update if that layout changes.
    const content = element.querySelector('.cm-content') as (HTMLElement & { cmTile?: { root?: { view?: EditorView } } }) | null;
    const view = content?.cmTile?.root?.view;
    if (view && !view.state.readOnly) bindings.push({ element, pane, view, path: pane.target.path });
  }
  return bindings;
}
