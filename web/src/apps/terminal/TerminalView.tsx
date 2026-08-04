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
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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
    fitAddon.fit();
    termRef.current = term;

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/terminals/${terminalId}/ws`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    socketRef.current = ws;

    ws.onopen = () => {
      // Send initial size
      sendResize(term.cols, term.rows);
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
          setIsDisconnected(true);
        }
      }
    };

    ws.onclose = () => {
      setIsDisconnected(true);
    };

    // User input handler
    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const encoder = new TextEncoder();
        const inputBytes = encoder.encode(data);
        const frame = new Uint8Array(1 + inputBytes.length);
        frame[0] = 0x01; // INPUT
        frame.set(inputBytes, 1);
        ws.send(frame);
      }
    });

    // Resize handler
    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        sendResize(term.cols, term.rows);
      }
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(containerRef.current);

    function sendResize(cols: number, rows: number) {
      const frame = new Uint8Array(5);
      frame[0] = 0x02; // RESIZE
      const view = new DataView(frame.buffer);
      view.setUint16(1, cols, false); // big-endian
      view.setUint16(3, rows, false);
      ws.send(frame);
    }

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [terminalId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0f172a' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', padding: '4px' }} />
      {isDisconnected && (
        <div className="terminal-disconnected-overlay">
          <span>Terminal Disconnected / Exited</span>
        </div>
      )}
    </div>
  );
}
