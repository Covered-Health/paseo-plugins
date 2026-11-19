import type { PluginServerContext } from '@getpaseo/plugin/server';
import { predictEdit } from './server/prediction.ts';
import { preferences, predict } from './shared/prediction.ts';
export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  server.handle(predict, async input => {
    const current = await settings.read();
    if (current.status !== 'ready' || !current.values.enabled) throw new Error('Next edit prediction is disabled.');
    return predictEdit(input, current.values);
  });
  return () => {};
}
