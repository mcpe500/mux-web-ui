// Spec 014 (v0.6.4) Wave 2 — transcript accumulator tests (pure, node-safe).
import { describe, it, expect } from 'vitest';
import { MAX_ANALYZE_LINES, TranscriptAccumulator } from './transcriptBuffer';
import { parseCodexJsonLine } from './codexEvents';
import { CODEX_V1_SESSION, CODEX_V2_SESSION } from './__fixtures__/codexFixtures';

const GOOD =
  '{"msg":{"type":"message","role":"user","content":[{"type":"input_text","text":"ok"}]}}';

function wholeLineEvents(lines: readonly string[]) {
  const acc = new TranscriptAccumulator();
  acc.feed(lines.join('\n') + '\n');
  return acc.eventsSnapshot();
}

describe('AGX-003/W2 TranscriptAccumulator chunk splitting', () => {
  it('yields identical event stream for EVERY splice boundary vs whole-line feed', () => {
    const all = [...CODEX_V1_SESSION, ...CODEX_V2_SESSION];
    const corpus = all.join('\n') + '\n';
    const expected = wholeLineEvents(all);
    for (let cut = 0; cut <= corpus.length; cut += 37) {
      const a = new TranscriptAccumulator();
      a.feed(corpus.slice(0, cut));
      a.feed(corpus.slice(cut));
      expect(a.eventsSnapshot()).toEqual(expected);
    }
  });

  it('handles multi-line chunks and line-per-chunk alike', () => {
    const lines = [...CODEX_V2_SESSION];
    const oneShot = new TranscriptAccumulator();
    oneShot.feed(lines.join('\n') + '\n');
    expect(oneShot.stats.parsed).toBe(20);

    const drip = new TranscriptAccumulator();
    for (const l of lines) drip.feed(l + '\n');
    expect(drip.eventsSnapshot()).toEqual(oneShot.eventsSnapshot());
  });

  it('buffers partial JSON until the newline arrives', () => {
    const acc = new TranscriptAccumulator();
    expect(acc.feed('{"msg":{"type":"mess')).toEqual([]);
    expect(acc.feed('age","role":"user","content":[{"type":"inp')).toEqual([]);
    const out = acc.feed('ut_text","text":"hi"}]}}\n');
    expect(out).toEqual([{ kind: 'user', text: 'hi' }]);
    expect(acc.stats.parsed).toBe(1);
    expect(acc.stats.unparsable).toBe(0);
  });

  it('tolerates CRLF line endings', () => {
    const acc = new TranscriptAccumulator();
    const out = acc.feed(GOOD + '\r\n' + '{"msg":{"type":"reasoning"}}\r\n');
    expect(out).toEqual([{ kind: 'user', text: 'ok' }]);
    expect(acc.stats.unparsable).toBe(0);
    expect(acc.analyzeNow().mode).toBe('structured');
  });

  it('keeps unicode multibyte intact across arbitrary chunk cuts', () => {
    const payload = JSON.stringify({
      msg: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'café ☕ 𝄞 ends' }],
      },
    });
    const line = payload + '\n';
    const acc = new TranscriptAccumulator();
    for (let cut = 0; cut <= line.length; cut += 3) {
      acc.resetForTest();
      acc.feed(line.slice(0, cut));
      acc.feed(line.slice(cut));
      expect(
        acc
          .eventsSnapshot()
          .some((e) => 'text' in e && e.text === 'café ☕ 𝄞 ends'),
        `cut=${cut}`,
      ).toBe(true);
    }
  });

  it('counts unparsable complete lines but ignores whitespace-only lines entirely', () => {
    const acc = new TranscriptAccumulator();
    // 1 unparsable / 5 counted = exactly the 0.2 boundary → still structured
    acc.feed('   \n{oops\n' + Array.from({ length: 4 }, () => GOOD + '\n').join('') + '\t\n');
    expect(acc.stats).toEqual({ parsed: 4, unparsable: 1 });
    expect(acc.analyzeNow()).toEqual({ mode: 'structured', unparsableRatio: 0.2 });
  });

  it('analyzeNow never sees the unterminated tail as a line', () => {
    const acc = new TranscriptAccumulator();
    acc.feed(GOOD + '\n{"trailing":"partial-no-newline');
    expect(acc.stats.parsed).toBe(1);
    expect(acc.analyzeNow().unparsableRatio).toBe(0);
    acc.feed('yet"'); // tail grows but still has no newline → not counted yet
    expect(acc.stats).toEqual({ parsed: 1, unparsable: 0 });
    acc.feed('\n');
    expect(acc.stats.unparsable).toBe(1);
  });

  it('sliding window caps analyzeNow input at MAX_ANALYZE_LINES (oldest dropped)', () => {
    expect(MAX_ANALYZE_LINES).toBeGreaterThan(50);
    const acc = new TranscriptAccumulator();
    acc.feed(Array.from({ length: MAX_ANALYZE_LINES }, () => '{stale\n').join(''));
    expect(acc.analyzeNow().mode).toBe('terminal');
    acc.feed(Array.from({ length: MAX_ANALYZE_LINES }, () => GOOD + '\n').join(''));
    const report = acc.analyzeNow();
    // every stale line rotated OUT of the window → structured again
    expect(report.mode).toBe('structured');
    expect(report.unparsableRatio).toBe(0);
  });

  it('drives V1 fixture end-to-end equal to the pure mapper output', () => {
    const acc = new TranscriptAccumulator();
    acc.feed(CODEX_V1_SESSION.join('\n') + '\n');
    expect(acc.analyzeNow()).toEqual({ mode: 'structured', unparsableRatio: 0 });
    expect(acc.eventsSnapshot()).toEqual(CODEX_V1_SESSION.flatMap(parseCodexJsonLine));
  });
});
