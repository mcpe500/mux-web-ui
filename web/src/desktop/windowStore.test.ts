import { describe, it, expect } from 'vitest';
import { windowReducer, WindowState, WindowAction } from './windowStore';

describe('windowStore', () => {
  const initialWindows: WindowState[] = [
    {
      id: 'term-1',
      appId: 'terminal',
      title: 'Terminal 1',
      icon: '💻',
      x: 50,
      y: 50,
      width: 600,
      height: 400,
      zIndex: 1,
      isMinimized: false,
      isMaximized: false,
    },
  ];

  it('handles UPDATE_BOUNDS correctly', () => {
    const action: WindowAction = {
      type: 'UPDATE_BOUNDS',
      id: 'term-1',
      bounds: { width: 800, height: 500, x: 100, y: 120 },
    };

    const state = windowReducer(initialWindows, action);
    expect(state[0].width).toBe(800);
    expect(state[0].height).toBe(500);
    expect(state[0].x).toBe(100);
    expect(state[0].y).toBe(120);
  });

  it('preserves other window states when updating bounds', () => {
    const action: WindowAction = {
      type: 'UPDATE_BOUNDS',
      id: 'term-1',
      bounds: { width: 750 },
    };

    const state = windowReducer(initialWindows, action);
    expect(state[0].width).toBe(750);
    expect(state[0].height).toBe(400);
    expect(state[0].x).toBe(50);
    expect(state[0].y).toBe(50);
  });

  it('handles MAXIMIZE_WINDOW toggle', () => {
    const action: WindowAction = {
      type: 'MAXIMIZE_WINDOW',
      id: 'term-1',
    };

    const state1 = windowReducer(initialWindows, action);
    expect(state1[0].isMaximized).toBe(true);

    const state2 = windowReducer(state1, action);
    expect(state2[0].isMaximized).toBe(false);
  });
});
