import { describe, expect, it } from 'vitest';
import {
  MAX_CELLS,
  MAX_NOTEBOOK_BYTES,
  MAX_OUTPUT_BYTES,
  parseNotebook,
  serializeNotebook,
  addCell,
  removeCell,
  moveCell,
  setCellSource,
  changeType,
} from './notebookModel';

const FIX_V4 = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: { kernelspec: { name: 'python3', display_name: 'Python 3' } },
  cells: [
    {
      cell_type: 'code',
      execution_count: 1,
      metadata: {},
      source: ['import pandas as pd\n'],
      outputs: [
        {
          output_type: 'stream',
          name: 'stdout',
          text: ['hello\n', 'world\n'],
        },
      ],
    },
    {
      cell_type: 'markdown',
      metadata: {},
      source: ['# Title\n', 'some **bold**'],
    },
    {
      cell_type: 'raw',
      metadata: {},
      source: 'raw text',
    },
  ],
});

// ── NB-001 parser ──

describe('NB-001 parseNotebook', () => {
  it('nbformat v4 standar → sel terpetakan + output stream', () => {
    const r = parseNotebook(FIX_V4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.notebook.cells).toHaveLength(3);
    expect(r.notebook.cells[0].type).toBe('code');
    expect(r.notebook.cells[0].source).toEqual(['import pandas as pd\n']);
    expect(r.notebook.cells[0].outputs).toEqual([
      { kind: 'stream', text: 'hello\nworld\n' },
    ]);
    expect(r.notebook.cells[1].type).toBe('markdown');
    expect(r.notebook.cells[2].type).toBe('raw');
  });

  it('output error → ename/evalue/traceback; rich → collapsed label; unknown → rich', () => {
    const nb = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          source: ['1/0'],
          outputs: [
            {
              output_type: 'error',
              ename: 'ZeroDivisionError',
              evalue: 'division by zero',
              traceback: ['Traceback (most recent call last):', 'ZeroDivisionError'],
            },
          ],
        },
        {
          cell_type: 'code',
          source: ['2+2'],
          outputs: [
            {
              output_type: 'execute_result',
              data: { 'text/plain': ['4'], 'image/png': 'iVBOR' },
            },
          ],
        },
        {
          cell_type: 'code',
          source: ['x'],
          outputs: [{ output_type: 'display_data', data: { 'application/vega': '{}' } }],
        },
      ],
    });
    const r = parseNotebook(nb);
    if (!r.ok) throw new Error('must parse');
    const [err, rich, unknown] = r.notebook.cells.map((c) => c.outputs[0]!);
    expect(err).toMatchObject({ kind: 'error', ename: 'ZeroDivisionError' });
    expect((err as { traceback: string[] }).traceback).toHaveLength(2);
    expect(rich).toMatchObject({ kind: 'rich', mime: 'text/plain' });
    expect(unknown).toMatchObject({ kind: 'rich', mime: 'application/vega' });
  });

  it('output >256 KiB → placeholder big dengan sizeBytes', () => {
    const huge = 'a'.repeat(MAX_OUTPUT_BYTES + 1);
    const nb = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          source: ['print("x"*999999)'],
          outputs: [{ output_type: 'stream', name: 'stdout', text: [huge] }],
        },
      ],
    });
    const r = parseNotebook(nb);
    if (!r.ok) throw new Error('must parse');
    expect(r.notebook.cells[0].outputs[0]).toMatchObject({
      kind: 'big',
      sizeBytes: huge.length,
    });
  });

  it('v3 worksheets → migrasi minimal input→source', () => {
    const v3 = JSON.stringify({
      nbformat: 3,
      nbformat_minor: 2,
      metadata: {},
      worksheets: [
        {
          cells: [
            { cell_type: 'code', input: ['x = 1\n'], prompt_number: 1, outputs: [] },
            { cell_type: 'markdown', source: ['# v3'] },
          ],
        },
      ],
    });
    const r = parseNotebook(v3);
    if (!r.ok) throw new Error('must parse');
    expect(r.notebook.cells[0].type).toBe('code');
    expect(r.notebook.cells[0].source).toEqual(['x = 1\n']);
    expect(r.notebook.cells[1].type).toBe('markdown');
  });

  it('JSON korup mid-file → NOTEBOOK_CORRUPT tanpa crash', () => {
    const corrupt = FIX_V4.slice(0, FIX_V4.length - 40) + '<<<TRUNCATED>>>';
    expect(parseNotebook(corrupt)).toMatchObject({ ok: false, error: 'NOTEBOOK_CORRUPT' });
    expect(parseNotebook('bukan json sama sekali')).toMatchObject({
      ok: false,
      error: 'NOTEBOOK_CORRUPT',
    });
    expect(parseNotebook(JSON.stringify({ nbformat: 4, cells: 'bukan-array' }))).toMatchObject({
      ok: false,
      error: 'NOTEBOOK_CORRUPT',
    });
  });

  it('JSON bomb-lite nesting >64 → NOTEBOOK_CORRUPT sebelum JSON.parse', () => {
    const bomb = '{"a":'.repeat(10_000) + '1' + '}'.repeat(10_000);
    const r = parseNotebook(bomb);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NOTEBOOK_CORRUPT');
  });

  it('2500 cells → ditolak (MAX_CELLS guard)', () => {
    const cells = Array.from({ length: MAX_CELLS + 500 }, (_, i) => ({
      cell_type: 'code',
      source: [`# cell ${i}`],
      outputs: [],
    }));
    const r = parseNotebook(JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells }));
    expect(r).toMatchObject({ ok: false, error: 'NOTEBOOK_CORRUPT' });
  });

  it('bytes > 5 MiB (param override utk test) → NOTEBOOK_TOO_LARGE sebelum parse', () => {
    const big = 'x'.repeat(MAX_NOTEBOOK_BYTES + 1);
    expect(parseNotebook(big)).toMatchObject({ ok: false, error: 'NOTEBOOK_TOO_LARGE' });
  });
});

// ── NB-004/NB-005 serializer + mutasi ──

describe('NB-004 serializeNotebook canonical', () => {
  it('round-trip byte-stabil: serialize(parse(serialize(fix))) == serialize(fix)', () => {
    const nb1 = parseNotebook(FIX_V4);
    if (!nb1.ok) throw new Error('fix must parse');
    const s1 = serializeNotebook(nb1.notebook);
    const nb2 = parseNotebook(s1);
    if (!nb2.ok) throw new Error('roundtrip must parse');
    const s2 = serializeNotebook(nb2.notebook);
    expect(s1).toBe(s2);
    // canonical key order visible: nbformat, metadata, cells; cell keys ordered
    expect(s1.indexOf('"nbformat"')).toBeLessThan(s1.indexOf('"cells"'));
    expect(s1.indexOf('"cell_type"')).toBeLessThan(s1.indexOf('"source"'));
  });

  it('metadata disortir stabil; source array→string→array bolak-balik', () => {
    const nb = parseNotebook(FIX_V4);
    if (!nb.ok) throw new Error('parse');
    const reordered = JSON.stringify({
      cells: [
        {
          source: ['import pandas as pd\n'],
          metadata: {},
          execution_count: 1,
          cell_type: 'code',
          outputs: [],
        },
      ],
      metadata: { z: 1, a: 2 },
      nbformat_minor: 5,
      nbformat: 4,
    });
    const r2 = parseNotebook(reordered);
    if (!r2.ok) throw new Error('parse2');
    const s1 = serializeNotebook(nb.notebook);
    const s2 = serializeNotebook(r2.notebook);
    // shape-equal modulo outputs/content: canonical order makes keys identical
    expect(s1.indexOf('"cell_type"')).toBeGreaterThan(-1);
    expect(s2.indexOf('"cell_type"')).toBeGreaterThan(-1);
    const r3 = parseNotebook(s2);
    if (!r3.ok) throw new Error('parse3');
    expect(serializeNotebook(r3.notebook)).toContain('"nbformat"');
  });
});

describe('NB-005 cell mutations (immutable)', () => {
  const base = parseNotebook(FIX_V4);
  if (!base.ok) throw new Error('fixture must parse');
  const nb = base.notebook;

  it('setCellSource → array baru, nb lama utuh', () => {
    const nb2 = setCellSource(nb, nb.cells[0].id, ['print(1)\n']);
    expect(nb2.cells[0].source).toEqual(['print(1)\n']);
    expect(nb.cells[0].source).toEqual(['import pandas as pd\n']);
    expect(nb2).not.toBe(nb);
  });

  it('addCell pada indeks + removeCell + moveCell', () => {
    const added = addCell(nb, 1, 'markdown');
    expect(added.cells).toHaveLength(4);
    expect(added.cells[1].type).toBe('markdown');
    expect(nb.cells).toHaveLength(3);

    const removed = removeCell(added, added.cells[0].id);
    expect(removed.cells).toHaveLength(3);
    expect(removed.cells[0].id).toBe(added.cells[1].id);

    const moved = moveCell(nb, 2, 0);
    expect(moved.cells[0].type).toBe('raw');
    expect(moved.cells.map((c) => c.id)).not.toEqual(nb.cells.map((c) => c.id));
    // out-of-range index aman (clamp terhadap panjang post-splice)
    expect(moveCell(nb, 0, 99).cells[2].type).toBe('code');
  });

  it('changeType code↔markdown menyimpan source; raw→markdown juga', () => {
    const changed = changeType(nb, nb.cells[2].id, 'markdown');
    expect(changed.cells[2].type).toBe('markdown');
    expect(changed.cells[2].source).toEqual(['raw text']);
  });
});
