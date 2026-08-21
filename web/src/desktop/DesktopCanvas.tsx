import { useReducer, useEffect, useRef, useState } from 'preact/hooks';
import { windowReducer, WindowState } from './windowStore';
import { WindowFrame } from './WindowFrame';
import { TerminalView } from '../apps/terminal/TerminalView';
import { FileExplorerView } from '../apps/files/FileExplorerView';
import { TextEditorView } from '../apps/editor/TextEditorView';
import { SystemMonitorView } from '../apps/monitor/SystemMonitorView';
import { GitView } from '../apps/git/GitView';
import { PackageCenterView } from '../apps/packages/PackageCenterView';
import { ShareModal } from '../apps/share/ShareModal';
import { BrowserView } from '../apps/browser/BrowserView';
import { Toolbar } from './Toolbar';
import { StartMenu } from './StartMenu';
import { SearchApp } from './SearchApp';

export function DesktopCanvas() {
  const [windows, dispatch] = useReducer(windowReducer, []);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [timeStr, setTimeStr] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }));

  // Open default terminal on initial load
  useEffect(() => {
    openTerminal();
  }, []);

  // Clock + global search shortcut
  useEffect(() => {
    const t = setInterval(() => setTimeStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })), 60000);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k')) { e.preventDefault(); setSearchOpen(true); }
      if (e.key === 'Escape') { setStartOpen(false); setSearchOpen(false); }
    };
    window.addEventListener('keydown', onKey as any);
    return () => { clearInterval(t); window.removeEventListener('keydown', onKey as any); };
  }, []);

  const openApp = (appId: string) => {
    if (appId === 'terminal') openTerminal();
    else if (appId === 'files') openFileExplorer();
    else if (appId === 'editor') openEditor();
    else if (appId === 'browser') openBrowser();
    else if (appId === 'git') openGit();
    else if (appId === 'packages') openPackages();
    else if (appId === 'share') openShare();
    else if (appId === 'monitor') openMonitor();
  };

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

  const openGit = (rootId: string = 'home', repoPath: string = '') => {
    const id = `git-${Date.now()}`;
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id,
        appId: 'git',
        title: `Git ${repoPath || rootId}`,
        icon: '🔧',
        x: 120,
        y: 80,
        width: 700,
        height: 500,
        props: { rootId, repoPath },
      },
    });
  };

  const openPackages = () => {
    const id = `packages-${Date.now()}`;
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id,
        appId: 'packages',
        title: 'Packages',
        icon: '📦',
        x: 140,
        y: 90,
        width: 650,
        height: 480,
      },
    });
  };

  const openShare = () => {
    const id = `share-${Date.now()}`;
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id,
        appId: 'share',
        title: 'Share Links',
        icon: '🔗',
        x: 160,
        y: 100,
        width: 500,
        height: 400,
      },
    });
  };

  const openBrowser = (url?: string) => {
    const id = `browser-${Date.now()}`;
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id,
        appId: 'browser',
        title: 'Browser',
        icon: '🌐',
        x: 100,
        y: 50,
        width: 900,
        height: 600,
        props: { url },
      },
    });
  };

  const handleTileGrid = () => {
    const { width, height } = getCanvasBounds();
    dispatch({ type: 'TILE_GRID', canvasWidth: width, canvasHeight: height });
  };

  return (
    <div className="desktop-viewport" onClick={()=> { setStartOpen(false); setSearchOpen(false); }}>
      <div className="desktop-canvas" ref={canvasRef} onClick={()=> { setStartOpen(false); setSearchOpen(false); }}>
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
                onOpenInGit={(root, path) => openGit(root, path)}
              />
            )}
            {win.appId === 'editor' && (
              <TextEditorView
                rootId={win.props?.rootId}
                filePath={win.props?.filePath}
                initialRoot={win.props?.initialRoot}
                winId={win.id}
              />
            )}
            {win.appId === 'monitor' && <SystemMonitorView />}
            {win.appId === 'git' && <GitView rootId={win.props?.rootId} repoPath={win.props?.repoPath} />}
            {win.appId === 'packages' && <PackageCenterView />}
            {win.appId === 'share' && <ShareModal />}
            {win.appId === 'browser' && <BrowserView />}
          </WindowFrame>
        ))}
      </div>

      {/* Windows 11 Taskbar + Search + Start */}
      <Toolbar onOpenApp={openApp} onSearch={()=> setSearchOpen(true)} onToggleStart={()=> setStartOpen(v=>!v)} startOpen={startOpen} timeStr={timeStr} />
      <StartMenu open={startOpen} onClose={()=> setStartOpen(false)} onOpenApp={openApp} />
      <SearchApp open={searchOpen} onClose={()=> setSearchOpen(false)} onOpenApp={openApp} />

      {/* Running apps + quick actions - Windows taskbar items */}
      <div style={{ height: '40px', background: 'rgba(32,32,32,0.92)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px', overflowX: 'auto' }}>
        <button onClick={() => spawnMultipleTerminals(4)} title="4 Terminals" style={{ padding: '6px 8px', background: '#4f46e5', color: 'white', borderRadius: '6px', fontSize: '12px' }}>⊞ 4</button>
        <button onClick={() => spawnMultipleTerminals(16)} title="16 Terminals" style={{ padding: '6px 8px', background: '#0284c7', color: 'white', borderRadius: '6px', fontSize: '12px' }}>⊞ 16</button>
        <button onClick={handleTileGrid} title="Tile Grid" style={{ padding: '6px 8px', background: '#059669', color: 'white', borderRadius: '6px', fontSize: '12px' }}>📐 Tile</button>
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
        {windows.map((win) => (
          <button
            key={win.id}
            className={`taskbar-item ${!win.isMinimized ? 'active' : ''} ${win.isMinimized ? 'minimized' : ''}`}
            onClick={() => {
              if (win.isMinimized) dispatch({ type: 'RESTORE_WINDOW', id: win.id });
              else dispatch({ type: 'FOCUS_WINDOW', id: win.id });
            }}
            title={win.title}
          >
            <span>{win.icon}</span>
            <span>{win.title}</span>
          </button>
        ))}
        {windows.length===0 && <span style={{ color: '#64748b', fontSize: '12px' }}>No windows • Press ⊞ or Ctrl+K to search apps</span>}
      </div>
    </div>
  );
}
