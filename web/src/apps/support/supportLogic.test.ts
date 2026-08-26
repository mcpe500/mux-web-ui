import { describe, expect, it } from 'vitest';
import {
  agentBadge,
  buildOnboarding,
  GUIDES,
  onboardingProgress,
  routerBadge,
  type ToolInfo,
} from './supportLogic';

const tool = (over: Partial<ToolInfo>): ToolInfo => ({
  id: 'opencode',
  label: 'OpenCode',
  color: '#6366f1',
  binary: 'opencode',
  found: false,
  package: 'opencode-ai',
  installable: true,
  ...over,
});

describe('DISC-002 agentBadge', () => {
  it('found → terpasang (hijau)', () => {
    const b = agentBadge(tool({ found: true }));
    expect(b.text).toContain('Terpasang');
    expect(b.color).toBe('#10b981');
  });

  it('not found + installable → ajak install', () => {
    const b = agentBadge(tool({ found: false, installable: true }));
    expect(b.text).toMatch(/install/i);
    expect(b.color).toBe('#f59e0b');
  });

  it('not found + not installable → hint manual (antigravity)', () => {
    const b = agentBadge(tool({ found: false, installable: false }));
    expect(b.text).toMatch(/manual/i);
  });
});

describe('DISC-002 routerBadge', () => {
  it('null → memeriksa', () => {
    expect(routerBadge(null).text).toMatch(/memeriksa/);
  });
  it('running → hijau dengan port', () => {
    const b = routerBadge({ running: true, port: 20128 });
    expect(b.color).toBe('#10b981');
    expect(b.text).toContain('20128');
  });
  it('down → merah', () => {
    expect(routerBadge({ running: false, port: 20128 }).color).toBe('#ef4444');
  });
});

describe('DISC-004 buildOnboarding', () => {
  it('fresh install → semua step belum done dan punya CTA', () => {
    const steps = buildOnboarding({ distrosInstalled: 0, agentsFound: 0, routerRunning: false });
    expect(steps.map((s) => s.done)).toEqual([false, false, false]);
    steps.forEach((s) => expect(s.cta).not.toBeNull());
  });

  it('distro ada tapi belum ada agent → CTA hanya untuk agent & router', () => {
    const steps = buildOnboarding({ distrosInstalled: 2, agentsFound: 0, routerRunning: false });
    expect(steps[0].done).toBe(true);
    expect(steps[0].cta).toBeNull();
    expect(steps[1].done).toBe(false);
    expect(steps[1].cta).toBe('Install Agent');
    expect(steps[2].done).toBe(false);
  });

  it('agent terdeteksi tanpa distro → CTA distro muncul', () => {
    const steps = buildOnboarding({ distrosInstalled: 0, agentsFound: 3, routerRunning: false });
    expect(steps[1].done).toBe(true);
    expect(steps[0].cta).toBe('Buka Manajemen Distro');
  });

  it('router jalan → step opsional done', () => {
    const steps = buildOnboarding({ distrosInstalled: 1, agentsFound: 1, routerRunning: true });
    expect(steps.every((s) => s.done)).toBe(true);
  });

  it('progress string akurat', () => {
    const steps = buildOnboarding({ distrosInstalled: 1, agentsFound: 0, routerRunning: true });
    expect(onboardingProgress(steps)).toBe('2/3');
  });
});

describe('DISC-003 guides', () => {
  it('mencakup distro, agents, router9, config — tiap guide ≥3 langkah', () => {
    const ids = GUIDES.map((g) => g.id);
    expect(ids).toEqual(['distro', 'agents', 'router9', 'config']);
    GUIDES.forEach((g) => expect(g.steps.length).toBeGreaterThanOrEqual(3));
  });

  it('panduan menyebut cara install yang konkret', () => {
    const routerGuide = GUIDES.find((g) => g.id === 'router9')!;
    expect(routerGuide.steps.join(' ')).toMatch(/9router/i);
    const agentGuide = GUIDES.find((g) => g.id === 'agents')!;
    expect(agentGuide.steps.join(' ')).toMatch(/Install/i);
  });
});
