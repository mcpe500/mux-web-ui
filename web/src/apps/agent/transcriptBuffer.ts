// Spec 014 (v0.6.4) Wave 2 — AGX-003/AGX-006 chunk-aware transcript buffer.
// Pure, node-safe: feeds arbitrary WS chunk splits into codexEvents mapper.
import { parseCodexJsonLine, analyzeTranscript, extractCodexThreadId, isTurnEndLine } from './codexEvents';
import type { CodexEvent, DriftReport } from './codexEvents';

/** Drift window bound — oldest complete lines rotate out (AFK-long sessions). */
export const MAX_ANALYZE_LINES = 2000;

/**
 * Buffers partial JSON lines across chunks until '\n', emitting canonical
 * events incrementally. CRLF tolerated; whitespace-only lines are skipped
 * without touching counters; the unterminated tail never enters analyzeNow.
 */
export class TranscriptAccumulator {
  private tail = '';
  private lines: string[] = [];
  readonly stats = { parsed: 0, unparsable: 0 };
  /** CDX-003 (spec 016): latest codex thread id seen in the stream. */
  threadId: string | null = null;
  /** CDX-003 (spec 016): latched turn-end signal (drained by the consumer). */
  turnEnded = false;

  /** Feeds a string chunk; returns events for newly completed lines only. */
  feed(chunk: string): CodexEvent[] {
    this.tail += chunk;
    const out: CodexEvent[] = [];
    let idx = this.tail.indexOf('\n');
    while (idx >= 0) {
      const line = this.tail.slice(0, idx).replace(/\r$/, '').trim();
      this.tail = this.tail.slice(idx + 1);
      if (line !== '') out.push(...this.consume(line));
      idx = this.tail.indexOf('\n');
    }
    return out;
  }

  private consume(line: string): CodexEvent[] {
    const events = parseCodexJsonLine(line);
    if (analyzeTranscript([line]).unparsableRatio > 0) this.stats.unparsable += 1;
    else this.stats.parsed += 1;
    const tid = extractCodexThreadId(line);
    if (tid !== null) this.threadId = tid;
    if (isTurnEndLine(line)) this.turnEnded = true;
    this.lines.push(line);
    if (this.lines.length > MAX_ANALYZE_LINES) this.lines.shift();
    return events;
  }

  /** Drift verdict over accumulated COMPLETE lines inside the sliding window. */
  analyzeNow(): DriftReport {
    return analyzeTranscript(this.lines);
  }

  /** Rendered event stream so far (for chat history capture). */
  eventsSnapshot(): CodexEvent[] {
    return this.lines.flatMap(parseCodexJsonLine);
  }

  resetForTest(): void {
    this.tail = '';
    this.lines = [];
    this.stats.parsed = 0;
    this.stats.unparsable = 0;
    this.threadId = null;
    this.turnEnded = false;
  }
}
