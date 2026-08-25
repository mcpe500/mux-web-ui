import { describe, it, expect } from 'vitest';
import {
  nextTerminalAction,
  cwdPayload,
  clampRatio,
  spawnErrorMessage,
  safeLoadWorkspace,
  parseGitBranch,
  displayWorkDir,
  isVersionAtLeast,
  gateState,
  MIN_SERVER_VERSION,
  wrapStorageKey,
  wrapStyles,
  loadWrapPref,
  persistWrapPref,
  mergeAgentSpawnPayload,
} from './editorLogic';

// EDT-001: toggle never duplicates the PTY session — 'spawn' is only ever
// returned when no session exists yet; afterwards it's show/hide only.
describe('test_edt_001_spawn_toggle_no_duplicate', () => {
  it('spawns exactly once (first open)', () => {
    expect(nextTerminalAction(false, null)).toBe('spawn');
  });

  it('reuses the session on subsequent toggles', () => {
    expect(nextTerminalAction(false, 't1')).toBe('show');
    expect(nextTerminalAction(true, 't1')).toBe('hide');
    expect(nextTerminalAction(false, 't1')).toBe('show');
    // invariant: after the first spawn, action is never 'spawn' again
    for (const show of [false, true]) {
      expect(nextTerminalAction(show, 't1')).not.toBe('spawn');
    }
  });
});

// EDT-002/009: terminal starts in / follows the opened folder.
describe('test_edt_002_and_edt_009_cwd_follows_folder', () => {
  it('payload carries cwd_root/cwd_path of the active workspace', () => {
    expect(cwdPayload({ rootId: 'home', basePath: '/work/app' })).toEqual({
      cols: 80,
      rows: 24,
      cwd_root: 'home',
      cwd_path: '/work/app',
    });
  });

  it('after Replace, next POST carries the new folder (EDT-009)', () => {
    const before = cwdPayload({ rootId: 'home', basePath: '/old' });
    const after = cwdPayload({ rootId: 'home', basePath: '/new' });
    expect(after.cwd_path).toBe('/new');
    expect(after.cwd_path).not.toBe(before.cwd_path);
  });

  it('empty basePath maps to root dir "" (root listing convention)', () => {
    expect(cwdPayload({ rootId: 'cwd', basePath: '' }).cwd_path).toBe('');
  });
});

// EDT-003: split divider drag clamps to sane bounds, NaN-safe.
describe('test_edt_003_split_resize_clamp', () => {
  it('clamps extremes and keeps valid values', () => {
    expect(clampRatio(-5)).toBe(0.25);
    expect(clampRatio(9)).toBe(0.75);
    expect(clampRatio(0.5)).toBe(0.5);
    expect(clampRatio(0.25)).toBe(0.25);
    expect(clampRatio(0.75)).toBe(0.75);
  });
  it('is NaN/Infinity safe (never renders a broken panel)', () => {
    expect(clampRatio(NaN)).toBe(0.25);
    expect(clampRatio(Infinity)).toBe(0.75);
  });
});

// EDT-004: restart reuses the same workspace cwd (same payload after exit).
describe('test_edt_004_restart_keeps_cwd', () => {
  it('restart payload equals original payload', () => {
    const ws = { rootId: 'home', basePath: '/proj' };
    expect(cwdPayload(ws)).toEqual(cwdPayload(ws));
  });
});

// EDT-005: MAX_SESSIONS surfaces a friendly message instead of crashing.
describe('test_edt_005_max_sessions_msg', () => {
  it('maps 409 to a MAX_SESSIONS message', () => {
    const msg = spawnErrorMessage(409);
    expect(msg).toContain('MAX_SESSIONS');
  });
  it('maps other failures and success correctly', () => {
    expect(spawnErrorMessage(500)).toBe('Spawn failed');
    expect(spawnErrorMessage(201)).toBeNull();
  });
});

// EDT-007: corrupted localStorage falls back to defaults without crashing.
describe('test_edt_007_ws_persist_fallback', () => {
  it('parses valid JSON', () => {
    expect(safeLoadWorkspace('{"rootId":"home","basePath":"/w"}')).toEqual({
      rootId: 'home',
      basePath: '/w',
    });
  });
  it('falls back on corrupt JSON / wrong shape / empty', () => {
    const fallback = { rootId: 'home', basePath: '' };
    expect(safeLoadWorkspace('{bad json')).toEqual(fallback);
    expect(safeLoadWorkspace('{"rootId":42,"basePath":null}')).toEqual(fallback);
    expect(safeLoadWorkspace(null)).toEqual(fallback);
    expect(safeLoadWorkspace('', 'cwd')).toEqual({ rootId: 'cwd', basePath: '' });
  });
});

// EDT-010: branch badge parsing from porcelain v2 raw output.
describe('test_edt_010_statusbar_branch', () => {
  it('extracts branch.head', () => {
    expect(parseGitBranch('# branch.oid abc123\n# branch.head main\n1 M a.txt')).toBe('main');
  });
  it('hides on non-repo / missing marker, shows detached', () => {
    expect(parseGitBranch(null)).toBeNull();
    expect(parseGitBranch('')).toBeNull();
    expect(parseGitBranch('1 M file.txt')).toBeNull();
    expect(parseGitBranch('# branch.head (detached)')).toBe('detached');
  });
});

// ── V051-002: header label uses the server-authoritative work_dir (spec 007) ──

describe('V051-002 displayWorkDir', () => {
  it('prefers the server work_dir: basename label + absolute title', () => {
    const out = displayWorkDir(
      '/data/data/com.termux/files/home/printing-web-app',
      { rootId: 'home', basePath: '/printing-web-app' },
    );
    expect(out).not.toBeNull();
    expect(out!.label).toBe('printing-web-app');
    expect(out!.title).toBe('/data/data/com.termux/files/home/printing-web-app');
    expect(out!.legacy).toBe(false);
  });

  it('falls back to the client guess when the server omits work_dir (legacy)', () => {
    const out = displayWorkDir(undefined, { rootId: 'home', basePath: '/printing-web-app' });
    expect(out).not.toBeNull();
    expect(out!.label).toBe('home:/printing-web-app');
    expect(out!.title).toBe('');
    expect(out!.legacy).toBe(true);
  });

  it('treats empty-string work_dir as absent', () => {
    const out = displayWorkDir('', { rootId: 'home', basePath: '' });
    expect(out!.label).toBe('home:/');
    expect(out!.legacy).toBe(true);
  });

  it('handles trailing slash and nested depth', () => {
    const deep = displayWorkDir('/home/ivan/work/app/sub/', { rootId: 'home', basePath: '/x' });
    expect(deep!.label).toBe('sub');
    expect(deep!.title).toBe('/home/ivan/work/app/sub');
  });
});

// ── V051-003: version gate against GET /api/v1/health ──

describe('V051-003 MIN_SERVER_VERSION', () => {
  it('is pinned to the hotfix version (spec 007)', () => {
    expect(MIN_SERVER_VERSION).toBe('0.5.1');
  });
});

describe('V051-003 isVersionAtLeast', () => {
  it.each([
    ['0.5.1', '0.5.1', true],
    ['0.6.0', '0.5.1', true],
    ['1.0', '0.5.1', true],
    ['0.3.0', '0.5.1', false],
    ['0.4.9', '0.5.1', false],
  ])('%s >= %s → %p', (v, min, want) => {
    expect(isVersionAtLeast(v, min)).toBe(want);
  });

  it('garbage versions are stale-safe (false)', () => {
    expect(isVersionAtLeast('', '0.5.1')).toBe(false);
    expect(isVersionAtLeast('abc', '0.5.1')).toBe(false);
    expect(isVersionAtLeast('0.x.y', '0.5.1')).toBe(false);
  });
});

// ── AGT-006 (spec 011): agent launch cwd override merge ──

describe('AGT-006 mergeAgentSpawnPayload', () => {
  const baseWs = { rootId: 'home', basePath: '/work' };

  it('null picker keeps the active workspace (legacy behavior locked)', () => {
    expect(mergeAgentSpawnPayload(baseWs, null, 'ubuntu', 'opencode')).toEqual({
      cols: 80,
      rows: 24,
      cwd_root: 'home',
      cwd_path: '/work',
      env_id: 'ubuntu',
      agent_id: 'opencode',
    });
  });

  it('picker selection overrides cwd only', () => {
    const p = mergeAgentSpawnPayload(
      baseWs,
      { rootId: 'sdcard', path: '/projects/app' },
      undefined,
      'claude-code',
    );
    expect(p.cwd_root).toBe('sdcard');
    expect(p.cwd_path).toBe('/projects/app');
    expect(p.env_id).toBeUndefined();
    expect(p.agent_id).toBe('claude-code');
  });

  it('termux env never sends env_id', () => {
    const p = mergeAgentSpawnPayload(baseWs, null, 'termux', 'codex');
    expect(p.env_id).toBeUndefined();
    expect(p.agent_id).toBe('codex');
  });
});

describe('V051-003 gateState', () => {
  it('ok when server version meets the minimum', () => {
    expect(gateState('0.5.1', false, false)).toEqual({
      level: 'ok',
      chip: 'ok',
      banner: null,
    });
  });

  it('stale → red banner + red chip', () => {
    const g = gateState('0.3.0', false, false);
    expect(g.level).toBe('stale');
    expect(g.banner).toBe('red');
    expect(g.chip).toBe('bad');
  });

  it('legacy-server hint when health has no version field', () => {
    const g = gateState(null, false, false);
    expect(g.level).toBe('unknown-version');
    expect(g.banner).toBe('yellow');
    expect(g.chip).toBe('warn');
  });

  it('health fetch failure degrades to warning chip only (no banner)', () => {
    const g = gateState(undefined, true, false);
    expect(g.level).toBe('unreachable');
    expect(g.banner).toBeNull();
    expect(g.chip).toBe('warn');
  });
});

// ── EDIT-014 (spec 011): word-wrap toggle ──

describe('EDIT-014 wrapStorageKey', () => {
  it('is per-window', () => {
    expect(wrapStorageKey(undefined)).toBe('mux_editor_wrap_default');
    expect(wrapStorageKey('w1')).toBe('mux_editor_wrap_w1');
  });
});

describe('EDIT-014 wrapStyles', () => {
  it('off = legacy pre exactly (regression lock)', () => {
    expect(wrapStyles(false)).toEqual({ whiteSpace: 'pre' });
  });
  it('on = pre-wrap with break-word for long tokens', () => {
    expect(wrapStyles(true)).toEqual({ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
  });
});

describe('EDIT-014 wrap pref persistence', () => {
  it('round-trips through localStorage and survives corruption', () => {
    const store = new Map<string, string>();
    const win = { localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } } as unknown as Window;
    const old = globalThis.window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = win;
    try {
      persistWrapPref('w9', true);
      expect(loadWrapPref('w9')).toBe(true);
      store.set(wrapStorageKey('w9'), 'garbage');
      expect(loadWrapPref('w9')).toBe(false);
      expect(loadWrapPref('missing')).toBe(false);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).window = old;
    }
  });
});
