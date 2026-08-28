// Spec 016 (v0.6.7) CDX-004 — client-side codex session persistence.
// Pure wrapper over an injectable Storage-like object (pola promptLibrary):
// JSON serde under ONE namespaced key, tolerant of corrupt payloads, hard
// caps against quota blowups. No real localStorage access in tests.
import type { CodexEvent } from './codexEvents';
import type { StorageLike } from './promptLibrary';
import { sanitizeWorkspaceKey } from './promptLibrary';

export interface CodexSessionRecord {
  /** mux terminal session id (PTY) — NOT the codex thread id. */
  id: string;
  /** codex thread/session id from `thread.started` events (resume key). */
  threadId: string | null;
  title: string;
  tags: string[];
  envId: string;
  model?: string;
  sandbox?: string;
  startedAt: number;
  lastActiveAt: number;
  status: 'live' | 'ended';
  transcript: CodexEvent[];
}

export const MAX_SESSIONS = 30;
export const MAX_SESSION_EVENTS = 300;
export const SESSION_STORE_FULL = 'SESSION_STORE_FULL';
export const MAX_SESSION_TAGS = 8;
export const MAX_TAG_LEN = 24;

/** Tag sanitizer: [word, space, hyphen] only, trimmed, ≤24 chars. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/[^\w\- ]/g, '').slice(0, MAX_TAG_LEN);
}

export interface CodexSessionStore {
  list(): CodexSessionRecord[];
  save(rec: CodexSessionRecord): void;
  remove(id: string): void;
  setTags(id: string, tags: string[]): void;
}

function storageKey(workspaceKey: string): string {
  return `mux_codex_sessions_${sanitizeWorkspaceKey(workspaceKey)}`;
}

function isValidRecord(r: unknown): r is CodexSessionRecord {
  if (typeof r !== 'object' || r === null) return false;
  const o = r as Partial<CodexSessionRecord>;
  return (
    typeof o.id === 'string' &&
    (o.threadId === null || typeof o.threadId === 'string') &&
    typeof o.title === 'string' &&
    Array.isArray(o.tags) &&
    o.tags.every((t) => typeof t === 'string') &&
    typeof o.startedAt === 'number' &&
    typeof o.lastActiveAt === 'number' &&
    (o.status === 'live' || o.status === 'ended') &&
    Array.isArray(o.transcript)
  );
}

/**
 * CDX-004: default store backed by localStorage-like storage.
 * list() tolerates corrupt JSON by returning [] (next save heals the slot).
 * save() upserts by id, caps transcript, rotates out the oldest sessions,
 * and surfaces quota failures as sanitized SESSION_STORE_FULL.
 */
export function codexSessionStore(workspaceKey: string, storage?: StorageLike): CodexSessionStore {
  const backend = storage ?? globalThis.localStorage;
  if (!backend) throw new Error('SESSION_STORE_UNAVAILABLE');
  const key = storageKey(workspaceKey);

  function read(): CodexSessionRecord[] {
    const raw = backend.getItem(key);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidRecord).map((r) => ({
        ...r,
        transcript: r.transcript.slice(-MAX_SESSION_EVENTS),
      }));
    } catch {
      return [];
    }
  }

  function writeAll(records: CodexSessionRecord[]): void {
    try {
      backend.setItem(key, JSON.stringify(records));
    } catch {
      throw new Error(SESSION_STORE_FULL);
    }
  }

  return {
    list(): CodexSessionRecord[] {
      return read().map((r) => ({ ...r, tags: [...r.tags], transcript: [...r.transcript] }));
    },
    save(rec: CodexSessionRecord): void {
      const records = read();
      const normalized: CodexSessionRecord = {
        ...rec,
        tags: rec.tags.slice(0, MAX_SESSION_TAGS).map(normalizeTag).filter((t) => t !== ''),
        transcript: rec.transcript.slice(-MAX_SESSION_EVENTS),
      };
      const idx = records.findIndex((r) => r.id === rec.id);
      if (idx >= 0) records[idx] = normalized;
      else records.push(normalized);
      records.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
      writeAll(records.slice(0, MAX_SESSIONS));
    },
    remove(id: string): void {
      writeAll(read().filter((r) => r.id !== id));
    },
    setTags(id: string, tags: string[]): void {
      const records = read();
      const idx = records.findIndex((r) => r.id === id);
      if (idx < 0) return;
      const cleaned = tags
        .map(normalizeTag)
        .filter((t) => t !== '')
        .filter((t, i, arr) => arr.indexOf(t) === i)
        .slice(0, MAX_SESSION_TAGS);
      records[idx] = { ...records[idx]!, tags: cleaned };
      writeAll(records);
    },
  };
}

/**
 * CDX-012: pure session search — case-insensitive match over title, threadId
 * and tags; optional exact-tag filter. Empty query + empty filter = full list.
 */
export function searchSessions(
  sessions: readonly CodexSessionRecord[],
  query: string,
  tagFilter: string,
): CodexSessionRecord[] {
  const q = query.trim().toLowerCase();
  const tag = tagFilter.trim();
  return sessions.filter((s) => {
    if (tag !== '' && !s.tags.includes(tag)) return false;
    if (q === '') return true;
    const haystack = [s.title, s.threadId ?? '', ...s.tags].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/** All distinct tags across sessions (for the filter chip row), alphabetical. */
export function allTags(sessions: readonly CodexSessionRecord[]): string[] {
  const set = new Set<string>();
  for (const s of sessions) for (const t of s.tags) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** CDX-006: transcript cap applied before every persistence write. */
export function capTranscript(events: readonly CodexEvent[]): CodexEvent[] {
  return events.slice(-MAX_SESSION_EVENTS);
}
