import { describe, expect, it } from 'vitest';
import { cellsToScript, splitRunStdout, type ScriptCell } from './cellScript';

// ── NB-008 D-log: cellsToScript markers + stdout segment mapping ──

const code = (lines: string[]): ScriptCell => ({ type: 'code', source: lines });
const md = (lines: string[]): ScriptCell => ({ type: 'markdown', source: lines });

describe('cellsToScript', () => {
  it('marker "# %% MUXCELL i" di depan tiap code cell', () => {
    const s = cellsToScript([code(['a = 1']), code(['print(a)'])]);
    expect(s).toBe('# %% MUXCELL 0\na = 1\n# %% MUXCELL 1\nprint(a)');
  });

  it('markdown di-skip dengan marker komentar, tanpa menggeser index code', () => {
    const s = cellsToScript([code(['x = 1']), md(['# judul']), code(['print(x)'])]);
    expect(s).toBe('# %% MUXCELL 0\nx = 1\n# %% MUXSKIP 1 (markdown)\n# %% MUXCELL 2\nprint(x)');
  });

  it('kosong / hanya-markdown → string kosong aman', () => {
    expect(cellsToScript([])).toBe('');
    expect(cellsToScript([md(['# c'])])).toBe('# %% MUXSKIP 0 (markdown)');
  });
});

describe('splitRunStdout', () => {
  it('segmen dipetakan balik ke index cell (trailing masuk cell terakhir)', () => {
    const s = cellsToScript([code(['a=1']), code(['b=2']), code(['c=3'])]);
    const lines = [
      'PRE', // sebelum marker pertama
      '# %% MUXCELL 1',
      'out-b',
      '# %% MUXCELL 2',
      'out-c-1',
      'out-c-2', // trailing-into-current
    ];
    const r = splitRunStdout(lines, 3);
    expect(r.prelude).toEqual(['PRE']);
    expect(r.cells[0]).toEqual([]);
    expect(r.cells[1]).toEqual(['out-b']);
    expect(r.cells[2]).toEqual(['out-c-1', 'out-c-2']);
    void s;
  });

  it('round-trip simetris: script → simulasi run → split = isi cell asli', () => {
    // nbformat source lines carry trailing \n (join('') rebuilds real python)
    const cells = [code(['print("A")\n', 'print("A2")']), code(['print("B")'])];
    const lines = cellsToScript(cells).split('\n');
    const r = splitRunStdout(lines, 2);
    // markers themselves are stripped from output
    expect(r.cells[0]).toEqual(['print("A")', 'print("A2")']);
    expect(r.cells[1]).toEqual(['print("B")']);
    expect(r.prelude).toEqual([]);
  });

  it('multi-line + fence-like konten di dalam print tidak memecah bucket', () => {
    const cells = [
      code(['print("```")\n', 'print("isi fence")\n', 'print("```")']),
      code(['print("done")']),
    ];
    const lines = cellsToScript(cells).split('\n');
    const r = splitRunStdout(lines, 2);
    expect(r.cells[0]).toEqual(['print("```")', 'print("isi fence")', 'print("```")']);
    expect(r.cells[1]).toEqual(['print("done")']);
  });

  it('marker markdown MUXSKIP diabaikan (bukan pembatas bucket)', () => {
    const cells = [code(['a=1']), md(['# t']), code(['b=2'])];
    const lines = cellsToScript(cells).split('\n');
    const r = splitRunStdout(lines, 2);
    expect(r.cells[1]).toEqual(['b=2']);
  });

  it('python print loop nyata (5 output) → tepat masuk bucket sendiri', () => {
    // handcrafted stdout simulation (code lines stripped; only prints emit)
    const sim = [
      '# %% MUXCELL 0',
      'start',
      '# %% MUXCELL 1',
      '0',
      '1',
      '2',
    ];
    const r = splitRunStdout(sim, 2);
    expect(r.cells[0]).toEqual(['start']);
    expect(r.cells[1]).toEqual(['0', '1', '2']);
  });

  it('cellCount lebih besar dari marker terakhir → array dipadatkan kosong', () => {
    const r = splitRunStdout(['# %% MUXCELL 0', 'x'], 4);
    expect(r.cells).toHaveLength(4);
    expect(r.cells[0]).toEqual(['x']);
    expect(r.cells[3]).toEqual([]);
  });
});
