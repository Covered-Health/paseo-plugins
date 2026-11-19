import { defineRpc, defineSettings } from '@getpaseo/plugin';
import { z } from 'zod';
const httpUrl = z.string().url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'Use an HTTP(S) URL');
export const preferences = defineSettings({
  id: 'prediction', scope: 'host', version: 2,
  schema: z.object({
    enabled: z.boolean().default(false),
    modelUrl: httpUrl.default('http://127.0.0.1:8080/v1/completions'),
    model: z.string().trim().max(4096).default(''),
    apiKey: z.string().trim().max(8000).default(''),
  }),
  // The old proxy URL does not identify the model endpoint; require configuring it again.
  migrate: () => ({ enabled: false }),
});
export type Preferences = z.output<typeof preferences.schema>;
export const request = z.object({ path: z.string().min(1).max(4096), text: z.string().max(500_000), cursorOffset: z.number().int().nonnegative(), history: z.array(z.object({ diff: z.string().max(16_000) })).max(10) }).refine(value => value.cursorOffset <= value.text.length, 'Cursor outside document');
export const result = z.object({ newText: z.string().max(1_000_000), cursorOffset: z.number().int().nonnegative() }).refine(value => value.cursorOffset <= value.newText.length, 'Cursor outside prediction');
export const predict = defineRpc({ name: 'prediction.next', input: request, output: result });
