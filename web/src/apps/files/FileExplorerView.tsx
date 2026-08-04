import { useEffect, useState } from 'preact/hooks';

interface FileEntry {
  name: String;
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
}

export function FileExplorerView({ onOpenFile, onOpenTerminalHere }: FileExplorerViewProps) {
  const [roots, setRoots] = useState<[string, string][]>([]);
  const [currentRoot, setCurrentRoot] = useState<string>('home');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/fs/roots')
      .then((res) => res.json())
      .then((data: [string, string][]) => {
        setRoots(data);
        if (data.length > 0) {
          setCurrentRoot(data[0][0]);
        }
      })
      .catch((err) => setError('Failed to load storage roots: ' + err));
  }, []);

  useEffect(() => {
    if (!currentRoot) return;
    loadDirectory(currentRoot, currentPath);
  }, [currentRoot, currentPath]);

  const loadDirectory = (root: string, path: string) => {
    setIsLoading(true);
    setError(null);
    const url = `/api/v1/fs/entries?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: DirectoryListing) => {
        setListing(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError('Failed to list files: ' + err.message);
        setIsLoading(false);
      });
  };

  const handleNavigate = (entry: FileEntry) => {
    if (entry.is_dir) {
      setCurrentPath(entry.path);
    } else if (onOpenFile) {
      onOpenFile(currentRoot, entry.path);
    }
  };

  const handleBreadcrumbClick = (index: number, parts: string[]) => {
    const newPath = parts.slice(0, index + 1).join('/');
    setCurrentPath(newPath);
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '8px' }}>
      {/* Top Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <select
          value={currentRoot}
          onChange={(e) => {
            setCurrentRoot((e.target as HTMLSelectElement).value);
            setCurrentPath('');
          }}
          style={{
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '4px 8px',
            borderRadius: '4px',
          }}
        >
          {roots.map(([id, path]) => (
            <option key={id} value={id}>
              {id.toUpperCase()}: {path}
            </option>
          ))}
        </select>

        {/* Breadcrumb Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, overflowX: 'auto' }}>
          <button
            onClick={() => setCurrentPath('')}
            style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}
          >
            /
          </button>
          {pathParts.map((part, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>/</span>
              <button
                onClick={() => handleBreadcrumbClick(idx, pathParts)}
                style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}
              >
                {part}
              </button>
            </div>
          ))}
        </div>

        {onOpenTerminalHere && (
          <button
            onClick={() => onOpenTerminalHere(currentRoot, currentPath)}
            style={{
              padding: '4px 8px',
              background: '#6366f1',
              color: 'white',
              borderRadius: '4px',
              fontSize: '0.8rem',
            }}
          >
            💻 Terminal Here
          </button>
        )}
      </div>

      {/* Directory Content Table */}
      {error && <div style={{ color: '#ef4444', padding: '8px' }}>{error}</div>}
      {isLoading ? (
        <div style={{ padding: '12px', color: '#94a3b8' }}>Loading directory...</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: '#94a3b8' }}>
                <th style={{ padding: '6px' }}>Name</th>
                <th style={{ padding: '6px' }}>Size</th>
              </tr>
            </thead>
            <tbody>
              {currentPath && (
                <tr
                  onClick={() => {
                    const parent = pathParts.slice(0, -1).join('/');
                    setCurrentPath(parent);
                  }}
                  style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <td style={{ padding: '6px', color: '#6366f1' }}>📁 ..</td>
                  <td style={{ padding: '6px' }}>—</td>
                </tr>
              )}
              {listing?.entries.map((entry) => (
                <tr
                  key={entry.name.toString()}
                  onClick={() => handleNavigate(entry)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <td style={{ padding: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{entry.is_dir ? '📁' : '📄'}</span>
                    <span>{entry.name.toString()}</span>
                    {entry.is_symlink && <span style={{ color: '#38bdf8', fontSize: '0.75rem' }}>🔗</span>}
                  </td>
                  <td style={{ padding: '6px', color: '#94a3b8' }}>
                    {entry.is_dir ? '—' : `${(entry.size / 1024).toFixed(1)} KiB`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
