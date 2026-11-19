# Next edit prediction development

Independent plugin for native Paseo CodeMirror editors. The LSP plugin is unchanged. [Configuration, data sent and limitations](OVERVIEW.md).

```sh
cd plugins/next-edit
npm ci
npm run typecheck
npm test
paseo plugin install /absolute/path/to/plugins/next-edit
```

Configure the direct Zeta 2.1 `/v1/completions` URL, model and optional API key in the plugin settings. A working local example is `http://127.0.0.1:8080/v1/completions` with model `slxnxl/zeta-2.1-mlx-4bit`. Python and Docker are no longer used.

The server embeds a 250 KB WASM module compiled from Zed’s `zeta_prompt` crate at revision `f693ad0847e4faacd7d630fc78c54695bb862266`. The small Rust wrapper exposes prompt preparation and response parsing. TypeScript handles HTTP, offset conversion, validated splicing and no-edit detection. The generated `server/zeta-wasm.js` contains the binary and JavaScript bindings, so Paseo’s source bundler needs no external asset loading or platform-specific native extension.

To rebuild the committed WASM artifact:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.130 --locked
npm run build:wasm
```

The build script downloads five source files from the pinned Zed revision and supplies their standalone Cargo manifest with the upstream workspace dependency versions. `wasm/Cargo.lock` pins resolved dependencies. Downloaded sources and build outputs are ignored; the Rust wrapper, lockfile, build script, GPL license and generated runtime bundle are included in the plugin package. Zeta source: <https://github.com/zed-industries/zed/tree/f693ad0847e4faacd7d630fc78c54695bb862266/crates/zeta_prompt>.

The editor extension is bundled separately as CommonJS with `@codemirror/state` and `@codemirror/view` external. Runtime loading supplies the host’s actual module instances. A removable compartment owns each editor’s extension, debounce timer and pending response generation. Changes to the extension require rebuilding ignored `client/ai-source.js` with `npm run postinstall`; installation does this automatically.

`@marimo-team/codemirror-ai` 0.3.10 was evaluated but its diff acceptance merges separated changes without retaining intervening text and ignores the model cursor for text edits. This implementation previews a single exact replacement span, retains all intervening text, and accepts the returned cursor. It invalidates pending results on selection movement and disposal, and ignores cursor-only predictions.

Tests execute the real compiled WASM module and compare prompts, stop tokens and spliced results with fixtures captured from `zed-zeta-bindings` 1.10.2: no-edit, real edit, Unicode/history and cropped-document cases. Additional tests cover the configured HTTP request, truncated completions, malformed Unicode, settings migration, native editor acceptance, stale results and LSP key priority.

Live checks on Paseo 0.16.0 with the local Zeta model verified no-edit cursor preservation and `return x` → `return x * x` through the installed WASM host handler. The earlier live editor check verified inline preview, LSP menu dismissal and Tab acceptance using the installed app’s web bundle; its background document-focus gate was simulated.
