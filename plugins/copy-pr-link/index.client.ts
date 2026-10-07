import type { PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/react-native";
import { getPrLink } from "./shared/pr.ts";
import { copyPrLink } from "./client/copy.ts";
import { copyRich } from "./client/web.ts";

export default function contribute(client: PluginClientContext) {
  const buttons = new Map<string, ReturnType<typeof client.addHeaderButton>>();
  const feedbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const resetFeedback = (id: string) => {
    clearTimeout(feedbackTimers.get(id));
    feedbackTimers.delete(id);
    buttons.get(id)?.update({ title: "Copy PR link", label: "Copy PR link", icon: "Copy" });
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
      resetFeedback(workspace.id);
      buttons.get(workspace.id)?.remove();
      buttons.delete(workspace.id);
      return;
    }
    if (buttons.has(workspace.id)) return;
    buttons.set(workspace.id, client.addHeaderButton({
      id: "copy-pr-link", workspaceId: workspace.id,
      button: {
        title: "Copy PR link", label: "Copy PR link", icon: "Copy",
        behavior: { kind: "action", async onPress() {
          resetFeedback(workspace.id);
          const link = await client.rpc(getPrLink, { workspaceId: workspace.id });
          if (stopped) return;
          await copyPrLink(link, copyRich, copyText);
          const button = buttons.get(workspace.id);
          if (stopped || !button) return;
          button.update({ title: "Link copied", label: "Link copied", icon: "Check" });
          feedbackTimers.set(workspace.id, setTimeout(() => resetFeedback(workspace.id), 2200));
        } },
      },
    }));
  };
  void client.paseo.workspaces.list({ subscribe: {} }).then(async ({ subscription }) => {
    if (stopped) { await subscription.release(); return; }
    release = () => subscription.release();
    subscription.subscribe({
      snapshot({ entries, pageInfo }) {
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
        else { resetFeedback(update.id); buttons.get(update.id)?.remove(); buttons.delete(update.id); }
      },
      error(error) { console.error("Copy PR link workspace subscription failed", error); },
    });
  }).catch((error) => { if (!stopped) console.error("Copy PR link could not observe workspaces", error); });
  return async () => { stopped = true; removeAll(); await release?.(); };
}
