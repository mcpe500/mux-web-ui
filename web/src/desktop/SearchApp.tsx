import { useState, useEffect, useMemo } from 'preact/hooks';

interface SearchAppProps {
  open: boolean;
  onClose: () => void;
  onOpenApp: (appId: string, props?: any) => void;
}

const SEARCHABLE = [
  { id: 'terminal', name: 'Terminal', icon: '💻', keywords: 'cmd shell bash terminal', appId: 'terminal' },
  { id: 'files', name: 'File Explorer', icon: '📁', name2: 'Explorer', keywords: 'file explorer folder files', appId: 'files' },
  { id: 'editor', name: 'Notepad', icon: '📝', keywords: 'notepad editor text vscode code', appId: 'editor' },
  { id: 'browser', name: 'Browser', icon: '🌐', keywords: 'browser edge chrome web', appId: 'browser' },
  { id: 'git', name: 'Git', icon: '🔧', keywords: 'git version control', appId: 'git' },
  { id: 'packages', name: 'Store', icon: '📦', keywords: 'store packages apt', appId: 'packages' },
  { id: 'share', name: 'Share', icon: '🔗', keywords: 'share link', appId: 'share' },
  { id: 'monitor', name: 'Task Manager', icon: '📊', keywords: 'monitor task manager', appId: 'monitor' },
];

export function SearchApp({ open, onClose, onOpenApp }: SearchAppProps) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const results = useMemo(() => {
    if (!q.trim()) return SEARCHABLE.slice(0, 5);
    const lq = q.toLowerCase();
    return SEARCHABLE.filter((s) => `${s.name} ${s.keywords}`.toLowerCase().includes(lq)).slice(0, 6);
  }, [q]);

  useEffect(() => { if (open) setTimeout(() => document.getElementById('search-input')?.focus(), 50); }, [open]);
  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;

  const choose = (item: typeof SEARCHABLE[number]) => {
    onOpenApp(item.appId);
    onClose();
    setQ('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 100000, display: 'flex', justifyContent: 'center', paddingTop: '20vh' }} onClick={onClose}>
      <div style={{ width: '640px', maxWidth: '92vw', background: 'rgba(32,32,32,0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', overflow: 'hidden', height: 'fit-content' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: '18px', color: '#94a3b8' }}>🔍</span>
          <input
            id="search-input"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter' && results[sel]) choose(results[sel]);
              else if (e.key === 'Escape') onClose();
            }}
            placeholder="Search apps, files, settings…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: '15px' }}
          />
          <span style={{ fontSize: '11px', color: '#94a3b8', border: '1px solid #334155', padding: '2px 6px', borderRadius: '4px' }}>ESC</span>
        </div>

        <div style={{ padding: '8px' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', padding: '6px 8px', fontWeight: 600, letterSpacing: '0.5px' }}>{q ? `RESULTS FOR “${q}”` : 'TOP APPS'}</div>
          {results.map((r, i) => (
            <div
              key={r.id}
              onClick={() => choose(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                background: i === sel ? 'rgba(99,102,241,0.2)' : 'transparent',
                border: i === sel ? '1px solid #6366f1' : '1px solid transparent',
                borderRadius: '8px', cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: '22px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: '13px', color: '#f1f5f9', fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{r.keywords}</div>
              </div>
              {i === sel && <span style={{ marginLeft: 'auto', color: '#6366f1' }}>↵</span>}
            </div>
          ))}
          {results.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>No results for “{q}”</div>}
        </div>

        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '12px', fontSize: '11px', color: '#94a3b8' }}>
          <span>↑↓ Navigate</span><span>↵ Open</span><span>ESC Close</span><span style={{ marginLeft: 'auto' }}>Mux Search</span>
        </div>
      </div>
    </div>
  );
}
