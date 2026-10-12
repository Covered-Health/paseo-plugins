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
