import { useState } from 'preact/hooks';

export function ShareModal() {
  const [targetType, setTargetType] = useState('terminal');
  const [targetId, setTargetId] = useState('');
  const [ttl, setTtl] = useState('3600');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const create = () => {
    fetch('/api/v1/share/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type: targetType, target_id: targetId, ttl_seconds: parseInt(ttl) || 3600 }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.share_token) setResult(data);
        else setError(JSON.stringify(data));
      })
      .catch((e) => setError(e.message));
  };

  return (
    <div style={{ padding: '12px' }}>
      <h3 style={{ color: '#8b5cf6' }}>🔗 Share Links (Read-Only)</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <select value={targetType} onChange={(e) => setTargetType((e.target as HTMLSelectElement).value)} style={{ padding: '6px', background: '#1e293b', color: 'white', borderRadius: '4px' }}>
          <option value="terminal">Terminal</option>
          <option value="file">File</option>
          <option value="folder">Folder</option>
        </select>
        <input value={targetId} onInput={(e) => setTargetId((e.target as HTMLInputElement).value)} placeholder="Target ID (term-... or root id)" style={{ padding: '6px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px' }} />
        <input value={ttl} onInput={(e) => setTtl((e.target as HTMLInputElement).value)} placeholder="TTL seconds" style={{ padding: '6px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px' }} />
        <button onClick={create} style={{ padding: '8px', background: '#8b5cf6', color: 'white', borderRadius: '4px' }}>Create Share Link</button>
        {result && (
          <div style={{ background: '#1e293b', padding: '8px', borderRadius: '4px', marginTop: '8px' }}>
            <div>Token: <code style={{ wordBreak: 'break-all' }}>{result.share_token}</code></div>
            <div>URL: <a href={result.share_url} style={{ color: '#38bdf8' }}>{result.share_url}</a></div>
            <button onClick={() => navigator.clipboard.writeText(window.location.origin + result.share_url)} style={{ marginTop: '6px', padding: '4px 8px', background: '#334155', color: 'white', borderRadius: '4px' }}>Copy URL</button>
          </div>
        )}
        {error && <div style={{ color: '#ef4444' }}>{error}</div>}
      </div>
    </div>
  );
}
