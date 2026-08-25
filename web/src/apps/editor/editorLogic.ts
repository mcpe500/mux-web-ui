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

// ── EDIT-014 (spec 011): word-wrap toggle with persistence ──

export const WRAP_KEY_PREFIX = 'mux_editor_wrap_';

export function wrapStorageKey(winId: string | undefined): string {
  return `${WRAP_KEY_PREFIX}${winId || 'default'}`;
}

export function loadWrapPref(winId: string | undefined): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(wrapStorageKey(winId)) === '1';
  } catch {
    return false;
  }
}

export function persistWrapPref(winId: string | undefined, on: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(wrapStorageKey(winId), on ? '1' : '0');
  } catch {
    // quota / privacy mode — best-effort only
  }
}

/** CSS for textarea AND the highlight layer must stay identical. */
export function wrapStyles(on: boolean): { whiteSpace: 'pre' | 'pre-wrap'; overflowWrap?: 'break-word' } {
  return on ? { whiteSpace: 'pre-wrap', overflowWrap: 'break-word' } : { whiteSpace: 'pre' };
}

// ── AGT-006 (spec 011): agent quick-launch cwd override merge ──

export interface AgentCwdSel {
  rootId: string;
  path: string;
}

export function mergeAgentSpawnPayload(
  baseWs: EditorWS,
  pickerSel: AgentCwdSel | null,
  envId?: string,
  agentId?: string,
): {
  cols: number;
  rows: number;
  cwd_root: string;
  cwd_path: string;
  env_id?: string;
  agent_id?: string;
} {
  const ws = pickerSel
    ? { rootId: pickerSel.rootId, basePath: pickerSel.path }
    : baseWs;
  return {
    ...cwdPayload(ws),
    ...(envId && envId !== 'termux' ? { env_id: envId } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
  };
}

// ── EDT-010: git branch badge from `git status --porcelain=v2 --branch` raw ──

export function parseGitBranch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^#\s*branch\.head\s+(\S+)/m.exec(raw);
  if (!m) return null;
  return m[1] === '(detached)' ? 'detached' : m[1];
}

// ── V051-002: terminal header label from the server-authoritative work_dir ──
// RC-02: the create response now carries the REAL working directory; the UI
// must never claim a cwd the server did not confirm (issue: header said
// home:/printing-web-app while pwd showed $HOME).

export interface WorkDirLabel {
  /** Short label for the terminal header bar. */
  label: string;
  /** Absolute path for the hover title; empty when unconfirmed. */
  title: string;
  /** True when the server did NOT confirm a cwd (legacy backend). */
  legacy: boolean;
}

export function displayWorkDir(
  workDir: string | null | undefined,
  ws: EditorWS,
): WorkDirLabel {
  if (typeof workDir === 'string' && workDir.trim() !== '') {
    const clean = workDir.replace(/\/+$/, '');
    const base = clean.split('/').pop() || clean;
    return { label: base, title: clean, legacy: false };
  }
  return { label: `${ws.rootId}:${ws.basePath || '/'}`, title: '', legacy: true };
}

// ── V051-003: boot-time version gate against GET /api/v1/health ──
// RC-01/RC-03: an outdated backend silently ignores cwd_* and the bug looks
// like a broken feature. Detect it loudly instead.

export const MIN_SERVER_VERSION = '0.5.1';

function parseSemver(v: string): number[] | null {
  if (!v) return null;
  const parts = v.trim().split('.');
  if (parts.length === 0 || !parts.every(p => /^\d+$/.test(p))) return null;
  return parts.map(p => parseInt(p, 10));
}

export function isVersionAtLeast(version: string, min: string): boolean {
  const v = parseSemver(version);
  const m = parseSemver(min);
  if (!v || !m) return false;
  const len = Math.max(v.length, m.length);
  for (let i = 0; i < len; i++) {
    const a = v[i] ?? 0;
    const b = m[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

export interface GateState {
  level: 'ok' | 'stale' | 'unknown-version' | 'unreachable' | 'pending';
  chip: 'ok' | 'warn' | 'bad';
  banner: 'red' | 'yellow' | null;
}

/**
 * Decide banner/chip from the health endpoint result.
 * - stale            : version present but < MIN → red banner + bad chip
 * - unknown-version  : 200 but no version field (very old backend) → yellow
 * - unreachable      : fetch failed / still loading → warn chip only
 */
export function gateState(
  serverVersion: string | null | undefined,
  healthFailed: boolean,
  dismissed = false,
): GateState {
  if (healthFailed || serverVersion === undefined) {
    return { level: healthFailed ? 'unreachable' : 'pending', chip: 'warn', banner: null };
  }
  if (serverVersion === null) {
    return { level: 'unknown-version', chip: 'warn', banner: 'yellow' };
  }
  if (!isVersionAtLeast(serverVersion, MIN_SERVER_VERSION)) {
    return { level: 'stale', chip: 'bad', banner: dismissed ? null : 'red' };
  }
  return { level: 'ok', chip: 'ok', banner: null };
}
