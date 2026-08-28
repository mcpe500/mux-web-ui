import { describe, expect, it } from 'vitest';
import { renderToNodes, sanitizeHref, tokenizeMarkdown } from './mdMini';

// ── D7 (spec 014) mdMini subset tokenizer ──

describe('mdMini tokenizeMarkdown', () => {
  it('heading level #..###### → token heading', () => {
    const t = tokenizeMarkdown('# Satu\n\n#### Empat');
    expect(t).toEqual([
      { type: 'heading', level: 1, text: 'Satu' },
      { type: 'heading', level: 4, text: 'Empat' },
    ]);
  });

  it('paragraph biasa → token text; kosong dilewati', () => {
    const t = tokenizeMarkdown('halo dunia\n\n\nlagi\n');
    expect(t).toEqual([
      { type: 'text', text: 'halo dunia' },
      { type: 'text', text: 'lagi' },
    ]);
  });

  it('ul/ol list (nested 1 level) → list_item dengan ordered+level', () => {
    const t = tokenizeMarkdown('- a\n- b\n  - b.1\n1. satu\n2. dua');
    expect(t).toEqual([
      { type: 'list_item', ordered: false, level: 0, text: 'a' },
      { type: 'list_item', ordered: false, level: 0, text: 'b' },
      { type: 'list_item', ordered: false, level: 1, text: 'b.1' },
      { type: 'list_item', ordered: true, level: 0, text: 'satu' },
      { type: 'list_item', ordered: true, level: 0, text: 'dua' },
    ]);
  });

  it('fence ```lang menangkap body multi-line sampai closing fence', () => {
    const t = tokenizeMarkdown('```python\nprint(1)\nprint(2)\n```\nsetelah');
    expect(t).toEqual([
      { type: 'fence', lang: 'python', text: 'print(1)\nprint(2)' },
      { type: 'text', text: 'setelah' },
    ]);
  });

  it('fence tanpa closing sampai EOF → tetap token fence', () => {
    const t = tokenizeMarkdown('```\nabc');
    expect(t).toEqual([{ type: 'fence', lang: '', text: 'abc' }]);
  });

  it('blockquote > → token blockquote', () => {
    const t = tokenizeMarkdown('> kutip\n> lanjut');
    expect(t).toEqual([
      { type: 'blockquote', text: 'kutip' },
      { type: 'blockquote', text: 'lanjut' },
    ]);
  });

  it('inline bold/italic/code/link dipecah berurutan', () => {
    const t = tokenizeMarkdown('**tebal** dan *miring* dan `kode` dan [teks](https://a.b)');
    expect(t).toEqual([
      { type: 'bold', text: 'tebal' },
      { type: 'text', text: ' dan ' },
      { type: 'italic', text: 'miring' },
      { type: 'text', text: ' dan ' },
      { type: 'inline_code', text: 'kode' },
      { type: 'text', text: ' dan ' },
      { type: 'link', text: 'teks', href: 'https://a.b' },
    ]);
  });
});

// ── SEC: XSS-safe contract (text-only, href coercion) ──

describe('mdMini security', () => {
  it('<script>alert(1)</script> muncul sebagai TEXT literal, bukan markup', () => {
    const t = tokenizeMarkdown('<script>alert(1)</script>');
    const joined = t.map((x) => ('text' in x ? x.text : '')).join('');
    expect(joined).toContain('<script>alert(1)</script>');
    for (const tok of t) {
      expect(tok.type === 'html' as never).toBeFalsy();
      expect((tok as { tag?: string }).tag).toBeUndefined();
    }
  });

  it('<img onerror=...> dirender sebagai teks murni', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const t = tokenizeMarkdown(payload);
    const joined = t.map((x) => ('text' in x ? x.text : '')).join('');
    expect(joined).toContain(payload);
  });

  it('href javascript:/data: dipaksa ke # ; http(s)/#/relative lolos', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBe('#');
    expect(sanitizeHref('JAVASCRIPT:x')).toBe('#');
    expect(sanitizeHref('data:text/html,<b>x</b>')).toBe('#');
    expect(sanitizeHref('vbscript:x')).toBe('#');
    expect(sanitizeHref('https://ok.id/a')).toBe('https://ok.id/a');
    expect(sanitizeHref('http://ok.id/a')).toBe('http://ok.id/a');
    expect(sanitizeHref('#anchor')).toBe('#anchor');
    expect(sanitizeHref('rel/path')).toBe('rel/path');
    expect(sanitizeHref('/abs/path')).toBe('/abs/path');
  });

  it('link token dgn scheme berbahaya → href "#" di tokenizer', () => {
    const t = tokenizeMarkdown('[klik](javascript:alert(1))');
    expect(t[0]).toEqual({ type: 'link', text: 'klik', href: '#' });
  });

  it('image ![alt](src) relatif/http/data:image → token image; scheme lain → literal text', () => {
    expect(tokenizeMarkdown('![alt text](image.png)')).toEqual([
      { type: 'image', alt: 'alt text', src: 'image.png' },
    ]);
    expect(tokenizeMarkdown('![](https://a/b.png)')).toEqual([
      { type: 'image', alt: '', src: 'https://a/b.png' },
    ]);
    expect(tokenizeMarkdown('![](data:image/png;base64,AAAA)')).toEqual([
      { type: 'image', alt: '', src: 'data:image/png;base64,AAAA' },
    ]);
    // disallowed → tetap teks literal (bukan token image); `)` URL nyambung
    // kembali saat join (greedy `[^)\s]+` boleh memisah token text)
    const evil = tokenizeMarkdown('![x](javascript:alert(1))');
    expect(evil.some((t) => t.type === 'image')).toBe(false);
    expect(evil.every((t) => t.type === 'text')).toBe(true);
    expect(evil.map((t) => (t as { text: string }).text).join('')).toBe('![x](javascript:alert(1))');
    expect(tokenizeMarkdown('![](data:text/html,x)')).toEqual([
      { type: 'text', text: '![](data:text/html,x)' },
    ]);
  });

  it('image berdampingan dgn inline lain dipecah benar', () => {
    const t = tokenizeMarkdown('lihat ![foto](a.png) dan **tebal**');
    expect(t).toEqual([
      { type: 'text', text: 'lihat ' },
      { type: 'image', alt: 'foto', src: 'a.png' },
      { type: 'text', text: ' dan ' },
      { type: 'bold', text: 'tebal' },
    ]);
  });
});

// ── renderToNodes: descriptor tanpa string HTML ──

describe('mdMini renderToNodes', () => {
  it('token → descriptor {tag,text} flat utk renderer preact', () => {
    const nodes = renderToNodes(tokenizeMarkdown('# Judul\n\n- item\n\n```py\nx=1\n```'));
    expect(nodes.map((n) => n.tag)).toEqual(['h1', 'li', 'pre']);
    expect(nodes[0].text).toBe('Judul');
    expect(nodes[2].lang).toBe('py');
  });

  it('KONTRAK: tidak ada node yang membawa markup siap-render (innerHTML-proof)', () => {
    const payload = '<script>alert(1)</script> [x](javascript:y) <b>z</b>';
    const nodes = renderToNodes(tokenizeMarkdown(payload));
    for (const n of nodes) {
      // descriptor hanya tag aman + teks mentah; renderer wajib children-text
      expect(n.tag).toMatch(/^(h[1-6]|p|li|pre|blockquote|span|a|code|em|strong|img)$/);
      expect((n as unknown as { html?: unknown }).html).toBeUndefined();
    }
  });

  it('image token → node {tag:img, src, text:alt} tanpa markup', () => {
    const nodes = renderToNodes(tokenizeMarkdown('![foto](https://a/b.png)'));
    expect(nodes[0]).toEqual({ tag: 'img', text: 'foto', src: 'https://a/b.png' });
  });
});
