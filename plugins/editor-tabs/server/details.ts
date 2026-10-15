import { z } from 'zod';
import type { Signature } from '../shared/contracts.ts';
const documentation = z.union([z.string().max(32_000), z.object({ value: z.string().max(32_000) })]);
export function hoverText(value: unknown): string | null {
  const hover = z.object({ contents: z.union([documentation, z.array(documentation).max(20)]) }).nullable().parse(value);
  if (!hover) return null;
  const entries = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
  return entries.map(entry => typeof entry === 'string' ? entry : entry.value).join('\n\n').replace(/^```[^\n]*\n|^```\s*$/gm, '').trim().slice(0, 32_000) || null;
}

export function signatureInfo(value: unknown): Signature | null {
  const index = z.number().int().min(0);
  const parameter = z.object({ label: z.union([z.string().max(8000), z.tuple([index, index])]), documentation: documentation.optional() });
  const entry = z.object({ label: z.string().max(8000), documentation: documentation.optional(), parameters: z.array(parameter).max(200).optional(), activeParameter: index.optional() });
  const response = z.object({ signatures: z.array(entry).max(100), activeSignature: index.optional(), activeParameter: index.optional() }).nullable().parse(value);
  if (!response?.signatures.length) return null;
  const active = Math.min(response.activeSignature ?? 0, response.signatures.length - 1);
  const selected = response.signatures[active];
  const selectedParameter = selected.parameters?.[selected.activeParameter ?? response.activeParameter ?? 0];
  let offsets: [number, number] | undefined;
  if (selectedParameter) {
    const label = selectedParameter.label;
    const start = typeof label === 'string' ? selected.label.indexOf(label) : label[0];
    const end = typeof label === 'string' ? start + label.length : label[1];
    if (start >= 0 && end >= start && end <= selected.label.length) offsets = [start, end];
  }
  const docs = [selected.documentation, selectedParameter?.documentation].filter(item => item !== undefined).map(item => typeof item === 'string' ? item : item.value).join('\n\n').slice(0, 32_000);
  return { label: selected.label, parameter: offsets, documentation: docs || undefined, index: active, count: response.signatures.length };
}
