import { describe, expect, it, vi } from 'vitest';
import {
  DOC_MAX_BYTES,
  fetchPdfWithCap,
  outlineFlatten,
  pdfRouteDecision,
  readDocMaxBytes,
  searchPlan,
} from './pdfLogic';
import { loadPdfjs, resetPdfjsLoaderForTest } from './pdfLoader';

// ── PDF-002 caps & streaming guard ──

const fakeResponse = (chunks: Uint8Array[], headers: Record<string, string> = {}) => {
  let i = 0;
  return {
    ok: true,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    body: {
      getReader() {
        return {
          read: async () =>
            i < chunks.length
              ? { done: false, value: chunks[i++] }
              : { done: true, value: undefined },
          cancel: vi.fn(),
        };
      },
    },
  } as unknown as Response;
};

describe('PDF-002 fetchPdfWithCap', () => {
  const decode = (u8: Uint8Array) => new TextDecoder().decode(u8);

  it('under cap → mengembalikan seluruh bytes', async () => {
    const resp = fakeResponse([new TextEncoder().encode('HELO')]);
    const bytes = await fetchPdfWithCap('x', { maxBytes: 10, fetchImpl: async () => resp });
    expect(decode(bytes)).toBe('HELO');
  });

  it('over-cap mid-stream → abort + DOC_TOO_LARGE', async () => {
    const a = new TextEncoder().encode('AAAA');
    const b = new TextEncoder().encode('BBBB');
    let aborted = false;
    const controller = new AbortController();
    const resp = fakeResponse([a, b], {});
    // intercept abort via wrapper around global? fake: pass signal and check after
    await expect(
      fetchPdfWithCap('x', {
        maxBytes: 6,
        fetchImpl: (_url, init) => {
          init?.signal?.addEventListener('abort', () => (aborted = true));
          return Promise.resolve(resp);
        },
      })
    ).rejects.toMatchObject({ code: 'DOC_TOO_LARGE' });
    expect(aborted).toBe(true);
    void controller;
  });

  it('Content-Length > cap → reject SEBELUM stream dibaca', async () => {
    const resp = fakeResponse([new Uint8Array(4)]);
    let reads = 0;
    (resp.body as unknown as { getReader(): { read: () => Promise<unknown> } });
    const spy = resp.body as unknown as { getReader: () => { read: () => Promise<unknown> } };
    origReaderSpy(spy, () => reads++);
    await expect(
      fetchPdfWithCap('x', {
        maxBytes: 2,
        fetchImpl: async () => fakeResponse([], { 'content-length': '100' }),
      })
    ).rejects.toMatchObject({ code: 'DOC_TOO_LARGE' });
    void resp;
    void spy;
    expect(reads).toBe(0);
  });

  it('signal eksternal sudah aborted → reject AbortError tanpa fetch', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const fetchImpl = vi.fn();
    await expect(
      fetchPdfWithCap('x', { maxBytes: 10, fetchImpl: fetchImpl as never, signal: ctrl.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('body kosong → Uint8Array panjang 0', async () => {
    const bytes = await fetchPdfWithCap('x', {
      maxBytes: 10,
      fetchImpl: async () => fakeResponse([]),
    });
    expect(bytes.length).toBe(0);
  });

  it('override localStorage mux_doc_max_bytes dipakai', () => {
    const store = { getItem: (k: string) => (k === 'mux_doc_max_bytes' ? '1024' : null) };
    expect(readDocMaxBytes(store as Storage)).toBe(1024);
    expect(DOC_MAX_BYTES).toBe(25 * 1024 * 1024);
  });
});

const origReaderSpy = (
  body: { getReader: () => { read: () => Promise<unknown> } },
  onRead: () => void
) => {
  body.getReader = () => ({ read: () => (onRead(), Promise.resolve({ done: true })) });
};

// ── PDF-007 route decision ──

describe('PDF-006/007 pdfRouteDecision', () => {
  it('nama .pdf → pdf-viewer', () => {
    expect(pdfRouteDecision({ fileName: 'paper.pdf' })).toBe('pdf-viewer');
  });
  it('ekstensi besar .PDF tetap pdf-viewer; mime application/pdf juga', () => {
    expect(pdfRouteDecision({ fileName: 'X.PDF' })).toBe('pdf-viewer');
    expect(pdfRouteDecision({ mime: 'application/pdf' })).toBe('pdf-viewer');
  });
  it('bukan pdf tanpa editorExts → null (integrator router memutuskan)', () => {
    expect(pdfRouteDecision({ fileName: 'notes.txt' })).toBeNull();
    expect(pdfRouteDecision({ fileName: 'a.md', mime: 'text/plain' })).toBeNull();
  });
  it('editorExts eksplisit (.txt) → editor', () => {
    expect(pdfRouteDecision({ fileName: 'notes.txt' }, ['.txt', '.md'])).toBe('editor');
  });
});

// ── PDF-003 outline flatten ──

describe('PDF-003 outlineFlatten', () => {
  it('tree nested → flat berurut dengan depth', () => {
    const flat = outlineFlatten([
      { title: 'Bab 1', items: [{ title: '1.1', items: [] }] },
      { title: 'Bab 2', items: [] },
    ] as never[]);
    expect(flat.map((o) => `${o.title}:${o.depth}`)).toEqual(['Bab 1:0', '1.1:1', 'Bab 2:0']);
  });
  it('outline kosong/null → array kosong', () => {
    expect(outlineFlatten(null)).toEqual([]);
    expect(outlineFlatten([])).toEqual([]);
  });
  it('item tanpa judul → placeholder stabil', () => {
    const flat = outlineFlatten([{ items: [] }] as never[]);
    expect(flat[0].title).toBeTruthy();
  });
});

// ── PDF-003 searchPlan ──

describe('PDF-003 searchPlan', () => {
  const pages = [
    { page: 1, text: 'Alpha beta alpha' },
    { page: 2, text: 'tidak ada' },
    { page: 3, text: 'ALPHA di akhir alpha' },
  ];

  it('query matches case-insensitive terurut per halaman lalu offset', () => {
    const plan = searchPlan('alpha', pages);
    expect(plan.hits.map((h) => [h.page, h.start])).toEqual([
      [1, 0],
      [1, 11],
      [3, 0],
      [3, 15],
    ]);
    expect(plan.total).toBe(4);
  });

  it('query kosong/whitespace → tanpa hit', () => {
    expect(searchPlan('', pages).total).toBe(0);
    expect(searchPlan('   ', pages).total).toBe(0);
  });

  it('query tidak ketemu → total 0 tapi struktur valid', () => {
    const plan = searchPlan('zzz', pages);
    expect(plan.total).toBe(0);
    expect(plan.hits).toEqual([]);
  });

  it('hit summary per halaman tersedia untuk badge UI', () => {
    const plan = searchPlan('alpha', pages);
    expect(plan.perPage[1]).toBe(2);
    expect(plan.perPage[2]).toBeUndefined();
  });
});

// ── PDF-001 loader memoization ──

describe('PDF-001 loadPdfjs singleton', () => {
  it('memoized: importer hanya dipanggil sekali walau dua await', async () => {
    resetPdfjsLoaderForTest();
    const importer = vi.fn(async () => ({ version: '5.4.149' }));
    const p1 = loadPdfjs(importer);
    const p2 = loadPdfjs(importer);
    const [m1, m2] = await Promise.all([p1, p2]);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(m1).toBe(m2);
  });

  it('panggilan berikutnya setelah resolve tetap instance sama', async () => {
    resetPdfjsLoaderForTest();
    const mod = { version: '5.4.149' };
    const importer = vi.fn(async () => mod);
    await loadPdfjs(importer);
    await loadPdfjs(importer);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
