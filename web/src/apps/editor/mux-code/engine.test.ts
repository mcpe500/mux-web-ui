// EDIT-009/010/012 (spec 010): mux-code engine tests — pure logic, node env.
import { describe, it, expect } from 'vitest';
import { detectLang, tokenizeLine, tokenize } from './tokenizer';
import {
  createModel,
  getText,
  insert,
  deleteRange,
  findMatches,
  replaceAll,
  gotoLine,
  visibleRange,
} from './engine';

describe('EDIT-009 detectLang', () => {
  it('maps extensions', () => {
    expect(detectLang('a.ts')).toBe('ts');
    expect(detectLang('b.JSX')).toBe('js');
    expect(detectLang('c.rs')).toBe('rust');
    expect(detectLang('d.md')).toBe('md');
    expect(detectLang('e.sh')).toBe('sh');
    expect(detectLang('f.json')).toBe('json');
    expect(detectLang('g.py')).toBe('py');
    expect(detectLang('h.txt')).toBe('plain');
  });
});

describe('EDIT-009 tokenizer', () => {
  it('js: keyword, string, number, comment', () => {
    const toks = tokenizeLine('const x = "hi" + 42; // note', 'js');
    const kinds = toks.map((t) => t.t);
    expect(kinds).toContain('kw');
    expect(kinds).toContain('str');
    expect(kinds).toContain('num');
    expect(kinds).toContain('com');
    const com = toks.find((t) => t.t === 'com')!;
    expect(com.s).toBe('const x = "hi" + 42; '.length);
    const kw = toks.find((t) => t.t === 'kw')!;
    expect(kw.s).toBe(0);
  });

  it('py: # comment and string', () => {
    const toks = tokenizeLine("s = 'hi'  # note", 'py');
    expect(toks.some((t) => t.t === 'str')).toBe(true);
    const com = toks.find((t) => t.t === 'com')!;
    expect(com.s).toBe("s = 'hi'  ".length);
  });

  it('rust: fn call and keyword', () => {
    const toks = tokenizeLine('fn main() { let x = 1; }', 'rust');
    expect(toks.filter((t) => t.t === 'kw').length).toBeGreaterThanOrEqual(2);
    expect(toks.some((t) => t.t === 'fn' && t.s === 3)).toBe(true);
  });

  it('plain: no tokens', () => {
    expect(tokenizeLine('anything here', 'plain')).toEqual([]);
  });

  it('tokenize splits lines', () => {
    const all = tokenize('let a = 1;\nlet b = 2;\n', 'js');
    expect(all.length).toBe(3);
    expect(all[0].length).toBeGreaterThan(0);
    expect(all[2].length).toBe(0);
  });
});

describe('EDIT model', () => {
  it('insert single-line', () => {
    const m = insert(createModel('hello'), 0, 5, ' world');
    expect(getText(m)).toBe('hello world');
  });

  it('insert multi-line splits', () => {
    const m = insert(createModel('ab'), 0, 1, 'X\nY');
    expect(getText(m)).toBe('aX\nYb');
  });

  it('delete within line and across lines', () => {
    let m = createModel('hello world');
    m = deleteRange(m, { line: 0, col: 5 }, { line: 0, col: 11 });
    expect(getText(m)).toBe('hello');
    m = insert(createModel('a\nb\nc'), 0, 1, 'X');
    m = deleteRange(m, { line: 0, col: 1 }, { line: 1, col: 1 });
    expect(getText(m)).toBe('a\nc'); // removes 'X\nb'
  });
});

describe('EDIT-012 search & replace & goto', () => {
  const m = createModel('foo bar\nFOO baz\nfoofoo');

  it('findMatches case toggle', () => {
    // 'foo bar' (1) + 'foofoo' (2) = 3 case-sensitive; + 'FOO' = 4 insensitive
    expect(findMatches(m, 'foo', true)).toHaveLength(3);
    expect(findMatches(m, 'foo', false)).toHaveLength(4);
  });

  it('replaceAll counts', () => {
    const { model, count } = replaceAll(m, 'foo', 'qux', true);
    expect(count).toBe(3);
    expect(getText(model).startsWith('qux bar')).toBe(true);
    expect(getText(model)).toContain('quxqux');
  });

  it('gotoLine clamps', () => {
    expect(gotoLine(m, 99)).toBe(2);
    expect(gotoLine(m, -5)).toBe(0);
  });
});

describe('EDIT-010 viewport', () => {
  it('visible range with overscan clamps to total', () => {
    const r = visibleRange(1000, 5000, 300, 20, 10);
    expect(r.start).toBe(240);
    expect(r.end).toBe(275);
  });
  it('empty file', () => {
    expect(visibleRange(0, 0, 300, 20)).toEqual({ start: 0, end: 0 });
  });
});
