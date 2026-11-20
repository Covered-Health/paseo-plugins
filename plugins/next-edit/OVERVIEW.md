# Next edit prediction

Suggests edits in Paseo’s existing desktop/web file editor after a 500 ms typing pause. Review the inline insertion and struck-through replacement, then press Tab or click Accept. Escape dismisses the suggestion. Accepted changes stay unsaved and use the editor’s normal undo history. A small spinner at the editor’s lower-right corner appears while a prediction is pending. Each editor runs one request at a time and keeps only the latest pending edit. Model requests time out after 25 seconds. Responses that do not change text are ignored. Native mobile editors are not supported.

Runs independently of the LSP plugin. Both use the host’s CodeMirror runtime and separate extension compartments; LSP autocomplete takes priority over predictions on Tab. Disabling or removing this plugin removes its extensions without changing LSP behavior.

## Setup

Requires Paseo 0.11.2 or newer. In Settings → Plugins → Next edit prediction, configure the full OpenAI-compatible **text completions** endpoint serving Zeta 2.1, the model identifier if required, and an optional API key, then enable predictions. Settings belong to the selected daemon host. Old proxy settings migrate to disabled predictions until the direct model endpoint is configured.

The default endpoint is `http://127.0.0.1:8080/v1/completions`, where localhost means the daemon machine. The inference engine can be MLX, vLLM, llama.cpp, or a hosted service supporting the model’s raw text-completion format. The daemon makes HTTP requests directly; client devices do not need network access to the model or browser CORS configuration.

The plugin includes a compiled Rust/WASM version of Zed’s Zeta context-range computation, Multi-Region SPM formatter and output parser. It runs in the plugin server process. No Python, Docker, separate proxy service or Rust toolchain is required to use it. The bundled formatter/parser and its wrapper are GPL-3.0-or-later; their license and build source are included under `wasm/`.

## Data and limits

Disabled by default. Once enabled, sends the active file’s unsaved text, path, cursor and up to ten recent edit diffs through the daemon to the configured model. History stays in memory per mounted editor, each diff is limited to 16,000 characters, and documents over 500,000 UTF-16 units are skipped. All editable file types are eligible; consider what an endpoint may receive before enabling it. The plugin does not persist document text or history.

Cursor conversion preserves UTF-16 editor offsets and UTF-8 model byte offsets. The host preserves the full file outside the predicted region and rejects truncated completions. No-edit responses preserve the original cursor and never display cursor-only suggestions. Pending predictions expire on edits, caret movement, blur or disposal. Only an explicit acceptance changes text.

Editor discovery uses private React pane and Metro module interfaces, with a small independent bridge so neither plugin depends on the other. A Paseo update can require adapting both bridges. Predictions appear only while the sidebar installer contribution is mounted.
