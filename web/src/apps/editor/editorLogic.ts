// Pure logic for the VS Code-like editor integration (spec 006).
// DOM-free so it can be unit tested in vitest's node environment.

export interface EditorWS {
  rootId: string;
  basePath: string;
}

// ── EDT-001: spawn-on-demand vs toggle (never duplicate a PTY) ──

export type TermAction = 'spawn' | 'show' | 'hide';

export function nextTerminalAction(show: boolean, termId: string | null): TermAction {
  if (!show && termId === null) return 'spawn';
  return show ? 'hide' : 'show';
}

// ── EDT-002/009: terminal follows the opened folder ──

export function cwdPayload(ws: EditorWS): {
  cols: number;
  rows: number;
  cwd_root: string;
  cwd_path: string;
} {
  return { cols: 80, rows: 24, cwd_root: ws.rootId, cwd_path: ws.basePath };
}

// ── EDT-003: split panel ratio clamp (editor fraction 0.25..0.75) ──

export function clampRatio(ratio: number, min = 0.25, max = 0.75): number {
  if (Number.isNaN(ratio)) return min;
  return Math.min(max, Math.max(min, ratio));
}

// ── EDT-005: friendly MAX_SESSIONS guard ──

export function spawnErrorMessage(status: number): string | null {
  if (status === 409) return 'MAX_SESSIONS — close another terminal first';
  if (status >= 400) return 'Spawn failed';
  return null;
}

// ── EDT-007: workspace persistence with tamper-proof fallback ──

const WS_KEY_PREFIX = 'mux_editor_ws_';

export function wsStorageKey(winId: string | undefined): string {
  return `${WS_KEY_PREFIX}${winId || 'default'}`;
}

export function safeLoadWorkspace(raw: string | null, defaultRoot = 'home'): EditorWS {
  try {
    if (!raw) throw new Error('empty');
    const o = JSON.parse(raw);
    if (
      o &&
      typeof o === 'object' &&
      typeof (o as EditorWS).rootId === 'string' &&
      typeof (o as EditorWS).basePath === 'string'
    ) {
      return { rootId: (o as EditorWS).rootId, basePath: (o as EditorWS).basePath };
    }
    throw new Error('shape');
  } catch {
    return { rootId: defaultRoot, basePath: '' };
  }
}

export function loadPersistedWorkspace(winId: string | undefined, defaultRoot = 'home'): EditorWS {
  if (typeof window === 'undefined' || !window.localStorage) return { rootId: defaultRoot, basePath: '' };
  try {
    return safeLoadWorkspace(window.localStorage.getItem(wsStorageKey(winId)), defaultRoot);
  } catch {
    return { rootId: defaultRoot, basePath: '' };
  }
}

export function persistWorkspace(winId: string | undefined, ws: EditorWS): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(wsStorageKey(winId), JSON.stringify(ws));
  } catch {
    // quota / privacy mode — persistence is best-effort only
  }
}

// ── EDT-010: git branch badge from `git status --porcelain=v2 --branch` raw ──

export function parseGitBranch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^#\s*branch\.head\s+(\S+)/m.exec(raw);
  if (!m) return null;
  return m[1] === '(detached)' ? 'detached' : m[1];
}
