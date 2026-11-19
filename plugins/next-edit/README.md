# Next edit prediction development

Independent plugin for native Paseo CodeMirror editors. The LSP plugin is unchanged.

```sh
cd plugins/next-edit
npm ci
npm run typecheck
npm test
uv run --cache-dir /tmp/next-edit-uv-cache --with fastapi --with httpx python -m unittest discover -s tests -p 'test_*.py'
paseo plugin install /absolute/path/to/plugins/next-edit
```

Run the standalone proxy on a platform with compatible Zeta bindings:

```sh
ZETA_COMPLETIONS_URL=https://your-inference-host/v1/completions \
ZETA_MODEL=your-zeta-2.1-model \
ZETA_API_KEY=your-token \
uv run --script server/proxy.py
```

Omit `ZETA_API_KEY` for servers without authentication. No MLX-specific dependency or process launch is used. If the proxy runs on another machine, set its listener as needed and use its address in the plugin’s settings. [Setup, data sent and limitations](OVERVIEW.md).

The prediction UI is a small CodeMirror extension bundled as CommonJS with `@codemirror/state` and `@codemirror/view` external. Runtime loading supplies the host’s actual module instances, avoiding duplicate state fields and extension incompatibility. A removable compartment owns each editor’s extension, debounce timer and pending response generation. Source changes require rebuilding the generated `client/ai-source.js` (`npm run postinstall`); installation does this automatically. The generated file is ignored by Git.

`@marimo-team/codemirror-ai` 0.3.10 was evaluated but its diff acceptance merges separated changes without retaining intervening text and ignores the model cursor for text edits. This implementation instead previews a single exact replacement span, retaining all intervening text, and accepts the returned cursor. It also invalidates pending results on selection movement and disposal. DOM tests cover those cases and the LSP plugin’s existing highest-priority Tab keymap.

Python tests use a mocked bindings adapter and mocked HTTP model, verifying request translation and byte-safe splicing. They do not exercise native Rust bindings or a real Zeta model. Upstream contracts: [Zeta bindings](https://pypi.org/project/zed-zeta-bindings/), [CodeMirror AI source](https://github.com/marimo-team/codemirror-ai), [Paseo plugin reference](https://paseo.sh/docs/plugins/reference.md).

On macOS, the published Linux bindings can run in Docker while MLX stays on the Mac:

```sh
docker run -d --name paseo-next-edit-proxy --platform linux/amd64 \
  -p 127.0.0.1:8001:8001 \
  -v "$PWD/server/proxy.py:/app/proxy.py:ro" \
  -e PREDICTION_HOST=0.0.0.0 \
  -e ZETA_COMPLETIONS_URL=http://host.docker.internal:8080/v1/completions \
  -e ZETA_MODEL=slxnxl/zeta-2.1-mlx-4bit \
  ghcr.io/astral-sh/uv:python3.13-bookworm-slim uv run --script /app/proxy.py
```

Run this from the plugin directory with Docker Desktop running. Manage the proxy with `docker logs`, `docker stop`, and `docker start paseo-next-edit-proxy`. The bind mount uses this checkout’s proxy file. This route was verified against the local MLX Zeta model through the installed plugin’s daemon RPC.

Live verification on Paseo 0.16.0 used the installed app’s web bundle connected to the real local daemon, with both LSP and prediction enabled. The native sample editor rendered the predicted `b` in `return a + b`; Escape dismissed the LSP completion menu while preserving the prediction, and Tab accepted the exact text with cursor offset 32. The background automation tab’s document-focus gate was simulated. The sample file and temporary UI test servers were removed afterwards.
