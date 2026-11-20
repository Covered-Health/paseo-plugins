import { StateEffect, StateField, Prec, type EditorState } from '@codemirror/state';
import { Decoration, WidgetType, ViewPlugin, keymap, EditorView } from '@codemirror/view';
import { editSpan } from './suggestion.ts';
type Prediction = { newText: string; cursorOffset: number };
type Pending = Prediction & { doc: EditorState['doc']; head: number };
export function nextEditPrediction(options: { fetchFn(state: EditorState): Promise<Prediction | null>; onEdit(oldText: string, newText: string): void; onError?(error: unknown): void }) {
  const show = StateEffect.define<Pending | null>();
  const field: StateField<Pending | null> = StateField.define<Pending | null>({
    create: () => null,
    update(value, tr) {
      if (tr.docChanged || tr.selection) value = null;
      for (const effect of tr.effects) if (effect.is(show)) value = effect.value;
      return value && value.doc === tr.state.doc && value.head === tr.state.selection.main.head ? value : null;
    },
    provide: field => decorations(field),
  });
  function accept(view: EditorView) {
    const value = view.state.field(field);
    if (!value) return false;
    view.dispatch({ changes: editSpan(value.doc.toString(), value.newText), selection: { anchor: value.cursorOffset }, userEvent: 'input.complete' });
    return true;
  }
  function reject(view: EditorView) {
    const value = view.state.field(field);
    view.dispatch({ effects: show.of(null) });
    return !!value;
  }
  class Preview extends WidgetType {
    readonly text: string;
    constructor(text: string) { super(); this.text = text; }
    toDOM(view: EditorView) {
      const element = document.createElement('span');
      element.className = 'paseo-next-edit';
      element.style.cssText = 'white-space:pre-wrap;color:inherit;background:color-mix(in srgb,#27ae60 22%,transparent)';
      const code = document.createElement('span'); code.textContent = this.text; element.append(code);
      for (const [label, action] of [['Accept prediction', accept], ['Dismiss prediction', reject]] as const) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label.startsWith('Accept') ? 'Accept ⇥' : 'Dismiss'; button.setAttribute('aria-label', label);
        button.onmousedown = event => event.preventDefault(); button.onclick = event => { event.preventDefault(); event.stopPropagation(); action(view); view.focus(); };
        element.append(button);
      }
      return element;
    }
    ignoreEvent() { return true; }
  }
  function decorations(source: StateField<Pending | null>) {
    return EditorView.decorations.from(source, value => {
      if (!value) return Decoration.none;
      const span = editSpan(value.doc.toString(), value.newText), decorations = [];
      if (span.from < span.to) decorations.push(Decoration.mark({ attributes: { style: 'text-decoration:line-through;background:color-mix(in srgb,#e74c3c 22%,transparent)' } }).range(span.from, span.to));
      decorations.push(Decoration.widget({ widget: new Preview(span.insert), side: 1 }).range(span.from));
      return Decoration.set(decorations, true);
    });
  }
  const plugin = ViewPlugin.fromClass(class {
    timer?: ReturnType<typeof setTimeout>;
    generation = 0;
    destroyed = false;
    inFlight = false;
    queued?: () => void;
    indicator = document.createElement('span');
    animation?: Animation;
    constructor(view: EditorView) {
      this.indicator.className = 'paseo-next-edit-loading';
      this.indicator.setAttribute('role', 'status');
      this.indicator.setAttribute('aria-label', 'Predicting next edit');
      this.indicator.title = 'Predicting next edit…';
      this.indicator.style.cssText = 'position:absolute;right:8px;bottom:8px;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;opacity:.45;pointer-events:none;z-index:5';
      this.indicator.hidden = true;
      view.dom.append(this.indicator);
    }
    loading(active: boolean) {
      this.indicator.hidden = !active;
      this.animation?.cancel(); this.animation = undefined;
      if (active && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        this.animation = this.indicator.animate?.([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 900, iterations: Infinity });
      }
    }
    invalidate() { this.generation++; clearTimeout(this.timer); this.queued = undefined; this.loading(false); }
    update(update: import('@codemirror/view').ViewUpdate) {
      if (!update.docChanged && !update.selectionSet && !update.focusChanged) return;
      this.invalidate();
      const generation = this.generation;
      if (update.docChanged) options.onEdit(update.startState.doc.toString(), update.state.doc.toString());
      if (!update.docChanged || !update.view.hasFocus || update.transactions.some(tr => tr.isUserEvent('input.complete'))) return;
      const state = update.state, view = update.view;
      const run = () => {
        if (this.destroyed || generation !== this.generation || !view.hasFocus) return;
        this.inFlight = true;
        this.loading(true);
        void Promise.resolve().then(() => options.fetchFn(state)).then(value => {
          if (!value || this.destroyed || generation !== this.generation || !view.hasFocus || state.doc !== view.state.doc) return;
          if (value.newText === state.doc.toString()) return;
          view.dispatch({ effects: show.of({ ...value, doc: state.doc, head: state.selection.main.head }) });
        }).catch(error => {
          if (!this.destroyed && generation === this.generation && view.hasFocus) options.onError?.(error);
        }).finally(() => {
          this.inFlight = false;
          if (!this.destroyed && generation === this.generation) this.loading(false);
          const next = this.queued; this.queued = undefined; next?.();
        });
      };
      this.timer = setTimeout(() => { if (this.inFlight) { this.queued = run; this.loading(true); } else run(); }, 500);
    }
    destroy() { this.destroyed = true; this.invalidate(); this.indicator.remove(); }
  });
  return [field, plugin, EditorView.domEventHandlers({ blur: (_event, view) => { view.dispatch({ effects: show.of(null) }); return false; } }), Prec.high(keymap.of([
    { key: 'Tab', run: view => view.dom.querySelector('.cm-tooltip-autocomplete') ? false : accept(view) },
    { key: 'Escape', run: view => { const pending = view.plugin(plugin); pending?.invalidate(); return reject(view); } },
  ]))];
}
