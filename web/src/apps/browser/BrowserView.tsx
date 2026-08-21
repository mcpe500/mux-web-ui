import { useState, useEffect } from 'preact/hooks';

interface Tab {
  id: string;
  url: string;
  title: string;
  input: string;
}

export function BrowserView() {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try { return JSON.parse(localStorage.getItem('mux_browser_tabs') || 'null') || [{ id: '1', url: 'https://example.com', title: 'Example', input: 'https://example.com' }]; } catch { return [{ id: '1', url: 'https://example.com', title: 'Example', input: 'https://example.com' }]; }
  });
  const [active, setActive] = useState<string>(tabs[0]?.id || '1');
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mux_bookmarks') || '[]'); } catch { return []; }
  });
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mux_history') || '[]'); } catch { return []; }
  });

  const activeTab = tabs.find((t)=> t.id===active) || tabs[0];
  useEffect(()=> { localStorage.setItem('mux_browser_tabs', JSON.stringify(tabs)); }, [tabs]);
  useEffect(()=> { localStorage.setItem('mux_bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(()=> { localStorage.setItem('mux_history', JSON.stringify(history.slice(-100))); }, [history]);

  const navigate = (id: string, url: string) => {
    let u = url.trim();
    if (!u) return;
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
    setTabs(prev=> prev.map(t=> t.id===id ? { ...t, url: u, input: u, title: new URL(u).hostname } : t));
    setHistory(prev=> [...prev, u]);
  };
  const addTab = () => {
    const id = Date.now().toString();
    setTabs(prev=> [...prev, { id, url: 'https://example.com', title: 'New Tab', input: 'https://example.com' }]);
    setActive(id);
  };
  const closeTab = (id: string, e: Event) => {
    e.stopPropagation();
    const next = tabs.filter(t=> t.id!==id);
    if (next.length===0) {
      const nid = Date.now().toString();
      setTabs([{ id: nid, url: 'https://example.com', title: 'New Tab', input: 'https://example.com' }]);
      setActive(nid);
    } else {
      setTabs(next);
      if (active===id) setActive(next[0].id);
    }
  };
  const toggleBookmark = (url: string) => {
    setBookmarks(prev=> prev.includes(url) ? prev.filter(u=>u!==url) : [...prev, url]);
  };

  if (!activeTab) return <div style={{ padding: '12px' }}>No tab</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0f172a' }}>
      {/* Preview banner - will do later */}
      <div style={{ padding: '4px 8px', background: 'rgba(245,158,11,0.15)', borderBottom: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', fontSize: '11px', textAlign: 'center' }}>
        🌐 Browser Preview — Basic browsing works, full features (downloads, extensions) will do later
      </div>
      {/* Tab bar */}
      <div style={{ display: 'flex', background: '#1e293b', borderBottom: '1px solid #334155', overflowX: 'auto' }}>
        {tabs.map((t)=> (
          <div key={t.id} onClick={()=> setActive(t.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: active===t.id?'#0f172a':'transparent', borderTop: active===t.id?'2px solid #3b82f6':'2px solid transparent', cursor: 'pointer', color: active===t.id?'#f1f5f9':'#94a3b8', fontSize: '12px', minWidth: '120px', maxWidth: '180px', borderRight: '1px solid #334155' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>🌐 {t.title}</span>
            <span onClick={(e)=> closeTab(t.id, e)} style={{ padding: '2px 4px' }}>✕</span>
          </div>
        ))}
        <button onClick={addTab} style={{ padding: '6px 12px', background: '#334155', color: 'white', fontSize: '12px' }}>+ New Tab</button>
      </div>
      {/* Navigation */}
      <div style={{ display: 'flex', gap: '6px', padding: '6px 8px', background: '#0f172a', borderBottom: '1px solid #334155', alignItems: 'center' }}>
        <button onClick={()=> { const iframe = document.getElementById(`browser-${active}`) as HTMLIFrameElement; try { iframe.contentWindow?.history.back(); } catch {} }} style={{ padding: '6px 8px', background: '#1e293b', color: 'white', borderRadius: '4px' }}>←</button>
        <button onClick={()=> { const iframe = document.getElementById(`browser-${active}`) as HTMLIFrameElement; try { iframe.contentWindow?.history.forward(); } catch {} }} style={{ padding: '6px 8px', background: '#1e293b', color: 'white', borderRadius: '4px' }}>→</button>
        <button onClick={()=> { const iframe = document.getElementById(`browser-${active}`) as HTMLIFrameElement; if(iframe) iframe.src = activeTab.url; }} style={{ padding: '6px 8px', background: '#1e293b', color: 'white', borderRadius: '4px' }}>↻</button>
        <input value={activeTab.input} onInput={(e)=> setTabs(prev=> prev.map(t=> t.id===active ? { ...t, input: (e.target as HTMLInputElement).value } : t))} onKeyDown={(e)=> e.key==='Enter' && navigate(active, activeTab.input)} style={{ flex: 1, padding: '6px 8px', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '16px', fontSize: '13px' }} placeholder="Search or enter URL" />
        <button onClick={()=> navigate(active, activeTab.input)} style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', borderRadius: '4px' }}>Go</button>
        <button onClick={()=> toggleBookmark(activeTab.url)} style={{ padding: '6px 8px', background: bookmarks.includes(activeTab.url)?'#f59e0b':'#334155', color: 'white', borderRadius: '4px' }}>{bookmarks.includes(activeTab.url)?'★':'☆'}</button>
      </div>
      {/* Bookmarks bar */}
      {bookmarks.length>0 && (
        <div style={{ display: 'flex', gap: '6px', padding: '4px 8px', background: '#1e293b', borderBottom: '1px solid #334155', overflowX: 'auto', fontSize: '12px' }}>
          {bookmarks.map((b)=> (
            <span key={b} onClick={()=> navigate(active, b)} style={{ padding: '2px 8px', background: '#0f172a', borderRadius: '12px', cursor: 'pointer', color: '#38bdf8', border: '1px solid #334155', whiteSpace: 'nowrap' }}>{new URL(b).hostname}</span>
          ))}
        </div>
      )}
      {/* Iframe */}
      <div style={{ flex: 1, background: 'white', overflow: 'hidden', position: 'relative' }}>
        <iframe id={`browser-${active}`} src={activeTab.url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style={{ width: '100%', height: '100%', border: 'none', background: 'white' }} title={activeTab.title} />
        <div style={{ position: 'absolute', bottom: '4px', right: '8px', background: 'rgba(15,23,42,0.9)', color: '#94a3b8', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>
          {history.length} history • sandbox
        </div>
      </div>
    </div>
  );
}
