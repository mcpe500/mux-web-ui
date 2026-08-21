import { useEffect, useState } from 'preact/hooks';
import { breadcrumbSegments, withSelectability } from './pickerLogic';

export interface PickerSel {
  rootId: string;
  path: string;
}

interface FolderPickerProps {
  mode: 'folder' | 'file';
  initial?: PickerSel;
  onSelect: (sel: PickerSel) => void;
  onClose: () => void;
}

interface PickerRow {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  selectable: boolean;
}

// EDT-006 — VS Code-like Open File / Open Folder modal.
// Depth-1 lazy listing per navigation (spec §7 no-lag budget); every path
// traversal stays behind GET /fs/entries so the backend AllowedRoots sandbox
// is the only authority.
export function FolderPicker({ mode, initial, onSelect, onClose }: FolderPickerProps) {
  const [roots, setRoots] = useState<Array<{ id: string; path: string }>>([]);
  const [rootId, setRootId] = useState<string>(initial?.rootId || 'home');
  const [path, setPath] = useState<string>(initial?.path || '/');
  const [rows, setRows] = useState<PickerRow[]>([]);
  const [selPath, setSelPath] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/fs/roots')
      .then((r) => r.json())
      .then((data: Array<[string, string]>) =>
        setRoots(data.map(([id, p]) => ({ id, path: p }))),
      )
      .catch(() => setError('Failed to load roots'));
  }, []);

  // Depth-1 per navigation — one fetch per folder entered (EDT-006 lazy).
  useEffect(() => {
    let alive = true;
    setError(null);
    fetch(
      `/api/v1/fs/entries?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(path)}`,
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!alive) return;
        setRows(withSelectability(data.entries || [], mode));
      })
      .catch(() => {
        if (alive) {
          setRows([]);
          setError('Cannot open folder');
        }
      });
    return () => {
      alive = false;
    };
  }, [rootId, path, mode]);

  const crumbs = breadcrumbSegments(path);
  const sorted = [...rows].sort((a, b) =>
    a.is_dir === b.is_dir ? a.name.localeCompare(b.name) : a.is_dir ? -1 : 1,
  );

  const selectCurrentFolder = () => onSelect({ rootId, path });

  const confirmSelection = () => {
    if (mode === 'folder') {
      selectCurrentFolder();
      return;
    }
    if (selPath) onSelect({ rootId, path: selPath });
  };

  const openManual = () => {
    const p = manual.trim();
    if (!p) return;
    const norm = p.startsWith('/') ? p : `/${p}`;
    setPath(norm);
    setSelPath(null);
  };

  return (
    <div
      data-testid="folder-picker-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,6,23,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        data-testid="folder-picker"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '560px',
          maxWidth: '92vw',
          height: '420px',
          maxHeight: '80vh',
          background: '#0c1222',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '12px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          {mode === 'folder' ? '📁 Open Folder' : '📄 Open File'}
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Roots sidebar */}
          <div
            style={{
              width: '140px',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Locations
            </div>
            {roots.map((r) => (
              <div
                key={r.id}
                onClick={() => {
                  setRootId(r.id);
                  setPath('/');
                  setSelPath(null);
                }}
                title={r.path}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  background: r.id === rootId ? 'rgba(99,102,241,0.25)' : 'transparent',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.id.toUpperCase()}
              </div>
            ))}
          </div>

          {/* Listing + breadcrumb */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                padding: '6px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontSize: '12px',
                color: '#cbd5e1',
                flexWrap: 'wrap',
              }}
            >
              {crumbs.map((c, i) => (
                <span key={c.path} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                  {i > 0 && <span style={{ color: '#475569' }}>›</span>}
                  <span
                    onClick={() => {
                      setPath(c.path);
                      setSelPath(null);
                    }}
                    style={{ cursor: 'pointer', color: i === crumbs.length - 1 ? '#f8fafc' : '#818cf8' }}
                  >
                    {c.label === '/' ? '⌂' : c.label}
                  </span>
                </span>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
              {error && (
                <div style={{ padding: '12px', color: '#fca5a5', fontSize: '12px' }}>⚠️ {error}</div>
              )}
              {!error && sorted.length === 0 && (
                <div style={{ padding: '12px', color: '#64748b', fontSize: '12px' }}>(empty)</div>
              )}
              {sorted.map((row) => (
                <div
                  key={row.path}
                  title={row.path}
                  onClick={() => {
                    if (row.selectable) setSelPath(row.path);
                    else if (row.is_dir) {
                      setPath(row.path);
                      setSelPath(null);
                    }
                  }}
                  onDblClick={() => {
                    if (row.is_dir) {
                      setPath(row.path);
                      setSelPath(null);
                    } else if (mode === 'file') {
                      onSelect({ rootId, path: row.path });
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    cursor: row.selectable ? 'pointer' : row.is_dir ? 'pointer' : 'default',
                    fontSize: '13px',
                    opacity: row.selectable || row.is_dir ? 1 : 0.45,
                    background:
                      selPath === row.path ? 'rgba(99,102,241,0.35)' : 'transparent',
                  }}
                >
                  <span>{row.is_dir ? '📁' : '📄'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '10px 14px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            alignItems: 'center',
          }}
        >
          <input
            value={manual}
            onInput={(e) => setManual((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && openManual()}
            placeholder="/path/inside/root"
            style={{
              flex: 1,
              padding: '6px 8px',
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '12px',
            }}
          />
          <button
            onClick={openManual}
            style={{
              padding: '6px 10px',
              background: '#334155',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Go
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 10px',
              background: '#334155',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={confirmSelection}
            disabled={mode === 'file' && !selPath}
            style={{
              padding: '6px 12px',
              background: mode === 'file' && !selPath ? '#1e293b' : '#6366f1',
              color: mode === 'file' && !selPath ? '#64748b' : '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: mode === 'file' && !selPath ? 'default' : 'pointer',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            {mode === 'folder' ? 'Select Folder' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  );
}
