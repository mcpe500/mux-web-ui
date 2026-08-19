import { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { WindowState } from './windowStore';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WIDTH = 240;
const MIN_HEIGHT = 140;

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

  const isResizing = useRef(false);
  const resizeDir = useRef<ResizeDirection | null>(null);
  const resizeStart = useRef({
    clientX: 0,
    clientY: 0,
    winX: 0,
    winY: 0,
    winWidth: 0,
    winHeight: 0,
  });

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

  const handleResizePointerDown = (e: PointerEvent, dir: ResizeDirection) => {
    e.stopPropagation();
    onFocus();
    isResizing.current = true;
    resizeDir.current = dir;
    resizeStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      winX: win.x,
      winY: win.y,
      winWidth: win.width,
      winHeight: win.height,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: PointerEvent) => {
    if (!isResizing.current || !resizeDir.current || win.isMaximized) return;

    const dx = e.clientX - resizeStart.current.clientX;
    const dy = e.clientY - resizeStart.current.clientY;
    const dir = resizeDir.current;

    let newX = resizeStart.current.winX;
    let newY = resizeStart.current.winY;
    let newWidth = resizeStart.current.winWidth;
    let newHeight = resizeStart.current.winHeight;

    if (dir.includes('e')) {
      newWidth = Math.max(MIN_WIDTH, resizeStart.current.winWidth + dx);
    }
    if (dir.includes('s')) {
      newHeight = Math.max(MIN_HEIGHT, resizeStart.current.winHeight + dy);
    }
    if (dir.includes('w')) {
      const candidateWidth = resizeStart.current.winWidth - dx;
      if (candidateWidth >= MIN_WIDTH) {
        newWidth = candidateWidth;
        newX = resizeStart.current.winX + dx;
      } else {
        newWidth = MIN_WIDTH;
        newX = resizeStart.current.winX + (resizeStart.current.winWidth - MIN_WIDTH);
      }
    }
    if (dir.includes('n')) {
      const candidateHeight = resizeStart.current.winHeight - dy;
      if (candidateHeight >= MIN_HEIGHT) {
        newHeight = candidateHeight;
        newY = resizeStart.current.winY + dy;
      } else {
        newHeight = MIN_HEIGHT;
        newY = resizeStart.current.winY + (resizeStart.current.winHeight - MIN_HEIGHT);
      }
    }

    onUpdateBounds({
      x: Math.max(0, newX),
      y: Math.max(0, newY),
      width: newWidth,
      height: newHeight,
    });
  };

  const handleResizePointerUp = (e: PointerEvent) => {
    if (isResizing.current) {
      isResizing.current = false;
      resizeDir.current = null;
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

      {!win.isMaximized && (
        <>
          {/* Border resize handles */}
          <div
            className="resize-handle resize-top"
            onPointerDown={(e) => handleResizePointerDown(e, 'n')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          />
          <div
            className="resize-handle resize-bottom"
            onPointerDown={(e) => handleResizePointerDown(e, 's')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          />
          <div
            className="resize-handle resize-left"
            onPointerDown={(e) => handleResizePointerDown(e, 'w')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          />
          <div
            className="resize-handle resize-right"
            onPointerDown={(e) => handleResizePointerDown(e, 'e')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          />

          {/* Corner resize handles */}
          <div
            className="resize-handle resize-top-left"
            onPointerDown={(e) => handleResizePointerDown(e, 'nw')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          />
          <div
            className="resize-handle resize-top-right"
            onPointerDown={(e) => handleResizePointerDown(e, 'ne')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          />
          <div
            className="resize-handle resize-bottom-left"
            onPointerDown={(e) => handleResizePointerDown(e, 'sw')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          />
          <div
            className="resize-handle resize-bottom-right"
            onPointerDown={(e) => handleResizePointerDown(e, 'se')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          >
            <div className="resize-grip" />
          </div>
        </>
      )}
    </div>
  );
}
