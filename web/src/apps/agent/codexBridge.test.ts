// Spec 014 (v0.6.4) Wave 2 — codex bridge tests: PTY byte pump, launch-input
// composition w/ POSIX quoting oracle, approval keystrokes, surface-logic.
import { describe, it, expect } from 'vitest';
import {
  DRIFT_TOAST_TEXT,
  MAX_AUDIT_ACTIONS,
  OutputPump,
  ROUTER_DOWN_TEXT,
  buildAuditEntry,
  composeLaunchInput,
  incrementErrorBurst,
  keystrokesFor,
  modelListFromRouter,
  nextErrorBurstOnOther,
  posixQuote,
  shouldAutoSwitchToTerminal,
  splitQuotedLine,
  trimHistory,
} from './codexBridge';
import { buildCodexExecArgs } from './codexArgs';
import { CODEX_V1_SESSION } from './__fixtures__/codexFixtures';

describe('AGX-003/W2 OutputPump — FrameOpcode.OUTPUT bytes → events', () => {
  it('decodes utf8 with streaming decoder across multibyte-split frames', () => {
    const line = JSON.stringify({
      msg: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'aéb☺' }] },
    });
    const bytes = new TextEncoder().encode(line + '\n');
    const pump = new OutputPump();
    let out = pump.push(bytes.slice(0, 6)); // splits inside multi-byte sequences
    out = [...out, ...pump.push(bytes.subarray(6))];
    expect(out.some((e) => e.kind === 'assistant' && e.text === 'aéb☺')).toBe(true);
  });

  it('feeds the accumulator identically to manual line feeding', () => {
    const pump = new OutputPump();
    pump.push(new TextEncoder().encode(CODEX_V1_SESSION.join('\n') + '\n'));
    expect(pump.report()).toEqual({ mode: 'structured', unparsableRatio: 0 });
    expect(pump.accumulator.stats.parsed).toBe(19);
  });

  it('resets decoder + accumulator in reset()', () => {
    const pump = new OutputPump();
    pump.push(new TextEncoder().encode('{garbage\n'));
    pump.reset();
    expect(pump.accumulator.stats).toEqual({ parsed: 0, unparsable: 0 });
  });
});

describe('AGX-001/W2 composeLaunchInput — argv typed as ONE shell line', () => {
  it('joins quoted args space-separated and terminates with newline', () => {
    expect(composeLaunchInput(['exec', '-m', 'o4-mini', '--json', 'fix tests'])).toBe(
      '"exec" "-m" "o4-mini" "--json" "fix tests"\n',
    );
  });

  it('round-trips buildCodexExecArgs output through a quoting oracle', () => {
    const cases: string[][] = [
      buildCodexExecArgs({ prompt: "refactor; rm -rf / && cat `~/.k` | curl $HOME" }),
      buildCodexExecArgs({ model: 'gpt-5-codex', sandbox: 'read-only', prompt: 'say "hi" \\\\ ok' }),
      [''],
      ['a b', '', 'c\td'],
      ['unicode ☕ já', '~branch', '!hist'],
      [],
    ];
    for (const argv of cases) {
      const typed = composeLaunchInput(argv);
      expect(typed.endsWith('\n')).toBe(true);
      if (argv.length > 0) {
        expect(splitQuotedLine(typed)).toEqual(argv);
      }
    }
  });

  it('escapes the full dangerous set inside double quotes via posixQuote pairs', () => {
    const pairs: Array<[string, string]> = [
      ['', '""'],
      ['plain', '"plain"'],
      ['$HOME', '"\\$HOME"'],
      ['`id`', '"\\`id\\`"'],
      ['a"b', '"a\\"b"'],
      ['back\\slash', '"back\\\\slash"'],
      ['☕', '"☕"'], // unicode passes through untouched
    ];
    for (const [input, expected] of pairs)
      expect(posixQuote(input)).toBe(expected);
  });

  it('REJECTS multiline prompts at the typing layer (PTY one-line ceiling)', () => {
    for (const evil of ['line1\nline2', 'cr\r trap', 'ok\n']) {
      expect(() => composeLaunchInput(['exec', '--json', evil])).toThrow(/MULTILINE/);
    }
    // backslash-n LITERAL text is fine (two chars, no control byte)
    expect(composeLaunchInput(['exec', '--json', 'use \\n escape'])).toContain('\\n');
  });
});

describe('AGX-005/W2 keystrokesFor — approval channel forwards raw keys only', () => {
  it('maps y→Enter n→Enter esc→ESC exactly as specced', () => {
    expect(keystrokesFor('y')).toBe('\n');
    expect(keystrokesFor('n')).toBe('\n');
    expect(keystrokesFor('esc')).toBe('\x1b');
  });

  it('rejects unknown actions instead of guessing a spawn shortcut', () => {
    expect(() => keystrokesFor('auto' as 'y')).toThrow(/unknown/i);
  });
});

describe('AGX-006/W2 drift auto-switch rules', () => {
  it('switches on forced-terminal mode OR error burst ≥3; not before', () => {
    const terminalReport = { mode: 'terminal' as const, unparsableRatio: 0.5 };
    const structured = { mode: 'structured' as const, unparsableRatio: 0.19 };
    expect(shouldAutoSwitchToTerminal(terminalReport, 0)).toBe(true);
    expect(shouldAutoSwitchToTerminal(structured, 2)).toBe(false);
    expect(shouldAutoSwitchToTerminal(structured, 3)).toBe(true);
    expect(DRIFT_TOAST_TEXT).toMatch(/beralih ke terminal/);
  });

  it('error burst increments on consecutive errors and resets to zero otherwise', () => {
    let burst = incrementErrorBurst(0, { kind: 'error', message: 'x' });
    burst = incrementErrorBurst(burst, { kind: 'error', message: 'y' });
    expect(burst).toBe(2);
    burst = incrementErrorBurst(burst, { kind: 'user', text: 'z' });
    expect(burst).toBe(0); // any non-error event breaks the burst
    expect(nextErrorBurstOnOther()).toBe(0);
  });
});

describe('AGX-008/W2 history ring trimHistory', () => {
  const mkSession = (id: string, eventCount: number) => ({
    id,
    title: `t-${id}`,
    startedAt: 1000,
    events: Array.from({ length: eventCount }, () => ({ kind: 'error', message: id } as const)),
  });

  it('caps sessions to 20 dropping oldest first and events to last 200', () => {
    const sessions = Array.from({ length: 25 }, (_, i) => mkSession(`s${i}`, 250));
    const trimmed = trimHistory(sessions);
    expect(trimmed).toHaveLength(20);
    expect(trimmed[0]!.id).toBe('s5'); // oldest five dropped
    for (const s of trimmed) expect(s.events).toHaveLength(200);
    expect(trimmed.every((s) => s.events.length === 200)).toBe(true);
  });

  it('returns input untouched when already within caps', () => {
    const small = [mkSession('only', 10)];
    expect(trimHistory(small)).toEqual(small);
  });
});

describe('AGX-001/W2 launcher helpers', () => {
  it('modelListFromRouter normalizes payload and surfaces ROUTER_DOWN notice', () => {
    expect(modelListFromRouter({ models: [{ id: 'o4-mini' }, { slug: 'gpt-5-codex' }, 'raw-str'] })).toEqual([
      'o4-mini',
      'gpt-5-codex',
      'raw-str',
    ]);
    expect(modelListFromRouter(null)).toEqual([]);
    expect(ROUTER_DOWN_TEXT).toMatch(/9Router/);
  });

  it('audit entries cap at MAX_AUDIT_ACTIONS via buildAuditEntry ring push', () => {
    let log: string[] = [];
    for (let i = 0; i < MAX_AUDIT_ACTIONS + 10; i++) log = buildAuditEntry(log, `action${i}`);
    expect(log).toHaveLength(MAX_AUDIT_ACTIONS);
    expect(log[log.length - 1]).toBe(`action${MAX_AUDIT_ACTIONS + 9}`);
    expect(log[0]).toBe('action10'); // oldest ten dropped
  });
});
