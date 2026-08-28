import { useEffect, useRef, useState } from 'preact/hooks';
import {
  addCell,
  changeType,
  moveCell,
  parseNotebook,
  removeCell,
  serializeNotebook,
  setCellSource,
  type CellType,
  type Notebook,
} from './notebookModel';
import { cellsToScript, splitRunStdout } from './cellScript';
import { renderToNodes, tokenizeMarkdown, type RenderNode } from './mdMini';

interface NotebookViewProps {
  rootId: string;
  filePath: string;
}

const STORAGE_KERNEL = 'mux_kernel_bridge';

// ── tiny house-style helpers ──

function shortId(id: string): string {
  return id.length > 10 ? id.slice(0, 8) : id;
}

function wsProto(): string {
  return location.protocol === 'https:' ? 'wss' : 'ws';
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/x-python;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

// ── markdown → preact nodes (text-only contract, no innerHTML) ──

// Amend 2026-08-28: `![alt](src)` preview. Relative src resolves against the
// notebook's directory via the existing fs endpoint (PdfViewerView pattern).
function resolveImgSrc(src: string, rootId: string, filePath: string): string {
  if (/^(https?:\/\/|data:image\/)/i.test(src)) return src;
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
  const full = dir ? `${dir}/${src}` : src;
  return `/api/v1/fs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(full)}`;
}

function ImgNode({ node, rootId, filePath }: { node: RenderNode; rootId: string; filePath: string }) {
  const [big, setBig] = useState(false);
  return (
    <span style={{ display: 'block', margin: '4px 0' }}>
      <img
        src={resolveImgSrc(node.src ?? '#', rootId, filePath)}
        alt={node.text}
        loading="lazy"
        onClick={() => setBig((v) => !v)}
        style={{ maxWidth: '100%', maxHeight: big ? undefined : 320, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', cursor: 'zoom-in', display: 'block' }}
      />
      {node.text ? <span style={{ display: 'block', color: '#64748b', fontSize: 11, marginTop: 2 }}>{node.text}</span> : null}
    </span>
  );
}

function MarkdownBlock({ source, rootId, filePath }: { source: string; rootId: string; filePath: string }) {
  const tokens = tokenizeMarkdown(source);
  const nodes = renderToNodes(tokens);
  return (
    <div style={{ lineHeight: 1.55 }}>
      {nodes.map((n, i) => {
        if (n.tag === 'img') return <ImgNode key={i} node={n} rootId={rootId} filePath={filePath} />;
        if (n.tag === 'h1') return <h1 key={i} style={{ fontSize: 22, margin: '6px 0', color: '#f1f5f9' }}>{n.text}</h1>;
        if (n.tag === 'h2') return <h2 key={i} style={{ fontSize: 19, margin: '6px 0', color: '#f1f5f9' }}>{n.text}</h2>;
        if (n.tag === 'h3') return <h3 key={i} style={{ fontSize: 16, margin: '5px 0', color: '#f1f5f9' }}>{n.text}</h3>;
        if (n.tag === 'h4') return <h4 key={i} style={{ fontSize: 14, margin: '4px 0', color: '#e2e8f0' }}>{n.text}</h4>;
        if (n.tag === 'h5') return <h5 key={i} style={{ fontSize: 13, margin: '4px 0', color: '#e2e8f0' }}>{n.text}</h5>;
        if (n.tag === 'h6') return <h6 key={i} style={{ fontSize: 12, margin: '4px 0', color: '#cbd5e1' }}>{n.text}</h6>;
        if (n.tag === 'li') return <li key={i} style={{ marginLeft: 18, color: '#e2e8f0' }}>{n.text}</li>;
        if (n.tag === 'pre') return <pre key={i} style={{ background: '#0f172a', padding: '6px 8px', borderRadius: 4, overflowX: 'auto', fontSize: 12, color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.06)' }}>{n.text}{n.lang ? <span style={{ marginLeft: 8, color: '#64748b', fontSize: 10 }}>{n.lang}</span> : null}</pre>;
        if (n.tag === 'blockquote') return <blockquote key={i} style={{ borderLeft: '3px solid #334155', margin: '4px 0', padding: '2px 8px', color: '#94a3b8', fontStyle: 'italic' }}>{n.text}</blockquote>;
        if (n.tag === 'a') return <a key={i} href={n.href} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'underline' }}>{n.text}</a>;
        if (n.tag === 'code') return <code key={i} style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>{n.text}</code>;
        if (n.tag === 'em') return <em key={i} style={{ color: '#e2e8f0' }}>{n.text}</em>;
        if (n.tag === 'strong') return <strong key={i} style={{ color: '#f8fafc' }}>{n.text}</strong>;
        return <span key={i} style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{n.text} </span>;
      })}
    </div>
  );
}

function OutputBox({ kind, text, ename, evalue, traceback, label, mime, sizeBytes }: { kind: string; text?: string; ename?: string; evalue?: string; traceback?: string[]; label?: string; mime?: string; sizeBytes?: number }) {
  if (kind === 'stream') {
    return <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '6px 8px', borderRadius: 4, fontSize: 11, whiteSpace: 'pre-wrap', margin: '4px 0', border: '1px solid rgba(255,255,255,0.06)', fontFamily: "'JetBrains Mono', monospace" }}>{text}</pre>;
  }
  if (kind === 'error') {
    return (
      <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 4, padding: '6px 8px', margin: '4px 0' }}>
        <div style={{ color: '#f87171', fontWeight: 600, fontSize: 12 }}>{ename}: {evalue}</div>
        {traceback && traceback.length > 0 && <pre style={{ color: '#fecaca', fontSize: 11, whiteSpace: 'pre-wrap', margin: '4px 0 0', fontFamily: "'JetBrains Mono', monospace" }}>{traceback.join('\n')}</pre>}
      </div>
    );
  }
  if (kind === 'rich') {
    return <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '6px 8px', margin: '4px 0', fontSize: 12, color: '#cbd5e1' }}><span style={{ background: '#1e293b', padding: '1px 6px', borderRadius: 10, fontSize: 10, color: '#7dd3fc', border: '1px solid #334155' }}>{mime}</span> <span style={{ color: '#94a3b8' }}>{label}</span> <span style={{ color: '#64748b' }}>— pratinjau rich output</span></div>;
  }
  if (kind === 'big') {
    return <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 4, padding: '6px 8px', margin: '4px 0', fontSize: 12, color: '#fde68a' }}>⚠️ Output {sizeBytes} bytes collapsed — klik "Hasil" setelah Jalankan Semua untuk melihat ringkas.</div>;
  }
  return null;
}

export function NotebookView({ rootId, filePath }: NotebookViewProps) {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [parseErr, setParseErr] = useState<null | 'NOTEBOOK_CORRUPT' | 'NOTEBOOK_TOO_LARGE'>(null);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [resultNotebook, setResultNotebook] = useState<Notebook | null>(null);
  const [activeTab, setActiveTab] = useState<'origin' | 'hasil'>('origin');
  const [activeIdx, setActiveIdx] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showNewCellMenu, setShowNewCellMenu] = useState(false);
  const [kernelBridge, setKernelBridge] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KERNEL) === '1';
    } catch {
      return false;
    }
  });
  const [showKernelPop, setShowKernelPop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [runningCell, setRunningCell] = useState(false);
  const [wsStatus, setWsStatus] = useState<string | null>(null);
  const [execLines, setExecLines] = useState<string[]>([]);
  // live per-cell stdout for L2
  const [cellLive, setCellLive] = useState<Record<number, string[]>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const editRef = useRef<HTMLTextAreaElement | null>(null);

  const displayed: Notebook | null = activeTab === 'hasil' && resultNotebook ? resultNotebook : notebook;
  const cells = displayed?.cells ?? [];

  // clamp activeIdx when tab/notebook changes
  useEffect(() => {
    if (cells.length === 0) {
      if (activeIdx !== 0) setActiveIdx(0);
      return;
    }
    if (activeIdx >= cells.length) setActiveIdx(cells.length - 1);
    if (activeIdx < 0) setActiveIdx(0);
  }, [cells.length, activeIdx]);

  // focus textarea when entering edit
  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      // auto-height
      const el = editRef.current;
      el.style.height = 'auto';
      el.style.height = `${Math.min(420, el.scrollHeight)}px`;
    }
  }, [editingId]);

  // fetch on mount / prop change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotice(null);
    setParseErr(null);
    setResultNotebook(null);
    setActiveTab('origin');
    setExecLines([]);
    setWsStatus(null);
    setCellLive({});
    wsRef.current?.close();
    wsRef.current = null;

    fetch(`/api/v1/fs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(filePath)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
          const code = body?.error?.code ?? (r.status === 400 ? 'BAD_REQUEST' : 'ERROR');
          const msg = body?.error?.message ?? r.statusText;
          throw new Error(`${code}: ${msg}`);
        }
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        const parsed = parseNotebook(text);
        if (!parsed.ok) {
          setParseErr(parsed.error);
          setNotebook(null);
        } else {
          setNotebook(parsed.notebook);
          setActiveIdx(0);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // normalize already-formatted CODE: msg vs raw
        const banner = msg.startsWith('⚠️') ? msg : `⚠️ ${msg}`;
        setNotice(banner);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [rootId, filePath]);

  // persist kernel bridge toggle
  const toggleKernel = (v: boolean) => {
    setKernelBridge(v);
    try {
      localStorage.setItem(STORAGE_KERNEL, v ? '1' : '0');
    } catch {
      // ignore
    }
  };

  // ── cell mutations (operate on displayed tab's notebook) ──
  const updateDisplayed = (fn: (nb: Notebook) => Notebook) => {
    if (activeTab === 'hasil' && resultNotebook) {
      setResultNotebook((prev) => (prev ? fn(prev) : prev));
    } else {
      setNotebook((prev) => (prev ? fn(prev) : prev));
    }
  };

  const handleAddCell = (type: CellType) => {
    if (!displayed) return;
    const at = Math.min(activeIdx + 1, cells.length);
    updateDisplayed((nb) => addCell(nb, at, type));
    setActiveIdx(at);
    setShowNewCellMenu(false);
  };

  const handleRemove = (id: string, idx: number) => {
    updateDisplayed((nb) => removeCell(nb, id));
    if (editingId === id) setEditingId(null);
    if (idx <= activeIdx && activeIdx > 0) setActiveIdx((v) => v - 1);
  };

  const handleMove = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= cells.length) return;
    updateDisplayed((nb) => moveCell(nb, from, to));
    if (activeIdx === from) setActiveIdx(to);
    else if (activeIdx === to) setActiveIdx(from);
  };

  const handleChangeType = (id: string, type: CellType) => {
    updateDisplayed((nb) => changeType(nb, id, type));
  };

  const startEdit = (cell: { id: string; source: string[] }) => {
    setEditingId(cell.id);
    setEditValue(cell.source.join(''));
  };

  const commitEdit = () => {
    if (!editingId) return;
    const src = editValue.split('\n').map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l));
    // preserve original empty-array vs trailing newline shape: use setCellSource
    updateDisplayed((nb) => setCellSource(nb, editingId, src.length === 1 && src[0] === '' ? [] : src));
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  // ── Simpan ──
  const handleSave = async () => {
    const toSave = displayed;
    if (!toSave) return;
    setSaving(true);
    setNotice(null);
    try {
      const body = serializeNotebook(toSave);
      const r = await fetch(`/api/v1/fs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body,
      });
      if (!r.ok) {
        const b = await r.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        setNotice(`⚠️ ${b?.error?.code ?? 'ERROR'}: ${b?.error?.message ?? r.statusText}`);
        return;
      }
      setNotice('✅ Tersimpan.');
      // keep origin in sync when saving hasil? keep both? update origin snapshot
      if (activeTab === 'hasil' && resultNotebook) {
        // also sync origin to saved hasil content so Origin reflects save (optional)
      } else {
        // ensure notebook state matches serialized (re-parse to normalize)
        const reparsed = parseNotebook(body);
        if (reparsed.ok) setNotebook(reparsed.notebook);
      }
    } catch (e) {
      setNotice(`⚠️ ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Unduh .py ──
  const handleDownloadPy = () => {
    const nb = displayed;
    if (!nb) return;
    const script = cellsToScript(nb.cells.map((c) => ({ type: c.type, source: c.source })));
    const base = filePath.split('/').pop() ?? 'notebook';
    const name = base.replace(/\.ipynb$/i, '') + '.py';
    downloadText(name, script);
  };

  // ── Jalankan Semua (L1) ──
  const handleRunAll = async () => {
    if (runningAll || runningCell) return;
    setNotice(null);
    setWsStatus(null);
    setExecLines([]);
    setCellLive({});
    setRunningAll(true);
    try {
      const r = await fetch('/api/v1/notebooks/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: rootId, path: filePath }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        setNotice(`⚠️ ${b?.error?.code ?? 'ERROR'}: ${b?.error?.message ?? r.statusText}`);
        setRunningAll(false);
        return;
      }
      const b = await r.json() as { task_id?: string; taskId?: string };
      const taskId = (b.task_id ?? b.taskId ?? '') as string;
      if (!taskId) {
        setNotice('⚠️ ERROR: task_id kosong');
        setRunningAll(false);
        return;
      }
      wsRef.current?.close();
      const ws = new WebSocket(`${wsProto()}://${location.host}/api/v1/notebooks/${encodeURIComponent(taskId)}/ws`);
      wsRef.current = ws;
      const acc: string[] = [];
      ws.onmessage = (ev) => {
        try {
          const frame = JSON.parse((ev as MessageEvent).data) as { type: string; data?: string; message?: string; code?: number };
          if (frame.type === 'line' && typeof frame.data === 'string') {
            acc.push(frame.data);
            setExecLines((prev) => [...prev.slice(-200), frame.data as string]);
            setWsStatus(frame.data as string);
          } else if (frame.type === 'exit') {
            setWsStatus(`exit ${frame.code ?? ''}`);
            ws.close();
            // fetch executed result
            fetch(`/api/v1/notebooks/executed/${encodeURIComponent(taskId)}`)
              .then(async (rr) => {
                if (!rr.ok) {
                  const bb = await rr.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
                  setNotice(`⚠️ ${bb?.error?.code ?? 'ERROR'}: ${bb?.error?.message ?? rr.statusText}`);
                  return null;
                }
                return rr.text();
              })
              .then((text) => {
                if (!text) return;
                const parsed = parseNotebook(text);
                if (!parsed.ok) {
                  setNotice(`⚠️ ${parsed.error}: hasil eksekusi korup`);
                  return;
                }
                setResultNotebook(parsed.notebook);
                setActiveTab('hasil');
                setActiveIdx((v) => Math.min(v, parsed.notebook.cells.length - 1));
                setNotice('✅ Jalankan Semua selesai — tab Hasil diperbarui.');
              })
              .catch((e) => setNotice(`⚠️ ${String(e)}`))
              .finally(() => setRunningAll(false));
          } else if (frame.type === 'error') {
            setNotice(`⚠️ ${frame.message ?? 'ws error'}`);
            setWsStatus(null);
            setRunningAll(false);
            ws.close();
          }
        } catch {
          // ignore malformed
        }
      };
      ws.onclose = () => {
        // if still runningAll and no exit arrived, clear flag after small delay? keep until exit fetch handles it
        // no-op: exit path already clears runningAll
      };
      ws.onerror = () => {
        setNotice('⚠️ WebSocket gagal');
      };
    } catch (e) {
      setNotice(`⚠️ ${String(e)}`);
      setRunningAll(false);
    }
  };

  // ── Jalankan Sel aktif (L2) ──
  const handleRunCell = async () => {
    if (runningAll || runningCell) return;
    const nb = displayed;
    if (!nb || cells.length === 0) return;
    const idx = Math.max(0, Math.min(activeIdx, cells.length - 1));
    const activeCell = cells[idx];
    if (!activeCell || activeCell.type !== 'code') {
      setNotice('⚠️ Pilih sel code untuk dijalankan.');
      return;
    }
    setNotice(null);
    setWsStatus(null);
    setExecLines([]);
    setCellLive({});
    setRunningCell(true);
    const prefixSrc = cellsToScript(cells.slice(0, idx).map((c) => ({ type: c.type, source: c.source })));
    const cellSrc = activeCell.source.join('');
    try {
      const r = await fetch('/api/v1/notebooks/cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: rootId, path: filePath, prefix_src: prefixSrc, cell_src: cellSrc }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        setNotice(`⚠️ ${b?.error?.code ?? 'ERROR'}: ${b?.error?.message ?? r.statusText}`);
        setRunningCell(false);
        return;
      }
      const b = await r.json() as { task_id?: string; taskId?: string };
      const taskId = (b.task_id ?? b.taskId ?? '') as string;
      if (!taskId) {
        setNotice('⚠️ ERROR: task_id kosong');
        setRunningCell(false);
        return;
      }
      wsRef.current?.close();
      const ws = new WebSocket(`${wsProto()}://${location.host}/api/v1/notebooks/${encodeURIComponent(taskId)}/ws`);
      wsRef.current = ws;
      const acc: string[] = [];
      ws.onmessage = (ev) => {
        try {
          const frame = JSON.parse((ev as MessageEvent).data) as { type: string; data?: string; message?: string; code?: number };
          if (frame.type === 'line' && typeof frame.data === 'string') {
            acc.push(frame.data as string);
            setExecLines((prev) => [...prev.slice(-200), frame.data as string]);
            setWsStatus(frame.data as string);
            // live mapping via splitRunStdout collector into per-cell output boxes
            const split = splitRunStdout(acc, cells.length);
            const live: Record<number, string[]> = {};
            split.cells.forEach((arr, i) => {
              if (arr.length > 0) live[i] = arr;
            });
            // also surface prelude as notice-ish? keep in status
            setCellLive(live);
          } else if (frame.type === 'exit') {
            setWsStatus(`exit ${frame.code ?? ''}`);
            // final split ensures trailing output
            const split = splitRunStdout(acc, cells.length);
            const live: Record<number, string[]> = {};
            split.cells.forEach((arr, i) => {
              if (arr.length > 0) live[i] = arr;
            });
            setCellLive(live);
            setRunningCell(false);
            ws.close();
            if ((frame.code ?? 0) !== 0) {
              setNotice(`⚠️ Sel keluar dengan code ${frame.code}`);
            } else {
              setNotice('✅ Sel selesai.');
            }
          } else if (frame.type === 'error') {
            setNotice(`⚠️ ${frame.message ?? 'ws error'}`);
            setWsStatus(null);
            setRunningCell(false);
            ws.close();
          }
        } catch {
          // ignore
        }
      };
      ws.onerror = () => setNotice('⚠️ WebSocket gagal');
      ws.onclose = () => setRunningCell((cur) => (cur ? false : cur));
    } catch (e) {
      setNotice(`⚠️ ${String(e)}`);
      setRunningCell(false);
    }
  };

  // ── virtualization window ──
  const windowedIndices: number[] = (() => {
    if (cells.length <= 120) return cells.map((_, i) => i);
    const start = Math.max(0, activeIdx - 40);
    const end = Math.min(cells.length, activeIdx + 40);
    const out: number[] = [];
    for (let i = start; i < end; i++) out.push(i);
    return out;
  })();
  const isWindowed = cells.length > 120;

  // ── loading / error states ──
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#1e1e2f', color: '#a1a1b5', fontSize: 13 }}>
        Memuat {filePath}…
      </div>
    );
  }

  if (parseErr) {
    const msg = parseErr === 'NOTEBOOK_TOO_LARGE' ? 'File terlalu besar (>5 MiB) — tidak bisa ditampilkan.' : 'File rusak atau bukan ipynb yang valid (NOTEBOOK_CORRUPT).';
    return (
      <div style={{ padding: 16, background: '#1e1e2f', color: '#f1f5f9', height: '100%', overflowY: 'auto' }}>
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>⛔</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fecaca', fontSize: 13 }}>{parseErr}</div>
            <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 2 }}>{msg}</div>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>{rootId}:{filePath}</div>
          </div>
        </div>
        {notice && <div style={{ marginTop: 10, padding: '6px 8px', background: '#1e293b', borderRadius: 6, fontSize: 12, color: '#f1f5f9' }}>{notice}</div>}
      </div>
    );
  }

  if (!displayed) {
    return (
      <div style={{ padding: 16, background: '#1e1e2f', color: '#f1f5f9', height: '100%' }}>
        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 10 }}>
          <span>⚠️</span><span style={{ fontSize: 12 }}>Tidak ada notebook untuk ditampilkan.</span>
        </div>
        {notice && <div style={{ marginTop: 10, padding: '6px 8px', background: '#1e293b', borderRadius: 6, fontSize: 12 }}>{notice}</div>}
      </div>
    );
  }

  const activeCell = cells[activeIdx] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e2f', color: '#f1f5f9', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      {/* notice / error banner (house style SupportHubView) */}
      {notice && (
        <div style={{ padding: '6px 10px', background: notice.startsWith('✅') ? 'rgba(16,185,129,0.14)' : notice.startsWith('⚠️') ? '#3f1a1a' : '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.06)', color: notice.startsWith('✅') ? '#a7f3d0' : '#fecaca', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}
      {(runningAll || runningCell) && wsStatus !== null && (
        <div style={{ padding: '4px 10px', background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#7dd3fc', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap', maxHeight: 80, overflowY: 'auto' }}>
          ▶ {wsStatus}
          {execLines.length > 1 && <span style={{ color: '#64748b' }}> — {execLines.length} baris</span>}
        </div>
      )}

      {/* toolbar row (Windows-11-dark exemplar like SupportHub/textEditor) */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px', background: '#181825', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {/* + Sel Baru */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNewCellMenu((v) => !v)}
            style={{ padding: '5px 10px', background: '#2a2a40', color: '#f1f5f9', border: '1px solid #3a3a5a', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          >
            + Sel Baru ▾
          </button>
          {showNewCellMenu && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 10, minWidth: 140, padding: '4px 0' }}>
              <div style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12 }} onClick={() => handleAddCell('code')}>code</div>
              <div style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12 }} onClick={() => handleAddCell('markdown')}>markdown</div>
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '5px 10px', background: saving ? '#334155' : '#1e40af', color: 'white', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>

        <button
          onClick={handleRunAll}
          disabled={runningAll || runningCell}
          style={{ padding: '5px 10px', background: runningAll ? '#334155' : '#0f766e', color: 'white', border: 'none', borderRadius: 6, cursor: runningAll || runningCell ? 'not-allowed' : 'pointer', fontSize: 12, opacity: runningAll || runningCell ? 0.6 : 1 }}
          title="Jalankan Semua (L1)"
        >
          ▶ Jalankan Semua
        </button>

        <button
          onClick={handleRunCell}
          disabled={!activeCell || activeCell.type !== 'code' || runningAll || runningCell}
          style={{ padding: '5px 10px', background: !activeCell || activeCell.type !== 'code' ? '#334155' : '#6366f1', color: 'white', border: 'none', borderRadius: 6, cursor: !activeCell || activeCell.type !== 'code' || runningAll || runningCell ? 'not-allowed' : 'pointer', fontSize: 12, opacity: !activeCell || activeCell.type !== 'code' || runningAll || runningCell ? 0.6 : 1 }}
          title="Jalankan Sel aktif (L2)"
        >
          ▶ Jalankan Sel
        </button>

        <button
          onClick={handleDownloadPy}
          style={{ padding: '5px 10px', background: '#334155', color: '#f1f5f9', border: '1px solid #475569', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
        >
          Unduh .py
        </button>

        {/* tabs Origin / Hasil */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 8, alignItems: 'center' }}>
          <button
            onClick={() => setActiveTab('origin')}
            style={{ padding: '4px 10px', background: activeTab === 'origin' ? '#6366f1' : '#2a2a40', color: 'white', border: '1px solid #3a3a5a', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          >
            Origin
          </button>
          <button
            onClick={() => resultNotebook && setActiveTab('hasil')}
            disabled={!resultNotebook}
            style={{ padding: '4px 10px', background: activeTab === 'hasil' ? '#6366f1' : '#2a2a40', color: 'white', border: '1px solid #3a3a5a', borderRadius: 6, cursor: !resultNotebook ? 'not-allowed' : 'pointer', fontSize: 12, opacity: !resultNotebook ? 0.45 : 1 }}
            title={!resultNotebook ? 'Jalankan Semua dulu untuk mengisi Hasil' : 'Hasil eksekusi L1'}
          >
            Hasil
          </button>
          {!resultNotebook && <span style={{ color: '#64748b', fontSize: 10 }}>Hasil disabled</span>}
        </div>

        <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filePath.split('/').pop()} · {cells.length} sel</span>

        {/* gear popover for kernel bridge */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowKernelPop((v) => !v)}
            title="Kernel Bridge"
            style={{ padding: '5px 8px', background: '#2a2a40', color: '#a1a1b5', border: '1px solid #3a3a5a', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          >
            ⚙
          </button>
          {showKernelPop && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 10, zIndex: 12, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: '#f1f5f9' }}>
                <input
                  type="checkbox"
                  checked={kernelBridge}
                  onChange={(e) => toggleKernel((e.target as HTMLInputElement).checked)}
                />
                Kernel Bridge (experimental)
              </label>
              <div style={{ color: '#64748b', fontSize: 10, marginTop: 6 }}>Menyimpan ke localStorage `mux_kernel_bridge`.</div>
            </div>
          )}
        </div>
      </div>

      {/* main area: cell list virtualize-lite */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isWindowed && (
          <div style={{ padding: '4px 8px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, color: '#a5b4fc', fontSize: 11 }}>
            Virtualized: menampilkan {windowedIndices.length} dari {cells.length} sel (aktif #{activeIdx + 1})
          </div>
        )}

        {windowedIndices.map((idx) => {
          const cell = cells[idx];
          const isActive = idx === activeIdx;
          const isEditing = editingId === cell.id;
          const liveLines = cellLive[idx];
          // outputs to show: either live (L2) else persisted outputs
          const showLive = liveLines && liveLines.length > 0;
          return (
            <div
              key={cell.id}
              onClick={() => setActiveIdx(idx)}
              style={{
                background: isActive ? 'rgba(99,102,241,0.08)' : '#181825',
                border: `1px solid ${isActive ? '#6366f1' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: isActive ? '0 0 0 1px rgba(99,102,241,0.35)' : 'none',
              }}
            >
              {/* header badge + actions */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 8px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                <span style={{ padding: '2px 6px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: cell.type === 'code' ? '#1e40af' : cell.type === 'markdown' ? '#0f766e' : '#334155', color: 'white', textTransform: 'uppercase' }}>{cell.type}</span>
                <span style={{ color: '#64748b', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{shortId(cell.id)}</span>
                <span style={{ color: '#a1a1b5', fontSize: 10 }}>#{idx + 1}</span>
                <span style={{ flex: 1 }} />
                <button onClick={(e) => { e.stopPropagation(); handleRemove(cell.id, idx); }} style={{ padding: '3px 7px', background: '#3f1a1a', color: '#fecaca', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Hapus</button>
                <button onClick={(e) => { e.stopPropagation(); const at = idx + 1; updateDisplayed((nb) => addCell(nb, at, cell.type)); }} style={{ padding: '3px 7px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Sisip</button>
                <button onClick={(e) => { e.stopPropagation(); handleMove(idx, -1); }} disabled={idx === 0} style={{ padding: '3px 6px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: 11, opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                <button onClick={(e) => { e.stopPropagation(); handleMove(idx, 1); }} disabled={idx === cells.length - 1} style={{ padding: '3px 6px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, cursor: idx === cells.length - 1 ? 'not-allowed' : 'pointer', fontSize: 11, opacity: idx === cells.length - 1 ? 0.4 : 1 }}>↓</button>
                <select
                  value={cell.type}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleChangeType(cell.id, (e.target as HTMLSelectElement).value as CellType)}
                  style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, fontSize: 11, padding: '2px 4px' }}
                >
                  <option value="code">code</option>
                  <option value="markdown">markdown</option>
                  <option value="raw">raw</option>
                </select>
              </div>

              {/* body */}
              <div style={{ padding: '8px 10px' }}>
                {cell.type === 'markdown' ? (
                  isEditing ? (
                    <div>
                      <textarea
                        ref={editRef}
                        value={editValue}
                        onInput={(e) => {
                          const v = (e.target as HTMLTextAreaElement).value;
                          setEditValue(v);
                          const el = e.target as HTMLTextAreaElement;
                          el.style.height = 'auto';
                          el.style.height = `${Math.min(420, el.scrollHeight)}px`;
                        }}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        style={{ width: '98%', minHeight: 60, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={commitEdit} style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Simpan</button>
                        <button onClick={cancelEdit} style={{ padding: '4px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Batal</button>
                      </div>
                    </div>
                  ) : (
                    <div onDblClick={() => startEdit(cell)} title="Double-click untuk edit">
                      {cell.source.join('').trim() ? <MarkdownBlock source={cell.source.join('')} rootId={rootId} filePath={filePath} /> : <span style={{ color: '#475569', fontStyle: 'italic', fontSize: 12 }}>(kosong — double-click untuk edit)</span>}
                    </div>
                  )
                ) : cell.type === 'raw' ? (
                  isEditing ? (
                    <div>
                      <textarea
                        ref={editRef}
                        value={editValue}
                        onInput={(e) => { setEditValue((e.target as HTMLTextAreaElement).value); const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = `${Math.min(420, el.scrollHeight)}px`; }}
                        style={{ width: '98%', minHeight: 60, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={commitEdit} style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Simpan</button>
                        <button onClick={cancelEdit} style={{ padding: '4px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Batal</button>
                      </div>
                    </div>
                  ) : (
                    <pre onDblClick={() => startEdit(cell)} title="Double-click untuk edit" style={{ background: '#0f172a', color: '#cbd5e1', padding: '6px 8px', borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap', margin: 0, border: '1px solid rgba(255,255,255,0.06)', fontFamily: "'JetBrains Mono', monospace" }}>{cell.source.join('') || '(kosong — double-click untuk edit)'}</pre>
                  )
                ) : (
                  // code
                  <div>
                    {isEditing ? (
                      <div>
                        <textarea
                          ref={editRef}
                          value={editValue}
                          onInput={(e) => { setEditValue((e.target as HTMLTextAreaElement).value); const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = `${Math.min(420, el.scrollHeight)}px`; }}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          spellcheck={false}
                          style={{ width: '98%', minHeight: 60, background: '#0f172a', color: '#f1f5f9', border: '1px solid #6366f1', borderRadius: 6, padding: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button onClick={commitEdit} style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Simpan</button>
                          <button onClick={cancelEdit} style={{ padding: '4px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Batal</button>
                        </div>
                      </div>
                    ) : (
                      <pre
                        onDblClick={() => startEdit(cell)}
                        title="Double-click untuk edit"
                        style={{ background: '#0f172a', color: '#e2e8f0', padding: '8px 10px', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', margin: 0, border: '1px solid rgba(255,255,255,0.06)', fontFamily: "'JetBrains Mono', monospace", cursor: 'text' }}
                      >
                        {cell.source.join('') || <span style={{ color: '#475569' }}>(kosong — double-click untuk edit)</span>}
                      </pre>
                    )}

                    {/* outputs collapsed rendering */}
                    {showLive ? (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ color: '#7dd3fc', fontSize: 10, marginBottom: 2 }}>live stdout (L2):</div>
                        <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '6px 8px', borderRadius: 4, fontSize: 11, whiteSpace: 'pre-wrap', margin: 0, border: '1px solid rgba(125,211,252,0.25)', fontFamily: "'JetBrains Mono', monospace" }}>{liveLines.join('\n')}</pre>
                      </div>
                    ) : (
                      cell.outputs.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {cell.outputs.map((o, oi) => (
                            <OutputBox
                              key={oi}
                              kind={o.kind}
                              text={o.kind === 'stream' ? (o as { text: string }).text : undefined}
                              ename={o.kind === 'error' ? (o as { ename: string }).ename : undefined}
                              evalue={o.kind === 'error' ? (o as { evalue: string }).evalue : undefined}
                              traceback={o.kind === 'error' ? (o as { traceback: string[] }).traceback : undefined}
                              label={o.kind === 'rich' ? (o as { label: string }).label : undefined}
                              mime={o.kind === 'rich' ? (o as { mime: string }).mime : undefined}
                              sizeBytes={o.kind === 'big' ? (o as { sizeBytes: number }).sizeBytes : undefined}
                            />
                          ))}
                        </div>
                      )
                    )}
                    {cell.outputs.length === 0 && !showLive && (
                      <div style={{ color: '#475569', fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>— tanpa output —</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {cells.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8 }}>
            Notebook kosong — klik "+ Sel Baru" untuk menambah sel.
          </div>
        )}

        {isWindowed && cells.length > windowedIndices.length && (
          <div style={{ textAlign: 'center', color: '#475569', fontSize: 11 }}>{cells.length - windowedIndices.length} sel tersembunyi di luar jendela (geser aktif untuk melihat).</div>
        )}
      </div>

      {/* TODO: Kernel Bridge L3 wiring gelombang berikutnya — panel static only this wave */}
      {kernelBridge && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#181825', padding: '8px 10px' }}>
          <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 12, marginBottom: 4 }}>Kernel Console</div>
          <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, padding: '6px 8px', color: '#fde68a', fontSize: 11 }}>
            EXPERIMENTAL — tersedia di gelombang berikutnya
          </div>
        </div>
      )}
    </div>
  );
}
