# Paseo plugins

Covered Health’s Paseo plugins. Currently includes **Copy PR link**, a workspace header button that copies the current branch’s GitHub PR as a clickable label:

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

## Development

The tests use Node.js 22.13+ TypeScript support and experimental module mocks.

```sh
cd plugins/copy-pr-link
npm ci
npm run typecheck
npm test
```

No runtime npm dependencies or separate build step are required.
