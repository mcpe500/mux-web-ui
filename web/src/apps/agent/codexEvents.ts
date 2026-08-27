// Spec 014 (v0.6.4) Milestone D — AGX-003 canonical event mapper +
// AGX-006 drift detector. Pure, node-safe, framework-free (conventions of
// terminal/reconnect.ts): no DOM, no Preact; exported consts + functions.
//
// Tolerant across TWO documented synthetic schema generations
// (__fixtures__/codexFixtures.ts):
//   SCHEMA-V1 (older CLI): {"msg":{type:message|reasoning|function_call|function_call_output,...}}
//   SCHEMA-V2 (newer CLI): {"type":"item.completed"|"item.updated",item:{item_type:...}}
//                          and bare {"type":"error","message"}.

/** Canonical chat event consumed by the Codex Chat View (Wave 2 UI). */
export type CodexEvent =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool_call'; id: string; name: string; argsPreview: string }
  | { kind: 'tool_result'; id: string; output: string }
  | { kind: 'error'; message: string };

/** argsPreview hard cap in characters (pretty-trimmed before slicing). */
export const ARGS_PREVIEW_MAX_CHARS = 120;

/**
 * AGX-006 threshold: transcript switches to Terminal View when the
 * unparsable ratio goes STRICTLY above this value. Chosen rule:
 * ratio == 0.2 stays structured ("innocent until proven guilty").
 */
export const UNPARSABLE_RATIO_FORCE_TERMINAL = 0.2;

/** AGX-006 detector verdict. */
export interface DriftReport {
  mode: 'structured' | 'terminal';
  unparsableRatio: number;
}

interface Rec {
  [key: string]: unknown;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function obj(v: unknown): Rec | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : null;
}

/** Concatenates the text fields of a content array (any documented type). */
function contentText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  let out = '';
  for (const part of content) {
    const p = obj(part);
    const t = p ? str(p.text) : null;
    if (t) out += t;
  }
  return out;
}

/** Pretty-trimmed preview: canonical single-line JSON when parseable, else raw trim. */
function previewArgs(raw: string): string {
  let s = raw;
  try {
    s = JSON.stringify(JSON.parse(raw));
  } catch {
    /* keep raw */
  }
  s = s.trim();
  return s.slice(0, ARGS_PREVIEW_MAX_CHARS);
}

interface Classified {
  events: CodexEvent[];
  /** false → line counts toward the drift ratio (invalid or unknown shape). */
  recognized: boolean;
}

function fromV1Msg(m: Rec): Classified {
  switch (m.type) {
    case 'reasoning':
      return { events: [], recognized: true };
    case 'message': {
      const role = m.role === 'user' ? 'user' : 'assistant';
      return { events: [{ kind: role, text: contentText(m.content) }], recognized: true };
    }
    case 'function_call':
      return {
        events: [
          {
            kind: 'tool_call',
            id: str(m.call_id) ?? '',
            name: str(m.name) ?? '',
            argsPreview: previewArgs(str(m.arguments) ?? ''),
          },
        ],
        recognized: true,
      };
    case 'function_call_output':
      return {
        events: [{ kind: 'tool_result', id: str(m.call_id) ?? '', output: str(m.output) ?? '' }],
        recognized: true,
      };
    default:
      return { events: [], recognized: false };
  }
}

function fromV2Item(it: Rec): Classified {
  switch (it.item_type) {
    case 'reasoning':
      return { events: [], recognized: true };
    case 'message': {
      const role = it.role === 'user' ? 'user' : 'assistant';
      return { events: [{ kind: role, text: contentText(it.content) }], recognized: true };
    }
    case 'command_execution': {
      // ponytail: per-line occurrence index → repeat commands share ids (e.g.
      // two `cargo test` lines both get cargo@0); upgrade path = session-scoped
      // counter keyed by item.id if real transcripts demand stable pairing.
      const command = str(it.command) ?? '';
      const explicitName = str(it.name);
      const derived = command.trim().split(/\s+/)[0] || '';
      const name = explicitName !== null && explicitName !== '' ? explicitName : derived || 'command';
      const id = `${name}@0`;
      const events: CodexEvent[] = [
        { kind: 'tool_call', id, name, argsPreview: command },
      ];
      const output = str(it.aggregated_output);
      if (output !== null) events.push({ kind: 'tool_result', id, output });
      return { events, recognized: true };
    }
    default:
      return { events: [], recognized: false };
  }
}

function classify(line: string): Classified {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { events: [], recognized: false };
  }
  const o = obj(parsed);
  if (!o) return { events: [], recognized: false };

  const msg = obj(o.msg);
  if (msg) return fromV1Msg(msg);

  const type = str(o.type);
  if (type === 'error') {
    const message = str(o.message) ?? '';
    return { events: [{ kind: 'error', message }], recognized: true };
  }
  if (type === 'item.completed' || type === 'item.updated') {
    const item = obj(o.item);
    return item ? fromV2Item(item) : { events: [], recognized: true };
  }
  return { events: [], recognized: false };
}

/**
 * Maps ONE JSONL line to zero or more canonical events. Tolerant by design:
 * anything unrecognized returns [] silently (drift is counted separately by
 * analyzeTranscript).
 */
export function parseCodexJsonLine(line: string): CodexEvent[] {
  return classify(line.trim()).events;
}

/**
 * AGX-006 DriftDetector. Whitespace-only lines are ignored and NOT counted.
 * Unparsable = invalid JSON, non-object JSON, or unrecognized top-level shape.
 * Ratio > UNPARSABLE_RATIO_FORCE_TERMINAL forces terminal mode; equality does
 * NOT (integer math 5*bad > counted avoids float-boundary flakiness).
 */
export function analyzeTranscript(lines: readonly string[]): DriftReport {
  let counted = 0;
  let bad = 0;
  for (const raw of lines) {
    if (raw.trim() === '') continue;
    counted += 1;
    if (!classify(raw.trim()).recognized) bad += 1;
  }
  const forcedTerminal = counted > 0 && bad * 5 > counted;
  return {
    mode: forcedTerminal ? 'terminal' : 'structured',
    unparsableRatio: counted === 0 ? 0 : bad / counted,
  };
}
