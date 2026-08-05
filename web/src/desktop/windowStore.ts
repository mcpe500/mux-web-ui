export interface WindowState {
  id: string;
  appId: 'terminal' | 'files' | 'editor' | 'monitor' | 'settings';
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
  | { type: 'UPDATE_PROPS'; id: string; props: Record<string, any> };

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
    default:
      return state;
  }
}
