import { useEffect, useRef, useState } from 'preact/hooks';
import {
  agentBadge,
  buildOnboarding,
  GUIDES,
  onboardingProgress,
  routerBadge,
  type ToolInfo,
} from './supportLogic';

// DISC-001..004 + APKG-006 + RTR-004 + ACFG-005 (spec 013): Support Hub.
// One central, visible place for every "support" feature with live status,
// how-to-use guides, agent install/uninstall and 9Router integration.

interface CatalogResp {
  installed: string[];
  available: string[];
}

const ENVS = ['termux'];

export function SupportHubView() {
  const [env, setEnv] = useState('termux');
  const [envs, setEnvs] = useState<string[]>(ENVS);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [catalog, setCatalog] = useState<CatalogResp | null>(null);
  const [router, setRouter] = useState<{ running: boolean; port: number } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [taskLines, setTaskLines] = useState<string[]>([]);
  const [runningTask, setRunningTask] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openGuide, setOpenGuide] = useState<string | null>('agents');
  const wsRef = useRef<WebSocket | null>(null);

  // config editor state (ACFG-005)
  const [cfgAgent, setCfgAgent] = useState<string | null>(null);
  const [cfgPath, setCfgPath] = useState('');
  const [cfgContent, setCfgContent] = useState('');
  const [cfgExists, setCfgExists] = useState(false);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);

  const loadCatalog = () =>
    fetch('/api/v1/environments/catalog')
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => {});

  const loadTools = (e: string) =>
    fetch(`/api/v1/tools/catalog?env=${encodeURIComponent(e)}`)
      .then((r) => r.json())
      .then((list) => setTools(Array.isArray(list) ? list : []))
      .catch(() => {});

  const loadRouter = () =>
    fetch('/api/v1/router/status')
      .then((r) => r.json())
      .then(setRouter)
      .catch(() => setRouter(null));

  useEffect(() => {
    loadCatalog();
    loadRouter();
    fetch('/api/v1/environments')
      .then((r) => r.json())
      .then((list: { id: string }[]) =>
        setEnvs(['termux', ...list.filter((x) => x.id !== 'termux').map((x) => x.id)])
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTools(env);
  }, [env]);

  // refresh found-status after a task finishes
  useEffect(() => {
    if (runningTask === null) loadTools(env);
  }, [runningTask]);

  const watchTask = (taskId: string) => {
    wsRef.current?.close();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${location.host}/api/v1/tools/tasks/${encodeURIComponent(taskId)}/stream`
    );
    wsRef.current = ws;
    setTaskLines([]);
    setRunningTask(taskId);
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse((ev as MessageEvent).data);
        if (frame.type === 'line') setTaskLines((l) => [...l.slice(-200), frame.data]);
        if (frame.type === 'exit') {
          setRunningTask(null);
          setNotice(
            frame.code === 0
              ? '✅ Selesai tanpa error.'
              : `⚠️ Proses keluar dengan code ${frame.code}.`
          );
          loadTools(env);
          if (cfgAgent) loadConfig(cfgAgent);
        }
        if (frame.type === 'error') {
          setRunningTask(null);
          setNotice(`⚠️ ${frame.message}`);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => setRunningTask((cur) => (cur === taskId ? null : cur));
  };

  const startTool = async (id: string, kind: 'install' | 'uninstall') => {
    setNotice(null);
    try {
      const r = await fetch(`/api/v1/tools/${encodeURIComponent(id)}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env_id: env }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ error: { message: r.statusText } }));
        setNotice(`⚠️ ${body?.error?.code ?? 'ERROR'}: ${body?.error?.message ?? 'gagal memulai'}`);
        return;
      }
      const body = await r.json();
      watchTask(body.task_id);
    } catch (e) {
      setNotice(`⚠️ ${String(e)}`);
    }
  };

  const cancelTask = async () => {
    if (!runningTask) return;
    await fetch(`/api/v1/tools/tasks/${encodeURIComponent(runningTask)}`, {
      method: 'DELETE',
    }).catch(() => {});
  };

  // ── config editor ──
  const loadConfig = (agentId: string) => {
    setCfgMsg(null);
    fetch(`/api/v1/agents/${encodeURIComponent(agentId)}/config`)
      .then(async (r) => {
        if (!r.ok) {
          const b = await r.json().catch(() => null);
          setCfgMsg(b?.error?.message ?? 'tidak bisa memuat config');
          return;
        }
        const b = await r.json();
        setCfgAgent(agentId);
        setCfgPath(b.path ?? '');
        setCfgContent(b.content ?? '');
        setCfgExists(!!b.exists);
      })
      .catch(() => setCfgMsg('gagal memuat config'));
  };

  const saveConfig = () => {
    if (!cfgAgent) return;
    fetch(`/api/v1/agents/${encodeURIComponent(cfgAgent)}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: cfgContent }),
    })
      .then(async (r) => {
        const b = await r.json().catch(() => null);
        setCfgMsg(
          r.ok
            ? b?.backup_written
              ? 'Tersimpan (backup .bak dibuat).'
              : 'Tersimpan.'
            : `⚠️ ${b?.error?.message ?? 'gagal menyimpan'}`
        );
      })
      .catch(() => setCfgMsg('⚠️ gagal menyimpan'));
  };

  const routeVia9Router = () => {
    if (!cfgAgent) return;
    fetch(`/api/v1/agents/${encodeURIComponent(cfgAgent)}/config/router9`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(async (r) => {
        const b = await r.json().catch(() => null);
        if (r.ok) {
          setCfgMsg(`✅ Diarahkan ke ${b?.base_url} — backup otomatis dibuat.`);
          loadConfig(cfgAgent);
        } else {
          setCfgMsg(`⚠️ ${b?.error?.message ?? 'gagal'}`);
        }
      })
      .catch(() => setCfgMsg('⚠️ gagal'));
  };

  const onboard = buildOnboarding({
    distrosInstalled: catalog?.installed.length ?? 0,
    agentsFound: tools.filter((t) => t.found && t.id !== '9router').length,
    routerRunning: router?.running ?? false,
  });

  return (
    <div style={{ padding: '12px', height: '100%', overflowY: 'auto', color: '#f1f5f9', fontSize: 13 }}>
      <h3 style={{ color: '#38bdf8', margin: '0 0 8px' }}>🛟 Support Hub</h3>

      {/* DISC-004 onboarding */}
      <Section title={`🚀 Mulai di sini (${onboardingProgress(onboard)})`}>
        {onboard.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
            <span>{s.done ? '✅' : '⬜'}</span>
            <span style={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? 0.6 : 1 }}>
              {s.label}
            </span>
            {!s.done && s.cta && (
              <button
                onClick={() => (s.key === 'router9' ? startTool('9router', 'install') : setOpenGuide(s.key))}
                style={btn('#38bdf8')}
              >
                {s.cta}
              </button>
            )}
          </div>
        ))}
      </Section>

      {/* DISC-002 router status card */}
      <Section title="🛜 9Router">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: routerBadge(router).color }}>{routerBadge(router).text}</span>
          <button
            onClick={() => startTool('9router', router?.running ? 'uninstall' : 'install')}
            disabled={runningTask !== null}
            style={btn(router?.running ? '#ef4444' : '#10b981', runningTask !== null)}
          >
            {router?.running ? 'Uninstall' : 'Install 9Router'}
          </button>
          {router?.running && (
            <button onClick={() => window.open(`http://127.0.0.1:${router.port}/dashboard`, '_blank')} style={btn('#6366f1')}>
              Buka Dashboard
            </button>
          )}
          {router?.running && (
            <button
              onClick={() => fetch('/api/v1/router/models').then((r) => r.json()).then((b) => setModels(b.models ?? [])).catch(() => {})}
              style={btn('#334155')}
            >
              Muat daftar model
            </button>
          )}
          {models.length > 0 && (
            <span style={{ color: '#94a3b8' }}>
              model: {models.slice(0, 4).join(', ')}{models.length > 4 ? ` +${models.length - 4}` : ''}
            </span>
          )}
        </div>
      </Section>

      {/* APKG-006 package center */}
      <Section title="🤖 Coding Agents & Tools">
        <div style={{ marginBottom: 6 }}>
          Environment:{' '}
          {envs.map((e) => (
            <button key={e} onClick={() => setEnv(e)} style={{ ...btn(env === e ? '#6366f1' : '#334155'), marginRight: 4 }}>
              {e}
            </button>
          ))}
        </div>
        {tools.map((t) => {
          const badge = agentBadge(t);
          return (
            <div key={t.id} style={{ background: '#1e293b', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: t.color }}>{t.label}</span>
                <span style={{ color: badge.color }}>{badge.text}</span>
                <span style={{ flex: 1 }} />
                {t.installable && (
                  <button
                    disabled={runningTask !== null}
                    onClick={() => startTool(t.id, t.found ? 'uninstall' : 'install')}
                    style={btn(t.found ? '#ef4444' : '#10b981', runningTask !== null)}
                  >
                    {t.found ? 'Uninstall' : 'Install'}
                  </button>
                )}
                {['codex', 'claude-code', 'opencode'].includes(t.id) && (
                  <button onClick={() => loadConfig(t.id)} style={btn('#334155')}>
                    Config
                  </button>
                )}
              </div>
              {!t.installable && t.install_hint && (
                <div style={{ color: '#94a3b8', fontSize: 12 }}>Hint: {t.install_hint}</div>
              )}
              {t.found && models.length > 0 && t.id !== '9router' && (
                <select
                  defaultValue=""
                  onChange={(e) =>
                    setNotice(`Model "${(e.target as HTMLSelectElement).value}" dipilih untuk ${t.label}.`)
                  }
                  style={{ marginTop: 4, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4 }}
                >
                  <option value="">— pilih model via 9Router —</option>
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
        {(runningTask !== null || taskLines.length > 0) && (
          <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: 6, padding: 6, maxHeight: 120, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
            {taskLines.join('\n') || 'menjalankan…'}
            {runningTask !== null && (
              <button onClick={cancelTask} style={{ ...btn('#ef4444'), marginLeft: 8 }}>
                Cancel
              </button>
            )}
          </div>
        )}
      </Section>

      {/* ACFG-005 config editor + model selector */}
      {cfgAgent && (
        <Section title={`⚙️ Config: ${cfgAgent}`}>
          <div style={{ color: '#94a3b8', marginBottom: 4 }}>
            {cfgPath}{cfgExists ? '' : ' (belum ada — akan dibuat)'}
          </div>
          <textarea
            value={cfgContent}
            onInput={(e) => setCfgContent((e.target as HTMLTextAreaElement).value)}
            spellcheck={false}
            style={{ width: '98%', minHeight: 140, background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }}
          />
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={saveConfig} style={btn('#10b981')}>Save</button>
            <button onClick={routeVia9Router} style={btn('#38bdf8')}>Route via 9Router</button>
            <button onClick={() => loadConfig(cfgAgent)} style={btn('#334155')}>Reload</button>
          </div>
          {cfgMsg && (
            <div style={{ marginTop: 4, color: cfgMsg.startsWith('⚠️') ? '#ef4444' : '#10b981' }}>{cfgMsg}</div>
          )}
        </Section>
      )}

      {/* DISC-002 distro status shortcut */}
      <Section title={`🐧 Distro (${catalog?.installed.length ?? 0} terpasang)`}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(catalog?.installed ?? []).map((d) => (
            <span key={d} style={chip('#10b981')}>✅ {d}</span>
          ))}
          {(catalog?.available ?? []).slice(0, 6).map((d) => (
            <span key={d} style={chip('#f59e0b')}>⬇️ {d}</span>
          ))}
        </div>
        <div style={{ color: '#94a3b8', marginTop: 4 }}>
          Kelola install/remove distro dari Editor (ikon 🐧 di header) — panduan lengkap di bawah.
        </div>
      </Section>

      {/* DISC-003 guides */}
      <Section title="📖 How to use">
        {GUIDES.map((g) => (
          <div key={g.id} style={{ marginBottom: 6 }}>
            <button
              onClick={() => setOpenGuide(openGuide === g.id ? null : g.id)}
              style={{ ...btn('#1e293b'), textAlign: 'left', width: '100%' }}
            >
              {openGuide === g.id ? '▾' : '▸'} {g.title}
            </button>
            {openGuide === g.id && (
              <ol style={{ margin: '6px 0 0 18px', padding: 0, lineHeight: 1.7 }}>
                {g.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </Section>

      {notice && <div style={{ marginTop: 8, padding: 6, background: '#1e293b', borderRadius: 4 }}>{notice}</div>}
    </div>
  );
}

function Section(props: { title: string; children: preact.ComponentChildren }) {
  return (
    <div style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid #1e293b', borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{props.title}</div>
      {props.children}
    </div>
  );
}

const btn = (bg: string, disabled = false): preact.JSX.CSSProperties => ({
  padding: '4px 10px',
  background: bg,
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

const chip = (color: string): preact.JSX.CSSProperties => ({
  padding: '2px 8px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${color}`,
});
