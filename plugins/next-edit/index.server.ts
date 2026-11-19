import type { PluginServerContext } from '@getpaseo/plugin/server';
import { preferences, predict, result } from './shared/prediction.ts';
export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  server.handle(predict, async input => {
    const current = await settings.read();
    if (current.status !== 'ready' || !current.values.enabled) throw new Error('Next edit prediction is disabled.');
    const response = await fetch(current.values.proxyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Prediction proxy returned HTTP ${response.status}`);
    return result.parse(await response.json());
  });
  return () => {};
}
