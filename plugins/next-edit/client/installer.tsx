import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRpc, useSettings, type PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { useToast } from '@getpaseo/plugin/client/react-native';
import { preferences, predict } from '../shared/prediction.ts';
import { nativeEditors } from './native.ts';
import { hostRuntime } from './runtime.ts';
import { recentDiff } from './suggestion.ts';
import type { EditorView } from '@codemirror/view';

export function Installer({ host }: PluginSidebarItemProps) {
  const settings = useSettings(preferences), fetchPrediction = useRpc(predict), toast = useToast();
  const enabled = settings.status === 'ready' && settings.values.enabled;
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    let stopped = false, failed = false, runtime: ReturnType<typeof hostRuntime> | undefined;
    const installed = new Map<EditorView, () => void>();
    async function scan() {
      const bindings = nativeEditors(host.id), views = new Set(bindings.map(binding => binding.view));
      for (const [view, remove] of installed) if (!views.has(view)) { remove(); installed.delete(view); }
      for (const binding of bindings) {
        const { view } = binding;
        if (installed.has(view)) continue;
        const pending = () => {};
        installed.set(view, pending);
        try {
          const { state, view: hostView, ai } = await (runtime ??= hostRuntime(view));
          if (stopped || installed.get(view) !== pending || !binding.element.isConnected) continue;
          if (view.state.constructor !== state.EditorState || view.constructor !== hostView.EditorView) throw new Error('CodeMirror runtime changed');
          const compartment = new state.Compartment();
          const history: { diff: string }[] = [];
          let alive = true;
          const extension = ai.nextEditPrediction({
            onEdit(oldDoc, newDoc) {
              if (oldDoc.length > 500_000 || newDoc.length > 500_000) { history.length = 0; return; }
              const diff = recentDiff(oldDoc, newDoc);
              if (diff.length <= 16_000 && diff !== history.at(-1)?.diff) history.push({ diff });
              if (history.length > 10) history.shift();
            },
            async fetchFn(editor) {
              const text = editor.doc.toString();
              if (!alive || text.length > 500_000) return null;
              try {
                const response = await fetchPrediction({ path: binding.path, text, cursorOffset: editor.selection.main.head, history: [...history] });
                failed = false; return response;
              } catch (error) {
                if (alive && !failed) { failed = true; toast.error(`Next edit prediction: ${String(error)}`); }
                return null;
              }
            },
          });
          view.dispatch({ effects: state.StateEffect.appendConfig.of(compartment.of(extension)) });
          installed.set(view, () => { alive = false; try { view.dispatch({ effects: compartment.reconfigure([]) }); } catch { /* View already destroyed. */ } });
        } catch (error) { if (!stopped && !failed) { failed = true; toast.error(`Next edit prediction unavailable: ${String(error)}`); } }
      }
    }
    const timer = setInterval(() => { void scan(); }, 500); void scan();
    return () => { stopped = true; clearInterval(timer); for (const remove of installed.values()) remove(); installed.clear(); };
  }, [host.id, enabled, fetchPrediction, toast]);
  return null;
}
