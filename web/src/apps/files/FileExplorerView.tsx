import { useEffect, useState, useRef } from 'preact/hooks';

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  modified_ms: number;
}

interface DirectoryListing {
  root_id: string;
  path: string;
  entries: FileEntry[];
  total: number;
}

interface FileExplorerViewProps {
  onOpenFile?: (rootId: string, path: string) => void;
  onOpenTerminalHere?: (rootId: string, path: string) => void;
  onOpenInGit?: (rootId: string, path: string) => void;
}

type ViewMode = 'list' | 'grid' | 'details';
type SortBy = 'name' | 'size' | 'modified';

export function FileExplorerView({ onOpenFile, onOpenTerminalHere, onOpenInGit }: FileExplorerViewProps) {
  const [roots, setRoots] = useState<[string, string][]>([]);
  const [currentRoot, setCurrentRoot] = useState<string>('home');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [pathInput, setPathInput] = useState<string>('');
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('details');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>(['']);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [preview, setPreview] = useState<{ path: string; content: string; loading: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry | null } | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mux_favorites') || '[]'); } catch { return []; }
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/v1/fs/roots')
      .then((res) => res.json())
      .then((data: [string, string][]) => {
        setRoots(data);
        if (data.length > 0 && !data.find(([id]) => id === currentRoot)) {
          setCurrentRoot(data[0][0]);
        }
      })
      .catch((err) => setError('Failed to load roots: ' + err));
  }, []);

  useEffect(() => {
    if (!currentRoot) return;
    loadDirectory(currentRoot, currentPath);
    setPathInput(currentPath);
    setSelected(new Set());
    setPreview(null);
  }, [currentRoot, currentPath]);

  const loadDirectory = (root: string, path: string) => {
    setIsLoading(true);
    setError(null);
    fetch(`/api/v1/fs/entries?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        return res.json();
      })
      .then((data: DirectoryListing) => {
        setListing(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError('Failed to list: ' + err.message);
        setIsLoading(false);
      });
  };

  const navigateTo = (path: string) => {
    const newHistory = history.slice(0, historyIdx + 1);
    newHistory.push(path);
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
    setCurrentPath(path);
  };

  const goBack = () => { if (historyIdx > 0) { setCurrentPath(history[historyIdx - 1]); setHistoryIdx(historyIdx - 1); } };
  const goForward = () => { if (historyIdx < history.length - 1) { setCurrentPath(history[historyIdx + 1]); setHistoryIdx(historyIdx + 1); } };
  const goUp = () => {
    if (!currentPath || currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    navigateTo(parts.length ? '/' + parts.join('/') : '');
  };

  const handleSelect = (e: MouseEvent, entry: FileEntry) => {
    const ctrl = (e as any).ctrlKey || (e as any).metaKey;
    const shift = (e as any).shiftKey;
    if (ctrl) {
      const n = new Set(selected); if (n.has(entry.path)) n.delete(entry.path); else n.add(entry.path); setSelected(n);
    } else if (shift && listing) {
      // range select
      const idx = listing.entries.findIndex((x) => x.path === entry.path);
      const last = Array.from(selected).pop();
      const lastIdx = last ? listing.entries.findIndex((x) => x.path === last) : 0;
      const [a,b] = [Math.min(idx,lastIdx), Math.max(idx,lastIdx)];
      setSelected(new Set(listing.entries.slice(a,b+1).map((x)=>x.path)));
    } else {
      setSelected(new Set([entry.path]));
      if (!entry.is_dir) fetchPreview(entry);
    }
  };

  const fetchPreview = (entry: FileEntry) => {
    if (entry.is_dir || entry.size > 200*1024) { setPreview(null); return; }
    setPreview({ path: entry.path, content: 'Loading...', loading: true });
    fetch(`/api/v1/fs/file?root=${encodeURIComponent(currentRoot)}&path=${encodeURIComponent(entry.path)}`)
      .then((r) => r.text())
      .then((t) => setPreview({ path: entry.path, content: t.slice(0, 5000), loading: false }))
      .catch(() => setPreview(null));
  };

  const toggleFavorite = (path: string) => {
    const key = `${currentRoot}:${path}`;
    const next = favorites.includes(key) ? favorites.filter((f)=>f!==key) : [...favorites, key];
    setFavorites(next);
    localStorage.setItem('mux_favorites', JSON.stringify(next));
  };

  const filteredEntries = (() => {
    if (!listing) return [];
    let e = [...listing.entries];
    if (search.trim()) {
      const q = search.toLowerCase();
      e = e.filter((x)=> x.name.toLowerCase().includes(q));
    }
    e.sort((a,b)=>{
      if (sortBy==='name') return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      if (sortBy==='size') return sortAsc ? a.size-b.size : b.size-a.size;
      return sortAsc ? a.modified_ms-b.modified_ms : b.modified_ms-a.modified_ms;
    });
    // dirs first
    e.sort((a,b)=> (a.is_dir===b.is_dir?0:a.is_dir?-1:1));
    return e;
  })();

  const currentRootObj = roots.find(([id])=>id===currentRoot);
  const breadcrumb = ['', ...currentPath.split('/').filter(Boolean)];

  const handleContext = (e: MouseEvent, entry: FileEntry | null) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const createFile = async (isDir: boolean) => {
    const name = prompt(isDir ? 'New folder name:' : 'New file name:');
    if (!name) return;
    const target = currentPath ? `${currentPath}/${name}` : `/${name}`;
    // Use PUT to create empty file or mkdir via fs actions? For now create file via PUT
    if (isDir) {
      // Use mkdir via backend? Fallback create via POST /fs/actions? For MVP use mkdir via PUT of placeholder
      // For now use fetch to create dir via mkdir endpoint (we simulate via create folder API if exists, else fallback)
      // Simple: call PUT with empty dir? We'll use POST /api/v1/fs/actions if available, else just show msg
      try {
        const res = await fetch(`/api/v1/fs/file?root=${encodeURIComponent(currentRoot)}&path=${encodeURIComponent(target + '/.keep')}`, { method: 'PUT', body: '' });
        if (res.ok) loadDirectory(currentRoot, currentPath);
        else alert('Create failed: ' + await res.text());
      } catch (err:any) { alert(err.message); }
    } else {
      const res = await fetch(`/api/v1/fs/file?root=${encodeURIComponent(currentRoot)}&path=${encodeURIComponent(target)}`, { method: 'PUT', body: '' });
      if (res.ok) loadDirectory(currentRoot, currentPath);
    }
  };

  const doDelete = async (entry: FileEntry) => {
    if (!confirm(`Delete ${entry.name}?`)) return;
    // Try trash first, fallback to permanent? For now DELETE via fs/file? Use actions
    // Simulate delete via backend not yet implemented: just alert
    // For MVP, try DELETE /api/v1/fs/file? not exists -> use PUT with empty? We'll just call list reload
    alert('Delete (trash) not yet wired to backend — would move to trash: ' + entry.path);
  };

  return (
    <div ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%', background: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif' }} onClick={()=>setContextMenu(null)}>
      {/* Navigation Pane - Windows style */}
      <div style={{ width: '220px', background: '#0c1222', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>QUICK ACCESS</div>
        <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div onClick={()=> navigateTo('')} style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', background: currentPath===''?'#1e293b':'transparent', display: 'flex', gap: '8px' }}><span>🏠</span> Home</div>
          <div onClick={()=> setSearch('')} style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', gap: '8px' }}><span>⭐</span> Favorites ({favorites.length})</div>
          {favorites.map((f)=> {
            const [r,p] = f.split(':');
            return <div key={f} onClick={()=>{ setCurrentRoot(r); navigateTo(p); }} style={{ padding: '4px 8px 4px 28px', fontSize: '12px', cursor: 'pointer', color: '#38bdf8' }}>{p.split('/').pop() || p}</div>;
          })}
        </div>
        <div style={{ padding: '12px 12px 4px', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>THIS PC</div>
        <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {roots.map(([id, path])=> (
            <div key={id} onClick={()=>{ setCurrentRoot(id); navigateTo(''); }} style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', background: currentRoot===id?'#1e293b':'transparent', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span>{id==='home'?'🏡':'💾'}</span><div style={{ flex:1, overflow: 'hidden' }}><div style={{ fontSize: '13px' }}>{id.toUpperCase()}</div><div style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }}>{path}</div></div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: '#64748b' }}>
          {listing ? `${listing.total} items` : '—'} • Trash: — 
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Ribbon / Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
          <button onClick={goBack} disabled={historyIdx<=0} style={{ padding: '4px 8px', background: historyIdx<=0?'#334155':'#3b82f6', color: 'white', borderRadius: '4px', opacity: historyIdx<=0?0.5:1 }}>←</button>
          <button onClick={goForward} disabled={historyIdx>=history.length-1} style={{ padding: '4px 8px', background: historyIdx>=history.length-1?'#334155':'#3b82f6', color: 'white', borderRadius: '4px', opacity: historyIdx>=history.length-1?0.5:1 }}>→</button>
          <button onClick={goUp} style={{ padding: '4px 8px', background: '#334155', color: 'white', borderRadius: '4px' }}>↑</button>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
          <button onClick={()=>createFile(false)} style={{ padding: '4px 8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', borderRadius: '4px', fontSize: '12px' }}>📄 New File</button>
          <button onClick={()=>createFile(true)} style={{ padding: '4px 8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', borderRadius: '4px', fontSize: '12px' }}>📁 New Folder</button>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button onClick={()=>setViewMode('list')} style={{ padding: '4px 6px', background: viewMode==='list'?'#3b82f6':'#334155', color: 'white', borderRadius: '4px', fontSize: '12px' }}>☰</button>
            <button onClick={()=>setViewMode('grid')} style={{ padding: '4px 6px', background: viewMode==='grid'?'#3b82f6':'#334155', color: 'white', borderRadius: '4px', fontSize: '12px' }}>⊞</button>
            <button onClick={()=>setViewMode('details')} style={{ padding: '4px 6px', background: viewMode==='details'?'#3b82f6':'#334155', color: 'white', borderRadius: '4px', fontSize: '12px' }}>≡</button>
          </div>
          <input value={search} onInput={(e)=>setSearch((e.target as HTMLInputElement).value)} placeholder="Search…" style={{ padding: '6px 8px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px', width: '160px' }} />
        </div>

        {/* Address Bar - Windows breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px', background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '12px' }}>
          <span style={{ color: '#94a3b8' }}>{currentRootObj ? `${currentRootObj[1]}` : ''}</span>
          <span style={{ color: '#475569' }}>›</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap' }}>
            {breadcrumb.map((seg,i)=> (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                <span onClick={()=> navigateTo('/' + breadcrumb.slice(1,i+1).join('/'))} style={{ padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', background: i===breadcrumb.length-1?'#1e293b':'transparent', color: i===breadcrumb.length-1?'#38bdf8':'#e2e8f0' }}>{seg===''?'Root':seg}</span>
                {i < breadcrumb.length-1 && <span style={{ color: '#475569' }}>›</span>}
              </span>
            ))}
          </div>
          <input value={pathInput} onInput={(e)=>setPathInput((e.target as HTMLInputElement).value)} onKeyDown={(e)=> e.key==='Enter' && navigateTo(pathInput.trim()||'')} placeholder="/path" style={{ marginLeft: '8px', flex: 1, padding: '4px 6px', background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '3px', fontSize: '11px' }} />
          <button onClick={()=>navigateTo(pathInput.trim()||'')} style={{ padding: '4px 8px', background: '#3b82f6', color: 'white', borderRadius: '3px', fontSize: '11px' }}>Go</button>
          {onOpenTerminalHere && <button onClick={()=>onOpenTerminalHere(currentRoot, currentPath)} style={{ padding: '4px 8px', background: '#6366f1', color: 'white', borderRadius: '3px', fontSize: '11px' }}>Terminal Here</button>}
        </div>

        {/* Content split: list + preview */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', background: '#0f172a' }} onContextMenu={(e)=>handleContext(e, null)}>
            {error && <div style={{ color: '#ef4444', padding: '12px' }}>{error}</div>}
            {isLoading ? <div style={{ padding: '12px', color: '#94a3b8' }}>Loading...</div> : (
              viewMode==='grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: '8px', padding: '12px' }}>
                  {filteredEntries.map((entry)=> (
                    <div key={entry.path} onClick={(e)=>{ if(entry.is_dir) navigateTo(entry.path); else { handleSelect(e as any, entry); if(onOpenFile) onOpenFile(currentRoot, entry.path); } }} onContextMenu={(e)=>handleContext(e, entry)} onDblClick={()=>{ if(!entry.is_dir && onOpenFile) onOpenFile(currentRoot, entry.path); }} style={{ padding: '12px', borderRadius: '6px', background: selected.has(entry.path)?'#1e293b':'transparent', border: selected.has(entry.path)?'1px solid #3b82f6':'1px solid transparent', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px' }}>{entry.is_dir ? '📁' : entry.name.endsWith('.zip')?'🗜️':entry.name.match(/\.(png|jpg|jpeg|gif|svg)$/)?'🖼️':'📄'}</div>
                      <div style={{ fontSize: '11px', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>{entry.is_dir?'—':`${(entry.size/1024).toFixed(1)} KB`}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 1 }}>
                    <tr style={{ textAlign: 'left', color: '#94a3b8' }}>
                      <th onClick={()=>{ if(sortBy==='name'){setSortAsc(!sortAsc);} else {setSortBy('name'); setSortAsc(true);} }} style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #334155' }}>Name {sortBy==='name'?(sortAsc?'▲':'▼'):''}</th>
                      {viewMode==='details' && <>
                        <th onClick={()=>{ if(sortBy==='size'){setSortAsc(!sortAsc);} else {setSortBy('size'); setSortAsc(false);} }} style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #334155' }}>Size {sortBy==='size'?(sortAsc?'▲':'▼'):''}</th>
                        <th onClick={()=>{ if(sortBy==='modified'){setSortAsc(!sortAsc);} else {setSortBy('modified'); setSortAsc(false);} }} style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #334155' }}>Modified</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {currentPath && (
                      <tr onClick={goUp} style={{ cursor: 'pointer', background: 'rgba(99,102,241,0.08)' }} onContextMenu={(e)=>handleContext(e, null)}>
                        <td style={{ padding: '8px', color: '#6366f1' }}>📁 ..</td>
                        {viewMode==='details' && <><td style={{ padding: '8px' }}>—</td><td style={{ padding: '8px' }}>—</td></>}
                      </tr>
                    )}
                    {filteredEntries.map((entry)=> (
                      <tr key={entry.path} onClick={(e)=>{ handleSelect(e as any, entry); if(entry.is_dir) navigateTo(entry.path); }} onDblClick={()=>{ if(!entry.is_dir && onOpenFile) onOpenFile(currentRoot, entry.path); }} onContextMenu={(e)=>handleContext(e, entry)} style={{ cursor: 'pointer', background: selected.has(entry.path)?'#1e293b':'transparent', borderLeft: selected.has(entry.path)?'2px solid #3b82f6':'2px solid transparent' }}>
                        <td style={{ padding: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span>{entry.is_dir ? '📁' : entry.is_symlink?'🔗📄': entry.name.endsWith('.zip')?'🗜️':'📄'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                          {selected.has(entry.path) && <span style={{ marginLeft: 'auto', color: '#3b82f6' }}>✓</span>}
                        </td>
                        {viewMode==='details' && (
                          <>
                            <td style={{ padding: '8px', color: '#94a3b8' }}>{entry.is_dir?'—':`${(entry.size/1024).toFixed(1)} KB`}</td>
                            <td style={{ padding: '8px', color: '#64748b', fontSize: '12px' }}>{new Date(entry.modified_ms).toLocaleString()}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* Preview Pane - Windows preview */}
          {preview && (
            <div style={{ width: '320px', borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#0c1222', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '12px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                <span>Preview: {preview.path.split('/').pop()}</span>
                <span onClick={()=>setPreview(null)} style={{ cursor: 'pointer' }}>✕</span>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
                {preview.loading ? <div style={{ color: '#94a3b8' }}>Loading...</div> : (
                  preview.content.startsWith('\x89PNG') || preview.content.includes('�PNG') ?
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>[Binary preview not available]</div> :
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px', fontFamily: 'monospace', background: '#0f172a', padding: '8px', borderRadius: '4px' }}>{preview.content}</pre>
                )}
              </div>
              <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '6px' }}>
                <button onClick={()=> onOpenFile && preview && onOpenFile(currentRoot, preview.path)} style={{ flex:1, padding: '6px', background: '#3b82f6', color: 'white', borderRadius: '4px', fontSize: '12px' }}>Open</button>
                <button onClick={()=> preview && toggleFavorite(preview.path)} style={{ padding: '6px 8px', background: '#334155', color: 'white', borderRadius: '4px', fontSize: '12px' }}>{favorites.includes(`${currentRoot}:${preview?.path}`)?'★':'☆'}</button>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar - Windows */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: '#1e293b', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '11px', color: '#94a3b8' }}>
          <span>{filteredEntries.length} items {selected.size?`• ${selected.size} selected`:''} {search?`• filtered "${search}"`:''}</span>
          <span>{currentRootObj ? `${currentRootObj[1]}${currentPath}` : ''} • {viewMode}</span>
        </div>

        {/* Context Menu - Windows */}
        {contextMenu && (
          <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 9999, minWidth: '200px', padding: '4px 0', fontSize: '13px' }} onClick={()=>setContextMenu(null)}>
            {contextMenu.entry ? (
              <>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ if(contextMenu.entry && !contextMenu.entry.is_dir && onOpenFile) onOpenFile(currentRoot, contextMenu.entry.path); }}>📄 Open</div>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ if(contextMenu.entry) fetchPreview(contextMenu.entry); }}>👁️ Preview</div>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ const e=contextMenu.entry; if(!e) return; onOpenTerminalHere && onOpenTerminalHere(currentRoot, e.is_dir ? e.path : currentPath); }}>💻 Open in Terminal</div>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ const e=contextMenu.entry; if(!e) return; onOpenInGit && onOpenInGit(currentRoot, e.is_dir ? e.path : currentPath); }}>🔧 Open in Git</div>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ const e=contextMenu.entry; if(!e) return; alert('Open in Browser: ' + e.path); }}>🌐 Open in Browser</div>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ const e=contextMenu.entry; if(!e) return; toggleFavorite(e.path); }}>{(() => { const e=contextMenu.entry; if(!e) return ''; return favorites.includes(`${currentRoot}:${e.path}`)?'★ Unpin from Quick Access':'☆ Pin to Quick Access'; })()}</div>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ const e=contextMenu.entry; if(!e) return; const n=prompt('Rename to:', e.name); if(n) alert('Rename to '+n+' (API wiring next)'); }}>✏️ Rename (F2)</div>
                <div style={{ padding: '6px 12px', cursor: 'pointer', color: '#f87171' }} onClick={()=>{ const e=contextMenu.entry; if(e) doDelete(e); }}>🗑️ Delete</div>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ const e=contextMenu.entry; if(!e) return; alert('Properties: '+JSON.stringify(e,null,2)); }}>ℹ️ Properties</div>
                {contextMenu.entry && contextMenu.entry.name.endsWith('.zip') && <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ const e=contextMenu.entry; if(!e) return; alert('Inspect Archive: '+e.path); }}>🗜️ Inspect Archive</div>}
              </>
            ) : (
              <>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>createFile(false)}>📄 New File</div>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>createFile(true)}>📁 New Folder</div>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>loadDirectory(currentRoot, currentPath)}>🔄 Refresh</div>
                <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=> onOpenTerminalHere && onOpenTerminalHere(currentRoot, currentPath)}>💻 Open Terminal Here</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
