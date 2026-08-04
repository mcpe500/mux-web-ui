import { useEffect, useState } from 'preact/hooks';

interface MetricsData {
  active_terminals: number;
  allowed_roots_count: number;
  uptime_seconds: number;
}

export function SystemMonitorView() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);

  useEffect(() => {
    const fetchMetrics = () => {
      fetch('/api/v1/metrics')
        .then((res) => res.json())
        .then((data: MetricsData) => setMetrics(data))
        .catch((err) => console.error('Metrics poll error:', err));
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleStopAll = () => {
    if (confirm('Are you sure you want to stop all active terminal sessions?')) {
      fetch('/api/v1/actions/terminals/stop-all', { method: 'POST' }).then(() => {
        alert('All terminal sessions stopped.');
      });
    }
  };

  const formatUptime = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>📊 System & Control Center</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ACTIVE TERMINALS</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1' }}>{metrics?.active_terminals ?? 0}</div>
        </div>

        <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ALLOWED ROOTS</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#38bdf8' }}>{metrics?.allowed_roots_count ?? 0}</div>
        </div>

        <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>SERVER UPTIME</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>{metrics ? formatUptime(metrics.uptime_seconds) : '—'}</div>
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <button
          onClick={handleStopAll}
          style={{
            padding: '8px 16px',
            background: '#ef4444',
            color: 'white',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          🛑 Stop All Active Terminals
        </button>
      </div>
    </div>
  );
}
