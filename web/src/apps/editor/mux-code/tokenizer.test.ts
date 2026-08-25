// EDIT-017 (spec 011): stateful tokenizer — block comments across lines.
import { describe, it, expect } from 'vitest';
import { tokenizeLine, tokenizeLineStateful, tokenizeTextStateful } from './tokenizer';

const kindsOf = (toks: { t: string }[]) => toks.map((t) => t.t);

describe('EDIT-017 tokenizeLineStateful js', () => {
  it('block spanning 3 lines: middle lines are fully comment', () => {
    const l1 = tokenizeLineStateful('const a = /* start', 'js', false);
    expect(kindsOf(l1.tokens)).toContain('com');
    expect(l1.inBlock).toBe(true);

    const l2 = tokenizeLineStateful('still commented // not a terminator', 'js', true);
    expect(l2.tokens).toEqual([{ t: 'com', s: 0, e: l2.tokens[0].e }]);
    expect(l2.tokens[0].s).toBe(0);
    expect(l2.inBlock).toBe(true);

    const l3 = tokenizeLineStateful('end */ const b = 1;', 'js', true);
    const com = l3.tokens.find((t) => t.t === 'com')!;
    expect(com.s).toBe(0);
    expect(com.e).toBe('end */'.length);
    expect(kindsOf(l3.tokens)).toContain('kw');
    expect(l3.inBlock).toBe(false);
  });

  it('unterminated block → every remaining line is comment', () => {
    let st = tokenizeLineStateful('/* never closed', 'js', false);
    expect(st.inBlock).toBe(true);
    for (let i = 0; i < 5; i++) {
      st = tokenizeLineStateful('x + y', 'js', st.inBlock);
      expect(st.tokens).toHaveLength(1);
      expect(st.tokens[0].t).toBe('com');
      expect(st.inBlock).toBe(true);
    }
  });

  it('line comment marker inside block does not terminate the block', () => {
    // no closer on this line: the // is INSIDE the comment — line stays com
    const r = tokenizeLineStateful('// still inside nope', 'js', true);
    expect(r.tokens).toHaveLength(1);
    expect(r.tokens[0].t).toBe('com');
    expect(r.inBlock).toBe(true);
  });

  it('closer mid-line ends the block; the rest is code even after //', () => {
    const r = tokenizeLineStateful('// tail */ code', 'js', true);
    expect(r.tokens[0]).toMatchObject({ t: 'com', s: 0, e: 10 });
    expect(r.inBlock).toBe(false);
  });

  it('string containing opener does not open a block', () => {
    const r = tokenizeLineStateful('const s = "/* not a comment";', 'js', false);
    expect(r.inBlock).toBe(false);
    expect(r.tokens.some((t) => t.t === 'str')).toBe(true);
    expect(r.tokens.every((t) => t.t !== 'com')).toBe(true);
  });
});

describe('EDIT-017 rust / langs without block comments', () => {
  it('rust multi-line doc block folds correctly', () => {
    let st = tokenizeLineStateful('fn f() { /* a', 'rust', false);
    expect(st.inBlock).toBe(true);
    st = tokenizeLineStateful('   b c', 'rust', st.inBlock);
    expect(st.tokens.map((t) => t.t)).toEqual(['com']);
    st = tokenizeLineStateful('*/ }', 'rust', st.inBlock);
    expect(st.inBlock).toBe(false);
  });

  it('py/sh/json/md never enter block state', () => {
    for (const lang of ['py', 'sh', 'json', 'md'] as const) {
      const r = tokenizeLineStateful('# anything /* here', lang, false);
      expect(r.inBlock).toBe(false);
    }
  });
});

describe('EDIT-017 backward compat', () => {
  it('legacy tokenizeLine stays stateless and unchanged (70 existing tests)', () => {
    const toks = tokenizeLine('const x = 1; // note', 'js');
    expect(toks.some((t) => t.t === 'kw' && t.s === 0)).toBe(true);
    expect(tokenizeLine('anything here', 'plain')).toEqual([]);
  });

  it('tokenizeTextStateful matches per-line fold', () => {
    const text = 'a /* b\nc d\n*/ e';
    const folded = tokenizeTextStateful(text, 'js');
    expect(folded[1]).toHaveLength(1);
    expect(folded[1][0].t).toBe('com');
    expect(folded[2][0].t).toBe('com');
    expect(folded[2].some((t) => t.t === 'txt')).toBe(true);
  });
});
