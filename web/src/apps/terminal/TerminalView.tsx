import { useEffect, useRef, useState } from 'preact/hooks';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  terminalId: string;
}

export function TerminalView({ terminalId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState('Terminal Disconnected / Exited');
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current || !terminalId) return;

    let isSubscribed = true;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 14,
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
    if (containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0) {
      try {
        fitAddon.fit();
      } catch (_) {}
    }
    termRef.current = term;

    let ws: WebSocket | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: number | null = null;
    let lastCols = term.cols;
    let lastRows = term.rows;

    // 1. Request attach token first (v0.2 spec)
    fetch(`/api/v1/terminals/${terminalId}/attach`, { method: 'POST' })
      .then((res) => {
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
          if (ws && ws.readyState === WebSocket.OPEN) {
            sendResize(term.cols, term.rows);
          }
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const data = new Uint8Array(event.data);
            if (data.length === 0) return;
            const opcode = data[0];
            const payload = data.subarray(1);

            if (opcode === 0x00) {
              // OUTPUT
              term.write(payload);
            } else if (opcode === 0x03) {
              // EXIT
              setDisconnectReason('Terminal Session Exited');
              setIsDisconnected(true);
            } else if (opcode === 0x04) {
              // ERROR (e.g. reattached elsewhere)
              const msg = new TextDecoder().decode(payload);
              setDisconnectReason(msg || 'Reattached elsewhere');
              setIsDisconnected(true);
            }
          }
        };

        ws.onclose = (ev) => {
          if (isSubscribed) {
            if (ev.reason) {
              setDisconnectReason(ev.reason);
            }
            setIsDisconnected(true);
          }
        };

        // User input handler
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
              if (ws && ws.readyState === WebSocket.OPEN) {
                sendResize(term.cols, term.rows);
              }
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
      })
      .catch((err) => {
        console.error('Failed to attach to terminal:', err);
        if (isSubscribed) {
          setDisconnectReason('Failed to attach session');
          setIsDisconnected(true);
        }
      });

    function sendResize(cols: number, rows: number) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const frame = new Uint8Array(5);
      frame[0] = 0x02; // RESIZE
      const view = new DataView(frame.buffer);
      view.setUint16(1, cols, false); // big-endian
      view.setUint16(3, rows, false);
      ws.send(frame);
    }

    return () => {
      isSubscribed = false;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      if (dataDisposable) dataDisposable.dispose();
      if (resizeObserver) resizeObserver.disconnect();
      if (ws) ws.close();
      term.dispose();
    };
  }, [terminalId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0f172a' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', padding: '4px' }} />
      {isDisconnected && (
        <div className="terminal-disconnected-overlay">
          <span>{disconnectReason}</span>
        </div>
      )}
    </div>
  );
}
