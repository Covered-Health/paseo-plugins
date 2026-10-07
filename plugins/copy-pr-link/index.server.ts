import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getPrLink } from "./shared/pr.ts";
import { lookupPr } from "./server/pr.ts";

export default function contribute(server: PluginServerContext) {
  server.handle(getPrLink, async ({ workspaceId }, { paseo }) => {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    if (!workspace) throw new Error("This workspace is no longer available.");
    return lookupPr(workspace.workspaceDirectory);
  });
  return () => {};
}
