# Next edit prediction

Suggests edits in Paseo’s existing desktop/web file editor after a 500 ms typing pause. Review the inline insertion and struck-through replacement, then press Tab or click Accept. Escape dismisses the suggestion. Accepted changes stay unsaved and use the editor’s normal undo history. Native mobile editors are not supported.

Runs independently of the LSP plugin. Both use the host’s CodeMirror runtime and separate extension compartments; LSP autocomplete takes priority over predictions on Tab. Disabling or removing this plugin removes its extensions without changing LSP behavior.

## Setup

Requires Paseo 0.11.2 or newer. Start the single-file FastAPI proxy on a host reachable from your Paseo daemon. Configure its model endpoint, then set the proxy URL in Settings → Plugins → Next edit prediction and enable predictions. The default proxy URL is `http://127.0.0.1:8001/predict`, where localhost means the daemon machine.

The proxy uses an OpenAI-compatible **text completions** endpoint serving Zeta 2.1. It is independent of the inference engine; MLX, vLLM, llama.cpp or a hosted endpoint can be used if they support that API and the model’s raw prompt format. Set the full endpoint URL in `ZETA_COMPLETIONS_URL`, the served model identifier in `ZETA_MODEL` if required, and an optional bearer credential in `ZETA_API_KEY`. These are proxy process environment variables; credentials are not sent to the editor. The default model endpoint is `http://127.0.0.1:8080/v1/completions`.

The pinned `zed-zeta-bindings` 1.10.2 package currently publishes only a Linux x86-64 wheel. Run the proxy there, or build compatible bindings for your proxy platform. The model server can run on a different machine, including a Mac. The bindings are GPL-3.0-or-later.

The proxy binds to loopback on port 8001 by default. `PREDICTION_HOST` and `PREDICTION_PORT` change its listener. Keep it on a trusted network or behind authentication if exposed; it does not implement client authentication. No browser CORS configuration is needed for the plugin because requests go through the daemon. For direct browser clients, set `PREDICTION_CORS_ORIGINS` to a comma-separated list of exact allowed origins.

## Data and limits

Disabled by default. Once enabled, sends the active file’s unsaved text, path, cursor and up to ten recent edit diffs to the configured proxy, then to the configured model. History stays in memory per mounted editor, each diff is limited to 16,000 characters, and documents over 500,000 UTF-16 units are skipped. All editable file types are eligible; consider what an endpoint may receive before enabling it. The plugin does not persist document text or history.

The proxy uses Zeta’s native context-range computation, Multi-Region SPM formatter and output parser. It converts UTF-16 editor offsets to UTF-8 byte offsets and back, preserves the full file outside the returned region, and rejects truncated completions. Predictions expire on edits, caret movement, blur or disposal. Only an explicit acceptance changes text.

Editor discovery uses the same private React pane and Metro module interfaces as the LSP plugin, with a small independent bridge so neither plugin depends on the other. A Paseo update can require adapting both bridges. Predictions appear only while the sidebar installer contribution is mounted.
