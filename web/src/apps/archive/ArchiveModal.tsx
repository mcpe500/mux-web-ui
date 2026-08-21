import { useState } from 'preact/hooks';

interface Props {
  rootId: string;
  archivePath: string;
  onClose: () => void;
}

export function ArchiveModal({ rootId, archivePath, onClose }: Props) {
  const [info, setInfo] = useState<any>(null);
  const [dest, setDest] = useState('');
  const [msg, setMsg] = useState('');

  const inspect = () => {
    fetch(`/api/v1/archive/inspect?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(archivePath)}`)
      .then((r) => r.json())
      .then(setInfo)
      .catch((e) => setMsg('Inspect failed: ' + e.message));
  };

  const extract = () => {
    if (!dest) {
      setMsg('Destination required');
      return;
    }
    fetch('/api/v1/archive/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: rootId, archive_path: archivePath, destination_dir: dest }),
    })
      .then((r) => r.json())
      .then((data) => setMsg(JSON.stringify(data)))
      .catch((e) => setMsg('Extract failed: ' + e.message));
  };

  return (
    <div style={{ padding: '12px', background: '#0f172a', color: '#f1f5f9', borderRadius: '8px' }}>
      <h3>🗜️ Archive: {archivePath}</h3>
      <button onClick={inspect} style={{ marginRight: '8px', padding: '6px 12px', background: '#3b82f6', color: 'white', borderRadius: '4px' }}>Inspect</button>
      <button onClick={onClose} style={{ padding: '6px 12px', background: '#475569', color: 'white', borderRadius: '4px' }}>Close</button>
      {info && <pre style={{ background: '#1e293b', padding: '8px', marginTop: '12px', maxHeight: '200px', overflow: 'auto' }}>{JSON.stringify(info, null, 2)}</pre>}
      <div style={{ marginTop: '12px' }}>
        <input value={dest} onInput={(e) => setDest((e.target as HTMLInputElement).value)} placeholder="Destination dir (e.g. / or dest)" style={{ padding: '6px 8px', width: '70%', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px' }} />
        <button onClick={extract} style={{ marginLeft: '8px', padding: '6px 12px', background: '#10b981', color: 'white', borderRadius: '4px' }}>Extract</button>
      </div>
      {msg && <div style={{ marginTop: '8px', color: '#94a3b8' }}>{msg}</div>}
    </div>
  );
}
