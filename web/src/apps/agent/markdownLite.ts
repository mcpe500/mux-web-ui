// Spec 016 (v0.6.7) CDX-010 — tiny escape-first markdown → HTML renderer.
// Zero dependencies (ringan, D3): every character is HTML-escaped BEFORE any
// markdown transform runs, so injected markup can never leave the text layer.
// Supported: fenced code blocks, headings (#..###), bullet/numbered lists,
// inline `code`, **bold**, *italic*, [text](http/https URL only).

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Inline transforms on ALREADY-ESCAPED text. */
function renderInline(escaped: string): string {
  let out = escaped;
  // inline code first — its content must not be further transformed
  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  // links: [text](http…/https…) only — escaped quotes can't appear in URLs
  out = out.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text: string, href: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  );
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return out;
}

/**
 * CDX-010: renders a markdown subset to an HTML string that is safe to inject
 * (dangerouslySetInnerHTML) BECAUSE every text token is escaped up-front.
 * Unknown constructs stay plain text — tolerant by design, mirror of the
 * codexEvents mapper philosophy.
 */
export function renderMarkdownLite(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let inFence = false;
  let fenceLang = '';
  let fenceBuf: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType !== null) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const fence = raw.match(/^\s*```(.*)$/);
    if (fence) {
      if (inFence) {
        html.push(`<pre><code>${escapeHtml(fenceBuf.join('\n'))}</code></pre>`);
        fenceBuf = [];
        inFence = false;
        fenceLang = '';
      } else {
        closeList();
        inFence = true;
        fenceLang = fence[1]!.trim();
      }
      continue;
    }
    if (inFence) {
      fenceBuf.push(raw);
      continue;
    }
    const line = escapeHtml(raw);
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1]!.length;
      html.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${renderInline(bullet[1]!)}</li>`);
      continue;
    }
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${renderInline(ordered[1]!)}</li>`);
      continue;
    }
    if (line.trim() === '') {
      closeList();
      continue;
    }
    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }
  if (inFence) {
    // unterminated fence — flush as code (tolerant)
    html.push(`<pre><code>${escapeHtml(fenceBuf.join('\n'))}</code></pre>`);
  }
  closeList();
  void fenceLang; // reserved for future syntax highlighting
  return html.join('\n');
}
