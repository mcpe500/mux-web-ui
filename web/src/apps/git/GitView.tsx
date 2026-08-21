import { useEffect, useState } from 'preact/hooks';

interface GitViewProps {
  rootId?: string;
  repoPath?: string;
}

export function GitView({ rootId = 'home', repoPath = '' }: GitViewProps) {
  const [status, setStatus] = useState<string>('Loading...');
  const [branches, setBranches] = useState<string>('');

  useEffect(() => {
    fetch(`/api/v1/git/status?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(repoPath)}`)
      .then((r) => r.json())
      .then((data) => setStatus(JSON.stringify(data, null, 2)))
      .catch((e) => setStatus('Error: ' + e.message));
    fetch(`/api/v1/git/branches?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(repoPath)}`)
      .then((r) => r.json())
      .then((data) => setBranches(JSON.stringify(data, null, 2)))
      .catch(() => {});
  }, [rootId, repoPath]);

  return (
    <div style={{ padding: '12px', overflowY: 'auto', height: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}>
      <h3 style={{ margin: '0 0 8px', color: '#f59e0b' }}>🔧 Git Status</h3>
      <pre style={{ background: '#1e293b', padding: '8px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>{status}</pre>
      <h4 style={{ margin: '12px 0 4px' }}>Branches</h4>
      <pre style={{ background: '#1e293b', padding: '8px', borderRadius: '4px' }}>{branches}</pre>
    </div>
  );
}
