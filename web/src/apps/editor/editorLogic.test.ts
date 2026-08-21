import { describe, it, expect } from 'vitest';
import {
  nextTerminalAction,
  cwdPayload,
  clampRatio,
  spawnErrorMessage,
  safeLoadWorkspace,
  parseGitBranch,
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
