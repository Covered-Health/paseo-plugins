import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Node strips .ts natively; use the existing compiler for the settings screen's JSX.
registerHooks({ load(url, context, nextLoad) {
  if (!url.endsWith(".tsx")) return nextLoad(url, context);
  return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
  }).outputText };
} });
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prLink, markdownLink, htmlLink } from "../shared/link.ts";
import { copyPrLink } from "../client/copy.ts";
import { preferences } from "../shared/settings.ts";
import { getPrLink, sendPrLink } from "../shared/pr.ts";
import { lookupPr } from "../server/pr.ts";

const pr = {
  number: 1020,
  title: "RD-4100: Patch pymongo, Mako and Werkzeug advisories",
  url: "https://github.com/covered-health/protego/pull/1020",
};
const link = prLink(pr);

test("exact label, destination repository, and safe clipboard formats", () => {
  assert.equal(link.label, `protego #1020: ${pr.title}`);
  assert.equal(prLink({ ...pr, url: "https://github.com/upstream/destination/pull/1020" }).label, `destination #1020: ${pr.title}`);
  assert.equal(markdownLink("Fix [x] *y* \\ z", pr.url), `[Fix \\[x\\] \\*y\\* \\\\ z](${pr.url})`);
  assert.equal(htmlLink('<script> & "x"', pr.url), `<a href="${pr.url}">&lt;script&gt; &amp; &quot;x&quot;</a>`);
  assert.throws(() => prLink({ ...pr, url: "javascript:alert(1)" }));
  assert.throws(() => prLink({ ...pr, number: 3 }));
});

test("rich clipboard success, Markdown fallback, and rejected clipboard", async () => {
  let copied = "";
  await copyPrLink(link, async (html, text) => {
    assert.equal(html, htmlLink(link.label, link.url));
    assert.equal(text, markdownLink(link.label, link.url));
    return true;
  }, async () => { assert.fail("Rich success should not overwrite clipboard"); });
  await copyPrLink(link, async () => false, async (text) => { copied = text; });
  assert.equal(copied, markdownLink(link.label, link.url));
  await assert.rejects(copyPrLink(link, async () => false, async () => { throw new Error("Clipboard denied"); }), /Clipboard denied/);
});

test("daemon gh lookup uses workspace cwd and handles missing PR/auth/CLI", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "copy-pr-test-")));
  const savedPath = process.env.PATH;
  try {
    process.env.PATH = directory;
    const gh = join(directory, "gh");
    await writeFile(gh, `#!${process.execPath}\nconst assert = require('node:assert/strict');\nassert.deepEqual(process.argv.slice(2), ['pr', 'view', '--json', 'number,title,url']);\nassert.equal(process.cwd(), ${JSON.stringify(directory)});\nconsole.log(${JSON.stringify(JSON.stringify(pr))});\n`, { mode: 0o755 });
    assert.deepEqual(await lookupPr(directory), link);
    for (const message of ["no pull requests found for branch", "authentication required"]) {
      await writeFile(gh, `#!${process.execPath}\nconsole.error(${JSON.stringify(message)}); process.exit(1);\n`, { mode: 0o755 });
      await assert.rejects(lookupPr(directory), (error: Error) => error.message.includes(message) && error.message.includes("gh auth login"));
    }
    await rm(gh);
    await assert.rejects(lookupPr(directory), /Install GitHub CLI/);
  } finally {
    process.env.PATH = savedPath;
    await rm(directory, { recursive: true, force: true });
  }
});

test("header registration, reconnect snapshots, removal, copying, and teardown", async () => {
  const writes: string[] = [];
  const feedback: any[] = [];
  let clipboardDenied = false;
  mock.module("@getpaseo/plugin/client/react-native", { namedExports: { useToast: () => ({ show() {}, error() {} }), copyText: async (text: string) => { if (clipboardDenied) throw new Error("Clipboard denied"); writes.push(text); } } });
  const platform = { OS: "ios" };
  const opened: string[] = [];
  let navigationDenied = false;
  mock.module("react-native", { namedExports: { Platform: platform, Text: () => null, View: () => null, Linking: { async openURL(url: string) { if (navigationDenied) throw new Error("No Slack app"); opened.push(url); } } } });
  mock.module("@getpaseo/plugin/client", { namedExports: { useSettings: () => { throw new Error("Settings screen is not mounted in this lifecycle test"); } } });
  mock.module("@getpaseo/plugin/client/ui", { namedExports: Object.fromEntries(["SettingsSection", "SettingsCard", "SettingsSwitch", "SettingsInput", "SettingsSelect", "SettingsAction", "ExternalLink"].map((name) => [name, () => null])) });
  const { default: contribute } = await import("../index.client.ts");
  let observer: any;
  let released = 0;
  let removed = 0;
  const registrations: any[] = [];
  let settingsScreen: any;
  let sent = 0;
  let sendDenied = false;
  const client: any = {
    addSettingsScreen(screen: any) { settingsScreen = screen; return () => {}; },
    paseo: { workspaces: { list: async () => ({ subscription: {
      subscribe(callbacks: any) { observer = callbacks; },
      async release() { released++; },
    } }) } },
    addHeaderButton(button: any) {
      // Paseo's bundled Lucide registry excludes brand icons, including Slack.
      const validateIcon = (icon: unknown) => {
        if (typeof icon === "string" && !["Copy", "Check", "Link"].includes(icon)) throw new Error(`Unknown Lucide icon: ${icon}`);
      };
      validateIcon(button.button.icon);
      registrations.push(button); return { remove() { removed++; }, update(patch: any) { if (patch.icon) validateIcon(patch.icon); feedback.push(patch); } }; },
    async rpc(contract: any, input: { workspaceId: string }) {
      if (contract.name !== getPrLink.name && contract.name !== sendPrLink.name) return { status: "ready", revision: "1", values: preferences.schema.parse({ slackToken: "xoxp-test" }) };
      assert.equal(input.workspaceId, "git");
      if (contract.name === sendPrLink.name) {
        if (sendDenied) throw new Error("Slack rejected the request");
        sent++;
        return { channel: "C123", ts: "1.000", navigationUrl: "https://example.slack.com/archives/C123/p1000", navigationError: false };
      }
      return link;
    },
  };
  const cleanup = contribute(client);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const workspace = { id: "git", projectKind: "git", archivingAt: null };
  observer.snapshot({ entries: [workspace, { ...workspace, id: "plain", projectKind: "non_git" }], pageInfo: { nextCursor: null } });
  assert.equal(registrations.length, 2);
  await registrations[0].button.behavior.onPress();
  assert.deepEqual(writes, [markdownLink(link.label, link.url)]);
  assert.deepEqual(feedback.at(-1), { title: "Link copied", label: "Link copied", icon: "Check" });
  clipboardDenied = true;
  await assert.rejects(registrations[0].button.behavior.onPress(), /Clipboard denied/);
  assert.equal(feedback.at(-1).label, "PR link");
  clipboardDenied = false;
  await new Promise<void>((resolve) => setImmediate(resolve));
  await registrations[1].button.behavior.onPress();
  assert.equal(feedback.at(-1).label, "Link sent");
  assert.equal(opened.length, 1);
  navigationDenied = true;
  await assert.rejects(registrations[1].button.behavior.onPress(), /Link sent, but Slack could not be opened/);
  assert.equal(feedback.at(-1).label, "Link sent");
  assert.equal(sent, 2);
  sendDenied = true;
  await assert.rejects(registrations[1].button.behavior.onPress(), /Slack rejected/);
  assert.equal(feedback.at(-1).label, "PR link");
  sendDenied = false;
  navigationDenied = false;
  const settingsProps = settingsScreen.Component({}).props;
  settingsProps.onChange(preferences.schema.parse({ showCopy: false, showSlack: true }));
  assert.equal(feedback.at(-2).visible, false);
  assert.equal(feedback.at(-1).visible, true);
  settingsProps.onChange(preferences.schema.parse({ showCopy: true, showSlack: false }));
  assert.equal(feedback.at(-2).visible, true);
  assert.equal(feedback.at(-1).visible, false);
  settingsProps.onChange(preferences.schema.parse({ showCopy: false, showSlack: false }));
  assert.equal(feedback.at(-1).visible, false);
  settingsProps.onChange(preferences.schema.parse({ showCopy: true, showSlack: true }));
  assert.equal(feedback.at(-1).visible, true);
  assert.equal(feedback.at(-1).disabled, true);
  observer.update({ type: "workspace_update", payload: { kind: "upsert", workspace } });
  assert.equal(registrations.length, 2);
  observer.snapshot({ entries: [workspace], pageInfo: { nextCursor: null } });
  assert.equal(removed, 2);
  assert.equal(registrations.length, 4);
  observer.update({ type: "workspace_update", payload: { kind: "remove", id: "git" } });
  assert.equal(removed, 4);
  observer.update({ type: "workspace_update", payload: { kind: "upsert", workspace } });
  await cleanup?.();
  assert.equal(removed, 6);
  assert.equal(released, 1);
  observer.update({ type: "workspace_update", payload: { kind: "upsert", workspace } });
  assert.equal(registrations.length, 6);

  const originalList = client.paseo.workspaces.list;
  client.paseo.workspaces.list = async (options: any) => options.page
    ? { entries: [{ ...workspace, id: "paged" }], pageInfo: { nextCursor: null } }
    : originalList();
  const pagedCleanup = contribute(client);
  await new Promise<void>((resolve) => setImmediate(resolve));
  observer.snapshot({ entries: [], pageInfo: { nextCursor: "next" } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(registrations.at(-1).workspaceId, "paged");
  await pagedCleanup?.();
  assert.equal(released, 2);

  // Exercise actual browser clipboard writes and rich-copy rejection.
  const { copyRich } = await import("../client/web.ts");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalClipboardItem = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  let richItems: any[] = [];
  try {
    platform.OS = "web";
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: {
      async write(items: any[]) { richItems = items; },
    } } });
    Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: class {
      data: any;
      constructor(data: any) { this.data = data; }
    } });
    assert.equal(await copyRich("<a>label</a>", "[label](url)"), true);
    assert.equal(await richItems[0].data["text/html"].text(), "<a>label</a>");
    assert.equal(await richItems[0].data["text/plain"].text(), "[label](url)");
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: {
      async write() { throw new Error("Denied"); },
    } } });
    assert.equal(await copyRich("html", "text"), false);
    platform.OS = "ios";
    assert.equal(await copyRich("html", "text"), false);
  } finally {
    platform.OS = "ios";
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (originalClipboardItem) Object.defineProperty(globalThis, "ClipboardItem", originalClipboardItem);
    else Reflect.deleteProperty(globalThis, "ClipboardItem");
  }

  // Teardown while the initial observation is still being established.
  let finish: any;
  client.paseo.workspaces.list = () => new Promise((resolve) => { finish = resolve; });
  const earlyCleanup = contribute(client);
  await earlyCleanup?.();
  finish({ subscription: { async release() { released++; } } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(released, 3);
});

test("host-valid icons register both buttons across all workspace pages and reconnects", async () => {
  const { default: contribute } = await import("../index.client.ts");
  const { SlackIcon } = await import("../client/slack-icon.ts");
  const live = new Map<string, any>();
  let observer: any;
  const validate = (icon: any) => {
    if (typeof icon === "string") assert.ok(["Copy", "Check", "Link"].includes(icon), `Unknown Lucide icon: ${icon}`);
    else assert.equal(typeof icon, "function");
  };
  const workspace = (id: string) => ({ id, projectKind: "git", archivingAt: null });
  const client: any = {
    addSettingsScreen() { return () => {}; },
    async rpc() { return { status: "ready", revision: "saved", values: preferences.schema.parse({ slackToken: "configured" }) }; },
    paseo: { workspaces: { async list(options: any) {
      if (options.page) return { entries: [workspace("paged")], pageInfo: { nextCursor: null } };
      return { subscription: { subscribe(callbacks: any) { observer = callbacks; }, async release() {} } };
    } } },
    addHeaderButton({ id, workspaceId, button }: any) {
      validate(button.icon);
      const key = `${workspaceId}:${id}`;
      assert.ok(!live.has(key));
      live.set(key, button);
      return { remove() { live.delete(key); }, update(patch: any) {
        if (patch.icon) validate(patch.icon);
        Object.assign(button, patch);
      } };
    },
  };
  const cleanup = contribute(client);
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    observer.snapshot({ entries: [workspace("first"), workspace("second")], pageInfo: { nextCursor: "more" } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(live.size, 6);
    for (const id of ["first", "second", "paged"]) {
      assert.equal(live.get(`${id}:copy-pr-link`).icon, "Copy");
      const slack = live.get(`${id}:send-pr-link`);
      assert.equal(slack.icon, SlackIcon);
      assert.equal(slack.visible, true);
      assert.equal(slack.disabled, false);
    }
    observer.snapshot({ entries: [workspace("second"), workspace("first")], pageInfo: { nextCursor: null } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(live.size, 4);
    observer.update({ type: "workspace_update", payload: { kind: "upsert", workspace: workspace("new") } });
    assert.equal(live.size, 6);
    // The custom glyph scales to the host's icon slot and uses its theme color.
    const glyph = SlackIcon({ size: 16, color: "#abcdef" } as any);
    assert.deepEqual(glyph.props.style, { width: 16, height: 16 });
    const pieces = glyph.props.children as any[];
    assert.equal(pieces.length, 8);
    assert.ok(pieces.every((piece) => piece.props.style.backgroundColor === "#abcdef"));
  } finally { await cleanup?.(); }
  assert.equal(live.size, 0);
});
