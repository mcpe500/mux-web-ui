// EDIT-010/012 (spec 010): line model + search + viewport helpers. Pure.

export interface TextModel {
  lines: string[];
}

export function createModel(text: string): TextModel {
  return { lines: text.split('\n') };
}

export function getText(m: TextModel): string {
  return m.lines.join('\n');
}

export function lineCount(m: TextModel): number {
  return m.lines.length;
}

/** Insert text at 0-based (line, col). Returns new model (immutable). */
export function insert(m: TextModel, line: number, col: number, text: string): TextModel {
  const lines = m.lines.slice();
  const li = Math.max(0, Math.min(line, lines.length - 1));
  const cur = lines[li] ?? '';
  const parts = text.split('\n');
  if (parts.length === 1) {
    lines[li] = cur.slice(0, col) + text + cur.slice(col);
  } else {
    const before = cur.slice(0, col);
    const after = cur.slice(col);
    const mid = parts.slice(1, -1);
    lines.splice(li, 1, before + parts[0], ...mid, parts[parts.length - 1] + after);
  }
  return { lines };
}

/** Delete range [start{line,col}, end{line,col}) — clamped, returns new model. */
export function deleteRange(
  m: TextModel,
  start: { line: number; col: number },
  end: { line: number; col: number },
): TextModel {
  const lines = m.lines.slice();
  const sl = Math.max(0, Math.min(start.line, lines.length - 1));
  const el = Math.max(0, Math.min(end.line, lines.length - 1));
  if (sl === el) {
    const c = lines[sl] ?? '';
    const a = Math.min(start.col, c.length);
    const b = Math.min(Math.max(end.col, a), c.length);
    lines[sl] = c.slice(0, a) + c.slice(b);
    return { lines };
  }
  const first = (lines[sl] ?? '').slice(0, start.col);
  const last = (lines[el] ?? '').slice(end.col);
  lines.splice(sl, el - sl + 1, first + last);
  return { lines };
}

export interface SearchHit {
  line: number;
  col: number;
  length: number;
}

export function findMatches(
  m: TextModel,
  query: string,
  caseSensitive = false,
): SearchHit[] {
  const hits: SearchHit[] = [];
  if (query.length === 0) return hits;
  const q = caseSensitive ? query : query.toLowerCase();
  for (let li = 0; li < m.lines.length; li++) {
    const hay = caseSensitive ? m.lines[li] : m.lines[li].toLowerCase();
    let from = 0;
    while (true) {
      const idx = hay.indexOf(q, from);
      if (idx === -1) break;
      hits.push({ line: li, col: idx, length: query.length });
      from = idx + Math.max(1, query.length);
    }
  }
  return hits;
}

export function replaceAll(
  m: TextModel,
  query: string,
  replacement: string,
  caseSensitive = false,
): { model: TextModel; count: number } {
  if (query.length === 0) return { model: m, count: 0 };
  let count = 0;
  const lines = m.lines.map((l) => {
    const hay = caseSensitive ? l : l.toLowerCase();
    const q = caseSensitive ? query : query.toLowerCase();
    if (!hay.includes(q)) return l;
    let out = '';
    let from = 0;
    while (true) {
      const idx = hay.indexOf(q, from);
      if (idx === -1) {
        out += l.slice(from);
        break;
      }
      out += l.slice(from, idx) + replacement;
      from = idx + query.length;
      count++;
    }
    return out;
  });
  return { model: { lines }, count };
}

export function gotoLine(m: TextModel, line: number): number {
  return Math.max(0, Math.min(line, m.lines.length - 1));
}

/** EDIT-010: visible line range with overscan (pure). */
export function visibleRange(
  total: number,
  scrollTop: number,
  viewportH: number,
  lineH: number,
  overscan = 10,
): { start: number; end: number } {
  if (total === 0 || lineH <= 0) return { start: 0, end: 0 };
  const start = Math.max(0, Math.floor(scrollTop / lineH) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + viewportH) / lineH) + overscan);
  return { start, end };
}
