// TAB-002/005/006 (spec 008 §5): pure model for VS Code-like editor terminal
// tabs — groups side-by-side, drag & drop, flex resize. Immutable ops, DOM-free.
export interface TermTab {
  key: string;
  sessionId: string;
  label: string;
  workDir: string | null;
}

export interface TermGroup {
  key: string;
  tabs: TermTab[];
  activeKey: string | null;
  flex: number;
}

const MIN_FLEX = 0.15;
const MAX_FLEX = 0.7;

let keySeq = 0;
function nextKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}${keySeq}`;
}

/** Scale every group's flex so the panel always sums to ~1 (float-safe). */
function normalize(groups: TermGroup[]): TermGroup[] {
  if (groups.length === 0) return groups;
  const sum = groups.reduce((a, g) => a + g.flex, 0);
  if (!Number.isFinite(sum) || sum <= 0) {
    const even = 1 / groups.length;
    return groups.map(g => ({ ...g, flex: even }));
  }
  return groups.map(g => ({ ...g, flex: g.flex / sum }));
}

function ownerIndexOf(groups: TermGroup[], tabKey: string): number {
  return groups.findIndex(g => g.tabs.some(t => t.key === tabKey));
}

/**
 * TAB-002: unique auto label — "bash", "bash 2", "bash 3", … counting past
 * closed tabs so labels never collide after churn.
 */
export function nextLabel(groups: TermGroup[]): string {
  let max = 0;
  for (const g of groups) {
    for (const t of g.tabs) {
      const m = /^bash(?: (\d+))?$/.exec(t.label);
      if (m) max = Math.max(max, m[1] ? parseInt(m[1], 10) : 1);
    }
  }
  return max === 0 ? 'bash' : `bash ${max + 1}`;
}

export function maxReached(groups: TermGroup[], maxSessions: number): boolean {
  return groups.reduce((a, g) => a + g.tabs.length, 0) >= maxSessions;
}

/** Group with keyboard/mouse focus = last group holding an active tab. */
function focusTargetIndex(groups: TermGroup[]): number {
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].activeKey !== null) return i;
  }
  return groups.length > 0 ? 0 : -1;
}

/** Activate the neighbor that takes over after `tabKey` leaves its group. */
function successorActiveKey(
  tabsBeforeRemoval: TermTab[],
  tabKey: string,
  tabsAfterRemoval: TermTab[],
): string | null {
  if (tabsAfterRemoval.length === 0) return null;
  const origPos = tabsBeforeRemoval.findIndex(t => t.key === tabKey);
  const idx = Math.min(origPos, tabsAfterRemoval.length - 1);
  return tabsAfterRemoval[idx].key;
}

export function createTab(
  groups: TermGroup[],
  session: { sessionId: string; workDir?: string | null },
  maxSessions?: number,
  labelOverride?: string,
): TermGroup[] {
  if (maxSessions != null && maxReached(groups, maxSessions)) return groups;
  const tab: TermTab = {
    key: nextKey('t'),
    sessionId: session.sessionId,
    label: labelOverride ?? nextLabel(groups),
    workDir: session.workDir ?? null,
  };
  if (groups.length === 0) {
    return [{ key: nextKey('g'), tabs: [tab], activeKey: tab.key, flex: 1 }];
  }
  const focusIdx = focusTargetIndex(groups);
  return groups.map((g, i) =>
    i === focusIdx ? { ...g, tabs: [...g.tabs, tab], activeKey: tab.key } : g,
  );
}

/**
 * TAB-005 wiring helper: insert a freshly spawned session as a brand-new
 * group right of the anchor group (VS Code "split terminal" target).
 */
export function openInNewGroup(
  groups: TermGroup[],
  anchorGroupKey: string | null,
  session: { sessionId: string; workDir?: string | null },
  labelOverride?: string,
): TermGroup[] {
  const tab: TermTab = {
    key: nextKey('t'),
    sessionId: session.sessionId,
    label: labelOverride ?? nextLabel(groups),
    workDir: session.workDir ?? null,
  };
  const fresh: TermGroup = { key: nextKey('g'), tabs: [tab], activeKey: tab.key, flex: 1 };
  if (groups.length === 0) return [fresh];
  const anchorIdx =
    anchorGroupKey !=null
      ? Math.max(0, Math.min(groups.findIndex(g => g.key === anchorGroupKey), groups.length - 1))
      : focusTargetIndex(groups);
  const at = anchorIdx < 0 ? groups.length : anchorIdx + 1;
  const out = groups.slice();
  out.splice(at, 0, fresh);
  return normalize(out);
}

export function closeTab(
  groups: TermGroup[],
  tabKey: string,
): { groups: TermGroup[]; closedSessionId: string | null } {
  const owner = ownerIndexOf(groups, tabKey);
  if (owner < 0) return { groups, closedSessionId: null };

  const src = groups[owner];
  const origPos = src.tabs.findIndex(t => t.key === tabKey);
  const removed = src.tabs[origPos];
  const remaining = src.tabs.filter(t => t.key !== tabKey);

  let nextGroups: TermGroup[];
  if (remaining.length > 0) {
    const neighbor = successorActiveKey(src.tabs, tabKey, remaining)!;
    nextGroups = groups.map((g, i) =>
      i === owner
        ? { ...g, tabs: remaining, activeKey: g.activeKey === tabKey ? neighbor : g.activeKey }
        : g,
    );
  } else {
    nextGroups = groups.filter((_, i) => i !== owner);
    if (nextGroups.length > 0) {
      const ni = Math.min(owner, nextGroups.length - 1);
      const target = nextGroups[ni];
      nextGroups[ni] = { ...target, activeKey: target.tabs[target.tabs.length - 1].key };
    }
  }
  return { groups: normalize(nextGroups), closedSessionId: removed.sessionId };
}

export function setActive(groups: TermGroup[], tabKey: string): TermGroup[] {
  const owner = ownerIndexOf(groups, tabKey);
  if (owner < 0) return groups;
  return groups.map((g, i) => (i === owner ? { ...g, activeKey: tabKey } : g));
}

/**
 * TAB-006: move a tab into another group (drag & drop). `toGroupKey === null`
 * creates a fresh group to the right of the source (drop on empty panel area).
 * Source groups that run empty collapse; a dangling active pointer is healed.
 */
export function moveTab(
  groups: TermGroup[],
  tabKey: string,
  toGroupKey: string | null,
  index?: number,
): TermGroup[] {
  const srcIdx = ownerIndexOf(groups, tabKey);
  if (srcIdx < 0) return groups;

  const src = groups[srcIdx];
  const origPos = src.tabs.findIndex(t => t.key === tabKey);
  const moved = src.tabs[origPos];
  const srcTabs = src.tabs.filter(t => t.key !== tabKey);

  const base = groups.slice();
  let insertAt: number;
  if (srcTabs.length > 0) {
    base[srcIdx] = {
      ...src,
      tabs: srcTabs,
      activeKey:
        src.activeKey === tabKey
          ? successorActiveKey(src.tabs, tabKey, srcTabs)
          : src.activeKey,
    };
    insertAt = srcIdx + 1;
  } else {
    base.splice(srcIdx, 1);
    insertAt = Math.min(srcIdx, base.length);
  }

  if (toGroupKey === null || !base.some(g => g.key === toGroupKey)) {
    const fresh: TermGroup = {
      key: nextKey('g'),
      tabs: [moved],
      activeKey: moved.key,
      flex: 1,
    };
    base.splice(insertAt, 0, fresh);
    return normalize(base);
  }

  const destIdx = base.findIndex(g => g.key === toGroupKey);
  const dest = base[destIdx];
  const tabs = dest.tabs.slice();
  let at = index == null ? tabs.length : index;
  if (destIdx === srcIdx && origPos < at) at -= 1;
  at = Math.max(0, Math.min(at, tabs.length));
  tabs.splice(at, 0, moved);
  base[destIdx] = { ...dest, tabs, activeKey: moved.key };
  return normalize(base);
}

/**
 * TAB-005: move an existing tab into its own new group placed to the right,
 * halving the source group's flex share. No-op when the tab is alone in its
 * group (nothing to split) or the key is unknown.
 */
export function splitToNewGroup(groups: TermGroup[], tabKey: string): TermGroup[] {
  const srcIdx = ownerIndexOf(groups, tabKey);
  if (srcIdx < 0) return groups;
  const src = groups[srcIdx];
  if (src.tabs.length <= 1) return groups;

  const half = src.flex / 2;
  const origPos = src.tabs.findIndex(t => t.key === tabKey);
  const moved = src.tabs[origPos];
  const restTabs = src.tabs.filter(t => t.key !== tabKey);
  const restActive =
    src.activeKey === tabKey
      ? successorActiveKey(src.tabs, tabKey, restTabs)
      : src.activeKey;

  const out = groups.slice();
  out[srcIdx] = { ...src, tabs: restTabs, activeKey: restActive, flex: half };
  const fresh: TermGroup = { key: nextKey('g'), tabs: [moved], activeKey: moved.key, flex: half };
  out.splice(srcIdx + 1, 0, fresh);
  return normalize(out);
}

export function adjustGroupFlex(
  groups: TermGroup[],
  groupKey: string,
  deltaFrac: number,
): TermGroup[] {
  const patched = groups.map(g =>
    g.key === groupKey
      ? { ...g, flex: Math.max(MIN_FLEX, Math.min(MAX_FLEX, g.flex + deltaFrac)) }
      : g,
  );
  return normalize(patched);
}
