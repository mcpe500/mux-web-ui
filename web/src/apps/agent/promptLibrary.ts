// Spec 014 (v0.6.4) Milestone D — AGX-007 prompt library storage port.
// Pure wrapper over an injectable Storage-like object (JSON serde under ONE
// namespaced key). No real localStorage access in tests; DOM-free logic.
import { matchesDangerousFlag } from './codexArgs';

export interface LibEntry {
  id: string;
  title: string;
  text: string;
  /** Set automatically when text hits the dangerous-flag denylist (AGX-007). */
  riskFlag: boolean;
  createdAt: number;
}

export interface PromptStore {
  list(): LibEntry[];
  save(e: LibEntry): void;
  remove(id: string): void;
}

/** Minimal shape actually consumed — lets tests inject plain objects. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Sanitized quota-failure signal; original error details never escape. */
export const PROMPT_STORE_FULL = 'PROMPT_STORE_FULL';

/** Removes every character outside [\w-] from a workspace root id. */
export function sanitizeWorkspaceKey(rootId: string): string {
  return rootId.replace(/[^\w-]/g, '');
}

function storageKey(workspaceKey: string): string {
  return `mux_codex_prompts_${sanitizeWorkspaceKey(workspaceKey)}`;
}

/**
 * Default PromptStore backed by localStorage-like storage.
 * namespace = 'mux_codex_prompts_' + sanitizeWorkspaceKey(workspaceKey).
 * list() tolerates corrupt JSON by returning [] (next save heals the slot).
 * save() failures (quota et al.) surface as sanitized PROMPT_STORE_FULL.
 */
export function defaultLocalStorageStore(
  workspaceKey: string,
  storage?: StorageLike,
): PromptStore {
  // ponytail: globalThis lookup kept lazy so node/vitest never touches window
  // unless the caller omitted a store entirely (Wave-2 wiring path).
  const backend = storage ?? globalThis.localStorage;
  if (!backend) throw new Error('PROMPT_STORE_UNAVAILABLE');
  const key = storageKey(workspaceKey);

  function read(): LibEntry[] {
    const raw = backend.getItem(key);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e): e is LibEntry =>
          typeof e === 'object' && e !== null &&
          typeof (e as LibEntry).id === 'string' &&
          typeof (e as LibEntry).text === 'string',
      );
    } catch {
      return [];
    }
  }

  return {
    list(): LibEntry[] {
      return read().map((e) => ({ ...e }));
    },
    save(e: LibEntry): void {
      const entries = read();
      const normalized: LibEntry = {
        ...e,
        riskFlag: e.riskFlag || matchesDangerousFlag(e.text),
      };
      const idx = entries.findIndex((x) => x.id === e.id);
      if (idx >= 0) entries[idx] = normalized;
      else entries.push(normalized);
      try {
        backend.setItem(key, JSON.stringify(entries));
      } catch {
        throw new Error(PROMPT_STORE_FULL);
      }
    },
    remove(id: string): void {
      const remaining = read().filter((e) => e.id !== id);
      try {
        backend.setItem(key, JSON.stringify(remaining));
      } catch {
        throw new Error(PROMPT_STORE_FULL);
      }
    },
  };
}

/**
 * Denylist risk classifier for candidate prompt texts (AGX-007 static check).
 * Same regex family as codexArgs.DANGEROUS_FLAG_DENYLIST.
 */
export function validateCodexPrompt(text: string): boolean {
  return matchesDangerousFlag(text);
}
