import { useEffect, useState } from 'preact/hooks';
import { DesktopCanvas } from './desktop/DesktopCanvas';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [pairingSecret, setPairingSecret] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 1. Check if token exists in URL path or query params (auto-pairing URL from server startup)
    const urlParams = new URLSearchParams(window.location.search);
    const queryToken = urlParams.get('token') || urlParams.get('secret');
    const pathToken = window.location.pathname.trim().replace(/^\/+|\/+$/g, '');

    const tokenToPair = queryToken || (pathToken && pathToken.length >= 8 && !pathToken.includes('/') ? pathToken : null);

    if (tokenToPair) {
      pairWithSecret(tokenToPair);
    } else {
      checkAuthStatus();
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/v1/fs/roots');
      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  };

  const pairWithSecret = async (secret: string) => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/v1/auth/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secret.trim() }),
      });

      if (res.ok) {
        // Clear pairing token from URL bar for clean UX & security
        if (window.location.pathname !== '/' || window.location.search !== '') {
          window.history.replaceState({}, '', '/');
        }
        setIsAuthenticated(true);
      } else {
        const data = await res.json().catch(() => null);
        const msg = data?.error?.message || (res.status === 429 ? 'Rate limit exceeded. Please wait.' : 'Invalid pairing secret');
        setErrorMsg(msg);
        setIsAuthenticated(false);
      }
    } catch {
      setErrorMsg('Failed to connect to Mux Web UI server');
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: Event) => {
    e.preventDefault();
    if (!pairingSecret.trim()) return;
    pairWithSecret(pairingSecret);
  };

  if (isAuthenticated === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚡</div>
          <div>Loading Mux Web UI...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', background: 'rgba(30, 41, 59, 0.8)', borderRadius: '1rem', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(12px)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚡</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>Mux Web UI</h1>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.5rem' }}>Authentication Required</p>
          </div>

          <form onSubmit={handleFormSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
                Bootstrap Pairing Code
              </label>
              <input
                type="password"
                value={pairingSecret}
                onInput={(e) => setPairingSecret((e.target as HTMLInputElement).value)}
                placeholder="Enter pairing secret from server stdout"
                disabled={isLoading}
                style={{ width: '100%', padding: '0.75rem 1rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {errorMsg && (
              <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !pairingSecret.trim()}
              style={{ width: '100%', padding: '0.75rem', background: isLoading ? '#475569' : '#6366f1', border: 'none', borderRadius: '0.5rem', color: '#ffffff', fontWeight: 600, fontSize: '0.95rem', cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease' }}
            >
              {isLoading ? 'Pairing Device...' : 'Pair Device'}
            </button>
          </form>

          <div style={{ marginTop: '1.75rem', textAlign: 'center', fontSize: '0.775rem', color: '#64748b', lineHeight: 1.5 }}>
            Pairing exchanges the single-use bootstrap secret for a secure session cookie.
          </div>
        </div>
      </div>
    );
  }

  return <DesktopCanvas />;
}
