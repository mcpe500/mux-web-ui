import { useState } from 'preact/hooks';

interface ToolbarProps {
  onOpenApp: (appId: string) => void;
  onSearch: (query: string) => void;
  onToggleStart: () => void;
  startOpen: boolean;
  timeStr: string;
}

export function Toolbar({ onOpenApp, onSearch, onToggleStart, startOpen, timeStr }: ToolbarProps) {
  const [query, setQuery] = useState('');

  return (
    <div className="taskbar" style={{ justifyContent: 'space-between', padding: '0 12px', height: '48px', background: 'rgba(32,32,32,0.85)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Left - Widgets */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
        <div style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '12px', color: '#f1f5f9' }}>
          🌤️ 24°C
        </div>
      </div>

      {/* Center - Start + Pinned + Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={(e)=> { (e as any).stopPropagation(); onToggleStart(); }}
          title="Start"
          style={{
            width: '44px', height: '32px', borderRadius: '6px',
            background: startOpen ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)',
            border: startOpen ? '1px solid #6366f1' : '1px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
            transition: 'all 0.15s'
          }}
        >
          ⊞
        </button>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '4px 12px', border: '1px solid rgba(255,255,255,0.12)', minWidth: '220px' }}>
          <span style={{ color: '#94a3b8' }}>🔍</span>
          <input
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) { onSearch(query.trim()); setQuery(''); } }}
            onFocus={() => onSearch('')}
            placeholder="Search apps, files, settings"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: '13px' }}
          />
          {query && <span onClick={() => setQuery('')} style={{ cursor: 'pointer', color: '#94a3b8' }}>✕</span>}
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Pinned apps - Windows 11 style */}
        {[
          { id: 'files', icon: '📁', label: 'Explorer' },
          { id: 'editor', icon: '📝', label: 'Notepad' },
          { id: 'terminal', icon: '💻', label: 'Terminal' },
          { id: 'browser', icon: '🌐', label: 'Edge' },
          { id: 'git', icon: '🔧', label: 'Git' },
          { id: 'packages', icon: '📦', label: 'Store' },
        ].map((app) => (
          <button
            key={app.id}
            onClick={() => onOpenApp(app.id)}
            title={app.label}
            style={{
              width: '44px', height: '32px', borderRadius: '6px',
              background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', transition: 'background 0.15s', border: '1px solid transparent'
            }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            {app.icon}
          </button>
        ))}
      </div>

      {/* Right - System Tray */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px' }}>
          <span style={{ fontSize: '12px' }}>🔊</span>
          <span style={{ fontSize: '12px' }}>📶</span>
          <span style={{ fontSize: '12px' }}>🔋</span>
        </div>
        <div style={{ textAlign: 'right', lineHeight: '1.1' }}>
          <div style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 500 }}>{timeStr.split(' ')[0]}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{timeStr.split(' ').slice(1).join(' ')}</div>
        </div>
      </div>
    </div>
  );
}
