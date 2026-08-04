import { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { WindowState } from './windowStore';

interface WindowFrameProps {
  win: WindowState;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onUpdateBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }) => void;
  children: ComponentChildren;
}

export function WindowFrame({
  win,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onUpdateBounds,
  children,
}: WindowFrameProps) {
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, winX: 0, winY: 0 });

  const handlePointerDown = (e: PointerEvent) => {
    onFocus();
    if ((e.target as HTMLElement).closest('.window-controls')) return;

    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, winX: win.x, winY: win.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging.current || win.isMaximized) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    onUpdateBounds({
      x: Math.max(0, dragStart.current.winX + dx),
      y: Math.max(0, dragStart.current.winY + dy),
    });
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  if (win.isMinimized) {
    return null;
  }

  const style = win.isMaximized
    ? {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: win.zIndex,
      }
    : {
        position: 'absolute' as const,
        top: `${win.y}px`,
        left: `${win.x}px`,
        width: `${win.width}px`,
        height: `${win.height}px`,
        zIndex: win.zIndex,
      };

  return (
    <div className={`window-frame ${win.isMaximized ? 'maximized' : ''}`} style={style} onClick={onFocus}>
      <div
        className="window-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="window-title">
          <span className="window-icon">{win.icon}</span>
          <span>{win.title}</span>
        </div>
        <div className="window-controls">
          <button className="win-btn minimize" onClick={onMinimize} title="Minimize">
            —
          </button>
          <button className="win-btn maximize" onClick={onMaximize} title="Maximize">
            {win.isMaximized ? '❐' : '□'}
          </button>
          <button className="win-btn close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}
