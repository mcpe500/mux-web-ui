// D7 (spec 014): in-house markdown subset tokenizer <8 KiB — XSS-safe by
// CONTRACT: tokens are typed data, never markup. The `<` character survives
// inside `text` fields INTENTIONALLY as literal text; renderToNodes emits
// flat descriptors {tag,text} that consumers MUST map onto preact
// children-as-text (never innerHTML / dangerouslySetInnerHTML). Link hrefs
// with any scheme other than http(s)/#/relative are coerced to '#'. Image
// srcs (amend 2026-08-28): http(s)/data:image/*/relative pass; any other
// scheme keeps the whole `![alt](src)` as literal text.
export type Token =
  | { type: 'heading'; level: number; text: string }
  | { type: 'text'; text: string }
  | { type: 'list_item'; ordered: boolean; level: number; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'fence'; lang: string; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'inline_code'; text: string }
  | { type: 'image'; alt: string; src: string }
  | { type: 'link'; text: string; href: string };

export function sanitizeHref(href: string): string {
  const h = href.trim();
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(h);
  if (scheme) {
    const s = scheme[0].slice(0, -1).toLowerCase();
    if (s === 'http' || s === 'https') return h;
    return '#';
  }
  // no scheme: anchor / relative / absolute-path are fine
  return h;
}

/** null = disallowed scheme → caller keeps `![alt](src)` as literal text. */
export function sanitizeImgSrc(src: string): string | null {
  const h = src.trim();
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(h);
  if (scheme) {
    const s = scheme[0].slice(0, -1).toLowerCase();
    if (s === 'http' || s === 'https') return h;
    if (s === 'data' && /^data:image\//i.test(h)) return h;
    return null;
  }
  // no scheme: relative / absolute-path are fine
  return h;
}

type InlineFn = (t: Token[]) => Token[];

const runInline = (src: string, chain: InlineFn[]): Token[] =>
  chain.reduce((acc, f) => f(acc), [{ type: 'text', text: src } as Token]);

const RULES: { re: RegExp; build: (m: RegExpExecArray) => Token }[] = [
  { re: /\*\*([^*]+)\*\*/, build: (m) => ({ type: 'bold', text: m[1] }) },
  { re: /\*([^*]+)\*/, build: (m) => ({ type: 'italic', text: m[1] }) },
  { re: /`([^`]+)`/, build: (m) => ({ type: 'inline_code', text: m[1] }) },
  {
    // negative lookbehind: `[x](y)` preceded by `!` belongs to the image rule,
    // which runs LAST so its literal-text fallback is never re-consumed
    re: /(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/,
    build: (m) => ({ type: 'link', text: m[1], href: sanitizeHref(m[2]) }),
  },
  {
    re: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
    build: (m) => {
      const src = sanitizeImgSrc(m[2]);
      return src === null ? { type: 'text', text: m[0] } : { type: 'image', alt: m[1], src };
    },
  },
];

const makeSplitter = (ruleIdx: number): InlineFn => (tokens) => {
  const out: Token[] = [];
  for (const tok of tokens) {
    if (tok.type !== 'text') {
      out.push(tok);
      continue;
    }
    let rest = tok.text;
    const rule = RULES[ruleIdx];
    for (;;) {
      const m = rule.re.exec(rest);
      if (!m || m.index === undefined) break;
      if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) });
      out.push(rule.build(m));
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) out.push({ type: 'text', text: rest });
  }
  return out;
};

const inlineChain: InlineFn[] = [
  makeSplitter(0),
  makeSplitter(1),
  makeSplitter(2),
  makeSplitter(3),
  makeSplitter(4),
];

export function tokenizeMarkdown(src: string): Token[] {
  const lines = src.split('\n');
  const tokens: Token[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      tokens.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence (or past EOF)
      tokens.push({ type: 'fence', lang, text: body.join('\n') });
      continue;
    }
    const list = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (list) {
      tokens.push({
        type: 'list_item',
        ordered: /\d+\./.test(list[2]),
        level: Math.min(1, Math.floor(list[1].length / 2)),
        text: list[3],
      });
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      tokens.push({ type: 'blockquote', text: line.replace(/^>\s?/, '') });
      i++;
      continue;
    }
    const text = line.trim();
    if (text) tokens.push(...runInline(text, inlineChain));
    i++;
  }
  return tokens;
}

// Renderer descriptors — flat, no HTML strings anywhere downstream.
export interface RenderNode {
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'li' | 'pre' | 'blockquote' | 'span' | 'a' | 'code' | 'em' | 'strong' | 'img';
  text: string;
  href?: string;
  src?: string;
  lang?: string;
}

export function renderToNodes(tokens: Token[]): RenderNode[] {
  return tokens.map((t): RenderNode => {
    switch (t.type) {
      case 'heading':
        return { tag: `h${t.level}` as RenderNode['tag'], text: t.text };
      case 'text':
        return { tag: 'span', text: t.text };
      case 'list_item':
        return { tag: 'li', text: t.text };
      case 'blockquote':
        return { tag: 'blockquote', text: t.text };
      case 'fence':
        return { tag: 'pre', text: t.text, lang: t.lang };
      case 'bold':
        return { tag: 'strong', text: t.text };
      case 'italic':
        return { tag: 'em', text: t.text };
      case 'inline_code':
        return { tag: 'code', text: t.text };
      case 'image':
        return { tag: 'img', text: t.alt, src: t.src };
      case 'link':
        return { tag: 'a', text: t.text, href: t.href };
    }
  });
}
