// EDIT-018 (spec 011): lineStates cache tests — incremental recompute +
// windowed token consistency vs a fresh full pass.
import { describe, it, expect } from 'vitest';
import { createCache, syncLines, tokensFor, LINE_H } from './lineStates';
import { tokenizeLineStateful, type Lang } from './tokenizer';

const fold = (line: string, inBlock: boolean) => tokenizeLineStateful(line, 'js', inBlock);
const fullTokens = (text: string) => {
  let st = false;
  return text.split('\n').map((l) => {
    const r = tokenizeLineStateful(l, 'js' as Lang, st);
    st = r.inBlock;
    return r.tokens;
  });
};

describe('EDIT-018 syncLines incremental', () => {
  it('builds states consistent with a full pass', () => {
    const c = createCache();
    const text = 'const a = 1;\n/* start\nmid\nend */ const b = 2;\nlet c = 3;';
    syncLines(c, text, fold);
    expect(c.states).toEqual([false, true, true, false, false]);
  });

  it('editing one middle line recomputes only from that line', () => {
    const c = createCache();
    const before = 'x\n/* open\nkept\nstill\n*/ tail';
    syncLines(c, before, fold);
    const firstRecompute = c.lastRecomputeFrom;
    syncLines(c, 'x\n/* open\nCHANGED\nstill\n*/ tail', fold);
    expect(c.lines[2]).toBe('CHANGED');
    expect(c.lastRecomputeFrom).toBe(2);
    expect(firstRecompute).toBe(0);
  });

  it('removing an opener un-highlights the lines below', () => {
    const c = createCache();
    syncLines(c, 'a\n/* b\nc\nd */ e', fold);
    expect(c.states[2]).toBe(true);
    syncLines(c, 'a\nb\nc\nd */ e', fold);
    // 'd */ e' without an open block: '*/' is not a word char → plain code
    expect(c.states[2]).toBe(false);
  });

  it('handles append and truncate', () => {
    const c = createCache();
    syncLines(c, 'a\nb', fold);
    syncLines(c, 'a\nb\nc\nd', fold);
    expect(c.states).toHaveLength(4);
    syncLines(c, 'a', fold);
    expect(c.states).toHaveLength(1);
  });

  it('LINE_H matches the editor font metrics (14px × 1.5)', () => {
    expect(LINE_H).toBe(21);
  });
});

describe('EDIT-018 tokensFor window consistency', () => {
  const text = [
    'const a = 1;',
    '// note',
    '/* open',
    'inside',
    'still',
    'close */ const end = 0;',
    'let z = "s /* not"; ',
    'final();',
  ].join('\n');

  it('any window equals the corresponding slice of a full pass', () => {
    const c = createCache();
    syncLines(c, text, fold);
    const reference = fullTokens(text);
    for (let from = 0; from <= 8; from++) {
      for (let to = from; to <= 8; to++) {
        expect(tokensFor(c, from, to, fold)).toEqual(reference.slice(from, to));
      }
    }
  });

  it('window crossing a block boundary carries state in correctly', () => {
    const c = createCache();
    syncLines(c, text, fold);
    const mid = tokensFor(c, 3, 6, fold); // inside → close
    expect(mid[0]).toHaveLength(1);
    expect(mid[0][0].t).toBe('com');
    expect(mid[2].some((t) => t.t === 'kw')).toBe(true);
  });

  it('clamps out-of-range windows safely', () => {
    const c = createCache();
    syncLines(c, 'one\ntwo', fold);
    expect(tokensFor(c, -5, 99, fold)).toHaveLength(2);
    expect(tokensFor(c, 5, 9, fold)).toHaveLength(0);
  });
});
