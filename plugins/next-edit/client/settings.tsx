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
    <SettingsInput label="Model completions URL (from daemon host)" initialValue={draft.modelUrl} onChangeText={modelUrl => setDraft({ ...draft, modelUrl })} />
    <SettingsInput label="Model name" initialValue={draft.model} onChangeText={model => setDraft({ ...draft, model })} />
    <SettingsInput label="API key (optional)" secureTextEntry initialValue={draft.apiKey} onChangeText={apiKey => setDraft({ ...draft, apiKey })} />
    <Text style={{ color: theme.colors.foregroundMuted }}>When enabled, file text, file path and up to ten recent diffs are sent through this host to your configured model endpoint. Tab accepts a prediction; Escape dismisses it. Use an OpenAI-compatible text completions endpoint serving Zeta 2.1.</Text>
    <SettingsAction label="Save changes" actionLabel="Save" disabled={settings.saving} error={settings.saveError} onPress={() => { void settings.save(draft, settings.revision); }} />
  </View>;
}
