// Spec 014 (v0.6.4) Wave 2 — AGX-001..008 Codex window: ONE PTY, two surfaces.
//
// ═══ WAVE-3 INTEGRATOR API (named exports, final) ═══
//   export interface AgentCodexViewProps {
//     rootId?: string;      // workspace key → prompt-library namespace + cwd_root
//     cwdPath?: string;     // relative path inside rootId
//     onClose?: () => void;
//   }
//   export function AgentCodexView(props): PreactComponent
//   (no sessionId prop — sessions are created per launch internally; desktop
//    registration / StartMenu / hub cards belong to Wave 3)
//
// Security posture: ONE PTY per launch. The only outbound channel is INPUT
// frames of the attached socket used by (a) the composed launch line,
// (b) the composer textarea, (c) approval keystrokesFor(). No spawn path.
// Execution model = `codex exec --json <quoted task>` (one-shot): EXIT frame
// ends the session; AFK reconnect trio mirrors TerminalView verbatim.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { TERMINAL_FONT_STACK, applyTerminalAddons } from '../terminal/terminalConfig';
import {
  FrameOpcode,
  canOpenSocket,
  nextReconnectDelay,
  shouldStopOnAttachStatus,
  shouldStopOnFrame,
} from '../terminal/reconnect';
import '@xterm/xterm/css/xterm.css';
import { ALLOWED_SANDBOXES, buildCodexExecArgs, buildCodexResumeArgs, validateCodexOpts, validateResumeOpts } from './codexArgs';
import type { SandboxMode } from './codexArgs';
import type { CodexEvent } from './codexEvents';
import {
  DRIFT_TOAST_TEXT,
  LAUNCH_MULTILINE_ERROR,
  MAX_HISTORY_EVENTS,
  OutputPump,
  ROUTER_DOWN_TEXT,
  buildAuditEntry,
  composeLaunchInput,
  incrementErrorBurst,
  keystrokesFor,
  modelListFromRouter,
  shouldAutoSwitchToTerminal,
} from './codexBridge';
import {
  SESSION_STORE_FULL,
  allTags,
  capTranscript,
  codexSessionStore,
  normalizeTag,
  searchSessions,
} from './sessionStore';
import type { CodexSessionRecord } from './sessionStore';
import { renderMarkdownLite } from './markdownLite';
import { defaultLocalStorageStore, validateCodexPrompt } from './promptLibrary';
import type { LibEntry } from './promptLibrary';

export interface AgentCodexViewProps {
  rootId?: string;
  cwdPath?: string;
  onClose?: () => void;
}

type Phase = 'launch' | 'live';
type Surface = 'chat' | 'terminal';

const RENDER_CAP_EVENTS = 300;

function Bubbles({ events }: { events: CodexEvent[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((ev, i) => {
        if (ev.kind === 'user')
          return (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', background: '#3730a3', color: '#eef2ff', padding: '6px 10px', borderRadius: 12, whiteSpace: 'pre-wrap' }}>
              {ev.text}
            </div>
          );
        if (ev.kind === 'assistant')
          return (
            <div
              key={i}
              class="codex-md"
              // CDX-011 (spec 016): markdownLite escapes ALL HTML before
              // transforms — XSS-safe by construction (see markdownLite.test).
              dangerouslySetInnerHTML={{ __html: renderMarkdownLite(ev.text) }}
              style={{ alignSelf: 'flex-start', maxWidth: '92%', background: '#1e293b', color: '#e2e8f0', padding: '6px 10px', borderRadius: 12, fontSize: 13, lineHeight: 1.55, overflowX: 'auto' }}
            />
          );
        if (ev.kind === 'error')
          return (
            <div key={i} style={{ background: '#7f1d1d', color: '#fee2e2', padding: '4px 10px', borderRadius: 8, fontSize: 12 }}>
              ⚠ {ev.message}
            </div>
          );
        if (ev.kind === 'tool_result')
          return (
            <details key={i} style={{ opacity: 0.7, borderLeft: '3px solid #334155', paddingLeft: 8 }}>
              <summary style={{ fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', color: '#94a3b8' }}>
                ▤ result[{ev.id}] ({ev.output.length} chars)
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0', fontSize: 11, color: '#94a3b8' }}>{ev.output}</pre>
            </details>
          );
        return (
          <details key={i} style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>
            <summary>⚙ {ev.name}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{ev.argsPreview}</pre>
          </details>
        );
      })}
    </div>
  );
}

interface CodexTerminalProps {
  terminalId: string;
  /** Called once per coalesced OUTPUT batch — chat feed derives from this. */
  onCoalescedOutput: (merged: Uint8Array) => void;
  registerWriter: (write: ((payload: Uint8Array) => void) | null) => void;
  onOpen: () => void;
  onEnded: (reason: string) => void;
}

/** Attach/backoff lifecycle replicated from TerminalView (AFK trio included). */
function CodexTerminal({
  terminalId,
  onCoalescedOutput,
  registerWriter,
  onOpen,
  onEnded,
}: CodexTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [reason, setReason] = useState('Menunggu sesi…');

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !terminalId) return;
    let isSubscribed = true;
    let stopped = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let currentAttempt = 0;
    let raf: number | null = null;
    let pending: Uint8Array[] = [];

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: TERMINAL_FONT_STACK,
      fontSize: 14,
      allowProposedApi: true,
      theme: {
        background: '#0f172a',
        foreground: '#f8fafc',
        cursor: '#6366f1',
        selectionBackground: 'rgba(99, 102, 241, 0.4)',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    applyTerminalAddons(term);
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      try {
        fitAddon.fit();
      } catch (_) { /* pane currently display:none under chat surface */ }
    }

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const stopReconnect = (why: string) => {
      stopped = true;
      clearReconnectTimer();
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      registerWriter(null);
      setDisconnected(true);
      setReconnecting(false);
      setReason(why);
      onEnded(why);
    };

    const scheduleReconnect = () => {
      if (!isSubscribed || stopped) return;
      setReconnecting(true);
      if (document.visibilityState === 'hidden') return;
      const delay = nextReconnectDelay(currentAttempt);
      currentAttempt += 1;
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => connect(), delay);
    };

    let sendInputBytes: ((payload: Uint8Array) => void) | null = null;

    function sendResize(cols: number, rows: number) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const frame = new Uint8Array(5);
      frame[0] = FrameOpcode.RESIZE;
      new DataView(frame.buffer).setUint16(1, cols, false);
      new DataView(frame.buffer).setUint16(3, rows, false);
      ws.send(frame);
    }

    // PERF-006 pattern: coalesce OUTPUT frames to one write per animation frame.
    const flush = () => {
      raf = null;
      if (pending.length === 0) return;
      let total = 0;
      for (const c of pending) total += c.length;
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of pending) {
        merged.set(c, off);
        off += c.length;
      }
      pending = [];
      term.write(merged); // Terminal surface = raw bytes, always first-class
      onCoalescedOutput(merged); // Chat surface derives from the SAME bytes
    };
    const schedule = (chunk: Uint8Array) => {
      pending.push(chunk);
      if (raf === null) raf = requestAnimationFrame(flush);
    };

    const connect = () => {
      if (!isSubscribed || stopped) return;
      if (!canOpenSocket(ws)) return;
      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch (_) {}
        ws = null;
      }
      setReconnecting(true);

      fetch(`/api/v1/terminals/${terminalId}/attach`, { method: 'POST' })
        .then((res) => {
          if (shouldStopOnAttachStatus(res.status)) {
            throw Object.assign(new Error(`HTTP ${res.status}`), { stop: true });
          }
          if (!res.ok) throw new Error(`Attach failed (${res.status})`);
          return res.json() as Promise<{ ws_token: string }>;
        })
        .then((data) => {
          if (!isSubscribed) return;
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const url = `${protocol}//${window.location.host}/api/v1/terminals/${terminalId}/ws?token=${encodeURIComponent(data.ws_token)}`;
          ws = new WebSocket(url);
          ws.binaryType = 'arraybuffer';

          sendInputBytes = (payload: Uint8Array) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            const frame = new Uint8Array(1 + payload.length);
            frame[0] = FrameOpcode.INPUT;
            frame.set(payload, 1);
            ws.send(frame);
          };
          registerWriter(sendInputBytes);

          ws.onopen = () => {
            currentAttempt = 0;
            setReconnecting(false);
            setDisconnected(false);
            if (term.cols > 2 && term.rows > 2) sendResize(term.cols, term.rows);
            onOpen();
          };
          ws.onmessage = (event) => {
            if (!(event.data instanceof ArrayBuffer)) return;
            const data = new Uint8Array(event.data);
            if (data.length === 0) return;
            const opcode = data[0];
            const payload = data.subarray(1);
            if (opcode === FrameOpcode.OUTPUT) schedule(payload);
            else if (opcode === FrameOpcode.PING) {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(new Uint8Array([FrameOpcode.PONG]));
              }
            } else if (shouldStopOnFrame(opcode)) {
              stopReconnect(
                opcode === FrameOpcode.EXIT
                  ? 'Sesi codex selesai'
                  : new TextDecoder().decode(payload) || 'Diambil alih klien lain',
              );
            }
          };
          ws.onclose = () => {
            if (!isSubscribed || stopped) return;
            scheduleReconnect();
          };
          ws.onerror = () => {};
        })
        .catch((err) => {
          console.error('codex attach failed:', err);
          if (!isSubscribed) return;
          if ((err as { stop?: boolean }).stop) {
            stopReconnect('Sesi diakhiri server');
            return;
          }
          scheduleReconnect();
        });
    };

    const encoder = new TextEncoder();
    const dataDisposable = term.onData((raw) => sendInputBytes?.(encoder.encode(raw)));

    let resizeTimer: number | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        try {
          fitAddon.fit();
        } catch (_) {}
      }, 75);
    });
    observer.observe(container);

    const onVisibility = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const live =
        ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);
      if (live) return;
      clearReconnectTimer();
      connect();
    };
    const onPageHide = () => {
      stopped = true;
      clearReconnectTimer();
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch (_) {}
        ws = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);

    connect();

    return () => {
      isSubscribed = false;
      stopped = true;
      clearReconnectTimer();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      if (raf !== null) cancelAnimationFrame(raf);
      dataDisposable.dispose();
      registerWriter(null);
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch (_) {}
      }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0f172a' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', padding: '4px' }} />
      {reconnecting && !disconnected && (
        <span className="term-reconnect">• Menghubungkan ulang…</span>
      )}
      {disconnected && (
        <div className="terminal-disconnected-overlay">
          <span>{reason}</span>
        </div>
      )}
    </div>
  );
}

const btnGhostStyle = {
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '3px 8px',
  cursor: 'pointer',
  fontSize: 12,
};
const labelStyle = { display: 'block', marginTop: 12, marginBottom: 4, fontSize: 13, color: '#94a3b8' };
const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  background: '#0b1220',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
};
const listStyle = { margin: '4px 0', paddingLeft: 16, fontSize: 13 };
const noticeStyle = { margin: '6px 0', fontSize: 12, color: '#fbbf24' };
const dangerStyle = { marginTop: 8, fontSize: 12, color: '#f87171' };

export function AgentCodexView({ rootId, cwdPath, onClose }: AgentCodexViewProps) {
  const [phase, setPhase] = useState<Phase>('launch');
  const [sessionId, setSessionId] = useState('');
  const [surface, setSurface] = useState<Surface>('chat');
  const [toast, setToast] = useState<string | null>(null);
  const [noticeLog, setNoticeLog] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useState<string[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  // CDX-012 (spec 016): persistent session browser state
  const [sessions, setSessions] = useState<CodexSessionRecord[]>([]);
  const [sessionQuery, setSessionQuery] = useState('');
  const [sessionTagFilter, setSessionTagFilter] = useState('');
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [storeNotice, setStoreNotice] = useState<string | null>(null);

  // CDX-006 (spec 016): multi-turn engine state
  const [turnRunning, setTurnRunning] = useState(false);
  const [webSearch, setWebSearch] = useState(false);

  const [envOptions, setEnvOptions] = useState<EnvOption[]>([{ id: 'termux' }]);
  const [envId, setEnvId] = useState('termux');
  const [models, setModels] = useState<string[]>([]);
  const [routerNotice, setRouterNotice] = useState<string | null>(null);
  const [modelText, setModelText] = useState('');
  const [sandbox, setSandbox] = useState<SandboxMode>('workspace-write');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [launcherError, setLauncherError] = useState<string | null>(null);
  const [launchBusy, setLaunchBusy] = useState(false);

  const [events, setEvents] = useState<CodexEvent[]>([]);
  const [liveOver, setLiveOver] = useState(false);
  const [draft, setDraft] = useState('');
  const [libEntries, setLibEntries] = useState<LibEntry[]>([]);
  const [libTitle, setLibTitle] = useState('');
  const [libText, setLibText] = useState('');

  const pumpRef = useRef<OutputPump | null>(null);
  const writerRef = useRef<((payload: Uint8Array) => void) | null>(null);
  const typedLaunchRef = useRef(false);
  const errorBurstRef = useRef(0);
  const driftFiredRef = useRef(false);
  const surfaceRef = useRef<Surface>('chat');
  /** CDX-006: live session record (thread id, tags, transcript autosave). */
  const currentSessionRef = useRef<CodexSessionRecord | null>(null);
  /** CDX-006: true while a codex turn is executing inside the PTY shell. */
  const turnRunningRef = useRef(false);
  /** CDX-016: resumed sessions skip the auto-typed launch line. */
  const pendingResumeRef = useRef(false);
  const eventsRef = useRef<CodexEvent[]>([]);
  const saveTimerRef = useRef<number | null>(null);

  const workspaceKey = rootId || 'default';
  const store = useMemo(() => defaultLocalStorageStore(workspaceKey), [workspaceKey]);
  const sessionStore = useMemo(() => codexSessionStore(workspaceKey), [workspaceKey]);

  const logAction = (entry: string) => setAuditLog((log) => buildAuditEntry(log, entry));

  const refreshSessions = () => {
    try {
      setSessions(sessionStore.list());
      setStoreNotice(null);
    } catch {
      setStoreNotice('Penyimpanan sesi tidak tersedia');
    }
  };

  /** CDX-006: debounced transcript autosave (1s) — cheap, quota-capped. */
  const scheduleSessionSave = () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveSessionNow();
    }, 1000);
  };

  const saveSessionNow = () => {
    const rec = currentSessionRef.current;
    if (!rec) return;
    try {
      sessionStore.save({
        ...rec,
        lastActiveAt: Date.now(),
        transcript: capTranscript(eventsRef.current),
      });
      setStoreNotice(null);
    } catch (err) {
      setStoreNotice(err instanceof Error && err.message === SESSION_STORE_FULL
        ? 'Penyimpanan sesi penuh — hapus sesi lama'
        : 'Gagal menyimpan sesi');
    }
  };

  useEffect(() => {
    setLibEntries(store.list());
  }, [store]);

  useEffect(() => {
    refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStore]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/environments')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) => {
        if (cancelled || !Array.isArray(list) || list.length === 0) return;
        setEnvOptions(list.map((e) => ({ id: String((e as { id?: unknown }).id ?? 'termux') })));
      })
      .catch(() => {});
    fetch('/api/v1/router/models')
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) {
          setRouterNotice(ROUTER_DOWN_TEXT);
          return;
        }
        setModels(modelListFromRouter(body));
      })
      .catch(() => !cancelled && setRouterNotice(ROUTER_DOWN_TEXT));
    return () => {
      cancelled = true;
    };
  }, []);

  const activeModel = modelText.trim() || undefined;

  const launcherRejection = validateCodexOpts({
    model: activeModel,
    sandbox,
    prompt: taskPrompt || ' ',
  });
  const launchBlocked =
    taskPrompt.trim() === '' || launcherRejection !== null || launchBusy;

  const startNewLaunchData = (metaId: string) => {
    setPhase('live');
    setLiveOver(false);
    setSessionId(metaId);
    setEvents([]);
    eventsRef.current = [];
    setSurface('chat');
    errorBurstRef.current = 0;
    driftFiredRef.current = false;
    typedLaunchRef.current = false;
    turnRunningRef.current = false;
    setTurnRunning(false);
    pumpRef.current = new OutputPump();
  };

  const ingestEvents = (incoming: CodexEvent[]) => {
    if (incoming.length === 0) return;
    setEvents((prev) => {
      const next = [...prev, ...incoming].slice(-MAX_HISTORY_EVENTS * 2);
      eventsRef.current = next;
      return next;
    });
    for (const ev of incoming) {
      errorBurstRef.current = incrementErrorBurst(errorBurstRef.current, ev);
    }
    const pump = pumpRef.current;
    if (
      pump &&
      !driftFiredRef.current &&
      surfaceRef.current === 'chat' &&
      shouldAutoSwitchToTerminal(pump.report(), errorBurstRef.current)
    ) {
      driftFiredRef.current = true;
      setToast(DRIFT_TOAST_TEXT);
      setNoticeLog((n) => [...n, DRIFT_TOAST_TEXT].slice(-50));
      setSurface('terminal');
      logAction('drift-auto-switch');
      window.setTimeout(() => setToast(null), 6000);
    }
  };

  const launchArgs = (): string[] =>
    buildCodexExecArgs({
      model: activeModel,
      sandbox,
      prompt: taskPrompt.trim(),
      search: webSearch,
    });

  const launch = async () => {
    if (launchBlocked) return;
    try {
      composeLaunchInput(launchArgs()); // multiline gate before any spawn
    } catch (err) {
      setLauncherError(
        err instanceof Error && err.message === LAUNCH_MULTILINE_ERROR
          ? 'Prompt tidak boleh mengandung baris baru di peluncur ini'
          : 'Gagal menyusun argumen peluncuran',
      );
      return;
    }
    const rejection = validateCodexOpts({
      model: activeModel,
      sandbox,
      prompt: taskPrompt,
    });
    if (rejection !== null) {
      setLauncherError(rejection);
      return;
    }
    setLaunchBusy(true);
    setLauncherError(null);
    try {
      const res = await fetch('/api/v1/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cwd_root: rootId || undefined,
          cwd_path: cwdPath || undefined,
          env_id: envId || undefined,
        }),
      });
      if (!res.ok) throw new Error(`create failed (${res.status})`);
      const meta = (await res.json()) as { id?: string };
      if (!meta.id) throw new Error('response tanpa id sesi');
      const metaId = meta.id;
      startNewLaunchData(metaId);
      pendingResumeRef.current = false;
      // CDX-004/006: persist the session record (thread id diisi saat event masuk)
      const rec: CodexSessionRecord = {
        id: metaId,
        threadId: null,
        title: taskPrompt.trim().slice(0, 60),
        tags: [],
        envId: envId || 'termux',
        model: activeModel,
        sandbox,
        startedAt: Date.now(),
        lastActiveAt: Date.now(),
        status: 'live',
        transcript: [],
      };
      currentSessionRef.current = rec;
      saveSessionNow();
      refreshSessions();
      logAction(`launch ${activeModel ?? 'default'} @${envId}/${sandbox}`);
    } catch (err) {
      console.error('codex launch failed:', err);
      setLauncherError(err instanceof Error ? err.message : 'Peluncuran gagal');
    } finally {
      setLaunchBusy(false);
    }
  };

  /** CDX-003/006: output pump bookkeeping — thread id + turn end + autosave. */
  const onCodexOutput = (merged: Uint8Array) => {
    const pump = pumpRef.current;
    if (!pump) return;
    ingestEvents(pump.push(merged));
    if (currentSessionRef.current) {
      const tid = pump.threadId();
      if (tid && currentSessionRef.current.threadId !== tid) {
        currentSessionRef.current = { ...currentSessionRef.current, threadId: tid };
      }
      if (pump.drainTurnEnded()) {
        turnRunningRef.current = false;
        setTurnRunning(false);
        saveSessionNow();
        refreshSessions();
        logAction('turn-completed');
      } else {
        scheduleSessionSave();
      }
    }
  };

  /** CDX-016: continue a persisted session — new PTY, transcript restored. */
  const resumeSession = async (rec: CodexSessionRecord) => {
    if (launchBusy) return;
    setLaunchBusy(true);
    setLauncherError(null);
    try {
      const res = await fetch('/api/v1/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cwd_root: rootId || undefined,
          cwd_path: cwdPath || undefined,
          env_id: rec.envId || undefined,
        }),
      });
      if (!res.ok) throw new Error(`create failed (${res.status})`);
      const meta = (await res.json()) as { id?: string };
      if (!meta.id) throw new Error('response tanpa id sesi');
      startNewLaunchData(meta.id);
      pendingResumeRef.current = true;
      currentSessionRef.current = { ...rec, id: meta.id, status: 'live', lastActiveAt: Date.now() };
      const restored = rec.transcript.slice(-MAX_HISTORY_EVENTS * 2);
      setEvents(restored);
      eventsRef.current = restored;
      setModelText(rec.model ?? '');
      if (rec.sandbox && (ALLOWED_SANDBOXES as readonly string[]).includes(rec.sandbox)) {
        setSandbox(rec.sandbox as SandboxMode);
      }
      saveSessionNow();
      refreshSessions();
      logAction(`resume-session ${rec.id.slice(0, 8)}${rec.threadId ? ' (thread ada)' : ''}`);
    } catch (err) {
      console.error('codex resume failed:', err);
      setLauncherError(err instanceof Error ? err.message : 'Gagal melanjutkan sesi');
    } finally {
      setLaunchBusy(false);
    }
  };

  const deleteSession = (id: string) => {
    sessionStore.remove(id);
    refreshSessions();
    logAction('delete-session');
  };

  const commitTagDraft = (id: string) => {
    const tag = normalizeTag(tagDraft);
    if (tag === '') {
      setEditingTagsFor(null);
      return;
    }
    const rec = sessions.find((s) => s.id === id);
    if (rec && !rec.tags.includes(tag)) {
      sessionStore.setTags(id, [...rec.tags, tag]);
      refreshSessions();
    }
    setTagDraft('');
  };

  const removeTag = (id: string, tag: string) => {
    const rec = sessions.find((s) => s.id === id);
    if (!rec) return;
    sessionStore.setTags(id, rec.tags.filter((t) => t !== tag));
    refreshSessions();
  };

  /** Types the composed single-line command ONCE per session, post-open. */
  const typeLaunchLineOnce = () => {
    if (typedLaunchRef.current) return;
    // CDX-016: resumed sessions do NOT auto-type — the first composer send
    // composes the `codex exec resume` line instead.
    if (pendingResumeRef.current) {
      typedLaunchRef.current = true;
      return;
    }
    const write = writerRef.current;
    if (!write) return;
    typedLaunchRef.current = true;
    try {
      const line = composeLaunchInput(launchArgs());
      write(new TextEncoder().encode(line));
      turnRunningRef.current = true;
      setTurnRunning(true);
      logAction('type-launch-line');
    } catch (err) {
      typedLaunchRef.current = false;
      console.error('compose launch line failed:', err);
    }
  };

  const sendRawKeys = (text: string) => {
    const write = writerRef.current;
    if (!write || liveOver) return;
    write(new TextEncoder().encode(text));
  };

  /**
   * CDX-006/014: the composer is turn-aware. While a codex turn is running
   * the text is forwarded raw (approvals, mid-run steering). When idle the
   * text NEVER reaches the shell bare — it becomes a new turn: `codex exec`
   * (fresh) or `codex exec resume <threadId>` (continuation), argv-quoted.
   */
  const sendComposer = () => {
    const text = draft.trim();
    if (text === '' || liveOver) return;
    if (turnRunningRef.current) {
      sendRawKeys(text + '\n');
      setDraft('');
      logAction('composer-raw');
      return;
    }
    const threadId = currentSessionRef.current?.threadId ?? null;
    let args: string[];
    if (threadId) {
      const rejection = validateResumeOpts({
        threadId,
        prompt: text,
        model: activeModel,
        sandbox,
        search: webSearch,
      });
      if (rejection !== null) {
        setLauncherError(rejection);
        return;
      }
      args = buildCodexResumeArgs({
        threadId,
        prompt: text,
        model: activeModel,
        sandbox,
        search: webSearch,
      });
    } else {
      const rejection = validateCodexOpts({ model: activeModel, sandbox, prompt: text });
      if (rejection !== null) {
        setLauncherError(rejection);
        return;
      }
      args = buildCodexExecArgs({ model: activeModel, sandbox, prompt: text, search: webSearch });
    }
    try {
      const line = composeLaunchInput(args); // multiline gate before any send
      sendRawKeys(line);
    } catch (err) {
      setLauncherError(
        err instanceof Error && err.message === LAUNCH_MULTILINE_ERROR
          ? 'Prompt tidak boleh mengandung baris baru di jalur ketik ini'
          : 'Gagal menyusun argumen turn',
      );
      return;
    }
    // optimistic user bubble + turn bookkeeping
    setEvents((prev) => {
      const next = [...prev, { kind: 'user', text } as CodexEvent].slice(-MAX_HISTORY_EVENTS * 2);
      eventsRef.current = next;
      return next;
    });
    turnRunningRef.current = true;
    setTurnRunning(true);
    if (currentSessionRef.current && !currentSessionRef.current.title) {
      currentSessionRef.current = { ...currentSessionRef.current, title: text.slice(0, 60) };
    }
    setDraft('');
    setLauncherError(null);
    logAction(threadId ? 'composer-resume-turn' : 'composer-new-turn');
  };

  const backToLauncher = () => {
    if (currentSessionRef.current) {
      const rec = currentSessionRef.current;
      currentSessionRef.current = {
        ...rec,
        status: liveOver ? 'ended' : rec.status,
      };
      saveSessionNow();
      refreshSessions();
    }
    setPhase('launch');
    logAction('back-to-launcher');
  };

  const filteredSessions = searchSessions(sessions, sessionQuery, sessionTagFilter);
  const tagList = allTags(sessions);
  const threadBadge = currentSessionRef.current?.threadId
    ? currentSessionRef.current.threadId.slice(0, 12)
    : null;

  if (phase === 'launch') {
    return (
      <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: '#0f172a', color: '#e2e8f0', padding: 16, boxSizing: 'border-box' }}>
        {onClose && (
          <button onClick={onClose} style={btnGhostStyle}>✕ Tutup</button>
        )}
        <h2 style={{ margin: '4px 0 12px', fontSize: 18 }}>🤖 Codex — Peluncuran</h2>

        <label style={labelStyle}>Environment</label>
        <select value={envId} onChange={(e) => setEnvId((e.target as HTMLSelectElement).value)} style={inputStyle}>
          {envOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.id}</option>
          ))}
        </select>

        <label style={labelStyle}>Model (opsional)</label>
        <input
          list="mux-codex-models"
          value={modelText}
          onChange={(e) => setModelText((e.target as HTMLInputElement).value)}
          placeholder="mis. o4-mini"
          style={inputStyle}
        />
        <datalist id="mux-codex-models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {routerNotice && <div style={noticeStyle}>{routerNotice}</div>}

        <label style={labelStyle}>Sandbox</label>
        <div style={{ display: 'flex', gap: 12 }}>
          {ALLOWED_SANDBOXES.map((s) => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="radio"
                name="sandbox"
                checked={sandbox === s}
                onChange={() => setSandbox(s)}
              />
              <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{s}</span>
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.45 }}>
            <input type="radio" disabled />
            <span style={{ fontFamily: 'monospace', fontSize: 13 }}>danger-full-access ✕ kebijakan</span>
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch((e.target as HTMLInputElement).checked)} />
          <span style={{ fontSize: 13 }}>🌐 Web search (codex --search)</span>
        </label>

        <label style={labelStyle}>Tugas awal (prompt satu baris)</label>
        <textarea
          rows={3}
          value={taskPrompt}
          onChange={(e) =>
            setTaskPrompt((e.target as HTMLTextAreaElement).value.replace(/[\n\r]+/g, ' '))
          }
          placeholder="Apa yang harus dikerjakan codex?"
          style={{ ...inputStyle, resize: 'vertical' }}
        />

        <button
          onClick={launch}
          disabled={launchBlocked}
          style={{
            marginTop: 14,
            width: '100%',
            background: launchBlocked ? '#334155' : '#4f46e5',
            color: launchBlocked ? '#94a3b8' : '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '9px 0',
            fontSize: 14,
            fontWeight: 600,
            cursor: launchBlocked ? 'not-allowed' : 'pointer',
          }}
        >
          🚀 Jalankan Sesi
        </button>
        {launcherRejection !== null && <div style={dangerStyle}>{launcherRejection}</div>}
        {launcherError !== null && <div style={dangerStyle}>{launcherError}</div>}
        {noticeLog.length > 0 && (
          <div style={{ ...noticeStyle, marginTop: 10 }}>
            {noticeLog.slice(-3).map((n, i) => (
              <div key={i}>{n}</div>
            ))}
          </div>
        )}

        <label style={labelStyle}>Sesi tersimpan ({filteredSessions.length}/{sessions.length})</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={sessionQuery}
            onChange={(e) => setSessionQuery((e.target as HTMLInputElement).value)}
            placeholder="🔍 cari judul / thread / tag…"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        {tagList.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            <button
              onClick={() => setSessionTagFilter('')}
              style={{ ...btnGhostStyle, borderColor: sessionTagFilter === '' ? '#4f46e5' : '#334155' }}
            >
              semua
            </button>
            {tagList.map((t) => (
              <button
                key={t}
                onClick={() => setSessionTagFilter(sessionTagFilter === t ? '' : t)}
                style={{ ...btnGhostStyle, borderColor: sessionTagFilter === t ? '#4f46e5' : '#334155' }}
              >
                🏷 {t}
              </button>
            ))}
          </div>
        )}
        <ul style={{ ...listStyle, listStyle: 'none', paddingLeft: 0 }}>
          {filteredSessions.map((s) => (
            <li key={s.id} style={{ marginBottom: 8, padding: '6px 8px', background: '#0b1220', borderRadius: 8, border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span title={s.status} style={{ color: s.status === 'live' ? '#22c55e' : '#64748b', fontSize: 10 }}>
                  ●
                </span>
                <strong style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || '(tanpa judul)'}
                </strong>
                <button onClick={() => resumeSession(s)} disabled={launchBusy} style={btnGhostStyle}>
                  ▶ Lanjutkan
                </button>
                <button onClick={() => deleteSession(s.id)} style={{ ...btnGhostStyle, color: '#f87171' }}>
                  ✕
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.6 }}>
                  {s.threadId ? `thread ${s.threadId.slice(0, 12)}` : `#${s.id.slice(0, 8)}`} · {s.transcript.length} event · {s.envId}
                  {s.model ? ` · ${s.model}` : ''}
                </span>
                {s.tags.map((t) => (
                  <span key={t} style={{ fontSize: 10, background: '#1e293b', borderRadius: 8, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    🏷 {t}
                    <span
                      onClick={() => removeTag(s.id, t)}
                      style={{ cursor: 'pointer', color: '#f87171' }}
                      title="hapus tag"
                    >
                      ✕
                    </span>
                  </span>
                ))}
                {editingTagsFor === s.id ? (
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    <input
                      autoFocus
                      value={tagDraft}
                      onChange={(e) => setTagDraft((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if ((e as KeyboardEvent).key === 'Enter') commitTagDraft(s.id);
                        if ((e as KeyboardEvent).key === 'Escape') setEditingTagsFor(null);
                      }}
                      placeholder="tag baru + Enter"
                      style={{ ...inputStyle, width: 120, padding: '2px 6px', fontSize: 11 }}
                    />
                    <button onClick={() => commitTagDraft(s.id)} style={btnGhostStyle}>ok</button>
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setEditingTagsFor(s.id);
                      setTagDraft('');
                    }}
                    style={{ ...btnGhostStyle, fontSize: 10, padding: '1px 6px' }}
                  >
                    + tag
                  </button>
                )}
              </div>
            </li>
          ))}
          {filteredSessions.length === 0 && (
            <li style={{ fontSize: 12, opacity: 0.6 }}>Belum ada sesi yang cocok.</li>
          )}
        </ul>
        {storeNotice && <div style={noticeStyle}>{storeNotice}</div>}

        {auditLog.length > 0 && (
          <>
            <label style={labelStyle}>Audit terakhir</label>
            <ul style={{ ...listStyle, opacity: 0.7, fontFamily: 'monospace', fontSize: 11 }}>
              {auditLog.slice(-10).map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  // ─── LIVE PHASE ──────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#e2e8f0' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #1e293b' }}>
        <strong style={{ fontSize: 14 }}>🤖 Codex</strong>
        <span style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.6 }}>#{sessionId.slice(0, 8)}</span>
        {threadBadge && (
          <span title={currentSessionRef.current?.threadId ?? ''} style={{ fontFamily: 'monospace', fontSize: 10, background: '#1e293b', borderRadius: 8, padding: '1px 6px' }}>
            thread {threadBadge}
          </span>
        )}
        <span
          title={turnRunning ? 'codex sedang mengerjakan turn' : 'idle — kirim pesan untuk turn baru'}
          style={{ fontSize: 11, color: turnRunning ? '#fbbf24' : '#22c55e' }}
        >
          {turnRunning ? '🔄 running' : '⏸ idle'}
        </span>
        <button
          onClick={() => {
            const next: Surface = surface === 'chat' ? 'terminal' : 'chat';
            setSurface(next);
            logAction(`toggle-${next}`);
          }}
          style={btnGhostStyle}
        >
          {surface === 'chat' ? '⌨ Ke Terminal' : '💬 Ke Chat'}
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={backToLauncher} style={btnGhostStyle}>
          ↩ Launcher
        </button>
        {onClose && (
          <button
            onClick={() => {
              logAction('close-window');
              onClose();
            }}
            style={btnGhostStyle}
          >
            ✕
          </button>
        )}
      </header>

      {toast && <div style={{ background: '#78350f', color: '#fef3c7', padding: '6px 10px', fontSize: 13 }}>{toast}</div>}
      {liveOver && (
        <div style={{ ...noticeStyle, textAlign: 'center' }}>
          Sesi berakhir — kembali ke launcher untuk tugas berikutnya.
        </div>
      )}

      <main style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, padding: 10, overflowY: 'auto', display: surface === 'chat' ? 'block' : 'none' }}>
          <Bubbles events={events.slice(-RENDER_CAP_EVENTS)} />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: surface === 'terminal' ? 'block' : 'none' }}>
          <CodexTerminal
            terminalId={sessionId}
            onCoalescedOutput={onCodexOutput}
            registerWriter={(w) => {
              writerRef.current = w;
            }}
            onOpen={typeLaunchLineOnce}
            onEnded={(why) => {
              setLiveOver(true);
              logAction(`session-ended:${why}`);
            }}
          />
        </div>

        {showLibrary && (
          <aside style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 260, background: '#111c31', borderLeft: '1px solid #334155', padding: 10, overflowY: 'auto', zIndex: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Prompt Library</strong>
              <button onClick={() => setShowLibrary(false)} style={btnGhostStyle}>✕</button>
            </div>
            <input
              value={libTitle}
              onChange={(e) => setLibTitle((e.target as HTMLInputElement).value)}
              placeholder="judul"
              style={inputStyle}
            />
            <textarea
              rows={3}
              value={libText}
              onChange={(e) => setLibText((e.target as HTMLTextAreaElement).value.replace(/[\n\r]+/g, ' '))}
              placeholder="isi prompt"
              style={inputStyle}
            />
            <button
              onClick={() => {
                if (libTitle.trim() === '' || libText.trim() === '') return;
                store.save({
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  title: libTitle.trim(),
                  text: libText.trim(),
                  riskFlag: validateCodexPrompt(libText),
                  createdAt: Date.now(),
                });
                setLibTitle('');
                setLibText('');
                setLibEntries(store.list());
                logAction('library-save');
              }}
              style={btnGhostStyle}
            >
              + Simpan
            </button>
            <ul style={listStyle}>
              {libEntries.map((e) => (
                <li key={e.id} style={{ marginBottom: 6 }}>
                  <div>
                    {e.riskFlag && <span title="flag terlarang" style={{ color: '#f59e0b' }}>⚠ </span>}
                    <strong style={{ fontSize: 13 }}>{e.title}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <button
                      onClick={() => {
                        setTaskPrompt(e.text);
                        setPhase('launch');
                      }}
                      style={btnGhostStyle}
                    >
                      ↑ isi peluncur
                    </button>
                    <button
                      onClick={() => {
                        store.remove(e.id);
                        setLibEntries(store.list());
                        logAction('library-remove');
                      }}
                      style={btnGhostStyle}
                    >
                      hapus
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </main>

      <footer style={{ borderTop: '1px solid #1e293b', padding: '6px 10px' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setShowLibrary((v) => !v)} style={btnGhostStyle}>
            📚 Library
          </button>
          <textarea
            rows={1}
            value={draft}
            disabled={liveOver}
            onChange={(e) => setDraft((e.target as HTMLTextAreaElement).value.replace(/[\n\r]+/g, ' '))}
            placeholder={
              liveOver
                ? 'sesi berakhir'
                : turnRunning
                  ? 'teks diteruskan utuh ke PTY (approval/steering)'
                  : threadBadge
                    ? '↵ turn baru — lanjut thread codex (resume)'
                    : '↵ turn baru — codex exec'
            }
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            disabled={liveOver || draft.trim() === ''}
            onClick={sendComposer}
            style={btnGhostStyle}
          >
            Kirim
          </button>
        </div>
        {!liveOver && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, opacity: 0.6 }}>Approval:</span>
            {( ['y', 'n', 'esc'] as const ).map((a) => (
              <button
                key={a}
                disabled={liveOver}
                onClick={() => {
                  sendRawKeys(keystrokesFor(a));
                  logAction(`approve-${a}`);
                }}
                style={btnGhostStyle}
              >
                {a}
              </button>
            ))}
            <span style={{ fontSize: 11, opacity: 0.6 }}>→ persis keystroke PTY</span>
          </div>
        )}
      </footer>
    </div>
  );
}

interface EnvOption {
  id: string;
}
