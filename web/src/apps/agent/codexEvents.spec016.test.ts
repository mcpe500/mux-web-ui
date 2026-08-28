// Spec 016 (v0.6.7) CDX-001/002 tests — thread-id extraction + turn-end signal.
import { describe, it, expect } from 'vitest';
import {
  extractCodexThreadId,
  isTurnEndLine,
  analyzeTranscript,
} from './codexEvents';

describe('CDX-001 extractCodexThreadId', () => {
  it('reads thread.started / thread.resumed (v2)', () => {
    expect(extractCodexThreadId('{"type":"thread.started","thread_id":"thr-abc"}')).toBe('thr-abc');
    expect(extractCodexThreadId('{"type":"thread.resumed","thread_id":"thr-xyz"}')).toBe('thr-xyz');
  });

  it('reads session.created (nested + flat) and legacy session_configured', () => {
    expect(extractCodexThreadId('{"type":"session.created","session":{"id":"s-1"}}')).toBe('s-1');
    expect(extractCodexThreadId('{"type":"session.created","session_id":"s-2"}')).toBe('s-2');
    expect(extractCodexThreadId('{"type":"session_configured","session_id":"s-3"}')).toBe('s-3');
    expect(
      extractCodexThreadId('{"id":"0","msg":{"type":"session_configured","session_id":"s-4"}}'),
    ).toBe('s-4');
  });

  it('returns null for unknown/invalid/non-carrier shapes', () => {
    expect(extractCodexThreadId('not json')).toBeNull();
    expect(extractCodexThreadId('["array"]')).toBeNull();
    expect(extractCodexThreadId('{"type":"item.completed","item":{}}')).toBeNull();
    expect(extractCodexThreadId('{"type":"thread.started"}')).toBeNull();
    expect(extractCodexThreadId('')).toBeNull();
  });
});

describe('CDX-002 isTurnEndLine', () => {
  it('recognizes turn.completed / turn.failed (top-level and v1 msg)', () => {
    expect(isTurnEndLine('{"type":"turn.completed"}')).toBe(true);
    expect(isTurnEndLine('{"type":"turn.failed","error":"boom"}')).toBe(true);
    expect(isTurnEndLine('{"id":"0","msg":{"type":"turn.completed"}}')).toBe(true);
  });

  it('rejects other/invalid lines', () => {
    expect(isTurnEndLine('{"type":"thread.started","thread_id":"t"}')).toBe(false);
    expect(isTurnEndLine('garbage')).toBe(false);
    expect(isTurnEndLine('')).toBe(false);
  });
});

describe('CDX-002 classifier recognition (drift false-positive guard)', () => {
  it('lifecycle lines do NOT count as unparsable', () => {
    const lines = [
      '{"type":"thread.started","thread_id":"t1"}',
      '{"type":"turn.completed"}',
      '{"type":"turn.failed"}',
      '{"id":"0","msg":{"type":"session_configured","session_id":"s"}}',
    ];
    const report = analyzeTranscript(lines);
    expect(report.mode).toBe('structured');
    expect(report.unparsableRatio).toBe(0);
  });
});
