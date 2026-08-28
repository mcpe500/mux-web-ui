// Spec 016 (v0.6.7) CDX-004 tests — session persistence, tags, search, caps.
import { describe, it, expect } from 'vitest';
import {
  allTags,
  codexSessionStore,
  MAX_SESSION_EVENTS,
  MAX_SESSIONS,
  normalizeTag,
  searchSessions,
  SESSION_STORE_FULL,
  type CodexSessionRecord,
} from './sessionStore';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function record(overrides: Partial<CodexSessionRecord> = {}): CodexSessionRecord {
  return {
    id: 't-1',
    threadId: 'thr-1',
    title: 'fix login bug',
    tags: [],
    envId: 'termux',
    startedAt: 1000,
    lastActiveAt: 1000,
    status: 'live',
    transcript: [],
    ...overrides,
  };
}

describe('CDX-004 codexSessionStore', () => {
  it('save + list roundtrip, deep-copied', () => {
    const store = codexSessionStore('home', memoryStorage());
    const rec = record({ transcript: [{ kind: 'user', text: 'halo' }] });
    store.save(rec);
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('t-1');
    expect(list[0]!.transcript).toEqual([{ kind: 'user', text: 'halo' }]);
    list[0]!.title = 'mutated';
    expect(store.list()[0]!.title).toBe('fix login bug');
  });

  it('upserts by id and rotates oldest by lastActiveAt', () => {
    const store = codexSessionStore('home', memoryStorage());
    for (let i = 0; i < MAX_SESSIONS + 3; i++) {
      store.save(record({ id: `t-${i}`, lastActiveAt: i }));
    }
    const list = store.list();
    expect(list).toHaveLength(MAX_SESSIONS);
    expect(list[0]!.id).toBe(`t-${MAX_SESSIONS + 2}`); // newest first
    expect(list.find((s) => s.id === 't-0')).toBeUndefined();
  });

  it('caps transcript length', () => {
    const store = codexSessionStore('home', memoryStorage());
    const events = Array.from({ length: MAX_SESSION_EVENTS + 50 }, (_, i) => ({
      kind: 'user' as const,
      text: `e${i}`,
    }));
    store.save(record({ transcript: events }));
    expect(store.list()[0]!.transcript).toHaveLength(MAX_SESSION_EVENTS);
    const last = store.list()[0]!.transcript[MAX_SESSION_EVENTS - 1]!;
    expect(last.kind === 'user' && last.text).toBe(`e${MAX_SESSION_EVENTS + 49}`);
  });

  it('setTags sanitizes, dedupes, caps', () => {
    const store = codexSessionStore('home', memoryStorage());
    store.save(record());
    store.setTags('t-1', ['backend', 'backend', '<script>x', '  ', 'ui']);
    expect(store.list()[0]!.tags).toEqual(['backend', 'scriptx', 'ui']);
  });

  it('tolerates corrupt JSON (heal on next save)', () => {
    const storage = memoryStorage();
    storage.setItem('mux_codex_sessions_home', '{not json');
    const store = codexSessionStore('home', storage);
    expect(store.list()).toEqual([]);
    store.save(record());
    expect(store.list()).toHaveLength(1);
  });

  it('filters invalid records and caps events on read', () => {
    const storage = memoryStorage();
    const junk = [
      { nope: true },
      record({ id: 'ok-1' }),
      record({ id: 'bad-status', status: 'weird' as unknown as 'live' }),
      record({ id: 'bad-tags', tags: 'not-array' as unknown as string[] }),
    ];
    storage.setItem('mux_codex_sessions_home', JSON.stringify(junk));
    const store = codexSessionStore('home', storage);
    expect(store.list().map((r) => r.id)).toEqual(['ok-1']);
  });

  it('surfaces quota failure as sanitized error', () => {
    const store = codexSessionStore('home', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(() => store.save(record())).toThrow(SESSION_STORE_FULL);
  });
});

describe('CDX-012 searchSessions + allTags + normalizeTag', () => {
  const sessions = [
    record({ id: 'a', title: 'Fix login flow', threadId: 'thr-aaa', tags: ['backend'] }),
    record({ id: 'b', title: 'UI polish', threadId: 'thr-bbb', tags: ['frontend', 'ui'] }),
    record({ id: 'c', title: 'Refactor router', threadId: null, tags: ['backend'] }),
  ];

  it('matches title, threadId, tags case-insensitively', () => {
    expect(searchSessions(sessions, 'login', '').map((s) => s.id)).toEqual(['a']);
    expect(searchSessions(sessions, 'THR-BBB', '').map((s) => s.id)).toEqual(['b']);
    expect(searchSessions(sessions, 'frontend', '').map((s) => s.id)).toEqual(['b']);
    expect(searchSessions(sessions, '   ', '').map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters by exact tag', () => {
    expect(searchSessions(sessions, '', 'backend').map((s) => s.id)).toEqual(['a', 'c']);
    expect(searchSessions(sessions, 'router', 'frontend')).toEqual([]);
  });

  it('collects distinct sorted tags', () => {
    expect(allTags(sessions)).toEqual(['backend', 'frontend', 'ui']);
  });

  it('normalizeTag strips dangerous chars and caps length', () => {
    expect(normalizeTag('  <b>big data!</b> ')).toBe('bbig datab');
    expect(normalizeTag('x'.repeat(100))).toHaveLength(24);
  });
});
