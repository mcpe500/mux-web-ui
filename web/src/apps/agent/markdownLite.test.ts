// Spec 016 (v0.6.7) CDX-010 tests — markdownLite: XSS safety + constructions.
import { describe, it, expect } from 'vitest';
import { renderMarkdownLite } from './markdownLite';

describe('CDX-010 XSS safety (T2)', () => {
  it('never lets raw HTML through', () => {
    const out = renderMarkdownLite('hello <script>alert(1)</script> world');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('neutralizes event handlers and javascript: URLs', () => {
    const out = renderMarkdownLite(
      '![x](javascript:alert(1)) and <img src=x onerror=alert(2)> and [klik](javascript:pay)',
    );
    // injected markup never becomes an element — it stays escaped TEXT
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<a href="javascript');
    expect(out).toContain('&lt;img src=x onerror=alert(2)&gt;');
  });

  it('allows only http/https links', () => {
    const out = renderMarkdownLite('[docs](https://example.com/a) dan [bad](ftp://x)');
    expect(out).toContain('<a href="https://example.com/a"');
    expect(out).not.toContain('<a href="ftp');
  });
});

describe('CDX-010 constructions', () => {
  it('headings h1-h3', () => {
    expect(renderMarkdownLite('# A')).toContain('<h1>A</h1>');
    expect(renderMarkdownLite('## B')).toContain('<h2>B</h2>');
    expect(renderMarkdownLite('### C')).toContain('<h3>C</h3>');
    expect(renderMarkdownLite('#### D')).not.toContain('<h4>');
  });

  it('bold, italic, inline code', () => {
    const out = renderMarkdownLite('ini **tebal** dan *miring* plus `kode()`');
    expect(out).toContain('<strong>tebal</strong>');
    expect(out).toContain('<em>miring</em>');
    expect(out).toContain('<code>kode()</code>');
  });

  it('fenced code block escapes content and survives other transforms', () => {
    const out = renderMarkdownLite('```\n<b>&amp;</b>\n**not bold**\n```');
    expect(out).toContain('<pre><code>');
    expect(out).toContain('&lt;b&gt;');
    expect(out).toContain('**not bold**');
    expect(out).not.toContain('<b>');
  });

  it('bullet and ordered lists group correctly', () => {
    const out = renderMarkdownLite('- satu\n- dua\n\n1. satu\n2. dua');
    expect(out).toContain('<ul>\n<li>satu</li>\n<li>dua</li>\n</ul>');
    expect(out).toContain('<ol>\n<li>satu</li>\n<li>dua</li>\n</ol>');
  });

  it('paragraphs wrap plain lines', () => {
    expect(renderMarkdownLite('baris satu\nbaris dua')).toBe(
      '<p>baris satu</p>\n<p>baris dua</p>',
    );
  });

  it('tolerates unterminated fence', () => {
    const out = renderMarkdownLite('```\nstart tanpa akhir');
    expect(out).toContain('<pre><code>start tanpa akhir</code></pre>');
  });
});
