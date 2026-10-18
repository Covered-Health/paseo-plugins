import { useSyncExternalStore } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { getResults, subscribeResults } from './results.ts';

export function ResultsPanel({ host, workspaceId, theme, layout }: PluginWorkspacePanelProps) {
  const result = useSyncExternalStore(subscribeResults, () => getResults(host.id, workspaceId));
  const colors = theme.colors;
  return <View style={{ flex: 1, backgroundColor: colors.surface0, padding: layout.compact ? 8 : 12 }}>
    {result && <Text style={{ color: colors.foreground, marginBottom: 8 }} selectable>{result.title}</Text>}
    <Text accessibilityLiveRegion="polite" style={{ color: colors.foregroundMuted, marginBottom: 8 }} selectable>
      {result?.status ?? 'Use F12 for definition or Shift+F12 for usages in a file editor.'}
    </Text>
    <ScrollView style={{ flex: 1 }}>
      {result?.targets.map((target, index) => <Pressable key={index} accessibilityRole="button"
        accessibilityLabel={`${target.path}, line ${target.range.start.line + 1}, column ${target.range.start.character + 1}`}
        onPress={() => result.open(target)}
        style={({ pressed }) => ({ padding: 8, marginBottom: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 4, backgroundColor: pressed ? colors.surface2 : colors.surface1 })}>
        <Text style={{ color: colors.foreground }}>{target.path}</Text>
        <Text style={{ color: colors.foregroundMuted }}>Line {target.range.start.line + 1}, column {target.range.start.character + 1}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}
