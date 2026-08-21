import { useEffect, useState } from 'preact/hooks';

export function PackageCenterView() {
  const [backend, setBackend] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/v1/packages/backend')
      .then((r) => r.json())
      .then(setBackend)
      .catch(() => {});
  }, []);

  const doSearch = () => {
    if (query.length < 2) return;
    fetch(`/api/v1/packages/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data) => setResults(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  return (
    <div style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
      <h3 style={{ color: '#10b981' }}>📦 Package Center</h3>
      {backend && (
        <div style={{ background: '#1e293b', padding: '8px', borderRadius: '4px', marginBottom: '12px' }}>
          Backend: <b>{backend.backend}</b> — {backend.available ? 'available' : 'not available'} {backend.root_required ? '(root)' : ''}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Search packages (min 2 chars)"
          style={{ flex: 1, padding: '6px 8px', background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: '4px' }}
        />
        <button onClick={doSearch} style={{ padding: '6px 12px', background: '#10b981', color: 'white', borderRadius: '4px' }}>Search</button>
      </div>
      <div>
        {results.length === 0 ? <div style={{ color: '#94a3b8' }}>No results</div> : results.map((p, i) => <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #1e293b' }}>{p.name} — {p.version}</div>)}
      </div>
    </div>
  );
}
