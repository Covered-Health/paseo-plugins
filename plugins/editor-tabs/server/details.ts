import { z } from 'zod';
const documentation = z.union([z.string().max(32_000), z.object({ value: z.string().max(32_000) })]);
export function hoverText(value: unknown): string | null {
  const hover = z.object({ contents: z.union([documentation, z.array(documentation).max(20)]) }).nullable().parse(value);
  if (!hover) return null;
  const entries = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
  return entries.map(entry => typeof entry === 'string' ? entry : entry.value).join('\n\n').replace(/^```[^\n]*\n|^```\s*$/gm, '').trim().slice(0, 32_000) || null;
}
