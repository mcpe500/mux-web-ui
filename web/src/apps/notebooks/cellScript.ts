// NB-008 (spec 014) D-log: L2 Run Cell protocol — embed `# %% MUXCELL i`
// markers between code cells (markdown/raw become `# %% MUXSKIP` comments so
// indexes stay stable) and map streamed stdout back to per-cell buckets.
// Trailing output after the LAST marker belongs to that (current) cell.
import type { CellType } from './notebookModel';

export interface ScriptCell {
  type: CellType;
  source: string[];
}

const MARK = '# %% MUXCELL ';
const SKIP = '# %% MUXSKIP ';

/// Marker BEFORE each code cell (index = cell position, markdown gaps keep
/// numbering stable) ⇒ splitRunStdout's prelude only carries true startup
/// noise; cell-0 stdout already belongs to bucket 0.
export function cellsToScript(cells: ScriptCell[]): string {
  const parts: string[] = [];
  cells.forEach((c, i) => {
    if (c.type === 'code') {
      parts.push(`${MARK}${i}`);
      const body = c.source.join('').replace(/\n+$/, '');
      if (body) parts.push(body);
    } else {
      parts.push(`${SKIP}${i} (${c.type})`);
    }
  });
  return parts.join('\n');
}

const MARK_RE = /^#\s%%\sMUXCELL\s(\d+)\s*$/;

export interface SplitResult {
  prelude: string[];
  cells: string[][];
}

/// Map emitted stdout lines back per cell index. Lines before the first
/// marker land in `prelude`; lines after the last marker trail into that
/// marker's bucket (trailing-into-current semantics). Marker lines themselves
/// are consumed. Always returns `cellCount` buckets.
export function splitRunStdout(lines: string[], cellCount: number): SplitResult {
  const cells: string[][] = Array.from({ length: cellCount }, () => []);
  const prelude: string[] = [];
  let cur = -1; // -1 = prelude
  for (const raw of lines) {
    const m = MARK_RE.exec(raw.trimEnd());
    if (m) {
      const idx = Number(m[1]);
      cur = idx < cellCount ? idx : cellCount - 1;
      continue;
    }
    if (raw.startsWith('# %% MUXSKIP')) continue; // markdown comment marker
    if (cur === -1) prelude.push(raw);
    else cells[cur].push(raw);
  }
  return { prelude, cells };
}
