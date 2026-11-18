import type { Target } from '../shared/contracts.ts';
type Cell = { content: string; lineNumber: number | null; sourceIdentity: { side: string }; fragments: { end: number; graphemes: { start: number; width: number }[] }[] };
export type Model = { viewportWidth: number; lineHeight: number; files: { path: string; top: number; bottom: number; bodyTop: number; gutterWidth: number }[]; rows: { kind: string; path: string; top: number; height: number; reviewHeight: number; cells?: (Cell | null)[] }[] };
export type DiffPoint = { path: string; position: Target['range']['start']; diffLine: string };
export function diffPoint(model: Model, x: number, y: number, horizontalOffset = 0): DiffPoint | undefined {
  const file = model.files.find(file => file.bodyTop <= y && y < file.bottom);
  const row = model.rows.find(row => row.kind === 'line' && row.top <= y && y < row.top + row.height - row.reviewHeight);
  if (!file || !row?.cells || row.path !== file.path || x < 0 || x >= model.viewportWidth) return;
  const width = model.viewportWidth / row.cells.length, index = Math.floor(x / width), cell = row.cells[index];
  if (!cell || cell.sourceIdentity.side !== 'new' || cell.lineNumber === null) return;
  const localX = x - index * width;
  if (localX < file.gutterWidth + 8) return;
  const fragment = cell.fragments[Math.floor((y - row.top) / model.lineHeight)];
  if (!fragment) return;
  const contentX = localX - file.gutterWidth - 8 + horizontalOffset;
  let advance = 0, character = fragment.end;
  for (const grapheme of fragment.graphemes) {
    if (contentX <= advance + grapheme.width / 2) { character = grapheme.start; break; }
    advance += grapheme.width;
  }
  return { path: file.path, position: { line: cell.lineNumber - 1, character }, diffLine: cell.content };
}
