import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preparePrediction, parsePrediction, predictEdit } from '../server/prediction.ts';
import { preferences, request } from '../shared/prediction.ts';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/zeta.json', import.meta.url), 'utf8')) as { name: string; request: unknown; prompt: string; stop: string[]; output: string; result: unknown }[];
for (const fixture of fixtures) test(`real WASM matches native Zeta bindings: ${fixture.name}`, () => {
  const input = request.parse(fixture.request), prepared = preparePrediction(input);
  assert.equal(prepared.prompt, fixture.prompt);
  assert.deepEqual(prepared.stop, fixture.stop);
  assert.deepEqual(parsePrediction(input, prepared.input, fixture.output), fixture.result);
});
test('rejects cursor offsets inside a surrogate pair', () => {
  assert.throws(() => preparePrediction({ path: 'a.py', text: '😀', cursorOffset: 1, history: [] }), /Unicode/);
});
test('host calls configured completions endpoint and rejects truncated or failed responses', async () => {
  const fixture = fixtures.find(item => item.name === 'edit')!, input = request.parse(fixture.request);
  const settings = preferences.schema.parse({ enabled: true, modelUrl: 'https://example.test/v1/completions', model: 'my-zeta', apiKey: 'secret' });
  let finish = 'stop', status = 200;
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, settings.modelUrl);
    const headers = new Headers(init?.headers); assert.equal(headers.get('Authorization'), 'Bearer secret');
    const payload = JSON.parse(init?.body as string);
    assert.equal(payload.prompt, fixture.prompt); assert.equal(payload.model, 'my-zeta'); assert.equal(payload.temperature, 0);
    assert.deepEqual(payload.stop, fixture.stop);
    return new Response(JSON.stringify({ choices: [{ text: fixture.output, finish_reason: finish }] }), { status });
  });
  try {
    assert.deepEqual(await predictEdit(input, settings), fixture.result);
    finish = 'length'; await assert.rejects(predictEdit(input, settings), /Truncated/);
    status = 503; await assert.rejects(predictEdit(input, settings), /HTTP 503/);
  } finally { fetchMock.mock.restore(); }
});
test('old proxy settings migrate to disabled direct model configuration', async () => {
  const migrated = preferences.schema.parse(await preferences.migrate!({ enabled: true, proxyUrl: 'http://remote.test/predict' }, 1));
  assert.equal(migrated.enabled, false); assert.equal(migrated.modelUrl, 'http://127.0.0.1:8080/v1/completions');
});
