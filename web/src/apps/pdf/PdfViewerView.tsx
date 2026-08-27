// PDF-002..005: PDF viewer window app (spec 014 §5, Milestone C).
// Lazy pdfjs chunk via pdfLoader (only importer of 'pdfjs-dist' in the app),
// client-side size cap via fetchPdfWithCap, render-only pass-through:
// no innerHTML, no eval path in parser, worker resolved from local asset.
// Integration note: NOT registered into desktop — integrator wires
// windowStore/DesktopCanvas to <PdfViewerView rootId=… filePath=…>.

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  DOC_WARN_BYTES,
  DocTooLargeError,
  fetchPdfWithCap,
  outlineFlatten,
  searchPlan,
  type OutlineEntry,
  type SearchPlan,
} from './pdfLogic';
import { loadPdfjs } from './pdfLoader';

export interface PdfViewerViewProps {
  rootId: string;
  filePath: string;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;
const clamp = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function fileUrl(rootId: string, filePath: string): string {
  return `/api/v1/fs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(filePath)}`;
}

export function PdfViewerView({ rootId, filePath }: PdfViewerViewProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [showOutline, setShowOutline] = useState(false);
  const [showThumbs, setShowThumbs] = useState(false);
  const [scale, setScale] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [docBytes, setDocBytes] = useState(0);
  const [bannerClosed, setBannerClosed] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [plan, setPlan] = useState<SearchPlan | null>(null);
  const [hitIdx, setHitIdx] = useState(0);
  const [estPageH, setEstPageH] = useState(0);

  const docRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const thumbCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderedScale = useRef<Map<number, number>>(new Map());
  const thumbRendered = useRef<Set<number>>(new Set());
  const visiblePages = useRef<Set<number>>(new Set());
  const ioRef = useRef<IntersectionObserver | null>(null);
  const scaleRef = useRef(1);

  // ── load document (PDF-002/004 caps, PDF-001 lazy engine) ──
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setNumPages(0);
    setOutline([]);
    setBannerClosed(false);
    setPlan(null);
    setSearchQ('');
    setPageInput('1');
    visiblePages.current.clear();
    renderedScale.current.clear();
    thumbRendered.current.clear();

    (async () => {
      try {
        const url = fileUrl(rootId, filePath);
        const bytes = await fetchPdfWithCap(url);
        if (cancelled) return;
        setDocBytes(bytes.byteLength);

        const pdfjs = await loadPdfjs();
        // Security posture (PDF-004): parser never evaluates JS, no auto-fetch
        // of embedded resources, scripting has no hook into this render-only view.
        const task = pdfjs.getDocument({
          data: bytes,
          isEvalSupported: false,
          disableAutoFetch: true,
        });
        const pdf = await task.promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        docRef.current = pdf;
        setNumPages(pdf.numPages);
        setStatus('ready');

        try {
          const rawOutline = await pdf.getOutline();
          if (!cancelled) setOutline(outlineFlatten(rawOutline as never));
        } catch {
          /* optional outline */
        }

        // fit-width default + estimate placeholder height for scroll layout
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        const w = viewerRef.current?.clientWidth ?? 800;
        const fit = clamp(w / vp.width);
        if (!cancelled) {
          setScale(fit);
          setEstPageH(Math.floor(vp.height * fit));
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErrMsg(errorText(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      ioRef.current?.disconnect();
      void docRef.current?.destroy().catch(() => {});
      docRef.current = null;
    };
  }, [rootId, filePath]);

  const renderPage = async (n: number): Promise<void> => {
    const pdf = docRef.current;
    if (!pdf || n < 1 || n > pdf.numPages) return;
    const canvas = canvasRefs.current.get(n);
    if (!canvas) return;
    const target = scaleRef.current;
    if (renderedScale.current.get(n) === target && canvas.width > 0) return;
    renderedScale.current.set(n, target); // claim first: avoid duplicate parallel renders
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: target });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = `${Math.floor(vp.width)}px`;
    canvas.style.height = `${Math.floor(vp.height)}px`;
    const holder = pageRefs.current.get(n);
    if (holder && renderedScale.current.get(n) === target) holder.style.minHeight = '';
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas }).promise;
  };

  const renderThumb = async (n: number): Promise<void> => {
    const pdf = docRef.current;
    const canvas = thumbCanvasRefs.current.get(n);
    if (!pdf || !canvas || thumbRendered.current.has(n)) return;
    thumbRendered.current.add(n);
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 110 / base.width });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas }).promise;
  };

  // ── IntersectionObserver virtualization-lite: visible ± neighbors ──
  useEffect(() => {
    if (status !== 'ready') return;
    ioRef.current?.disconnect();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const n = Number((en.target as HTMLElement).dataset.page);
          if (!(n > 0)) continue;
          if (en.isIntersecting) {
            visiblePages.current.add(n);
            for (let d = -2; d <= 2; d++) renderPage(n + d).catch(() => {});
          } else {
            visiblePages.current.delete(n);
          }
        }
      },
      { root: viewerRef.current, rootMargin: '100% 0px' }
    );
    pageRefs.current.forEach((el) => io.observe(el));
    ioRef.current = io;
    return () => io.disconnect();
  }, [status]);

  // re-render visible pages on zoom change
  useEffect(() => {
    if (status !== 'ready') return;
    Array.from(visiblePages.current).forEach((n) => renderPage(n).catch(() => {}));
  }, [scale, status]);

  const buildTexts = async (): Promise<Array<{ page: number; text: string }>> => {
    const pdf = docRef.current;
    if (!pdf) return [];
    if (textsCache.current) return textsCache.current;
    const metas: Array<{ page: number; text: string }> = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      metas.push({
        page: n,
        text: tc.items.map((it: unknown) => ((it as { str?: string }).str ?? '')).join(' '),
      });
    }
    textsCache.current = metas;
    return metas;
  };
  const textsCache = useRef<Array<{ page: number; text: string }> | null>(null);

  const runSearch = async () => {
    const p = searchPlan(searchQ, await buildTexts());
    setPlan(p);
    setHitIdx(0);
  };

  const jumpToHit = (idx: number) => {
    if (!plan || plan.total === 0) return;
    const i = ((idx % plan.total) + plan.total) % plan.total;
    setHitIdx(i);
    gotoPage(plan.hits[i].page);
  };

  const gotoPage = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    const el = pageRefs.current.get(Math.max(1, Math.min(numPages || 1, raw)));
    el?.scrollIntoView({ block: 'start' });
  };

  const fitWidth = () => {
    const pdf = docRef.current;
    if (!pdf || !viewerRef.current) return;
    pdf
      .getPage(1)
      .then((p) => {
        const vp = p.getViewport({ scale: 1 });
        setScale(clamp(viewerRef.current!.clientWidth / vp.width));
      })
      .catch(() => {});
  };

  const jumpOutline = async (dest: unknown) => {
    try {
      const pdf = docRef.current;
      if (!pdf) return;
      const explicit =
        typeof dest === 'string' ? await pdf.getDestination(dest) : (dest as unknown[] | null);
      if (!explicit) return;
      const index = await pdf.getPageIndex(explicit[0] as never);
      gotoPage(index + 1);
    } catch {
      /* ignore broken dest */
    }
  };

  const openRaw = () => window.open(fileUrl(rootId, filePath), '_blank', 'noopener');

  const fileName = filePath.split('/').pop() ?? filePath;

  if (status === 'error') {
    return (
      <div style={errWrap}>
        <div style={{ fontSize: 28 }}>⚠️</div>
        <div style={{ fontWeight: 600, color: '#ef4444' }}>Gagal membuka {fileName}</div>
        <div style={{ color: '#94a3b8', maxWidth: 420, textAlign: 'center' }}>{errMsg}</div>
        <button onClick={openRaw} style={btn('#38bdf8')}>
          Buka di tab baru ↗
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#f1f5f9', fontSize: 13 }}>
      {/* header */}
      <div style={header}>
        <span style={{ fontWeight: 600, color: '#38bdf8' }}>📄 {fileName}</span>
        <span style={chip(showOutline)} onClick={() => setShowOutline((v) => !v)}>☰ Outline</span>
        <span style={chip(showThumbs)} onClick={() => setShowThumbs((v) => !v)}>▦ Thumbnail</span>
        <button onClick={() => setScale((s) => clamp(s - SCALE_STEP))} style={btn('#334155')}>−</button>
        <span style={{ minWidth: 46, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => clamp(s + SCALE_STEP))} style={btn('#334155')}>+</button>
        <span style={chip(false)} onClick={fitWidth}>Fit</span>
        <input
          value={pageInput}
          onChange={(e) => setPageInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && gotoPage(parseInt(pageInput, 10))}
          style={input}
          aria-label="Halaman"
        />
        <span style={{ color: '#94a3b8' }}>/ {numPages || '…'}</span>
        <span style={{ flex: 1 }} />
        {/* PDF-005 fallback chain — raw URL always available */}
        <a href={fileUrl(rootId, filePath)} target="_blank" rel="noopener noreferrer" style={btn('#38bdf8')}>
          Open ↗
        </a>
      </div>

      {/* search row */}
      <div style={{ ...header, borderBottom: '1px solid #1e293b' }}>
        <input
          placeholder="Cari teks dalam dokumen…"
          value={searchQ}
          onChange={(e) => setSearchQ((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          style={{ ...input, flex: 1, width: 'auto' }}
          aria-label="Cari dalam dokumen"
        />
        <button onClick={runSearch} style={btn('#334155')}>Cari</button>
        {plan && (
          <>
            <button onClick={() => jumpToHit(hitIdx - 1)} style={btn('#334155')} disabled={!plan.total}>◀</button>
            <span style={{ color: plan.total ? '#94a3b8' : '#f59e0b' }}>
              {plan.total ? `${hitIdx + 1}/${plan.total}` : 'tidak ketemu'}
            </span>
            <button onClick={() => jumpToHit(hitIdx + 1)} style={btn('#334155')} disabled={!plan.total}>▶</button>
          </>
        )}
      </div>

      {docBytes > DOC_WARN_BYTES && !bannerClosed && (
        <div style={{ display: 'flex', gap: 8, margin: '6px 10px 0', padding: '6px 10px', background: '#7c2d12', borderRadius: 6, alignItems: 'center' }}>
          <span>⚠️ Dokumen besar ({(docBytes / 1024 / 1024).toFixed(1)} MiB) — geser bisa lambat.</span>
          <span style={{ flex: 1 }} />
          <span style={{ ...chip(false), borderColor: '#fdba74' }} onClick={() => setBannerClosed(true)}>✕</span>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {showOutline && (
          <aside style={{ width: 180, overflowY: 'auto', borderRight: '1px solid #1e293b', padding: 6, background: '#111c31' }}>
            {outline.length === 0 && <div style={{ color: '#94a3b8' }}>Dokumen tanpa outline.</div>}
            {outline.map((o, i) => (
              <div
                key={i}
                onClick={() => jumpOutline(o.dest)}
                style={{ padding: '3px 4px', paddingLeft: 4 + o.depth * 12, cursor: 'pointer', borderRadius: 4 }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#1e293b')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
              >
                {o.title}
              </div>
            ))}
          </aside>
        )}

        {showThumbs && (
          <aside style={{ width: 130, overflowY: 'auto', borderRight: '1px solid #1e293b', padding: 6, background: '#111c31' }}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <div key={n} onClick={() => gotoPage(n)} style={{ cursor: 'pointer', marginBottom: 8, border: '1px solid #334155', borderRadius: 4, overflow: 'hidden', background: '#e2e8f0', width: 112 }}>
                <canvas
                  ref={(c) => {
                    if (c) {
                      thumbCanvasRefs.current.set(n, c);
                      renderThumb(n).catch(() => {});
                    } else thumbCanvasRefs.current.delete(n);
                  }}
                />
              </div>
            ))}
          </aside>
        )}

        <div ref={viewerRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {status !== 'ready' && <div style={{ marginTop: 40, color: '#94a3b8' }}>Memuat {fileName}…</div>}
          {status === 'ready' &&
            Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                data-page={n}
                ref={(el) => {
                  if (el) pageRefs.current.set(n, el);
                  else pageRefs.current.delete(n);
                }}
                style={{ background: '#e2e8f0', minHeight: estPageH || undefined }}
              >
                <canvas
                  ref={(c) => {
                    if (c) canvasRefs.current.set(n, c);
                    else canvasRefs.current.delete(n);
                  }}
                />
                <div style={{ color: '#334155', fontSize: 11, textAlign: 'center', paddingBottom: 4 }}>{n}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function errorText(e: unknown): string {
  if (e instanceof DocTooLargeError)
    return 'Ukuran dokumen melebihi batas 25 MiB (default; ubah via localStorage mux_doc_max_bytes). Gunakan tombol di bawah untuk membuka mentah.';
  const err = e as { name?: string };
  if (err?.name === 'PasswordException') return 'Dokumen terenkripsi — dibuka tanpa sandi tidak didukung.';
  if (err?.name === 'InvalidPDFException') return 'File bukan PDF valid atau korup.';
  if (err?.name === 'AbortError') return 'Pemuatan dibatalkan.';
  return 'Terjadi kesalahan saat memuat dokumen.';
}

const errWrap: preact.JSX.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  background: '#0f172a',
  color: '#f1f5f9',
  padding: 16,
};

const header: preact.JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  padding: '6px 10px',
  borderBottom: '1px solid #1e293b',
};

const btn = (bg: string): preact.JSX.CSSProperties => ({
  padding: '3px 8px',
  background: bg,
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-block',
});

const input: preact.JSX.CSSProperties = {
  width: 44,
  background: '#020617',
  color: '#f1f5f9',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '3px 6px',
};

const chip = (active: boolean): preact.JSX.CSSProperties => ({
  padding: '2px 8px',
  borderRadius: 10,
  cursor: 'pointer',
  background: active ? '#4f46e5' : 'rgba(255,255,255,0.06)',
  border: `1px solid ${active ? '#6366f1' : '#334155'}`,
});
