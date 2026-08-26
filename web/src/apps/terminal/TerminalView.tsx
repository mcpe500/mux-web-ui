import { useEffect, useRef, useState } from 'preact/hooks';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { TERMINAL_FONT_STACK, applyTerminalAddons } from './terminalConfig';
import {
  FrameOpcode,
  canOpenSocket,
  nextReconnectDelay,
  shouldStopOnAttachStatus,
  shouldStopOnFrame,
} from './reconnect';
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  terminalId: string;
}

/** AFK-004: attach failures that must permanently stop the reconnect loop. */
class StopReconnectError extends Error {}

/**
 * Spec 012 (v0.6.2): WS reconnect dengan backoff exponensial (AFK-001..004),
 * guard satu socket (AFK-003), re-attach saat tab kembali visible (AFK-005),
 * indicator reconnecting ringan (AFK-007) — bukan overlay penuh.
 */
export function TerminalView({ terminalId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState('Terminal Disconnected / Exited');
  const [reconnecting, setReconnecting] = useState(false);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current || !terminalId) return;

    let isSubscribed = true;
    let stopped = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let currentAttempt = 0;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: TERMINAL_FONT_STACK,
      fontSize: 14,
      // V051-004: term.unicode.register/activeVersion (dipakai Unicode11Addon)
      // adalah proposed API — wajib true atau activate() melempar Error.
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

    term.open(containerRef.current);
    // V051-004: unicode 11 width tables so prompt glyphs/emoji measure right.
    applyTerminalAddons(term);
    if (containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0) {
      try {
        fitAddon.fit();
      } catch (_) {}
    }
    termRef.current = term;

    let raf: number | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: number | null = null;
    let lastCols = term.cols;
    let lastRows = term.rows;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const setStatus = (disconnected: boolean, reason?: string, reconnectingState = false) => {
      if (!isSubscribed) return;
      setIsDisconnected(disconnected);
      setReconnecting(reconnectingState);
      if (reason !== undefined) setDisconnectReason(reason);
    };

    /** AFK-004: sesi hilang / EXIT / ERROR → hentikan loop selamanya. */
    const stopReconnect = (reason: string) => {
      stopped = true;
      clearReconnectTimer();
      setStatus(true, reason, false);
    };

    /** AFK-001/006: backoff exponensial; ditahan saat tab hidden. */
    const scheduleReconnect = () => {
      if (!isSubscribed || stopped) return;
      setStatus(false, undefined, true);
      // Hidden (AFK) — tunda sampai visibilitychange memicu connect() ulang.
      if (document.visibilityState === 'hidden') return;
      const delay = nextReconnectDelay(currentAttempt);
      currentAttempt += 1;
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    function sendResize(cols: number, rows: number) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const frame = new Uint8Array(5);
      frame[0] = 0x02; // RESIZE
      const view = new DataView(frame.buffer);
      view.setUint16(1, cols, false); // big-endian
      view.setUint16(3, rows, false);
      ws.send(frame);
    }

    /** 2. Ambil token attach lalu buka WS; reusable untuk reconnect. */
    const connect = () => {
      if (!isSubscribed || stopped) return;
      // AFK-003: jangan pernah punya dua socket live.
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
      setStatus(false, undefined, true);

      fetch(`/api/v1/terminals/${terminalId}/attach`, { method: 'POST' })
        .then((res) => {
          if (shouldStopOnAttachStatus(res.status)) {
            throw new StopReconnectError(`Sesi diakhiri server (HTTP ${res.status})`);
          }
          if (!res.ok) throw new Error(`Attach request failed (${res.status})`);
          return res.json();
        })
        .then((data) => {
          if (!isSubscribed) return;

          const token = data.ws_token;
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${protocol}//${window.location.host}/api/v1/terminals/${terminalId}/ws?token=${encodeURIComponent(token)}`;

          ws = new WebSocket(wsUrl);
          ws.binaryType = 'arraybuffer';
          socketRef.current = ws;

          ws.onopen = () => {
            currentAttempt = 0;
            setStatus(false, undefined, false);
            if (ws && ws.readyState === WebSocket.OPEN) {
              sendResize(term.cols, term.rows);
            }
          };

          // PERF-006: coalesce OUTPUT frames to 1 term.write per animation frame
          let pending: Uint8Array[] = [];
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
            term.write(merged);
          };
          const schedule = (chunk: Uint8Array) => {
            pending.push(chunk);
            if (raf !== null) return;
            raf = requestAnimationFrame(flush);
          };

          ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
              const data = new Uint8Array(event.data);
              if (data.length === 0) return;
              const opcode = data[0];
              const payload = data.subarray(1);

              if (opcode === FrameOpcode.OUTPUT) {
                // OUTPUT - coalesced (PERF-006)
                schedule(new Uint8Array(payload));
              } else if (opcode === FrameOpcode.PING) {
                // PING dari server (LIFE-010) -> pong
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(new Uint8Array([0x06])); // PONG
                }
              } else if (shouldStopOnFrame(opcode)) {
                // EXIT atau ERROR → AFK-004: hentikan reconnect loop.
                const msg =
                  opcode === FrameOpcode.EXIT
                    ? 'Terminal Session Exited'
                    : new TextDecoder().decode(payload) || 'Reattached elsewhere';
                stopReconnect(msg);
              }
            }
          };

          ws.onclose = (ev) => {
            if (!isSubscribed || stopped) return;
            if (ev.reason) {
              setDisconnectReason(ev.reason);
            }
            scheduleReconnect();
          };

          ws.onerror = () => {
            // onclose menyusul → reconnect via onclose
          };
        })
        .catch((err) => {
          console.error('Failed to attach to terminal:', err);
          if (!isSubscribed) return;
          if (err instanceof StopReconnectError) {
            stopReconnect(err.message);
            return;
          }
          scheduleReconnect();
        });
    };

    // User input handler (dipasang sekali; memakai binding ws yang mutable)
    dataDisposable = term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const encoder = new TextEncoder();
        const inputBytes = encoder.encode(data);
        const frame = new Uint8Array(1 + inputBytes.length);
        frame[0] = 0x01; // INPUT
        frame.set(inputBytes, 1);
        ws.send(frame);
      }
    });

    // Resize handler with trailing-edge debounce
    const handleResize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth <= 0 || clientHeight <= 0) return;

      try {
        fitAddon.fit();
        if (term.cols !== lastCols || term.rows !== lastRows) {
          lastCols = term.cols;
          lastRows = term.rows;
          sendResize(term.cols, term.rows);
        }
      } catch (err) {
        console.warn('Terminal fit failed:', err);
      }
    };

    const debouncedResize = () => {
      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(handleResize, 75);
    };

    resizeObserver = new ResizeObserver(() => debouncedResize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // AFK-005/006: saat tab kembali visible dan socket mati → langsung re-attach
    // tanpa menunggu backoff; saat hidden → timer ditahan oleh scheduleReconnect.
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

    connect(); // attach awal

    return () => {
      isSubscribed = false;
      stopped = true;
      clearReconnectTimer();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      if (raf !== null) cancelAnimationFrame(raf);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      if (dataDisposable) dataDisposable.dispose();
      if (resizeObserver) resizeObserver.disconnect();
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch (_) {}
      }
      term.dispose();
      termRef.current = null;
    };
  }, [terminalId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0f172a' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', padding: '4px' }} />
      {reconnecting && !isDisconnected && (
        <span className="term-reconnect">• Menghubungkan ulang…</span>
      )}
      {isDisconnected && (
        <div className="terminal-disconnected-overlay">
          <span>{disconnectReason}</span>
        </div>
      )}
    </div>
  );
}
