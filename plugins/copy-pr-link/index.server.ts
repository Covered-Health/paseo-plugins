import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getPrLink, sendPrLink } from "./shared/pr.ts";
import { preferences } from "./shared/settings.ts";
import { lookupPr } from "./server/pr.ts";
import { sendToSlack } from "./server/slack.ts";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  server.handle(getPrLink, async ({ workspaceId }, { paseo }) => {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    if (!workspace) throw new Error("This workspace is no longer available.");
    return lookupPr(workspace.workspaceDirectory);
  });
  server.handle(sendPrLink, async ({ workspaceId }, { paseo }) => {
    const current = await settings.read();
    if (current.status !== "ready") throw new Error("Reload or reset the plugin settings before sending.");
    if (!current.values.slackToken) throw new Error("Configure a Slack user token in Settings → Plugins → Copy PR link.");
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    if (!workspace) throw new Error("This workspace is no longer available.");
    return sendToSlack(await lookupPr(workspace.workspaceDirectory), current.values);
  });
  return () => {};
}
