import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { prepare, parse } from './zeta-wasm.js';
import { request, result, type Preferences } from '../shared/prediction.ts';

type Input = z.output<typeof request>;
const parsedRegion = z.object({
  new_editable_region: z.string().max(1_000_000),
  range_in_excerpt: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
  cursor_offset_in_new_editable_region: z.number().int().nonnegative().nullable(),
});
const completion = z.object({ choices: z.array(z.object({ text: z.string().max(1_000_000), finish_reason: z.string().nullable().optional() })).min(1) });
const decoder = new TextDecoder('utf-8', { fatal: true });

export function preparePrediction(input: Input): { prompt: string; input: string; stop: string[] } {
  request.parse(input);
  const prefix = input.text.slice(0, input.cursorOffset);
  if (Buffer.from(prefix).toString('utf8') !== prefix || Buffer.from(input.text).toString('utf8') !== input.text) throw new Error('Invalid Unicode cursor or document');
  return JSON.parse(prepare(JSON.stringify({
    cursor_path: input.path, cursor_excerpt: input.text,
    cursor_offset_in_excerpt: Buffer.byteLength(prefix, 'utf8'), excerpt_start_row: 0,
    events: input.history.map(({ diff }) => ({ event: 'BufferChange', path: input.path, old_path: input.path, diff, predicted: false, in_open_source_repo: false })),
  })));
}

export function parsePrediction(input: Input, preparedInput: string, output: string) {
  const parsed = parsedRegion.parse(JSON.parse(parse(output, preparedInput)));
  const original = Buffer.from(input.text, 'utf8'), replacement = Buffer.from(parsed.new_editable_region, 'utf8');
  const { start, end } = parsed.range_in_excerpt;
  if (start > end || end > original.length) throw new Error('Invalid predicted region');
  decoder.decode(original.subarray(0, start)); decoder.decode(original.subarray(0, end));
  if (original.subarray(start, end).equals(replacement)) return { newText: input.text, cursorOffset: input.cursorOffset };
  const updated = Buffer.concat([original.subarray(0, start), replacement, original.subarray(end)]);
  const explicit = parsed.cursor_offset_in_new_editable_region;
  const oldCursor = Buffer.byteLength(input.text.slice(0, input.cursorOffset), 'utf8');
  let cursor: number;
  if (explicit !== null) {
    if (explicit > replacement.length) throw new Error('Invalid predicted cursor');
    decoder.decode(replacement.subarray(0, explicit)); cursor = start + explicit;
  } else if (oldCursor < start) cursor = oldCursor;
  else if (oldCursor > end) cursor = oldCursor + replacement.length - (end - start);
  else cursor = start + replacement.length;
  return result.parse({ newText: decoder.decode(updated), cursorOffset: decoder.decode(updated.subarray(0, cursor)).length });
}

export async function predictEdit(input: Input, settings: Preferences) {
  const prepared = preparePrediction(input);
  const response = await fetch(settings.modelUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
    body: JSON.stringify({ prompt: prepared.prompt, max_tokens: 512, temperature: 0, stop: prepared.stop, stream: false, ...(settings.model ? { model: settings.model } : {}) }),
    signal: AbortSignal.timeout(25_000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Prediction model returned HTTP ${response.status}`);
  const choice = completion.parse(await response.json()).choices[0]!;
  if (choice.finish_reason === 'length') throw new Error('Truncated model prediction');
  return parsePrediction(input, prepared.input, choice.text);
}
