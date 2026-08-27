// Spec 014 (v0.6.4) Milestone D — AGX-007 prompt library tests
// (storage-port pattern, injectable Storage-like, no real localStorage here).
import { describe, it, expect } from 'vitest';
import {
  PROMPT_STORE_FULL,
  defaultLocalStorageStore,
  sanitizeWorkspaceKey,
  validateCodexPrompt,
  type LibEntry,
  type PromptStore,
} from './promptLibrary';

function entry(partial: Partial<LibEntry> & Pick<LibEntry, 'id' | 'title' | 'text'>): LibEntry {
  return { riskFlag: false, createdAt: 1_700_000_000_000, ...partial };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const calls = { setItem: 0, setItemLastKey: '', setItemLastValue: '' };
  return {
    data: initial,
    calls,
    getItem(k: string): string | null {
      return k in this.data ? this.data[k]! : null;
    },
    setItem(k: string, v: string): void {
      calls.setItem += 1;
      calls.setItemLastKey = k;
      calls.setItemLastValue = v;
      this.data[k] = v;
    },
    removeItem(k: string): void {
      delete this.data[k];
    },
  };
}

describe('AGX-007 sanitizeWorkspaceKey', () => {
  it('strips everything outside [\\w-]', () => {
    expect(sanitizeWorkspaceKey('/home/ivan/projects/mux-web-ui')).toBe(
      'homeivanprojectsmux-web-ui',
    );
    expect(sanitizeWorkspaceKey('root!! @dev/#ops')).toBe('rootdevops');
    expect(sanitizeWorkspaceKey('')).toBe('');
  });

  it('builds namespaced storage key per workspace', () => {
    const s = memoryStorage();
    const store = defaultLocalStorageStore('proj/a b', s);
    store.save(entry({ id: '1', title: 't', text: 'hello' }));
    expect(Object.keys(s.data)).toEqual(['mux_codex_prompts_projab']);
  });
});

describe('AGX-007 CRUD over injectable storage', () => {
  it('save → list round-trips entries via JSON serde', () => {
    const store = defaultLocalStorageStore('ws1', memoryStorage());
    const e = entry({ id: 'a', title: 'Fix flaky', text: 'run vitest', riskFlag: true });
    store.save(e);
    expect(store.list()).toEqual([e]);
  });

  it('save replaces entry with same id (no duplicates)', () => {
    const store = defaultLocalStorageStore('ws1', memoryStorage());
    store.save(entry({ id: 'a', title: 'one', text: 'x' }));
    store.save(entry({ id: 'b', title: 'two', text: 'y' }));
    store.save(entry({ id: 'a', title: 'one-edited', text: 'z' }));
    const ids = store.list().map((e) => e.id);
    expect(ids.sort()).toEqual(['a', 'b']);
    expect(store.list().find((e) => e.id === 'a')!.title).toBe('one-edited');
  });

  it('remove deletes only the target id and tolerates unknown id', () => {
    const store: PromptStore = defaultLocalStorageStore('ws2', memoryStorage());
    store.save(entry({ id: 'a', title: 'A', text: 'x' }));
    store.save(entry({ id: 'b', title: 'B', text: 'y' }));
    store.remove('missing-id');
    expect(store.list()).toHaveLength(2);
    store.remove('a');
    expect(store.list().map((e) => e.id)).toEqual(['b']);
  });

  it('returns defensive copies — mutating list() result never corrupts stored state', () => {
    const store = defaultLocalStorageStore('ws3', memoryStorage());
    store.save(entry({ id: 'a', title: 'A', text: 'x' }));
    store.save(entry({ id: 'b', title: 'B', text: 'y' }));
    const copy = store.list();
    copy.pop();
    copy[0]!.text = 'hacked';
    expect(store.list()).toHaveLength(2);
    expect(store.list().find((e) => e.id === 'a')!.text).toBe('x');
    expect(store.list().find((e) => e.id === 'b')!.title).toBe('B'); // pop didn't reach storage
  });

  it('corrupt JSON resilience: list() returns [] instead of throwing', () => {
    const bad = memoryStorage({ mux_codex_prompts_ws4: '{definitely-not-an-array' });
    const store = defaultLocalStorageStore('ws4', bad);
    expect(store.list()).toEqual([]);
    // recovery: next save heals the slot instead of preserving garbage forever
    store.save(entry({ id: 'a', title: 'healed', text: 'x' }));
    expect(store.list().map((e) => e.title)).toEqual(['healed']);
  });

  it('quota/setItem errors are rethrown sanitized as PROMPT_STORE_FULL', () => {
    const full = memoryStorage();
    full.setItem = (): never => {
      throw new DOMException('mock quota exceeded', 'QuotaExceededError');
    };
    const store = defaultLocalStorageStore('ws5', full);
    try {
      store.save(entry({ id: 'a', title: 'boom', text: 'x' }));
      throw new Error('expected PROMPT_STORE_FULL');
    } catch (err) {
      expect((err as Error).message).toBe(PROMPT_STORE_FULL);
      expect(err).not.toBeInstanceOf(DOMException); // sanitized, original swallowed
    }
  });
});

describe('AGX-007 denylist interplay (riskFlag)', () => {
  it('validateCodexPrompt flags the dangerous-flag family', () => {
    for (const t of ['use --yolo mode', '--dangerously-skip-git-repo-check please', '-y everywhere'])
      expect(validateCodexPrompt(t)).toBe(true);
    expect(validateCodexPrompt('refactor auth tests carefully')).toBe(false);
  });

  it('saving benign text with riskFlag=false stays clean', () => {
    const store = defaultLocalStorageStore('ws6', memoryStorage());
    store.save(entry({ id: 'ok', title: 'safe', text: 'list modules' }));
    expect(store.list()[0]!.riskFlag).toBe(false);
  });

  it('saving dangerous text FORCES riskFlag=true even if caller passed false (store-level guard)', () => {
    const store = defaultLocalStorageStore('ws6', memoryStorage());
    store.save(entry({ id: 'bad', title: 'risky', text: 'codex --full-auto --dangerously-skip-git-repo-check', riskFlag: false }));
    expect(store.list()[0]!.riskFlag).toBe(true);
    // explicit true is preserved for benign text too (UI decided upstream)
    store.save(entry({ id: 'meh', title: 'flagged-by-ui', text: 'plain text', riskFlag: true }));
    expect(store.list().find((e) => e.id === 'meh')!.riskFlag).toBe(true);
  });
});
