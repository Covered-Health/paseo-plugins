import { createElement } from "react";
import { Linking } from "react-native";
import { settingsRpc } from "@getpaseo/plugin";
import { preferences, type Preferences } from "./shared/settings.ts";
import { PrSettings } from "./client/settings.tsx";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/react-native";
import { getPrLink, sendPrLink } from "./shared/pr.ts";
import { copyPrLink } from "./client/copy.ts";
import { copyRich } from "./client/web.ts";

export default function contribute(client: PluginClientContext) {
  const buttons = new Map<string, ReturnType<typeof client.addHeaderButton>>();
  const feedbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let current = preferences.schema.parse({});
  let settingsVersion = 0;
  const presentation = (kind: "copy" | "slack") => ({
    title: kind === "copy" ? "Copy PR link" : "Send PR link to #pull-requests",
    label: "PR link", icon: kind === "copy" ? "Copy" : "Slack",
    visible: kind === "copy" ? current.showCopy : current.showSlack,
    disabled: kind === "slack" && !current.slackToken,
  });
  const resetFeedback = (id: string) => {
    clearTimeout(feedbackTimers.get(id));
    feedbackTimers.delete(id);
    buttons.get(id)?.update(presentation(id.endsWith(":copy") ? "copy" : "slack"));
  };
  const applySettings = (values: Preferences) => {
    settingsVersion++;
    current = values;
    for (const id of buttons.keys()) resetFeedback(id);
  };
  const removeSettings = client.addSettingsScreen({
    id: "preferences", title: "PR links", icon: "Link",
    Component: (props) => createElement(PrSettings, { ...props, onChange: applySettings }),
  });
  const refreshSettings = async () => {
    const version = settingsVersion;
    const state = await client.rpc(settingsRpc(preferences.id).read, {});
    if (!stopped && version === settingsVersion && state.status === "ready") {
      applySettings(preferences.schema.parse(state.values));
    }
  };
  const showFeedback = (id: string, label: string) => {
    if (stopped || !buttons.has(id)) return;
    buttons.get(id)!.update({ title: label, label, icon: "Check" });
    feedbackTimers.set(id, setTimeout(() => resetFeedback(id), 2200));
  };
  const removeWorkspace = (workspaceId: string) => {
    for (const kind of ["copy", "slack"]) {
      const id = `${workspaceId}:${kind}`;
      resetFeedback(id);
      buttons.get(id)?.remove();
      buttons.delete(id);
    }
  };
  let stopped = false;
  let snapshotVersion = 0;
  const changedSinceSnapshot = new Set<string>();
  let release: (() => Promise<void>) | undefined;
  const removeAll = () => {
    for (const timer of feedbackTimers.values()) clearTimeout(timer);
    feedbackTimers.clear();
    for (const button of buttons.values()) button.remove();
    buttons.clear();
  };
  const register = (workspace: { id: string; projectKind: string; archivingAt: string | null }) => {
    if (stopped) return;
    if (workspace.projectKind !== "git" || workspace.archivingAt) {
      removeWorkspace(workspace.id);
      return;
    }
    for (const kind of ["copy", "slack"] as const) {
      const id = `${workspace.id}:${kind}`;
      if (buttons.has(id)) continue;
      buttons.set(id, client.addHeaderButton({
        id: kind === "copy" ? "copy-pr-link" : "send-pr-link", workspaceId: workspace.id,
        button: {
          ...presentation(kind),
          behavior: { kind: "action", async onPress() {
            resetFeedback(id);
            if (kind === "copy") {
              const link = await client.rpc(getPrLink, { workspaceId: workspace.id });
              if (stopped) return;
              await copyPrLink(link, copyRich, copyText);
              showFeedback(id, "Link copied");
            } else {
              const result = await client.rpc(sendPrLink, { workspaceId: workspace.id });
              showFeedback(id, "Link sent");
              if (stopped) return;
              if (result.navigationError || !result.navigationUrl) {
                throw new Error("Link sent, but Slack could not be opened. Check #pull-requests; do not resend.");
              }
              try { await Linking.openURL(result.navigationUrl); }
              catch { throw new Error("Link sent, but Slack could not be opened. Check #pull-requests; do not resend."); }
            }
          } },
        },
      }));
    }
  };
  void client.paseo.workspaces.list({ subscribe: {} }).then(async ({ subscription }) => {
    if (stopped) { await subscription.release(); return; }
    release = () => subscription.release();
    subscription.subscribe({
      snapshot({ entries, pageInfo }) {
        void refreshSettings().catch((error) => { if (!stopped) console.error("Could not load PR link settings", error); });
        const version = ++snapshotVersion;
        changedSinceSnapshot.clear();
        removeAll();
        for (const workspace of entries) register(workspace);
        void (async () => {
          let cursor = pageInfo.nextCursor;
          while (cursor && !stopped && version === snapshotVersion) {
            const page = await client.paseo.workspaces.list({ page: { cursor, limit: 200 } });
            if (stopped || version !== snapshotVersion) return;
            for (const workspace of page.entries) {
              if (!changedSinceSnapshot.has(workspace.id)) register(workspace);
            }
            cursor = page.pageInfo.nextCursor;
          }
        })().catch((error) => { if (!stopped) console.error("Copy PR link could not load workspace pages", error); });
      },
      update(message) {
        if (message.type !== "workspace_update") return;
        const update = message.payload;
        changedSinceSnapshot.add(update.kind === "upsert" ? update.workspace.id : update.id);
        if (update.kind === "upsert") register(update.workspace);
        else removeWorkspace(update.id);
      },
      error(error) { console.error("Copy PR link workspace subscription failed", error); },
    });
  }).catch((error) => { if (!stopped) console.error("Copy PR link could not observe workspaces", error); });
  return async () => { stopped = true; removeAll(); removeSettings(); await release?.(); };
}
