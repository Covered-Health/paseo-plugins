import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const preferences = defineSettings({
  id: "preferences", scope: "host", version: 1,
  schema: z.object({
    slackToken: z.string().trim().default(""),
    showCopy: z.boolean().default(true),
    showSlack: z.boolean().default(true),
    afterSending: z.enum(["message", "channel"]).default("message"),
  }),
});
export type Preferences = z.output<typeof preferences.schema>;
