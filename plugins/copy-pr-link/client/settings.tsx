import { useEffect, useState } from "react";
import type { PluginSurfaceProps, SettingsState } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { SettingsSection, SettingsCard, SettingsSwitch, SettingsInput, SettingsSelect, SettingsAction, ExternalLink } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { preferences, type Preferences } from "../shared/settings.ts";

export function PrSettings(props: PluginSurfaceProps & { onChange(values: Preferences): void }) {
  const settings = useSettings(preferences);
  useEffect(() => { if (settings.status === "ready") props.onChange(settings.values); }, [settings.status, settings.status === "ready" ? settings.revision : null]);
  if (settings.status !== "ready") return <View>
    <Text style={{ color: props.theme.colors.foreground }}>{settings.status === "loading" ? "Loading settings…" : settings.error}</Text>
    {settings.status !== "loading" && <SettingsAction label="Reload settings" actionLabel="Reload" onPress={() => { void settings.reload(); }} />}
    {settings.status === "invalid" && <SettingsAction label="Reset settings" actionLabel="Reset" onPress={() => { void settings.reset(); }} />}
  </View>;
  return <Editor key={settings.revision} {...props} settings={settings} />;
}

function Editor({ settings, onChange, theme }: PluginSurfaceProps & { settings: Extract<SettingsState<typeof preferences.schema>, { status: "ready" }>; onChange(values: Preferences): void }) {
  const [draft, setDraft] = useState(settings.values);
  const toast = useToast();
  async function save(values: Preferences) {
    if (await settings.save(values, settings.revision)) { onChange(values); toast.show("Settings saved", { variant: "success" }); }
  }
  return <View style={{ gap: 16 }}>
    <SettingsSection title="PR link buttons"><SettingsCard>
      <SettingsSwitch label="Show copy button" value={draft.showCopy} onValueChange={(showCopy) => setDraft({ ...draft, showCopy })} />
      <SettingsSwitch label="Show Slack button" value={draft.showSlack} onValueChange={(showSlack) => setDraft({ ...draft, showSlack })} />
    </SettingsCard></SettingsSection>
    <SettingsSection title="Slack"><SettingsCard>
      <SettingsInput label="Slack user token" secureTextEntry initialValue={draft.slackToken} placeholder="xoxp-…" onChangeText={(slackToken) => setDraft({ ...draft, slackToken })} />
      <SettingsSelect label="After sending" value={draft.afterSending} options={[{ label: "Open posted message", value: "message" }, { label: "Open Slack app channel", value: "channel" }]} onValueChange={(afterSending) => setDraft({ ...draft, afterSending })} />
      <SettingsAction label="Remove saved token" actionLabel="Clear token" disabled={settings.saving} onPress={() => { void save({ ...draft, slackToken: "" }); }} />
    </SettingsCard></SettingsSection>
    <Text style={{ color: theme.colors.foregroundMuted }}>Create a Slack app for your workspace. In OAuth &amp; Permissions, add chat:write under User Token Scopes, install the app to your workspace, then copy the User OAuth Token here. Your user must be able to post in #pull-requests.</Text>
    <ExternalLink href="https://api.slack.com/apps">Open Slack app settings</ExternalLink>
    <ExternalLink href="https://docs.slack.dev/authentication/tokens/">User token documentation</ExternalLink>
    <SettingsAction label="Save changes" actionLabel="Save" disabled={settings.saving} error={settings.saveError} onPress={() => { void save({ ...draft, slackToken: draft.slackToken.trim() }); }} />
  </View>;
}
