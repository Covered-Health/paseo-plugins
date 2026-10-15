# Paseo plugins

Covered Health’s Paseo plugins. Currently includes **Copy PR link**, workspace header buttons that copy or share the current branch’s GitHub PR as a clickable label:

> protego #1020: RD-4100: Patch pymongo, Mako and Werkzeug advisories

Desktop/web clients copy an HTML hyperlink with a Markdown plain-text fallback. Mobile and clients without rich clipboard support copy `[repo #number: title](URL)`. Clipboard permissions can prevent copying.

## Install

Requires Paseo `>=0.11.0-beta.2` on both the daemon and app. Install GitHub CLI (`gh`) on the daemon’s PATH and authenticate with `gh auth login` using an account with access to your repositories. The current workspace branch must have a GitHub PR.

This repository is private. Configure Git authentication on the daemon with an account that can read `covered-health/paseo-plugins` (for HTTPS, `gh auth setup-git` can configure credentials).

With plugins enabled in Paseo Settings → Plugins:

```sh
paseo plugin install github:covered-health/paseo-plugins:plugins/copy-pr-link
```

The plugin runs `gh pr view` in the workspace directory on each click. It reads PR metadata from GitHub and writes to the clipboard on the device running Paseo.

## Slack sharing

In **Settings → Plugins → Copy PR link → PR links**, choose which buttons to show and configure a Slack user token. Both buttons are labeled **PR link**, with Copy and Slack icons. Successful actions briefly show **Link copied** or **Link sent**.

To obtain a user token, [create a Slack app](https://api.slack.com/apps) for your workspace. Under **OAuth & Permissions → User Token Scopes**, add `chat:write`, install the app to the workspace, and copy the **User OAuth Token** (`xoxp-…`). Your user must be able to post in `#pull-requests`. [Slack token documentation](https://docs.slack.dev/authentication/tokens/). Bot tokens also work if already permitted to post there.

Slack sharing posts a clickable PR label to `#pull-requests` with link and media previews disabled. Choose whether to open the posted message’s permalink or the Slack app channel after sending. Navigation runs on the device running Paseo. If opening Slack fails after delivery, the message is still sent; do not resend it just to open Slack.

## Development

The tests use Node.js 22.18+ TypeScript support and experimental module mocks.

```sh
cd plugins/copy-pr-link
npm ci
npm run typecheck
npm test
```

No runtime npm dependencies or separate build step are required.

## Native code navigation

`plugins/editor-tabs` now injects go-to-definition and usages into **Paseo's existing editor and native file tabs**. The separate editor, file browser and save implementation have been removed. Open files normally, then use F12, Shift+F12 or Cmd/Ctrl-click. The plugin reads unsaved native buffers, opens a single result directly in a native file tab, and selects the Navigation tab in the right-hand Explorer sidebar only for multiple results. No results and errors show a brief butter bar without changing sidebar tabs. The normal editor context menu is left untouched.

The workspace config in [`.paseo/lsp.json`](.paseo/lsp.json) uses **basedpyright** for Python (`.py` and `.pyi`). On the daemon host:

```sh
uv tool install basedpyright
npm install -g typescript-language-server typescript
paseo plugin install github:covered-health/paseo-plugins:plugins/editor-tabs
```

Configure servers in **`.paseo/lsp.json` in each workspace**, rather than the plugin UI. Each profile maps extensions to language IDs and may specify a directory `path`; omitted paths cover the workspace root. The deepest matching scope wins, and its directory becomes the server's CWD and LSP root. Saved config changes take effect on the next navigation lookup and restart that workspace's sessions. See [config examples and rules](plugins/editor-tabs/OVERVIEW.md).

The npm tools are needed only for JavaScript/TypeScript. A Python profile can instead use `command: "ty"`, `args: ["server"]` and `languages: {"py":"python","pyi":"python"}`. basedpyright is tested; ty is not yet verified.

This uses private React pane context because Paseo has no supported editor-extension API. It was proven in the live macOS Paseo 0.11.2 app, including native Python definition tabs, exact symbol selection and usages. A Paseo update may require adapting the private bridge. The plugin remains installed as `editor-tabs`; it no longer contributes replacement tabs. See [architecture and proof](plugins/editor-tabs/ARCHITECTURE.md) and [setup and limits](plugins/editor-tabs/OVERVIEW.md).

Development uses Node.js 22.18+:

```sh
cd plugins/editor-tabs
npm ci
npm run typecheck
npm test
npm run browser-harness -- <workspace-id-for-this-checkout>
```

The host tests launch real TypeScript and basedpyright servers. At the printed harness URL, run `await window.proof.runChecks()` to exercise the injected adapter with React-owned file panes and live daemon RPCs. Stop the harness afterwards; the installed plugin uses only Paseo's own connection.
