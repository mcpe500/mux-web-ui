import { useState, useEffect, useRef } from 'preact/hooks';
import {
  type TraceTarget,
  mapTracebackToOpenTarget,
  parsePythonTraceback,
} from './runPanelLogic';

interface RunPanelProps {
  rootId: string;
  filePath: string;
  onClose: () => void;
  onSelectTrace?: (t: TraceTarget) => void;
}

const MAX_LINES = 200;

/** PY-003/005 (spec 014): bottom output drawer for python runs. */
export function RunPanel({ rootId, filePath, onClose, onSelectTrace }: RunPanelProps) {
  const [envs, setEnvs] = useState<string[]>(['termux']);
  const [env, setEnv] = useState('termux');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [exitInfo, setExitInfo] = useState<{ code: number | null; reason: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch('/api/v1/environments')
      .then((r) => r.json())
      .then((list: { id: string }[]) =>
        setEnvs(['termux', ...list.filter((x) => x.id !== 'termux').map((x) => x.id)])
      )
      .catch(() => {});
    return () => wsRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watchTask = (id: string) => {
    wsRef.current?.close();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${location.host}/api/v1/run/python/${encodeURIComponent(id)}/ws`
    );
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse((ev as MessageEvent).data);
        if (frame.type === 'line') {
          setLines((l) => [...l.slice(-(MAX_LINES - 1)), String(frame.data)]);
        }
        if (frame.type === 'exit') {
          setExitInfo({ code: frame.code ?? null, reason: frame.reason ?? 'code' });
          setTaskId(null);
        }
        if (frame.type === 'error') {
          setNotice(`⚠️ ${frame.message}`);
          setTaskId(null);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => setTaskId((cur) => (cur === id ? null : cur));
  };

  const start = async () => {
    setNotice(null);
    setExitInfo(null);
    setLines([]);
    try {
      const r = await fetch('/api/v1/run/python', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: rootId, path: filePath, env_id: env }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ error: { message: r.statusText } }));
        setNotice(`⚠️ ${body?.error?.code ?? 'ERROR'}: ${body?.error?.message ?? 'gagal mulai'}`);
        return;
      }
      const body = await r.json();
      watchTask(body.task_id);
      setTaskId(body.task_id);
    } catch (e) {
      setNotice(`⚠️ ${String(e)}`);
    }
  };

  const stop = async () => {
    if (!taskId) return;
    await fetch(`/api/v1/run/python/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
    }).catch(() => {});
  };

  const frames = parsePythonTraceback(lines);
  const target = mapTracebackToOpenTarget(frames, rootId, filePath);

  return (
    <div
      data-testid="run-panel"
      style={{
        flexShrink: 0,
        maxHeight: '40%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f172a',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: '12px',
      }}
    >
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 8px', background: '#1e293b' }}>
        <span style={{ color: '#94a3b8' }}>🐍 Run</span>
        {envs.map((e) => (
          <button
            key={e}
            data-testid={`env-chip-${e}`}
            onClick={() => setEnv(e)}
            disabled={!!taskId}
            style={{
              padding: '2px 8px',
              borderRadius: '10px',
              background: e === env ? '#6366f1' : '#334155',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              opacity: taskId ? 0.55 : 1,
            }}
          >
            {e}
          </button>
        ))}
        {!taskId ? (
          <button
            data-testid="run-start"
            onClick={start}
            title="Jalankan file .py ini"
            style={{ padding: '3px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            ▶ Run
          </button>
        ) : (
          <button
            data-testid="run-stop"
            onClick={stop}
            title="Stop (SIGKILL)"
            style={{ padding: '3px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            ■ Stop
          </button>
        )}
        {exitInfo && (
          <span data-testid="run-exit-chip" style={{ color: exitInfo.code === 0 && exitInfo.reason === 'code' ? '#10b981' : '#f59e0b' }}>
            {exitInfo.reason === 'timeout'
              ? '⏱ Timed out'
              : exitInfo.code === 0
                ? '✅ Exit 0'
                : `⚠️ Exit ${exitInfo.code ?? 'killed'}`}
          </span>
        )}
        {notice && <span style={{ color: '#fca5a5' }}>{notice}</span>}
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>{filePath.split('/').pop()}</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
      </div>
      {target && onSelectTrace && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '3px 8px', background: '#131c31', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ color: '#64748b' }}>traceback:</span>
          {frames.map((f, i) => (
            <button
              key={i}
              style={{ background: 'transparent', border: 'none', color: '#7dd3fc', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              onClick={() => {
                const t = mapTracebackToOpenTarget([f], rootId, filePath);
                if (t) onSelectTrace(t);
              }}
            >
              {f.file.split('/').pop()}:{f.line}
            </button>
          ))}
        </div>
      )}
      <div
        data-testid="run-output"
        style={{ overflowY: 'auto', padding: '6px 10px', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap', color: '#e2e8f0', minHeight: '40px' }}
      >
        {lines.length === 0 && !taskId ? <span style={{ color: '#475569' }}>— belum ada output —</span> : null}
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
