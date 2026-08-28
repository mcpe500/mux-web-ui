// Spec 014 (v0.6.4) Wave 2 — AGX-001/005/006/008 bridge logic.
// ONE PTY is the source of truth: this module only maps its OUTPUT frames and
// prepares the single launch line typed into the attached shell. No second
// process spawn path exists here or in the component (structural guarantee).
import { FrameOpcode } from '../terminal/reconnect';
import { TranscriptAccumulator } from './transcriptBuffer';
import type { CodexEvent, DriftReport } from './codexEvents';

/** Maps PTY OUTPUT bytes → utf8 chunks (streaming) → CodexEvents. */
export class OutputPump {
  private decoder = new TextDecoder();
  readonly accumulator = new TranscriptAccumulator();

  /** Consumes one raw OUTPUT payload (opcode byte already stripped). */
  push(bytes: Uint8Array): CodexEvent[] {
    return this.accumulator.feed(this.decoder.decode(bytes, { stream: true }));
  }

  report(): DriftReport {
    return this.accumulator.analyzeNow();
  }

  /** CDX-003 (spec 016): latest codex thread id observed in the output. */
  threadId(): string | null {
    return this.accumulator.threadId;
  }

  /** CDX-003 (spec 016): true once per completed turn (latched until drained). */
  drainTurnEnded(): boolean {
    const ended = this.accumulator.turnEnded;
    this.accumulator.turnEnded = false;
    return ended;
  }

  reset(): void {
    this.decoder = new TextDecoder();
    this.accumulator.resetForTest();
  }
}

/**
 * POSIX double-quote for a single argv element. Escapes the set that is
 * special inside double quotes: \ " $ ` ; ! treated as plain text is safe
 * in non-interactive shells (history expansion off).
 */
export function posixQuote(arg: string): string {
  return '"' + arg.replace(/([\\"$`])/g, '\\$1') + '"';
}

/**
 * Tiny splitting oracle for tests: reverses composeLaunchInput's quoting.
 * Supports exactly our emitted grammar (double-quoted, escaped \ " $ `).
 */
export function splitQuotedLine(line: string): string[] {
  const trimmed = line.replace(/\n$/, '');
  if (trimmed.trim() === '') return [];
  const out: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    while (i < trimmed.length && /\s/.test(trimmed[i]!)) i += 1;
    if (i >= trimmed.length) break;
    let cur = '';
    if (trimmed[i] === '"') {
      i += 1;
      while (i < trimmed.length && trimmed[i] !== '"') {
        if (trimmed[i] === '\\' && ['\\', '"', '$', '`'].includes(trimmed[i + 1]!)) {
          cur += trimmed[i + 1];
          i += 2;
        } else {
          cur += trimmed[i];
          i += 1;
        }
      }
      i += 1; // closing quote
    } else {
      while (i < trimmed.length && !/\s/.test(trimmed[i]!)) {
        cur += trimmed[i];
        i += 1;
      }
    }
    out.push(cur);
  }
  return out;
}

export const LAUNCH_MULTILINE_ERROR = 'PROMPT_MULTILINE_UNSAFE';

/**
 * AGX-001: builds the single line to TYPE into the attached shell:
 * every argv element double-quoted, joined with spaces, newline-terminated.
 * Multiline args cannot survive a typed-PTY channel — rejected explicitly
 * (byte-faithful stdin piping is the wave-3+ upgrade path).
 */
export function composeLaunchInput(args: readonly string[]): string {
  if (args.some((a) => /[\n\r]/.test(a))) throw new Error(LAUNCH_MULTILINE_ERROR);
  return args.map(posixQuote).join(' ') + '\n';
}

/**
 * AGX-005: approval forwarding = RAW keystrokes over the SAME socket.
 * No other send shortcut exists — components must use these values.
 */
export function keystrokesFor(action: 'y' | 'n' | 'esc'): string {
  switch (action) {
    case 'y':
      return '\n';
    case 'n':
      return '\n';
    case 'esc':
      return '\x1b';
    default:
      throw new Error('unknown approval action');
  }
}

/** AGX-006 toast copy shown when drift forces the surface switch. */
export const DRIFT_TOAST_TEXT =
  'Mode chat dinonaktifkan sementara — beralih ke terminal (drift skema CLI)';

/** Consecutive error events tolerated before Chat auto-switches to Terminal. */
export const ERROR_BURST_LIMIT = 3;

/** True when the Chat surface must hand over to Terminal right now. */
export function shouldAutoSwitchToTerminal(report: DriftReport, errorBurst: number): boolean {
  return report.mode === 'terminal' || errorBurst >= ERROR_BURST_LIMIT;
}

export function incrementErrorBurst(burst: number, event: CodexEvent): number {
  return event.kind === 'error' ? burst + 1 : 0;
}

export function nextErrorBurstOnOther(): number {
  return 0;
}

/** AGX-008 session history shape kept minimal + in-memory only (v1). */
export interface HistorySession {
  id: string;
  title: string;
  startedAt: number;
  events: CodexEvent[];
}

export const MAX_HISTORY_SESSIONS = 20;
export const MAX_HISTORY_EVENTS = 200;

/** Ring semantics: drop oldest sessions first, keep last N events per session. */
export function trimHistory(
  sessions: HistorySession[],
  maxSessions = MAX_HISTORY_SESSIONS,
  maxEvents = MAX_HISTORY_EVENTS,
): HistorySession[] {
  return sessions.slice(-maxSessions).map((s) => ({
    ...s,
    events: s.events.slice(-maxEvents),
  }));
}

export const MAX_AUDIT_ACTIONS = 50;

/** Audit mini-log ring push (launches/approvals/toggles). */
export function buildAuditEntry(log: string[], entry: string): string[] {
  const next = [...log, entry];
  return next.length > MAX_AUDIT_ACTIONS ? next.slice(next.length - MAX_AUDIT_ACTIONS) : next;
}

/** AGX-001 model picker normalizer; router offline → notice, empty list. */
export const ROUTER_DOWN_TEXT =
  '9Router tidak merespons — model manual dapat diketik, jalankan `9router` bila perlu daftar';

export function modelListFromRouter(payload: unknown): string[] {
  const p = payload as { models?: unknown } | null;
  if (!p || !Array.isArray(p.models)) return [];
  return p.models.map((m): string => {
    if (typeof m === 'string') return m;
    const o = m as { id?: unknown; slug?: unknown };
    if (typeof o.id === 'string') return o.id;
    if (typeof o.slug === 'string') return o.slug;
    return String(m);
  });
}

/** Guard kept for symmetry with FrameOpcode handling at call sites. */
export const FRAME_OPCODE_INPUT = FrameOpcode.INPUT;
