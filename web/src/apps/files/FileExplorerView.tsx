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
  const [pathInput, setPathInput] = useState<string>('');
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
    setPathInput(currentPath);
  }, [currentRoot, currentPath]);

  const loadDirectory = (root: string, path: string) => {
    setIsLoading(true);
    setError(null);
    const url = `/api/v1/fs/entries?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }
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

  const handlePathInputSubmit = () => {
    setCurrentPath(pathInput.trim());
  };

  const currentRootObj = roots.find(([id]) => id === currentRoot);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '8px' }}>
      {/* Top Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <select
          value={currentRoot}
          onChange={(e) => {
            setCurrentRoot((e.target as HTMLSelectElement).value);
            setCurrentPath('');
          }}
          style={{
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '6px 8px',
            borderRadius: '4px',
            fontSize: '0.85rem'
          }}
        >
          {roots.map(([id, path]) => (
            <option key={id} value={id}>
              {id.toUpperCase()}: {path}
            </option>
          ))}
        </select>

        {/* Editable Path Navigation Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: '200px' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>📂</span>
          <input
            type="text"
            value={pathInput}
            onInput={(e) => setPathInput((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePathInputSubmit()}
            placeholder="Type subpath (e.g. quant or /)..."
            style={{
              flex: 1,
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.85rem'
            }}
          />
          <button
            onClick={handlePathInputSubmit}
            style={{
              padding: '4px 8px',
              background: '#3b82f6',
              color: 'white',
              borderRadius: '4px',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            Go
          </button>
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
              fontWeight: 600
            }}
          >
            💻 Terminal Here
          </button>
        )}
      </div>

      {currentRootObj && (
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
          Full path: <span style={{ color: '#38bdf8' }}>{currentRootObj[1]}{currentPath}</span>
        </div>
      )}

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
                    const parts = currentPath.split('/').filter(Boolean);
                    const parent = parts.slice(0, -1).join('/');
                    setCurrentPath(parent ? `/${parent}` : '');
                  }}
                  style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <td style={{ padding: '6px', color: '#6366f1' }}>📁 .. (Parent Directory)</td>
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
