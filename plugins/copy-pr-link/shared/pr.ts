import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const getPrLink = defineRpc({
  name: "pr.link",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: z.object({ label: z.string(), url: z.string().url() }),
});
