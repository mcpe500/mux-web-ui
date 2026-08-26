import { useState, useMemo } from 'preact/hooks';

interface StartMenuProps {
  open: boolean;
  onClose: () => void;
  onOpenApp: (appId: string) => void;
  onSearchApp?: (query: string) => void;
}

const APPS = [
  { id: 'terminal', icon: '💻', name: 'Terminal', desc: 'Mux Terminal' },
  { id: 'files', icon: '📁', name: 'File Explorer', desc: 'Browse files' },
  { id: 'editor', icon: '📝', name: 'Notepad', desc: 'Text editor' },
  { id: 'browser', icon: '🌐', name: 'Edge', desc: 'Web browser' },
  { id: 'git', icon: '🔧', name: 'Git', desc: 'Version control' },
  { id: 'packages', icon: '📦', name: 'Store', desc: 'Package Center' },
  { id: 'share', icon: '🔗', name: 'Share', desc: 'Share links' },
  { id: 'monitor', icon: '📊', name: 'Task Manager', desc: 'System monitor' },
  { id: 'support', icon: '🛟', name: 'Support', desc: 'Support Hub & panduan' },
];

export function StartMenu({ open, onClose, onOpenApp }: StartMenuProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    if (!query.trim()) return APPS;
    const q = query.toLowerCase();
    return APPS.filter((a) => a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q) || a.id.includes(q));
  }, [query]);

  if (!open) return null;

  return (
    <div style={{ position: 'absolute', bottom: '56px', left: '50%', transform: 'translateX(-50%)', width: '640px', maxWidth: '92vw', background: 'rgba(32,32,32,0.96)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', zIndex: 99999, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
      {/* Search inside Start */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '10px 14px', border: '1px solid rgba(255,255,255,0.12)' }}>
          <span>🔍</span>
          <input
            autoFocus
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder="Search for apps, settings, and documents"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: '14px' }}
          />
          <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Ctrl K</span>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>Pinned</span>
          <span style={{ fontSize: '12px', color: '#94a3b8', padding: '4px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer' }}>All apps ›</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
          {filtered.map((app) => (
            <button
              key={app.id}
              onClick={() => { onOpenApp(app.id); onClose(); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '12px 6px', borderRadius: '8px', background: 'transparent', color: '#f1f5f9', transition: 'background 0.15s', border: '1px solid transparent' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <span style={{ fontSize: '28px' }}>{app.icon}</span>
              <span style={{ fontSize: '12px', textAlign: 'center', lineHeight: '1.2' }}>{app.name}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>No apps found for “{query}”</div>}

        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>Recommended</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center', padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
              <span>📄</span><div><div style={{ fontSize: '12px', color: '#f1f5f9' }}>Getting Started</div><div style={{ fontSize: '11px', color: '#94a3b8' }}>Welcome to Mux</div></div>
            </div>
            <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center', padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
              <span>⚡</span><div><div style={{ fontSize: '12px', color: '#f1f5f9' }}>Terminal</div><div style={{ fontSize: '11px', color: '#94a3b8' }}>Powerful shell</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom user */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.04)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '16px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>U</div>
          <span style={{ fontSize: '13px', color: '#f1f5f9' }}>User</span>
        </div>
        <span style={{ fontSize: '18px', cursor: 'pointer' }} title="Power">⏻</span>
      </div>
    </div>
  );
}
