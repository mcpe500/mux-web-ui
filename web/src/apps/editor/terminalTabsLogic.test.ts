// TAB-002/005/006 (spec 008 §5): pure model for VS Code-like editor terminal
// tabs — groups side-by-side, drag & drop, flex resize. DOM-free for vitest node env.
import { describe, it, expect } from 'vitest';
import {
  createTab,
  closeTab,
  setActive,
  moveTab,
  splitToNewGroup,
  adjustGroupFlex,
  maxReached,
  openInNewGroup,
  serializeLayout,
  restoreLayout,
  type TermGroup,
} from './terminalTabsLogic';

// tiny helper for the openInNewGroup test
function anchorIdxOf(gs: TermGroup[], key: string): number {
  return gs.findIndex(g => g.key === key);
}

function mkTab(sessionId = 's'): { sessionId: string; workDir: string | null } {
  return { sessionId, workDir: null };
}

function seedOne(): TermGroup[] {
  return createTab([], mkTab('s1'));
}

const sumFlex = (gs: TermGroup[]) => gs.reduce((a, g) => a + g.flex, 0);

describe('TAB createTab / labels', () => {
  it('creates first group with the tab active and label bash', () => {
    const gs = seedOne();
    expect(gs).toHaveLength(1);
    expect(gs[0].tabs).toHaveLength(1);
    expect(gs[0].activeKey).toBe(gs[0].tabs[0].key);
    expect(gs[0].tabs[0].label).toBe('bash');
    expect(gs[0].flex).toBeCloseTo(1);
  });

  it('second tab goes to the active group with unique label', () => {
    const gs = createTab(seedOne(), mkTab('s2'));
    expect(gs[0].tabs.map(t => t.label)).toEqual(['bash', 'bash 2']);
    expect(gs[0].tabs[1].sessionId).toBe('s2');
    // new tab becomes the active one
    expect(gs[0].activeKey).toBe(gs[0].tabs[1].key);
  });

  it('labels keep counting after closes (no reuse collisions)', () => {
    let gs = seedOne();
    const k1 = gs[0].tabs[0].key;
    gs = createTab(gs, mkTab('s2'));
    gs = closeTab(gs, k1).groups;
    gs = createTab(gs, mkTab('s3'));
    expect(gs.flatMap(g => g.tabs.map(t => t.label))).toEqual(['bash 2', 'bash 3']);
  });
});

describe('TAB closeTab', () => {
  it('returns closed sessionId and activates neighbor', () => {
    let gs = seedOne();
    gs = createTab(gs, mkTab('s2')); // active = s2
    const firstKey = gs[0].tabs[0].key;
    const res = closeTab(gs, gs[0].tabs[1].key);
    expect(res.closedSessionId).toBe('s2');
    gs = res.groups;
    expect(gs[0].activeKey).toBe(firstKey);
  });

  it('collapses emptied group and keeps flex normalized', () => {
    let gs = seedOne();
    gs = createTab(gs, mkTab('s2'));
    gs = splitToNewGroup(gs, gs[0].tabs[1].key); // 2 groups, both non-empty
    expect(gs).toHaveLength(2);
    const only = gs[1].activeKey!;
    const res = closeTab(gs, only);
    expect(res.closedSessionId).toBe('s2');
    expect(res.groups).toHaveLength(1);
    expect(sumFlex(res.groups)).toBeCloseTo(1);
  });

  it('closing the last tab empties everything', () => {
    const gs = seedOne();
    const res = closeTab(gs, gs[0].tabs[0].key);
    expect(res.closedSessionId).toBe('s1');
    expect(res.groups).toHaveLength(0);
  });

  it('unknown key is a safe no-op', () => {
    const gs = seedOne();
    const res = closeTab(gs, 'nope');
    expect(res.closedSessionId).toBeNull();
    expect(res.groups).toBe(gs);
  });
});

describe('TAB setActive / maxReached', () => {
  it('switches active within its group; unknown key no-op', () => {
    let gs = seedOne();
    gs = createTab(gs, mkTab('s2'));
    const k0 = gs[0].tabs[0].key;
    gs = setActive(gs, k0);
    expect(gs[0].activeKey).toBe(k0);
    const before = JSON.stringify(gs);
    expect(setActive(gs, 'ghost')).toBe(gs);
    expect(JSON.stringify(gs)).toBe(before);
  });

  it('maxReached guards spawn cap', () => {
    let gs = seedOne();
    expect(maxReached(gs, 4)).toBe(false);
    for (let i = 0; i < 3; i++) gs = createTab(gs, mkTab('x' + i));
    expect(maxReached(gs, 4)).toBe(true);
    expect(createTab(gs, mkTab('overflow'), 4)).toBe(gs); // unchanged
  });
});

describe('TAB moveTab (drag & drop)', () => {
  function twoGroups() {
    let gs = seedOne(); // bash
    gs = createTab(gs, mkTab('s2')); // bash 2
    gs = splitToNewGroup(gs, gs[0].tabs[1].key); // moves bash 2 into group B
    return gs;
  }

  it('reorders within the same group honoring target index', () => {
    let gs = seedOne();
    gs = createTab(gs, mkTab('s2'));
    const [k0, k1] = gs[0].tabs.map(t => t.key);
    gs = moveTab(gs, k1, gs[0].key, 0);
    expect(gs[0].tabs.map(t => t.key)).toEqual([k1, k0]);
  });

  it('moves across groups; source collapses when empty', () => {
    const gs = twoGroups();
    const movingKey = gs[0].tabs[0].key;
    const out = moveTab(gs, movingKey, gs[1].key, 0);
    expect(out).toHaveLength(1);
    expect(out[0].tabs.map(t => t.key)).toContain(movingKey);
    expect(out[0].tabs[0].key).toBe(movingKey);
    expect(sumFlex(out)).toBeCloseTo(1);
  });

  it('null target group creates a new right-side group when source survives', () => {
    let gs = twoGroups();
    gs = createTab(gs, mkTab('s3')); // focus lands on the last active group
    const before = gs.length;
    const key = gs[gs.length - 1].tabs[0].key;
    const out = moveTab(gs, key, null);
    expect(out.length).toBeGreaterThan(before);
    const dest = out.find(g => g.tabs.some(t => t.key === key))!;
    expect(dest.activeKey).toBe(key);
    expect(sumFlex(out)).toBeCloseTo(1);
  });

  it('moving a sole tab to null just relocates it (no phantom growth)', () => {
    const gs = twoGroups();
    const key = gs[0].tabs[0].key;
    const out = moveTab(gs, key, null);
    expect(out).toHaveLength(2);
    expect(out.every(g => g.tabs.length > 0)).toBe(true);
  });

  it('clamps out-of-range target index', () => {
    const gs = twoGroups();
    const key = gs[0].tabs[0].key;
    const out = moveTab(gs, key, gs[1].key, 99);
    const dest = out.find(g => g.key === gs[1].key)!;
    expect(dest.tabs[dest.tabs.length - 1].key).toBe(key);
  });
});

describe('TAB split & flex', () => {
  it('splitToNewGroup halves the source flex and inserts to the right', () => {
    let gs = seedOne();
    gs = createTab(gs, mkTab('s2')); // keep source non-empty after the move
    const srcFlexBefore = gs[0].flex;
    const movedKey = gs[0].tabs[1].key;
    gs = splitToNewGroup(gs, movedKey);
    expect(gs).toHaveLength(2);
    expect(gs[0].flex).toBeCloseTo(srcFlexBefore / 2);
    expect(gs[1].flex).toBeCloseTo(srcFlexBefore / 2);
    expect(gs[1].tabs.map(t => t.key)).toEqual([movedKey]);
    expect(sumFlex(gs)).toBeCloseTo(1);
  });

  it('adjustGroupFlex clamps 0.15..0.70 then renormalizes', () => {
    let gs = seedOne();
    gs = createTab(gs, mkTab('s2'));
    gs = splitToNewGroup(gs, gs[0].tabs[1].key); // .5/.5
    gs = adjustGroupFlex(gs, gs[0].key, +0.45); // want .95 → clamp .70 → normalize
    expect(gs[0].flex).toBeLessThanOrEqual(0.7001);
    expect(sumFlex(gs)).toBeCloseTo(1);
    gs = adjustGroupFlex(gs, gs[0].key, -10); // floor at .15
    expect(gs[0].flex).toBeGreaterThanOrEqual(0.15 - 1e-9);
    expect(sumFlex(gs)).toBeCloseTo(1);
  });

  describe('openInNewGroup', () => {
    it('inserts a fresh group right of the anchor with a new session', () => {
      let gs = seedOne();
      gs = createTab(gs, mkTab('s2'));
      const anchorKey = gs[0].key;
      const before = gs.length;
      gs = openInNewGroup(gs, anchorKey, { sessionId: 'sx', workDir: '/w' });
      expect(gs.length).toBe(before + 1);
      const fresh = gs[anchorIdxOf(gs, anchorKey) + 1];
      expect(fresh.tabs.map(t => t.sessionId)).toEqual(['sx']);
      expect(fresh.activeKey).toBe(fresh.tabs[0].key);
      expect(sumFlex(gs)).toBeCloseTo(1);
    });
  });
});

describe('TAB-010/011 (spec 011) layout persistence', () => {
  function twoGroupsLive() {
    let gs = createTab([], mkTab('s1'));
    gs = createTab(gs, mkTab('s2'));
    gs = splitToNewGroup(gs, gs[0].tabs[1].key);
    return gs;
  }

  it('serialize → restore round-trips live tabs with fresh keys', () => {
    const gs = twoGroupsLive();
    const ser = serializeLayout(gs, true, 0.55);
    expect(ser.v).toBe(1);
    const res = restoreLayout(ser, new Set(['s1', 's2']), 4);
    expect(res.panelOpen).toBe(true);
    expect(res.splitRatio).toBeCloseTo(0.55);
    expect(res.groups).toHaveLength(2);
    expect(res.groups.flatMap(g => g.tabs.map(t => t.sessionId))).toEqual(['s1', 's2']);
    // keys regenerated — no collision with old runtime keys
    expect(res.groups[0].tabs[0].key).not.toBe(gs[0].tabs[0].key);
    for (const g of res.groups) {
      expect(g.activeKey).toBe(g.tabs[g.tabs.length - 1].key);
    }
    expect(sumFlex(res.groups)).toBeCloseTo(1);
  });

  it('drops dead sessions and collapses their groups; all-dead → panel closed', () => {
    const gs = twoGroupsLive();
    const ser = serializeLayout(gs, true, 0.5);
    const partial = restoreLayout(ser, new Set(['s2']), 4);
    expect(partial.groups).toHaveLength(1);
    expect(partial.groups[0].tabs.map(t => t.sessionId)).toEqual(['s2']);
    const none = restoreLayout(ser, new Set(), 4);
    expect(none.groups).toHaveLength(0);
    expect(none.panelOpen).toBe(false);
  });

  it('clamps to maxSessions (drop from the end)', () => {
    let gs = createTab([], mkTab('a'));
    gs = createTab(gs, mkTab('b'));
    gs = createTab(gs, mkTab('c'));
    gs = createTab(gs, mkTab('d'));
    const res = restoreLayout(serializeLayout(gs, false, 0.6), new Set(['a','b','c','d']), 2);
    expect(res.groups.flatMap(g => g.tabs.map(t => t.sessionId))).toEqual(['a', 'b']);
  });

  it('corrupt JSON / wrong shape / tampered types → clean empty layout', () => {
    for (const bad of ['{nope', 'null', '{"v":2}', '{"v":1,"groups":"x"}', '42']) {
      const res = restoreLayout(bad as unknown, new Set(['s1']), 4);
      expect(res.groups).toHaveLength(0);
      expect(res.panelOpen).toBe(false);
      expect(res.splitRatio).toBe(0.6);
    }
  });

  it('splitRatio clamps into the EDT-003 band on restore', () => {
    const ser = { v: 1 as const, panelOpen: true, splitRatio: 99, groups: [] };
    expect(restoreLayout(ser, new Set(), 4).splitRatio).toBe(0.75);
  });
});

describe('TAB invariants', () => {
  it('fuzz-ish: random op sequence never breaks invariants', () => {
    let gs = seedOne();
    for (let i = 0; i < 50; i++) {
      const allKeys = gs.flatMap(g => g.tabs.map(t => t.key));
      if (allKeys.length === 0) break;
      const pick = allKeys[i % allKeys.length];
      switch (i % 4) {
        case 0:
          gs = createTab(gs, mkTab('f' + i));
          break;
        case 1:
          gs = moveTab(gs, pick, null);
          break;
        case 2:
          gs = adjustGroupFlex(gs, gs[i % gs.length].key, 0.07);
          break;
        default:
          gs = setActive(gs, pick);
      }
      expect(gs.every(g => g.tabs.length > 0)).toBe(true);
      expect(sumFlex(gs)).toBeCloseTo(1, 5);
      for (const g of gs) {
        if (g.activeKey) expect(g.tabs.some(t => t.key === g.activeKey)).toBe(true);
        else expect(g.tabs.length).toBe(0);
      }
    }
  });
});
