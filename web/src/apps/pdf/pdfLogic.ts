// PDF-002/004/007 pure logic + streaming cap guard (spec 014 §5).

export const DOC_MAX_BYTES = 25 * 1024 * 1024; // MUX_WEB_DOC_MAX_BYTES default
export const DOC_WARN_BYTES = 10 * 1024 * 1024;

export class DocTooLargeError extends Error {
  code = 'DOC_TOO_LARGE';
}

export function readDocMaxBytes(store?: Pick<Storage, 'getItem'>): number {
  const raw =
    store?.getItem('mux_doc_max_bytes') ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem('mux_doc_max_bytes') : null);
  const n = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DOC_MAX_BYTES;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<Response>;

export interface FetchCapOpts {
  maxBytes?: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

export async function fetchPdfWithCap(url: string, opts: FetchCapOpts = {}): Promise<Uint8Array> {
  const maxBytes = opts.maxBytes ?? readDocMaxBytes();
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const doFetch: FetchLike = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const controller = new AbortController();
  let externallyAborted = false;
  const onExternalAbort = () => {
    externallyAborted = true;
    controller.abort();
  };
  opts.signal?.addEventListener('abort', onExternalAbort);
  try {
    const resp = await doFetch(url, { signal: controller.signal });

    const lenHeader = resp.headers?.get?.('content-length');
    if (lenHeader !== null && lenHeader !== undefined && !Number.isNaN(Number(lenHeader))) {
      if (Number(lenHeader) > maxBytes) throw new DocTooLargeError(`Dokumen lebih besar dari ${maxBytes} byte.`);
    }

    const reader = resp.body?.getReader?.();
    if (!reader) return new Uint8Array(0);

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await Promise.resolve(reader.cancel());
        } catch {
          /* ignore cancel failure */
        }
        onExternalAbort();
        throw new DocTooLargeError(`Dokumen melebihi batas ${maxBytes} byte.`);
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out;
  } catch (e) {
    if (externallyAborted && !(e instanceof DocTooLargeError)) {
      throw e;
    }
    throw e;
  } finally {
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}

export type PdfRoute = 'pdf-viewer' | 'editor' | null;

export function pdfRouteDecision(
  input: { fileName?: string; mime?: string },
  editorExts: string[] = []
): PdfRoute {
  const mimeOk = (input.mime ?? '').toLowerCase() === 'application/pdf';
  const name = input.fileName ?? '';
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  if (ext === '.pdf' || mimeOk) return 'pdf-viewer';
  if (editorExts.some((e) => e.toLowerCase() === ext)) return 'editor';
  return null;
}

export interface OutlineEntry {
  title: string;
  depth: number;
  dest: unknown;
}

export function outlineFlatten(
  outline: Array<{ title?: string | null; dest?: unknown; items?: unknown[] }> | null | undefined
): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const walk = (items: unknown[] | undefined, depth: number) => {
    for (const it of items ?? []) {
      const item = it as { title?: string | null; dest?: unknown; items?: unknown[] };
      out.push({ title: item.title?.trim() || '(Tanpa judul)', depth, dest: item.dest });
      walk(item.items, depth + 1);
    }
  };
  walk(Array.isArray(outline) ? (outline as unknown[]) : [], 0);
  return out;
}

export interface PageMeta {
  page: number;
  text: string;
}

export interface SearchHit {
  page: number;
  start: number;
  len: number;
}

export interface SearchPlan {
  hits: SearchHit[];
  perPage: Record<number, number>;
  total: number;
}

export function searchPlan(query: string, pagesMeta: PageMeta[]): SearchPlan {
  const q = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  const perPage: Record<number, number> = {};
  if (!q) return { hits, perPage, total: 0 };
  for (const meta of [...pagesMeta].sort((a, b) => a.page - b.page)) {
    const text = (meta.text ?? '').toLowerCase();
    let from = 0;
    while (q.length > 0) {
      const idx = text.indexOf(q, from);
      if (idx < 0) break;
      hits.push({ page: meta.page, start: idx, len: q.length });
      perPage[meta.page] = (perPage[meta.page] ?? 0) + 1;
      from = idx + q.length;
    }
  }
  return { hits, perPage, total: hits.length };
}
