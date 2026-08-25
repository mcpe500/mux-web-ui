// EDIT-013 (spec 011): bracket auto-close — pure, DOM-free, table-driven.
export interface InsertResult {
  text: string;
  caret: number;
}

const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
};
const CLOSERS = new Set([')', ']', '}', '"', "'", '`']);

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z0-9_$]/.test(c);
}

/**
 * Compute the text mutation for typing `ch` at an empty selection.
 * `before`/`after` are the text around the caret.
 * Returns null when the keystroke should be inserted natively.
 */
export function onSelfInsert(
  before: string,
  after: string,
  ch: string,
): InsertResult | null {
  const next = after[0];

  // Skip-over: typing a closer that is already next → move caret past it.
  if (CLOSERS.has(ch) && next === ch) {
    return { text: before + after, caret: before.length + 1 };
  }

  // Auto-close an opener (quotes only when not hugging a word char).
  const close = PAIRS[ch];
  if (close) {
    const isQuote = ch === '"' || ch === "'" || ch === '`';
    if (isQuote && (isWordChar(next) || isWordChar(before[before.length - 1]))) {
      return null;
    }
    return { text: `${before}${ch}${close}${after}`, caret: before.length + 1 };
  }

  return null;
}

/**
 * Wrap a non-empty selection with a bracket pair. The selection becomes the
 * inner content; caret lands right after the closing pair.
 */
export function wrapSelection(
  before: string,
  selected: string,
  after: string,
  ch: string,
): InsertResult | null {
  const close = PAIRS[ch];
  if (!close || selected.length === 0) return null;
  return {
    text: `${before}${ch}${selected}${close}${after}`,
    caret: before.length + 1 + selected.length + 1,
  };
}
