import type { Target } from '../shared/contracts.ts';

export type NavigationResults = { title: string; status: string; targets: Target[]; open(target: Target): void };
const results = new Map<string, NavigationResults>();
const listeners = new Set<() => void>();
const key = (hostId: string, workspaceId: string) => JSON.stringify([hostId, workspaceId]);
export function getResults(hostId: string, workspaceId: string) { return results.get(key(hostId, workspaceId)); }
export function subscribeResults(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setResults(hostId: string, workspaceId: string, value: NavigationResults) {
  results.set(key(hostId, workspaceId), value);
  for (const listener of listeners) listener();
}
export function clearResults(hostId: string) {
  for (const entry of results.keys()) if (JSON.parse(entry)[0] === hostId) results.delete(entry);
  for (const listener of listeners) listener();
}
