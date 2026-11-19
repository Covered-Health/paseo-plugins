import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSettings, type PluginSurfaceProps, type SettingsState } from '@getpaseo/plugin/client';
import { SettingsInput, SettingsSwitch, SettingsAction } from '@getpaseo/plugin/client/ui';
import { preferences } from '../shared/prediction.ts';
export function PredictionSettings(props: PluginSurfaceProps) {
  const settings = useSettings(preferences);
  if (settings.status !== 'ready') return <View><Text style={{ color: props.theme.colors.foreground }}>{settings.status === 'loading' ? 'Loading…' : settings.error}</Text><SettingsAction label="Reload settings" actionLabel="Reload" onPress={() => { void settings.reload(); }} />{settings.status === 'invalid' && <SettingsAction label="Reset settings" actionLabel="Reset" onPress={() => { void settings.reset(); }} />}</View>;
  return <Editor key={settings.revision} {...props} settings={settings} />;
}
function Editor({ settings, theme }: PluginSurfaceProps & { settings: Extract<SettingsState<typeof preferences.schema>, { status: 'ready' }> }) {
  const [draft, setDraft] = useState(settings.values);
  return <View style={{ gap: 16 }}>
    <SettingsSwitch label="Enable next edit prediction" value={draft.enabled} onValueChange={enabled => setDraft({ ...draft, enabled })} />
    <SettingsInput label="Prediction proxy URL (from daemon host)" initialValue={draft.proxyUrl} onChangeText={proxyUrl => setDraft({ ...draft, proxyUrl })} />
    <Text style={{ color: theme.colors.foregroundMuted }}>When enabled, file text, file path and up to ten recent diffs are sent through this host to your proxy and configured model endpoint. Tab accepts a prediction; Escape dismisses it. Configure the model URL, name and credentials on the proxy host.</Text>
    <SettingsAction label="Save changes" actionLabel="Save" disabled={settings.saving} error={settings.saveError} onPress={() => { void settings.save(draft, settings.revision); }} />
  </View>;
}
