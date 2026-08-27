// NB-001..003/NB-005 (spec 014): pure notebook model — nbformat v4 parser
// (+v3 minimal migrate), canonical serializer, immutable cell ops.
// Guards: MAX_NOTEBOOK_BYTES pre-parse, depth pre-scan (JSON bomb-lite),
// MAX_CELLS, per-output MAX_OUTPUT_BYTES collapse.
export const MAX_CELLS = 2000;
export const MAX_NOTEBOOK_BYTES = 5 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 64;

export type CellType = 'code' | 'markdown' | 'raw';

export interface StreamOutput {
  kind: 'stream';
  text: string;
}
export interface ErrorOutput {
  kind: 'error';
  ename: string;
  evalue: string;
  traceback: string[];
}
export interface RichOutput {
  kind: 'rich';
  mime: string;
  label: string;
}
export interface BigOutput {
  kind: 'big';
  sizeBytes: number;
}
export type Output = StreamOutput | ErrorOutput | RichOutput | BigOutput;

export interface NbCell {
  id: string;
  type: CellType;
  source: string[];
  outputs: Output[];
  executionCount?: number | null;
  metadata?: Record<string, unknown>;
}

export interface Notebook {
  nbformat: number;
  nbformatMinor: number;
  metadata: Record<string, unknown>;
  cells: NbCell[];
}

export type ParseResult =
  | { ok: true; notebook: Notebook }
  | { ok: false; error: 'NOTEBOOK_CORRUPT' | 'NOTEBOOK_TOO_LARGE' };

let cellSeq = 0;
export const newCellId = () => `muxc-${cellSeq++}`;

const toLines = (src: unknown): string[] => {
  if (typeof src === 'string') return src.split('\n').map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l));
  if (Array.isArray(src)) return src.map((l) => String(l));
  return [];
};

/// Cheap linear scan rejecting pathological nesting before JSON.parse can
/// blow the native stack (JSON bomb-lite).
const depthExceeds = (text: string, max: number): boolean => {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') {
      depth++;
      if (depth > max) return true;
    } else if (c === '}' || c === ']') depth--;
  }
  return false;
};

const byteSize = (v: unknown): number => {
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return 0;
  }
};

const richLabel = (mime: string): string => mime.split('/').pop() || mime;

const mapOutput = (o: Record<string, unknown>): Output | null => {
  const t = o.output_type;
  if (t === 'stream') {
    const text = toLines(o.text).join('');
    if (byteSize(text) > MAX_OUTPUT_BYTES) return { kind: 'big', sizeBytes: text.length };
    return { kind: 'stream', text };
  }
  if (t === 'error') {
    return {
      kind: 'error',
      ename: String(o.ename ?? 'Error'),
      evalue: String(o.evalue ?? ''),
      traceback: Array.isArray(o.traceback) ? o.traceback.map(String) : [],
    };
  }
  if (t === 'execute_result' || t === 'display_data') {
    const data = (o.data ?? {}) as Record<string, unknown>;
    const mimes = Object.keys(data);
    if (mimes.length === 0) return { kind: 'rich', mime: 'text/plain', label: 'text' };
    const total = byteSize(data);
    if (total > MAX_OUTPUT_BYTES) return { kind: 'big', sizeBytes: total };
    const mime = mimes.includes('text/plain') ? 'text/plain' : mimes[0];
    return { kind: 'rich', mime, label: richLabel(mime) };
  }
  return null;
};

export function parseNotebook(
  text: string,
  opts: { maxBytes?: number } = {}
): ParseResult {
  if (text.length > (opts.maxBytes ?? MAX_NOTEBOOK_BYTES)) {
    return { ok: false, error: 'NOTEBOOK_TOO_LARGE' };
  }
  if (depthExceeds(text, MAX_JSON_DEPTH)) return { ok: false, error: 'NOTEBOOK_CORRUPT' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'NOTEBOOK_CORRUPT' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'NOTEBOOK_CORRUPT' };
  const obj = raw as Record<string, unknown>;
  const nbformat = obj.nbformat;
  if (nbformat !== 3 && nbformat !== 4) return { ok: false, error: 'NOTEBOOK_CORRUPT' };

  // v4 top-level cells; v3 nested worksheets
  let rawCells: unknown[];
  if (nbformat === 4) {
    if (!Array.isArray(obj.cells)) return { ok: false, error: 'NOTEBOOK_CORRUPT' };
    rawCells = obj.cells;
  } else {
    const ws = obj.worksheets;
    if (!Array.isArray(ws)) return { ok: false, error: 'NOTEBOOK_CORRUPT' };
    rawCells = ws.flatMap((w) =>
      w && typeof w === 'object' && Array.isArray((w as Record<string, unknown>).cells)
        ? ((w as Record<string, unknown>).cells as unknown[])
        : []
    );
  }
  if (rawCells.length > MAX_CELLS) return { ok: false, error: 'NOTEBOOK_CORRUPT' };

  const cells: NbCell[] = [];
  for (const rc of rawCells) {
    if (typeof rc !== 'object' || rc === null) return { ok: false, error: 'NOTEBOOK_CORRUPT' };
    const c = rc as Record<string, unknown>;
    const t = c.cell_type;
    // v3 code cells use `input` for source
    const source = toLines(c.source ?? c.input);
    const type: CellType = t === 'code' || t === 'markdown' || t === 'raw' ? t : 'raw';
    const outputs: Output[] = [];
    if (type === 'code' && Array.isArray(c.outputs)) {
      for (const ro of c.outputs) {
        if (typeof ro !== 'object' || ro === null) continue;
        const m = mapOutput(ro as Record<string, unknown>);
        if (m) outputs.push(m);
      }
    }
    const cell: NbCell = { id: newCellId(), type, source, outputs };
    if (typeof c.execution_count === 'number') cell.executionCount = c.execution_count;
    if (c.metadata && typeof c.metadata === 'object') {
      cell.metadata = c.metadata as Record<string, unknown>;
    }
    cells.push(cell);
  }

  const metadata =
    obj.metadata && typeof obj.metadata === 'object'
      ? (obj.metadata as Record<string, unknown>)
      : {};
  const nbformatMinor =
    typeof obj.nbformat_minor === 'number' ? obj.nbformat_minor : nbformat === 4 ? 5 : 2;
  return { ok: true, notebook: { nbformat, nbformatMinor, metadata, cells } };
}

const stableValue = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stableValue);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = stableValue((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
};

/// Internal Output → nbformat-shaped output (keeps saved files valid ipynb).
/// ponytail: `big` placeholders degrade to a small stream stub on save —
/// exact byte-faithful giant-output round-trip lands with the Wave-3
/// lazy-output work (rich keeps mime, error/stream are lossless).
const outputToNbformat = (o: Output): Record<string, unknown> => {
  switch (o.kind) {
    case 'stream':
      return { output_type: 'stream', name: 'stdout', text: toLines(o.text) };
    case 'error':
      return { output_type: 'error', ename: o.ename, evalue: o.evalue, traceback: o.traceback };
    case 'rich':
      return { output_type: 'display_data', data: { [o.mime]: o.label } };
    case 'big':
      return { output_type: 'stream', name: 'stdout', text: [`<${o.sizeBytes} bytes collapsed>`] };
  }
};

/// Canonical serializer: fixed key order (nbformat, nbformat_minor, metadata,
/// cells[ cell_type, execution_count?, metadata, source, outputs? ]) with
/// recursively sorted metadata keys — byte-stable across round-trips.
export function serializeNotebook(nb: Notebook): string {
  const cells = nb.cells.map((c) => {
    const source = typeof c.source === 'string' ? [c.source] : c.source;
    if (c.type === 'code') {
      return {
        cell_type: 'code',
        execution_count: c.executionCount ?? null,
        metadata: stableValue(c.metadata ?? {}),
        source,
        outputs: c.outputs.map(outputToNbformat),
      };
    }
    return {
      cell_type: c.type,
      metadata: stableValue(c.metadata ?? {}),
      source,
    };
  });
  const doc = {
    nbformat: nb.nbformat,
    nbformat_minor: nb.nbformatMinor,
    metadata: stableValue(nb.metadata),
    cells,
  };
  return JSON.stringify(doc, null, 1);
}

// ── NB-005: immutable mutations ──

export function setCellSource(nb: Notebook, id: string, source: string[]): Notebook {
  return {
    ...nb,
    cells: nb.cells.map((c) => (c.id === id ? { ...c, source } : c)),
  };
}

export function addCell(nb: Notebook, at: number, type: CellType): Notebook {
  const cell: NbCell = { id: newCellId(), type, source: [], outputs: [] };
  const cells = [...nb.cells];
  const idx = Math.max(0, Math.min(at, cells.length));
  cells.splice(idx, 0, cell);
  return { ...nb, cells };
}

export function removeCell(nb: Notebook, id: string): Notebook {
  return { ...nb, cells: nb.cells.filter((c) => c.id !== id) };
}

export function moveCell(nb: Notebook, from: number, to: number): Notebook {
  const cells = [...nb.cells];
  if (from < 0 || from >= cells.length) return nb;
  const [cell] = cells.splice(from, 1);
  const idx = Math.max(0, Math.min(to, cells.length));
  cells.splice(idx, 0, cell);
  return { ...nb, cells };
}

export function changeType(nb: Notebook, id: string, type: CellType): Notebook {
  return {
    ...nb,
    cells: nb.cells.map((c) =>
      c.id === id
        ? { ...c, type, outputs: type === 'code' ? c.outputs : [] }
        : c
    ),
  };
}
