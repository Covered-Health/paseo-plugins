import type { PluginClientContext } from '@getpaseo/plugin/client';
import { Installer } from './client/installer.tsx';
import { PredictionSettings } from './client/settings.tsx';
export default function contribute(client: PluginClientContext) {
  const removeSettings = client.addSettingsScreen({ id: 'prediction', title: 'Next edit prediction', icon: 'Sparkles', Component: PredictionSettings });
  const removeInstaller = client.addSidebarFooterItem({ id: 'prediction-installer', title: 'Next edit prediction', Component: Installer });
  return () => { removeInstaller(); removeSettings(); };
}
