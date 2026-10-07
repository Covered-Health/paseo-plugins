import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prLink, markdownLink, htmlLink } from "../shared/link.ts";
import { copyPrLink } from "../client/copy.ts";
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
  mock.module("@getpaseo/plugin/client/react-native", { namedExports: { copyText: async (text: string) => { writes.push(text); } } });
  const platform = { OS: "ios" };
  mock.module("react-native", { namedExports: { Platform: platform } });
  const { default: contribute } = await import("../index.client.ts");
  let observer: any;
  let released = 0;
  let removed = 0;
  const registrations: any[] = [];
  const client: any = {
    paseo: { workspaces: { list: async () => ({ subscription: {
      subscribe(callbacks: any) { observer = callbacks; },
      async release() { released++; },
    } }) } },
    addHeaderButton(button: any) { registrations.push(button); return { remove() { removed++; } }; },
    async rpc(_contract: unknown, input: { workspaceId: string }) { assert.equal(input.workspaceId, "git"); return link; },
  };
  const cleanup = contribute(client);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const workspace = { id: "git", projectKind: "git", archivingAt: null };
  observer.snapshot({ entries: [workspace, { ...workspace, id: "plain", projectKind: "non_git" }], pageInfo: { nextCursor: null } });
  assert.equal(registrations.length, 1);
  await registrations[0].button.behavior.onPress();
  assert.deepEqual(writes, [markdownLink(link.label, link.url)]);
  observer.update({ type: "workspace_update", payload: { kind: "upsert", workspace } });
  assert.equal(registrations.length, 1);
  observer.snapshot({ entries: [workspace], pageInfo: { nextCursor: null } });
  assert.equal(removed, 1);
  assert.equal(registrations.length, 2);
  observer.update({ type: "workspace_update", payload: { kind: "remove", id: "git" } });
  assert.equal(removed, 2);
  observer.update({ type: "workspace_update", payload: { kind: "upsert", workspace } });
  await cleanup?.();
  assert.equal(removed, 3);
  assert.equal(released, 1);
  observer.update({ type: "workspace_update", payload: { kind: "upsert", workspace } });
  assert.equal(registrations.length, 3);

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
