export interface WindowState {
  id: string;
  appId: 'terminal' | 'files' | 'editor' | 'monitor' | 'settings' | 'git' | 'packages' | 'archive' | 'share' | 'browser' | 'support';
  title: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
  props?: Record<string, any>;
}

export type WindowAction =
  | { type: 'OPEN_WINDOW'; payload: Omit<WindowState, 'zIndex' | 'isMinimized' | 'isMaximized'> }
  | { type: 'CLOSE_WINDOW'; id: string }
  | { type: 'FOCUS_WINDOW'; id: string }
  | { type: 'MINIMIZE_WINDOW'; id: string }
  | { type: 'MAXIMIZE_WINDOW'; id: string }
  | { type: 'RESTORE_WINDOW'; id: string }
  | { type: 'UPDATE_BOUNDS'; id: string; bounds: { x?: number; y?: number; width?: number; height?: number } }
  | { type: 'UPDATE_PROPS'; id: string; props: Record<string, any> }
  | { type: 'TILE_GRID'; canvasWidth: number; canvasHeight: number }
  | { type: 'BATCH_ADD_WINDOWS'; windows: Omit<WindowState, 'zIndex' | 'isMinimized' | 'isMaximized'>[]; canvasWidth: number; canvasHeight: number };

export function windowReducer(state: WindowState[], action: WindowAction): WindowState[] {
  switch (action.type) {
    case 'OPEN_WINDOW': {
      const maxZ = state.reduce((max, w) => Math.max(max, w.zIndex), 0);
      const newWin: WindowState = {
        ...action.payload,
        zIndex: maxZ + 1,
        isMinimized: false,
        isMaximized: false,
      };
      return [...state, newWin];
    }
    case 'CLOSE_WINDOW': {
      return state.filter((w) => w.id !== action.id);
    }
    case 'FOCUS_WINDOW': {
      const maxZ = state.reduce((max, w) => Math.max(max, w.zIndex), 0);
      return state.map((w) => {
        if (w.id === action.id) {
          return { ...w, zIndex: maxZ + 1, isMinimized: false };
        }
        return w;
      });
    }
    case 'MINIMIZE_WINDOW': {
      return state.map((w) => (w.id === action.id ? { ...w, isMinimized: true } : w));
    }
    case 'MAXIMIZE_WINDOW': {
      return state.map((w) => (w.id === action.id ? { ...w, isMaximized: !w.isMaximized } : w));
    }
    case 'RESTORE_WINDOW': {
      const maxZ = state.reduce((max, w) => Math.max(max, w.zIndex), 0);
      return state.map((w) => (w.id === action.id ? { ...w, isMinimized: false, zIndex: maxZ + 1 } : w));
    }
    case 'UPDATE_BOUNDS': {
      return state.map((w) => (w.id === action.id ? { ...w, ...action.bounds } : w));
    }
    case 'UPDATE_PROPS': {
      return state.map((w) =>
        w.id === action.id ? { ...w, props: { ...w.props, ...action.props } } : w
      );
    }
    case 'TILE_GRID': {
      return tileWindowsGrid(state, action.canvasWidth, action.canvasHeight);
    }
    case 'BATCH_ADD_WINDOWS': {
      let maxZ = state.reduce((max, w) => Math.max(max, w.zIndex), 0);
      const newWins: WindowState[] = action.windows.map((w) => {
        maxZ++;
        return {
          ...w,
          zIndex: maxZ,
          isMinimized: false,
          isMaximized: false,
        };
      });
      const combined = [...state, ...newWins];
      return tileWindowsGrid(combined, action.canvasWidth, action.canvasHeight);
    }
    default:
      return state;
  }
}

function tileWindowsGrid(windows: WindowState[], canvasWidth: number, canvasHeight: number): WindowState[] {
  const visible = windows.filter((w) => !w.isMinimized);
  const count = visible.length;
  if (count === 0) return windows;

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const cellWidth = Math.floor(canvasWidth / cols);
  const cellHeight = Math.floor(canvasHeight / rows);

  let visIdx = 0;
  return windows.map((w) => {
    if (w.isMinimized) return w;
    const r = Math.floor(visIdx / cols);
    const c = visIdx % cols;
    visIdx++;
    return {
      ...w,
      isMaximized: false,
      x: c * cellWidth,
      y: r * cellHeight,
      width: cellWidth,
      height: cellHeight,
    };
  });
}
