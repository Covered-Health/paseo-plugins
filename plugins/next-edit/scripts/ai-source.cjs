const { buildSync } = require('esbuild');
const { writeFileSync } = require('node:fs');
const result = buildSync({ stdin: { contents: 'export {nextEditPrediction} from "./client/extension.ts"', resolveDir: require('node:path').join(__dirname, '..') }, bundle: true, format: 'cjs', platform: 'browser', external: ['@codemirror/state', '@codemirror/view'], write: false });
writeFileSync(require('node:path').join(__dirname, '../client/ai-source.js'), `export default ${JSON.stringify(result.outputFiles[0].text)};\n`);
