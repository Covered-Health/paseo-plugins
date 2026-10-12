import { z } from "zod";
import type { Preferences } from "../shared/settings.ts";

const responseSchema = z.object({ ok: z.boolean(), error: z.string().optional() });

async function slack(method: string, token: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    let response: Response;
    try {
      response = await fetch(`https://slack.com/api/${method}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal, redirect: "error",
      });
    } catch {
      throw new Error("Slack request failed or timed out. Check Slack before sending again; the message may already have been posted.");
    }
    if (response.status === 429) throw new Error("Slack rate limit reached. Wait before trying again.");
    if (!response.ok) throw new Error(`Slack returned HTTP ${response.status}. Check Slack before sending again.`);
    let data: unknown;
    try { data = await response.json(); } catch { throw new Error("Slack returned an unreadable response. Check Slack before sending again."); }
    const result = responseSchema.safeParse(data);
    if (!result.success) throw new Error("Slack returned an invalid response. Check Slack before sending again.");
    if (!result.data.ok) {
      const code = result.data.error;
      const advice: Record<string, string> = {
        invalid_auth: "Check the Slack token in plugin settings.",
        token_revoked: "Replace the revoked Slack token in plugin settings.",
        missing_scope: "Add chat:write under User Token Scopes and reinstall the Slack app.",
        channel_not_found: "Verify #pull-requests exists and your user can access it.",
        not_in_channel: "Join #pull-requests before sending.",
        is_archived: "#pull-requests is archived.",
      };
      throw new Error(advice[code ?? ""] ?? "Slack rejected the request. Check your token and permission to post in #pull-requests.");
    }
    return data;
  } finally { clearTimeout(timer); }
}

export async function sendToSlack(link: { label: string; url: string }, settings: Preferences) {
  if (!settings.slackToken) throw new Error("Configure a Slack user token in Settings → Plugins → Copy PR link.");
  const posted = await slack("chat.postMessage", settings.slackToken, {
    channel: "#pull-requests", text: `${link.label} ${link.url}`, mrkdwn: false,
    blocks: [{ type: "rich_text", elements: [{ type: "rich_text_section", elements: [
      { type: "link", url: link.url, text: link.label },
    ] }] }],
    unfurl_links: false, unfurl_media: false,
  });
  const post = z.object({ channel: z.string().regex(/^[CG][A-Z0-9]+$/), ts: z.string().regex(/^\d+\.\d+$/) }).safeParse(posted);
  if (!post.success) throw new Error("Slack accepted the message but returned an invalid receipt. Check #pull-requests before sending again.");
  // Once posted, navigation failure must not look like a send failure or encourage a duplicate.
  try {
    if (settings.afterSending === "channel") {
      const auth = z.object({ team_id: z.string().regex(/^T[A-Z0-9]+$/) }).parse(await slack("auth.test", settings.slackToken, {}));
      return { ...post.data, navigationUrl: `slack://channel?team=${auth.team_id}&id=${post.data.channel}`, navigationError: false };
    }
    const result = z.object({ permalink: z.string().url() }).parse(await slack("chat.getPermalink", settings.slackToken, { channel: post.data.channel, message_ts: post.data.ts }));
    const url = new URL(result.permalink);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".slack.com")) throw new Error("Invalid Slack permalink");
    return { ...post.data, navigationUrl: result.permalink, navigationError: false };
  } catch {
    return { ...post.data, navigationUrl: null, navigationError: true };
  }
}
