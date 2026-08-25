// EDIT-009 (spec 010): table-driven tokenizer for mux-code engine.
// Pure functions — no DOM. Target: tiny footprint, per-line stateless pass.

export type TokenType = 'kw' | 'str' | 'com' | 'num' | 'fn' | 'txt';
export interface Token {
  t: TokenType;
  s: number; // start col (inclusive)
  e: number; // end col (exclusive)
}

export type Lang = 'js' | 'ts' | 'py' | 'rust' | 'json' | 'md' | 'sh' | 'plain';

export function detectLang(fileName: string): Lang {
  const f = fileName.toLowerCase();
  if (/\.(js|mjs|cjs|jsx)$/.test(f)) return 'js';
  if (/\.(ts|tsx)$/.test(f)) return 'ts';
  if (/\.(py|pyw)$/.test(f)) return 'py';
  if (/\.(rs)$/.test(f)) return 'rust';
  if (/\.(json)$/.test(f)) return 'json';
  if (/\.(md|markdown)$/.test(f)) return 'md';
  if (/\.(sh|bash|zsh)$/.test(f)) return 'sh';
  return 'plain';
}

interface LangRules {
  keywords: Set<string>;
  lineComment: string | null;
  blockComment: [string, string] | null;
  strings: string[]; // quote chars
}

const KW = (words: string) => new Set(words.split(' '));

const RULES: Record<Exclude<Lang, 'plain'>, LangRules> = {
  js: {
    keywords: KW('const let var function return if else for while class new import export from async await try catch throw typeof instanceof null undefined true false this extends static get set of in do switch case break continue default delete yield'),
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"', "'", '`'],
  },
  ts: {
    keywords: KW('const let var function return if else for while class new import export from async await try catch throw typeof instanceof null undefined true false this extends static get set of in do switch case break continue default delete yield interface type enum implements private public protected readonly namespace declare as satisfies'),
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"', "'", '`'],
  },
  py: {
    keywords: KW('def class return if elif else for while import from as pass break continue with try except finally raise lambda None True False and or not in is global nonlocal yield async await assert del'),
    lineComment: '#',
    blockComment: null,
    strings: ['"', "'"],
  },
  rust: {
    keywords: KW('fn let mut const struct enum impl trait pub use mod match if else for while loop return break continue as dyn ref move where unsafe async await self Self crate super type static true false Some None Ok Err'),
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"'],
  },
  json: {
    keywords: KW('true false null'),
    lineComment: null,
    blockComment: null,
    strings: ['"'],
  },
  md: {
    keywords: KW('# ## ### #### ##### ###### - * > `'),
    lineComment: null,
    blockComment: null,
    strings: ['`'],
  },
  sh: {
    keywords: KW('if then else elif fi for while do done case esac function return exit local export echo cd ls read set shift source trap unset'),
    lineComment: '#',
    blockComment: null,
    strings: ['"', "'"],
  },
};

/** Tokenize one line. Stateless per line (block comments handled per line). */
export function tokenizeLine(line: string, lang: Lang): Token[] {
  return tokenizeLineStateful(line, lang, false).tokens;
}

/**
 * EDIT-017 (spec 011): stateful pass — carries block-comment state across
 * lines. `inBlock` = the previous line ended inside an open block comment.
 * Wrapper `tokenizeLine` keeps the legacy stateless signature for compat.
 */
export function tokenizeLineStateful(
  line: string,
  lang: Lang,
  inBlock: boolean,
): { tokens: Token[]; inBlock: boolean } {
  if (lang === 'plain') return { tokens: [], inBlock: false };
  const rules = RULES[lang];
  const tokens: Token[] = [];
  const push = (t: TokenType, s: number, e: number) => {
    if (e > s) tokens.push({ t, s, e });
  };

  let i = 0;
  const n = line.length;

  // Continuing a block comment opened on an earlier line.
  if (inBlock && rules.blockComment) {
    const end = line.indexOf(rules.blockComment[1]);
    if (end === -1) {
      push('com', 0, n);
      return { tokens, inBlock: true };
    }
    push('com', 0, end + rules.blockComment[1].length);
    i = end + rules.blockComment[1].length;
  }

  while (i < n) {
    // whitespace
    if (line[i] === ' ' || line[i] === '\t') {
      i++;
      continue;
    }
    // line comment
    if (rules.lineComment && line.startsWith(rules.lineComment, i)) {
      push('com', i, n);
      return { tokens, inBlock: false };
    }
    // block comment start → rest of line (per-line pass)
    if (rules.blockComment && line.startsWith(rules.blockComment[0], i)) {
      const end = line.indexOf(rules.blockComment[1], i + rules.blockComment[0].length);
      if (end === -1) {
        push('com', i, n);
        return { tokens, inBlock: true };
      }
      push('com', i, end + rules.blockComment[1].length);
      i = end + rules.blockComment[1].length;
      continue;
    }
    // string
    const q = rules.strings.find((c) => line[i] === c);
    if (q) {
      let j = i + 1;
      while (j < n) {
        if (line[j] === '\\') {
          j += 2;
          continue;
        }
        if (line[j] === q) {
          j++;
          break;
        }
        j++;
      }
      push('str', i, Math.min(j, n));
      i = Math.min(j, n);
      continue;
    }
    // number
    if (/[0-9]/.test(line[i]) ) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXoO_.]/.test(line[j])) j++;
      push('num', i, j);
      i = j;
      continue;
    }
    // word
    if (/[A-Za-z_$#]/.test(line[i])) {
      let j = i;
      // inner class MUST mirror the gate above incl. '#' — otherwise a word
      // starting with '#' never advances i and loops forever (latent v0.6.1
      // bug exposed by EDIT-017 tests)
      while (j < n && /[A-Za-z0-9_$#]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (rules.keywords.has(word)) push('kw', i, j);
      else if (lang !== 'md' && line[j] === '(') push('fn', i, j);
      else if (lang === 'md') push('kw', i, j);
      else push('txt', i, j);
      i = j;
      continue;
    }
    // any other char
    i++;
  }
  return { tokens, inBlock: false };
}

/** Tokenize full text into per-line token arrays (stateless legacy API). */
export function tokenize(text: string, lang: Lang): Token[][] {
  return text.split('\n').map((l) => tokenizeLine(l, lang));
}

/** EDIT-017: stateful fold over all lines — correct block comments across lines. */
export function tokenizeTextStateful(text: string, lang: Lang): Token[][] {
  const out: Token[][] = [];
  let inBlock = false;
  for (const line of text.split('\n')) {
    const r = tokenizeLineStateful(line, lang, inBlock);
    out.push(r.tokens);
    inBlock = r.inBlock;
  }
  return out;
}
