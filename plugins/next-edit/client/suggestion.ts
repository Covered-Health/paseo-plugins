import { createPatch } from 'diff';
export function editSpan(oldText: string, newText: string) {
  let from = 0, oldEnd = oldText.length, newEnd = newText.length;
  while (from < oldEnd && from < newEnd && oldText[from] === newText[from]) from++;
  while (oldEnd > from && newEnd > from && oldText[oldEnd - 1] === newText[newEnd - 1]) { oldEnd--; newEnd--; }
  // Keep surrogate pairs together at diff boundaries.
  if (from > 0 && /[\uD800-\uDBFF]/.test(oldText[from - 1])) from--;
  if (oldEnd < oldText.length && /[\uDC00-\uDFFF]/.test(oldText[oldEnd])) { oldEnd++; newEnd++; }
  return { from, to: oldEnd, insert: newText.slice(from, newEnd) };
}
export function recentDiff(oldDoc: string, newDoc: string) {
  return createPatch('buffer', oldDoc, newDoc, '', '', { context: 3 }).split('\n').slice(4).join('\n');
}
