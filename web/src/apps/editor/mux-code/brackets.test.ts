// EDIT-013 (spec 011): bracket auto-close — pure logic table tests.
import { describe, it, expect } from 'vitest';
import { onSelfInsert, wrapSelection } from './brackets';

describe('EDIT-013 onSelfInsert openers', () => {
  const cases: Array<[string, string]> = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
  ];

  it.each(cases)('%s → inserts pair, caret inside', (open, close) => {
    const r = onSelfInsert('fn ', ' x', open)!;
    expect(r).not.toBeNull();
    expect(r.text).toBe(`fn ${open}${close} x`);
    expect(r.caret).toBe(4);
  });

  it('quotes hugging a word char type normally (no auto-close)', () => {
    expect(onSelfInsert('abc', 'def', '"')).toBeNull(); // hug-right
    expect(onSelfInsert('abc', '', "'")).toBeNull(); // hug-left (apostrophe/lifetime)
    expect(onSelfInsert('x=', 'name', '{')).not.toBeNull(); // braces always pair
  });
});

describe('EDIT-013 skip-over', () => {
  it.each([')', ']', '}', '"', "'", '`'])('typing %s when next is identical skips over', (c) => {
    const r = onSelfInsert('foo', `${c}bar`, c)!;
    expect(r.text).toBe(`foo${c}bar`);
    expect(r.caret).toBe(4);
  });

  it('closer with different next char inserts natively', () => {
    expect(onSelfInsert('foo', 'bar', ')')).toBeNull();
  });

  it('closer at end of line inserts natively', () => {
    expect(onSelfInsert('foo(', '', ')')).toBeNull();
  });
});

describe('EDIT-013 wrapSelection', () => {
  it('wraps selection with the pair; caret after closer', () => {
    const r = wrapSelection('a ', 'sel', ' b', '(')!;
    expect(r.text).toBe('a (sel) b');
    expect(r.caret).toBe(7);
  });

  it('works for quotes too', () => {
    const r = wrapSelection('', 'text', '', '"')!;
    expect(r.text).toBe('"text"');
    expect(r.caret).toBe(6);
  });

  it('empty selection and non-bracket chars return null', () => {
    expect(wrapSelection('a', '', 'b', '(')).toBeNull();
    expect(wrapSelection('a', 's', 'b', 'x')).toBeNull();
  });
});
