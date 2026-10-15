import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { useRpc, type PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { useToast } from '@getpaseo/plugin/client/react-native';
import { lookup, release } from '../shared/contracts.ts';
import { NativeNavigation } from './native.ts';

const adapters = new Map<string, NativeNavigation>();
export function NativeInstaller({ host, openResults }: PluginSidebarItemProps & { openResults(workspaceId: string): void }) {
  const toast = useToast();
  const notify = useMemo(() => (message: string, error = false) => { if (error) toast.error(message); else toast.show(message); }, [toast]);
  const find = useRpc(lookup), close = useRpc(release);
  const api = useMemo(() => ({ lookup: find, release: close }), [find, close]);
  const current = useRef<NativeNavigation | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const adapter = new NativeNavigation(api, host.id, openResults, notify); adapters.set(host.id, adapter); current.current = adapter;
    return () => { if (adapters.get(host.id) === adapter) adapters.delete(host.id); current.current = null; void adapter.dispose(); };
  }, [host.id]);
  useEffect(() => { current.current?.update(api, notify); }, [api, notify]);
  return null;
}
export async function disposeNative() { const all = [...adapters.values()]; adapters.clear(); await Promise.all(all.map(adapter => adapter.dispose())); }
