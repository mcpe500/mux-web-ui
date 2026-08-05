import { useReducer, useEffect, useRef } from 'preact/hooks';
import { windowReducer, WindowState } from './windowStore';
import { WindowFrame } from './WindowFrame';
import { TerminalView } from '../apps/terminal/TerminalView';
import { FileExplorerView } from '../apps/files/FileExplorerView';
import { TextEditorView } from '../apps/editor/TextEditorView';
import { SystemMonitorView } from '../apps/monitor/SystemMonitorView';

export function DesktopCanvas() {
  const [windows, dispatch] = useReducer(windowReducer, []);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Open default terminal on initial load
  useEffect(() => {
    openTerminal();
  }, []);

  const getCanvasBounds = () => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      return { width: rect.width || window.innerWidth, height: rect.height || (window.innerHeight - 44) };
    }
    return { width: window.innerWidth, height: window.innerHeight - 44 };
  };

  const openTerminal = (_workDir?: string) => {
    fetch('/api/v1/terminals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols: 80, rows: 24 }),
    })
      .then((res) => res.json())
      .then((data) => {
        dispatch({
          type: 'OPEN_WINDOW',
          payload: {
            id: data.id,
            appId: 'terminal',
            title: `Terminal (${data.id})`,
            icon: '💻',
            x: 50 + Math.random() * 40,
            y: 40 + Math.random() * 30,
            width: 700,
            height: 440,
            props: { terminalId: data.id },
          },
        });
      })
      .catch((err) => console.error('Failed to create terminal session:', err));
  };

  const spawnMultipleTerminals = async (count: number) => {
    const { width, height } = getCanvasBounds();
    const newWindows: Omit<WindowState, 'zIndex' | 'isMinimized' | 'isMaximized'>[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const res = await fetch('/api/v1/terminals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cols: 80, rows: 24 }),
        });
        const data = await res.json();
        newWindows.push({
          id: data.id,
          appId: 'terminal',
          title: `Terminal (${data.id})`,
          icon: '💻',
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          props: { terminalId: data.id },
        });
      } catch (err) {
        console.error('Failed spawning batch terminal:', err);
      }
    }

    if (newWindows.length > 0) {
      dispatch({
        type: 'BATCH_ADD_WINDOWS',
        windows: newWindows,
        canvasWidth: width,
        canvasHeight: height,
      });
    }
  };

  const openFileExplorer = () => {
    const id = `files-${Date.now()}`;
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id,
        appId: 'files',
        title: 'File Explorer',
        icon: '📁',
        x: 100,
        y: 60,
        width: 650,
        height: 480,
      },
    });
  };

  const openEditor = (rootId?: string, filePath?: string) => {
    const existingEditor = windows.find((w) => w.appId === 'editor');
    if (existingEditor && rootId && filePath) {
      dispatch({
        type: 'UPDATE_PROPS',
        id: existingEditor.id,
        props: { rootId, filePath, openNewFile: true },
      });
      dispatch({ type: 'FOCUS_WINDOW', id: existingEditor.id });
      return;
    }

    const id = `editor-${Date.now()}`;
    const title = filePath ? `Editor - ${filePath.split('/').pop() || filePath}` : 'Code Editor';
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id,
        appId: 'editor',
        title,
        icon: '📝',
        x: 80,
        y: 40,
        width: 900,
        height: 580,
        props: { rootId, filePath },
      },
    });
  };

  const openMonitor = () => {
    const id = `monitor-${Date.now()}`;
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id,
        appId: 'monitor',
        title: 'System Monitor',
        icon: '📊',
        x: 180,
        y: 100,
        width: 500,
        height: 320,
      },
    });
  };

  const handleTileGrid = () => {
    const { width, height } = getCanvasBounds();
    dispatch({ type: 'TILE_GRID', canvasWidth: width, canvasHeight: height });
  };

  return (
    <div className="desktop-viewport">
      <div className="desktop-canvas" ref={canvasRef}>
        {windows.map((win) => (
          <WindowFrame
            key={win.id}
            win={win}
            onFocus={() => dispatch({ type: 'FOCUS_WINDOW', id: win.id })}
            onClose={() => dispatch({ type: 'CLOSE_WINDOW', id: win.id })}
            onMinimize={() => dispatch({ type: 'MINIMIZE_WINDOW', id: win.id })}
            onMaximize={() => dispatch({ type: 'MAXIMIZE_WINDOW', id: win.id })}
            onUpdateBounds={(bounds) => dispatch({ type: 'UPDATE_BOUNDS', id: win.id, bounds })}
          >
            {win.appId === 'terminal' && <TerminalView terminalId={win.props?.terminalId} />}
            {win.appId === 'files' && (
              <FileExplorerView
                onOpenFile={(root, path) => openEditor(root, path)}
                onOpenTerminalHere={(_root, path) => openTerminal(path)}
              />
            )}
            {win.appId === 'editor' && (
              <TextEditorView
                rootId={win.props?.rootId}
                filePath={win.props?.filePath}
                initialRoot={win.props?.initialRoot}
              />
            )}
            {win.appId === 'monitor' && <SystemMonitorView />}
          </WindowFrame>
        ))}
      </div>

      {/* Taskbar */}
      <div className="taskbar">
        <button className="start-btn" onClick={() => openTerminal()}>
          ⚡ New Terminal
        </button>
        <button className="start-btn" onClick={() => spawnMultipleTerminals(4)} style={{ background: '#4f46e5' }}>
          🔲 4 Terminals (2x2)
        </button>
        <button className="start-btn" onClick={() => spawnMultipleTerminals(16)} style={{ background: '#0284c7' }}>
          🔲 16 Terminals (4x4)
        </button>
        <button className="start-btn" onClick={handleTileGrid} style={{ background: '#059669' }}>
          📐 Tile Grid
        </button>
        <button className="start-btn" onClick={openFileExplorer} style={{ background: '#3b82f6' }}>
          📁 Files
        </button>
        <button className="start-btn" onClick={() => openEditor()} style={{ background: '#8b5cf6' }}>
          📝 Editor
        </button>
        <button className="start-btn" onClick={openMonitor} style={{ background: '#10b981' }}>
          📊 Monitor
        </button>

        <div className="taskbar-items">
          {windows.map((win) => (
            <button
              key={win.id}
              className={`taskbar-item ${!win.isMinimized ? 'active' : ''} ${win.isMinimized ? 'minimized' : ''}`}
              onClick={() => {
                if (win.isMinimized) {
                  dispatch({ type: 'RESTORE_WINDOW', id: win.id });
                } else {
                  dispatch({ type: 'FOCUS_WINDOW', id: win.id });
                }
              }}
            >
              <span>{win.icon}</span>
              <span>{win.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
