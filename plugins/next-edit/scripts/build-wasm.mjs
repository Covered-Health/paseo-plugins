// Build once during development; installation uses the checked-in WASM bundle.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('..', import.meta.url));
const crate = join(root, 'wasm');
const revision = 'f693ad0847e4faacd7d630fc78c54695bb862266';
const upstream = join(crate, '.upstream/zeta_prompt');
await mkdir(join(upstream, 'src'), { recursive: true });
for (const name of ['zeta_prompt.rs', 'excerpt_ranges.rs', 'hashed_regions.rs', 'multi_region.rs', 'udiff.rs']) {
  const response = await fetch(`https://raw.githubusercontent.com/zed-industries/zed/${revision}/crates/zeta_prompt/src/${name}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Cannot download pinned Zeta source: ${name}: ${response.status}`);
  await writeFile(join(upstream, 'src', name), await response.text());
}
// Replace only Zed's workspace-inherited manifest values to build this isolated crate.
await writeFile(join(upstream, 'Cargo.toml'), `[package]\nname="zeta_prompt"\nversion="0.1.0"\nedition="2024"\nlicense="GPL-3.0-or-later"\n[lib]\npath="src/zeta_prompt.rs"\n[dependencies]\nanyhow="1.0.86"\nimara-diff={version="0.2",default-features=false}\nserde={version="1.0",features=["derive","rc"]}\nstrum={version="0.28",features=["derive"]}\n`);
execFileSync('cargo', ['build', '--manifest-path', join(crate, 'Cargo.toml'), '--target', 'wasm32-unknown-unknown', '--release', '--locked'], { stdio: 'inherit' });
const output = join(crate, 'target/bindings');
execFileSync('wasm-bindgen', [join(crate, 'target/wasm32-unknown-unknown/release/paseo_zeta_wasm.wasm'), '--target', 'web', '--out-dir', output, '--out-name', 'zeta', '--remove-name-section', '--remove-producers-section'], { stdio: 'inherit' });
const base64 = (await readFile(join(output, 'zeta_bg.wasm'))).toString('base64');
const bundled = await build({ stdin: { contents: `import {initSync,prepare,parse} from './zeta.js'; initSync({module:Uint8Array.from(atob(${JSON.stringify(base64)}), c=>c.charCodeAt(0))}); export {prepare,parse};`, resolveDir: output }, bundle: true, format: 'esm', platform: 'node', target: 'es2022', minify: true, write: false });
await writeFile(resolve(root, 'server/zeta-wasm.js'), `// Generated from GPL-3.0-or-later Zed zeta_prompt at ${revision}; rebuild with npm run build:wasm.\n${bundled.outputFiles[0].text}`);
console.log(`Bundled ${Buffer.from(base64, 'base64').length} WASM bytes`);
