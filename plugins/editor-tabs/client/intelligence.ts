import type { EditorView } from '@codemirror/view';
import type { PluginTheme } from '@getpaseo/plugin';
import { nativeEditors, editorBuffers, type Binding } from './native.ts';
import { positionOffset, type Diagnostic, type EditorApi } from '../shared/contracts.ts';

export type IntelligenceColors = Pick<PluginTheme['colors'], 'border' | 'surface0' | 'foreground' | 'accent'>;
type RecordState = { binding: Binding; doc: EditorView['state']['doc']; changed: number; checked: number; pending: boolean; diagnostics: Diagnostic[] };

// Browser highlights style rendered text without adding a second CodeMirror runtime to the host state.
export class Intelligence {
  private records = new Map<EditorView, RecordState>();
  private id = `paseo-lsp-${Math.random().toString(36).slice(2)}`;
  private style = document.createElement('style');
  private tooltip = document.createElement('div');
  private stopped = false;
  private hoverTimer?: ReturnType<typeof setTimeout>;
  private frame = 0;
  private lastError = '';
  private workspaces = new Set<string>();
  private timer: ReturnType<typeof setInterval>;
  private observer: MutationObserver;
  constructor(private api: EditorApi, private hostId: string, private editorId: string, colors: IntelligenceColors, private notify: (message: string, error?: boolean) => void) {
    document.head.append(this.style);
    this.tooltip.dataset.lspTooltip = ''; this.tooltip.setAttribute('role', 'tooltip');
    document.body.append(this.tooltip); this.update(api, colors, notify); this.hide();
    document.addEventListener('mousemove', this.mouse, true);
    document.addEventListener('keydown', this.key, true);
    document.addEventListener('scroll', this.scroll, true);
    this.observer = new MutationObserver(() => { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); }); });
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.timer = setInterval(() => this.tick(), 250); this.tick();
  }
  update(api: EditorApi, colors: IntelligenceColors, notify: (message: string, error?: boolean) => void) {
    this.api = api; this.notify = notify;
    this.style.textContent = [1, 2, 3, 4].map(severity => `::highlight(${this.id}-${severity}) { text-decoration: underline wavy ${severity === 1 ? '#ed6666' : severity === 2 ? '#d6a642' : colors.accent}; text-underline-offset: 3px; }`).join('\n');
    this.tooltip.style.cssText = `display:none;position:fixed;z-index:100000;max-width:min(600px,calc(100vw - 16px));max-height:40vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;border:1px solid ${colors.border};border-radius:4px;background:${colors.surface0};color:${colors.foreground};font:13px/1.5 system-ui;box-shadow:0 2px 10px #0004`;
  }
  private hide() { clearTimeout(this.hoverTimer); this.tooltip.style.display = 'none'; }
  private key = () => this.hide();
  private scroll = () => { this.hide(); this.paint(); };
  private mouse = (event: MouseEvent) => {
    if (this.tooltip.contains(event.target as Node)) return;
    this.hide();
    const binding = nativeEditors(this.hostId).find(item => item.element.contains(event.target as Node));
    const record = binding && this.records.get(binding.view);
    if (!binding || !record || record.doc !== binding.view.state.doc) return;
    const offset = binding.view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (offset === null) return;
    const items = record.diagnostics.filter(item => { try { return positionOffset(record.doc.toString(), item.range.start) <= offset && positionOffset(record.doc.toString(), item.range.end) >= offset; } catch { return false; } });
    if (items.length) this.hoverTimer = setTimeout(() => {
      this.tooltip.textContent = items.map(item => `${item.severity === 1 ? 'Error' : item.severity === 2 ? 'Warning' : 'Info'}${item.source ? ` (${item.source}${item.code !== undefined ? ` ${item.code}` : ''})` : ''}: ${item.message}`).join('\n\n');
      this.tooltip.style.display = 'block';
      this.tooltip.style.left = `${Math.max(8, Math.min(event.clientX, innerWidth - this.tooltip.offsetWidth - 8))}px`;
      this.tooltip.style.top = `${Math.max(8, Math.min(event.clientY + 18, innerHeight - this.tooltip.offsetHeight - 8))}px`;
    }, 250);
  };
  private tick() {
    if (this.stopped || document.hidden) return;
    const bindings = nativeEditors(this.hostId);
    const views = new Set(bindings.map(binding => binding.view));
    for (const view of this.records.keys()) if (!views.has(view)) this.records.delete(view);
    for (const binding of bindings) {
      let record = this.records.get(binding.view);
      if (!record) { record = { binding, doc: binding.view.state.doc, changed: Date.now(), checked: 0, pending: false, diagnostics: [] }; this.records.set(binding.view, record); }
      record.binding = binding;
      if (record.doc !== binding.view.state.doc) { record.doc = binding.view.state.doc; record.changed = Date.now(); record.diagnostics = []; this.hide(); this.paint(); }
      if (record.pending || Date.now() - record.changed < 350 || Date.now() - record.checked < 1000 || !binding.element.getClientRects().length) continue;
      void this.check(record);
    }
    for (const workspace of this.workspaces) if (!bindings.some(binding => binding.pane.workspaceId === workspace)) {
      this.workspaces.delete(workspace); void this.api.release({ workspaceId: workspace, editorId: this.editorId }).catch(() => {});
    }
  }
  private async check(record: RecordState) {
    const { binding, doc } = record;
    const siblings = nativeEditors(this.hostId, binding.pane.workspaceId);
    const docs = siblings.map(item => item.view.state.doc);
    record.pending = true; record.checked = Date.now();
    try {
      this.workspaces.add(binding.pane.workspaceId);
      const response = await this.api.inspect({ workspaceId: binding.pane.workspaceId, editorId: this.editorId, path: binding.path, buffers: editorBuffers(binding, siblings), position: { line: 0, character: 0 } });
      if (this.stopped || doc !== binding.view.state.doc || siblings.some((item, index) => item.view.state.doc !== docs[index])) return;
      record.diagnostics = response.diagnostics; this.paint(); this.lastError = '';
    } catch (error) {
      record.diagnostics = []; this.paint();
      const message = error instanceof Error ? error.message : String(error);
      if (!this.stopped && message !== this.lastError && !/No LSP covers|Missing .paseo\/lsp.json/.test(message)) this.notify(message, true);
      this.lastError = message;
    } finally { record.pending = false; }
  }
  private paint() {
    if (this.stopped || !CSS.highlights || typeof Highlight === 'undefined') return;
    const highlights = [new Highlight(), new Highlight(), new Highlight(), new Highlight()];
    for (const { binding, doc, diagnostics } of this.records.values()) {
      if (!binding.element.isConnected || binding.view.state.doc !== doc || !binding.element.getClientRects().length) continue;
      const text = doc.toString();
      for (const diagnostic of diagnostics) {
        try {
          const from = positionOffset(text, diagnostic.range.start), to = positionOffset(text, diagnostic.range.end);
          for (const visible of binding.view.visibleRanges) {
            const start = Math.max(from, visible.from), end = Math.min(Math.max(from + 1, to), visible.to);
            if (start >= end) continue;
            const a = binding.view.domAtPos(start), b = binding.view.domAtPos(end);
            const range = document.createRange(); range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset);
            highlights[diagnostic.severity - 1].add(range);
          }
        } catch { /* A server range may refer to text that has since changed. */ }
      }
    }
    highlights.forEach((highlight, index) => CSS.highlights.set(`${this.id}-${index + 1}`, highlight));
  }
  async dispose() {
    this.stopped = true; clearInterval(this.timer); this.observer.disconnect(); cancelAnimationFrame(this.frame); this.hide();
    document.removeEventListener('mousemove', this.mouse, true); document.removeEventListener('keydown', this.key, true); document.removeEventListener('scroll', this.scroll, true);
    this.style.remove(); this.tooltip.remove(); for (let i = 1; i <= 4; i++) CSS.highlights?.delete(`${this.id}-${i}`);
    await Promise.all([...this.workspaces].map(workspaceId => this.api.release({ workspaceId, editorId: this.editorId }).catch(() => {})));
  }
}
