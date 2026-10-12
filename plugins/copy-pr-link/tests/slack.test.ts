import { test } from "node:test";
import assert from "node:assert/strict";
import { sendToSlack } from "../server/slack.ts";
import { preferences } from "../shared/settings.ts";

const link = { label: "protego #1020: Fix <x> & y", url: "https://github.com/covered-health/protego/pull/1020" };
const settings = preferences.schema.parse({ slackToken: "xoxp-test-secret" });
const receipt = { ok: true, channel: "C123", ts: "123.456" };

test("Slack posting, navigation, errors, and token-safe messages", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { method: string; body: any; headers: any }[] = [];
  let replies: { status?: number; data?: unknown; reject?: boolean }[] = [];
  globalThis.fetch = (async (url: string, options: any) => {
    requests.push({ method: url.split("/").at(-1)!, body: JSON.parse(options.body), headers: options.headers });
    assert.ok(options.signal);
    assert.equal(options.redirect, "error");
    const reply = replies.shift();
    assert.ok(reply, "No unexpected API calls or retries");
    if (reply.reject) throw new Error("Network timed out xoxp-test-secret");
    return new Response(JSON.stringify(reply.data), { status: reply.status ?? 200 });
  }) as typeof fetch;
  try {
    assert.deepEqual(preferences.schema.parse({}), { slackToken: "", showCopy: true, showSlack: true, afterSending: "message" });
    await assert.rejects(sendToSlack(link, { ...settings, slackToken: "" }), /Configure a Slack user token/);
    assert.equal(requests.length, 0);
    replies = [{ data: receipt }, { data: { ok: true, permalink: "https://covered-health.slack.com/archives/C123/p123456" } }];
    const sent = await sendToSlack(link, settings);
    assert.equal(sent.navigationError, false);
    assert.equal(sent.navigationUrl, "https://covered-health.slack.com/archives/C123/p123456");
    assert.deepEqual(requests[0], {
      method: "chat.postMessage", headers: { Authorization: "Bearer xoxp-test-secret", "Content-Type": "application/json" },
      body: {
        channel: "#pull-requests", text: `${link.label} ${link.url}`, mrkdwn: false,
        blocks: [{ type: "rich_text", elements: [{ type: "rich_text_section", elements: [{ type: "link", url: link.url, text: link.label }] }] }],
        unfurl_links: false, unfurl_media: false,
      },
    });
    assert.deepEqual(requests[1].body, { channel: "C123", message_ts: "123.456" });
    assert.equal(JSON.stringify(sent).includes(settings.slackToken), false);
    requests.length = 0;
    replies = [{ data: receipt }, { data: { ok: true, team_id: "T123" } }];
    assert.equal((await sendToSlack(link, { ...settings, afterSending: "channel" })).navigationUrl, "slack://channel?team=T123&id=C123");
    assert.deepEqual(requests.map((r) => r.method), ["chat.postMessage", "auth.test"]);
    replies = [{ data: receipt }, { data: { ok: false, error: "missing_scope" } }];
    assert.deepEqual(await sendToSlack(link, settings), { channel: "C123", ts: "123.456", navigationUrl: null, navigationError: true });
    replies = [{ data: receipt }, { data: { ok: true, permalink: "https://evil.example" } }];
    assert.equal((await sendToSlack(link, settings)).navigationError, true);
    for (const error of ["invalid_auth", "missing_scope", "channel_not_found", "not_in_channel", "xoxp-test-secret"]) {
      replies = [{ data: { ok: false, error } }];
      await assert.rejects(sendToSlack(link, settings), (failure: Error) => !failure.message.includes(settings.slackToken));
      assert.equal(replies.length, 0);
    }
    replies = [{ status: 429, data: {} }];
    await assert.rejects(sendToSlack(link, settings), /rate limit/);
    requests.length = 0;
    replies = [{ reject: true }];
    await assert.rejects(sendToSlack(link, settings), (failure: Error) => failure.message.includes("may already have been posted") && !failure.message.includes(settings.slackToken));
    assert.equal(requests.length, 1);
    replies = [{ data: { ok: true } }];
    await assert.rejects(sendToSlack(link, settings), /invalid receipt/);
  } finally { globalThis.fetch = originalFetch; }
});
