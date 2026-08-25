// EDIT-018 (spec 011): incremental per-line block-comment state cache +
// windowed token extraction. Pure & DOM-free. Kept free of static imports
// from ./tokenizer so the lazy chunk boundary survives (view loads both via
// dynamic import together).
import type { Token } from './tokenizer';

/** Height of one editor line in px (14px font × 1.5 line-height). */
export const LINE_H = 21;

export interface LineStateCache {
  /** Snapshot of lines the states were computed for. */
  lines: string[];
  /** states[i] = inBlock AFTER processing line i (false when i<0 conceptually). */
  states: boolean[];
  /** First line index recomputed by the most recent sync (perf assertions). */
  lastRecomputeFrom: number;
}

export type LineFold = (line: string, inBlock: boolean) => { tokens: Token[]; inBlock: boolean };

export function createCache(): LineStateCache {
  return { lines: [], states: [], lastRecomputeFrom: Number.MAX_SAFE_INTEGER };
}

function recomputeFrom(cache: LineStateCache, from: number, fold: LineFold): void {
  cache.lastRecomputeFrom = from;
  let st = from > 0 ? cache.states[from - 1] : false;
  for (let i = from; i < cache.lines.length; i++) {
    const r = fold(cache.lines[i], st);
    st = r.inBlock;
    cache.states[i] = st;
  }
  cache.states.length = cache.lines.length;
}

/**
 * Diff `newText` against the cached snapshot on common line prefix/suffix,
 * splice, then recompute states only for the changed tail. Handles full
 * rebuilds transparently (empty cache / different document).
 */
export function syncLines(cache: LineStateCache, newText: string, fold: LineFold): void {
  const nextLines = newText.split('\n');
  const old = cache.lines;
  let p = 0;
  const minLen = Math.min(old.length, nextLines.length);
  while (p < minLen && old[p] === nextLines[p]) p++;
  let s = 0;
  while (
    s < minLen - p &&
    old[old.length - 1 - s] === nextLines[nextLines.length - 1 - s]
  )
    s++;
  const removed = old.length - p - s;
  const inserted = nextLines.slice(p, nextLines.length - s);
  cache.lines = nextLines;
  cache.states.splice(p, removed, ...new Array<boolean>(inserted.length).fill(false));
  recomputeFrom(cache, p, fold);
}

/**
 * Tokens for the half-open window [from, to) using the cached entry state —
 * O(window), never O(document). Result equals a fresh full stateful pass.
 */
export function tokensFor(
  cache: LineStateCache,
  from: number,
  to: number,
  fold: LineFold,
): Token[][] {
  const out: Token[][] = [];
  let st = from > 0 ? cache.states[from - 1] ?? false : false;
  for (let i = Math.max(0, from); i < Math.min(to, cache.lines.length); i++) {
    const r = fold(cache.lines[i], st);
    out.push(r.tokens);
    st = r.inBlock;
  }
  return out;
}
