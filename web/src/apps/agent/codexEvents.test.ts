// Spec 014 (v0.6.4) Milestone D — AGX-003 canonical event mapper + AGX-006
// drift detector tests (pure, node-safe, DOM-free like terminal/reconnect).
import { describe, it, expect } from 'vitest';
import {
  ARGS_PREVIEW_MAX_CHARS,
  UNPARSABLE_RATIO_FORCE_TERMINAL,
  analyzeTranscript,
  parseCodexJsonLine,
} from './codexEvents';
import { CODEX_V1_SESSION, CODEX_V2_SESSION } from './__fixtures__/codexFixtures';

describe('AGX-003 parseCodexJsonLine — SCHEMA-V1', () => {
  it('maps user message envelope to user event', () => {
    const line =
      '{"msg":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}';
    expect(parseCodexJsonLine(line)).toEqual([{ kind: 'user', text: 'hello' }]);
  });

  it('maps assistant message with output_text to assistant event', () => {
    const line =
      '{"msg":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hi there"}]}}';
    expect(parseCodexJsonLine(line)).toEqual([
      { kind: 'assistant', text: 'hi there' },
    ]);
  });

  it('accepts every documented content item type incl text/output_text joins', () => {
    const line =
      '{"msg":{"type":"message","role":"assistant","content":[{"type":"text","text":"a"},{"type":"output_text","text":"b"}]}}';
    expect(parseCodexJsonLine(line)).toEqual([{ kind: 'assistant', text: 'ab' }]);
  });

  it('ignores reasoning deltas as noise', () => {
    expect(parseCodexJsonLine('{"msg":{"type":"reasoning","summary":[]}}')).toEqual(
      [],
    );
    expect(
      parseCodexJsonLine(
        '{"msg":{"type":"reasoning","summary":[{"type":"summary_text","text":"thinking"}]}}',
      ),
    ).toEqual([]);
  });

  it('maps function_call → tool_call with pretty-trimmed args preview capped at 120 chars', () => {
    const longArgs = JSON.stringify({ cmd: ['rg', 'auth'], note: 'x'.repeat(400) });
    const line = `{"msg":{"type":"function_call","call_id":"call_9","name":"shell","arguments":${JSON.stringify(longArgs)}}}`;
    const events = parseCodexJsonLine(line);
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    if (ev.kind !== 'tool_call') throw new Error(`expected tool_call, got ${ev.kind}`);
    expect(ev.id).toBe('call_9');
    expect(ev.name).toBe('shell');
    expect(ev.argsPreview.length).toBe(ARGS_PREVIEW_MAX_CHARS);
    expect(ev.argsPreview).toBe(longArgs.slice(0, ARGS_PREVIEW_MAX_CHARS));
  });

  it('falls back to raw trimmed arguments when arguments is not JSON', () => {
    const line =
      '{"msg":{"type":"function_call","call_id":"c1","name":"apply_patch","arguments":"  - a\\n+ b  "}}';
    expect(parseCodexJsonLine(line)).toEqual([
      { kind: 'tool_call', id: 'c1', name: 'apply_patch', argsPreview: '- a\n+ b' },
    ]);
  });

  it('maps function_call_output → tool_result keyed by call_id', () => {
    const line =
      '{"msg":{"type":"function_call_output","call_id":"call_1","output":"src/a.ts:42"}}';
    expect(parseCodexJsonLine(line)).toEqual([
      { kind: 'tool_result', id: 'call_1', output: 'src/a.ts:42' },
    ]);
  });
});

describe('AGX-003 parseCodexJsonLine — SCHEMA-V2', () => {
  it('maps item.completed message by role → assistant', () => {
    const line =
      '{"type":"item.completed","item":{"item_type":"message","role":"assistant","content":[{"type":"output_text","text":"done"}]}}';
    expect(parseCodexJsonLine(line)).toEqual([{ kind: 'assistant', text: 'done' }]);
  });

  it('maps item.completed message role user → user', () => {
    const line =
      '{"type":"item.completed","item":{"item_type":"message","role":"user","content":[{"type":"input_text","text":"go"}]}}';
    expect(parseCodexJsonLine(line)).toEqual([{ kind: 'user', text: 'go' }]);
  });

  it('ignores reasoning items as noise on both completed and updated', () => {
    expect(
      parseCodexJsonLine('{"type":"item.completed","item":{"item_type":"reasoning","id":"r1"}}'),
    ).toEqual([]);
    expect(
      parseCodexJsonLine('{"type":"item.updated","item":{"item_type":"reasoning","id":"r2"}}'),
    ).toEqual([]);
  });

  it('maps command_execution updated → tool_call named <first-token>@<per-line-idx>', () => {
    const line =
      '{"type":"item.updated","item":{"item_type":"command_execution","command":"rg -n backoff src"}}';
    expect(parseCodexJsonLine(line)).toEqual([
      { kind: 'tool_call', id: 'rg@0', name: 'rg', argsPreview: 'rg -n backoff src' },
    ]);
  });

  it('pairs tool_result with the SAME id when aggregated_output arrives', () => {
    const line =
      '{"type":"item.completed","item":{"item_type":"command_execution","command":"cargo test","aggregated_output":"7 passed","exit_code":0}}';
    expect(parseCodexJsonLine(line)).toEqual([
      { kind: 'tool_call', id: 'cargo@0', name: 'cargo', argsPreview: 'cargo test' },
      { kind: 'tool_result', id: 'cargo@0', output: '7 passed' },
    ]);
  });

  it('per-line index resets each line — repeat commands share id (documented pairing ceiling)', () => {
    const a =
      '{"type":"item.updated","item":{"item_type":"command_execution","command":"cargo test"}}';
    const b =
      '{"type":"item.completed","item":{"item_type":"command_execution","command":"cargo test","aggregated_output":"7 passed","exit_code":0}}';
    expect(parseCodexJsonLine(a)).toEqual([
      { kind: 'tool_call', id: 'cargo@0', name: 'cargo', argsPreview: 'cargo test' },
    ]);
    expect(parseCodexJsonLine(b)).toEqual([
      { kind: 'tool_call', id: 'cargo@0', name: 'cargo', argsPreview: 'cargo test' },
      { kind: 'tool_result', id: 'cargo@0', output: '7 passed' },
    ]);
  });

  it('maps bare {"type":"error"} to error event', () => {
    expect(parseCodexJsonLine('{"type":"error","message":"boom"}')).toEqual([
      { kind: 'error', message: 'boom' },
    ]);
  });
});

describe('AGX-003 tolerance', () => {
  it('returns [] silently for unknown top-level shapes', () => {
    expect(parseCodexJsonLine('{"type":"session_configured","model":"x"}')).toEqual([]);
    expect(parseCodexJsonLine('"just a string"')).toEqual([]);
    expect(parseCodexJsonLine('[1,2,3]')).toEqual([]);
    expect(parseCodexJsonLine('42')).toEqual([]);
    expect(parseCodexJsonLine('{not json at all')).toEqual([]);
    expect(parseCodexJsonLine('')).toEqual([]);
  });
});

describe('AGX-003 fixture sessions — both schema generations survive', () => {
  it('V1 synthetic session maps cleanly with zero drift', () => {
    const report = analyzeTranscript([...CODEX_V1_SESSION]);
    expect(report.mode).toBe('structured');
    expect(report.unparsableRatio).toBe(0);
    const kinds = new Map<string, number>();
    for (const l of CODEX_V1_SESSION)
      for (const ev of parseCodexJsonLine(l)) kinds.set(ev.kind, (kinds.get(ev.kind) ?? 0) + 1);
    expect(kinds.get('user')).toBe(2);
    expect(kinds.get('assistant')).toBe(5);
    expect(kinds.get('tool_call')).toBe(4);
    expect(kinds.get('tool_result')).toBe(4);
    // paired ids: every tool_call has its result
    const calls = CODEX_V1_SESSION.flatMap((l) => parseCodexJsonLine(l)).filter(
      (e): e is Extract<(typeof e), { kind: 'tool_call' }> => e.kind === 'tool_call',
    );
    const results = CODEX_V1_SESSION.flatMap((l) => parseCodexJsonLine(l)).filter(
      (e): e is Extract<(typeof e), { kind: 'tool_result' }> => e.kind === 'tool_result',
    );
    for (const c of calls)
      expect(results.some((r) => r.id === c.id), `missing tool_result for ${c.id}`).toBe(true);
  });

  it('V2 synthetic session maps cleanly; no reasoning noise leaks into events', () => {
    const all = CODEX_V2_SESSION.flatMap((l) => parseCodexJsonLine(l));
    const report = analyzeTranscript([...CODEX_V2_SESSION]);
    expect(report.mode).toBe('structured');
    expect(report.unparsableRatio).toBe(0);
    const counts: Record<string, number> = {};
    for (const e of all) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    expect(counts['user']).toBe(2);
    expect(counts['assistant']).toBe(3);
    expect(counts['error']).toBe(1);
    // 4 awaiting-output calls (item.updated) + 5 completed-with-output
    expect(counts['tool_call']).toBe(9);
    expect(counts['tool_result']).toBe(5);
    const texts = all
      .filter((e): e is Extract<(typeof e), { kind: 'user' | 'assistant' }> =>
        e.kind === 'user' || e.kind === 'assistant')
      .map((e) => e.text)
      .join('|');
    expect(texts).not.toContain('reproducing'); // reasoning summary stayed noise
  });
});

describe('AGX-006 DriftDetector analyzeTranscript', () => {
  it('empty transcript is innocent: structured with ratio 0', () => {
    expect(analyzeTranscript([])).toEqual({
      mode: 'structured',
      unparsableRatio: 0,
    });
  });

  it('whitespace-only lines are ignored AND not counted', () => {
    const lines = ['   ', '\t', '', '{"msg":{"type":"message","role":"user","content":[]}}'];
    expect(analyzeTranscript(lines)).toEqual({
      mode: 'structured',
      unparsableRatio: 0,
    });
  });

  it('CHOSEN RULE: ratio == 0.2 stays structured (force only above threshold)', () => {
    expect(UNPARSABLE_RATIO_FORCE_TERMINAL).toBe(0.2);
    const bad = ['{oops', '[1]', '3', '"s"', 'null'];
    const good =
      '{"msg":{"type":"message","role":"user","content":[{"type":"input_text","text":"ok"}]}}';
    const lines = [...bad, ...Array.from({ length: 20 }, () => good)]; // 5/25 = exactly 0.2
    expect(lines).toHaveLength(25);
    expect(analyzeTranscript(lines)).toEqual({
      mode: 'structured',
      unparsableRatio: 0.2,
    });
  });

  it('CHOSEN RULE: ratio > 0.2 forces terminal mode (invalid AND unknown shapes both count)', () => {
    const known =
      '{"msg":{"type":"message","role":"user","content":[{"type":"input_text","text":"ok"}]}}';
    // below threshold sanity: 2 broken out of 15 stays structured
    const r2of15 = analyzeTranscript(['{oops', '[2]', ...Array.from({ length: 13 }, () => known)]);
    expect(r2of15.mode).toBe('structured');
    // 6 broken / 20 total = 0.3 > 0.2 → terminal
    const broken = ['{oops', '42', '[7]', '{"totally_unknown_shape":true}', '"s"', 'null'];
    const lines = [...broken, ...Array.from({ length: 14 }, () => known)];
    const r = analyzeTranscript(lines);
    expect(r.unparsableRatio).toBeCloseTo(0.3, 5);
    expect(r.mode).toBe('terminal');
  });

  it('non-object JSON and invalid lines both count as unparsable', () => {
    const good =
      '{"msg":{"type":"message","role":"user","content":[{"type":"input_text","text":"ok"}]}}';
    const lines = [good, '42', '"str"', '[1]']; // 3 unparsable / 4 = 0.75 > 0.2
    const r = analyzeTranscript(lines);
    expect(r.mode).toBe('terminal');
    expect(r.unparsableRatio).toBeCloseTo(0.75, 5);
  });

  it('smoke: handles >10k-line transcript without error (no timing assertions)', () => {
    const base = [...CODEX_V1_SESSION];
    const big: string[] = [];
    while (big.length < 12_000) big.push(...base);
    const r = analyzeTranscript(big);
    expect(r.mode).toBe('structured');
    expect(r.unparsableRatio).toBe(0);
  });
});
