// Spec 014 (v0.6.4) Milestone D — AGX-001 launcher builder + AGX-005/AGX-010
// dangerous-flag denylist. Pure, node-safe; argv array is NEVER shell-joined
// and the prompt always travels as a single argv element.

/** Regex SOURCE strings — "same regex family" shared with promptLibrary. */
export const DANGEROUS_FLAG_DENYLIST: readonly string[] = [
  '--dangerously(-|-)[a-z-]*',
  '--yolo\\b',
  '--full-auto\\b',
  '(?<![\\w-])-{1,2}(y|yes)\\b',
] as const;

const DENYLIST_COMBINED = new RegExp(
  DANGEROUS_FLAG_DENYLIST.map((source) => `(?:${source})`).join('|'),
  'i',
);

/** True when text contains any denylisted flag pattern (case-insensitive). */
export function matchesDangerousFlag(text: string): boolean {
  return DENYLIST_COMBINED.test(text);
}

/** Default-deny sandbox allowlist (AGX-005/010); undefined → builder default. */
export const ALLOWED_SANDBOXES = ['read-only', 'workspace-write'] as const;

export type SandboxMode = (typeof ALLOWED_SANDBOXES)[number];

export interface CodexExecOpts {
  model?: string;
  sandbox?: SandboxMode;
  prompt: string;
}

/**
 * argv for the codex exec wrapper. Fixed shape:
 *   ["exec", ("-m", model)?, "--sandbox", sandbox??"workspace-write", "--json", prompt]
 * The prompt is ONE argv element — shell metachars inside it are expected and
 * safe because this array must never be joined into a shell command line.
 * SECURITY WIRING (AGX-010): the Wave-2 launcher MUST call validateCodexOpts
 * first; this builder is shape-only on purpose.
 */
export function buildCodexExecArgs(opts: CodexExecOpts): string[] {
  const args = ['exec'];
  if (opts.model !== undefined) args.push('-m', opts.model);
  args.push('--sandbox', opts.sandbox ?? 'workspace-write');
  args.push('--json', opts.prompt);
  return args;
}

/** Indonesian rejection reason, or null when opts are acceptable. */
export function validateCodexOpts(opts: CodexExecOpts): string | null {
  if (opts.sandbox !== undefined && !(ALLOWED_SANDBOXES as readonly string[]).includes(opts.sandbox)) {
    return 'Sandbox tidak diizinkan';
  }
  if (opts.model !== undefined) {
    if (/[;&|`$]/.test(opts.model)) {
      return 'Model mengandung karakter shell berbahaya';
    }
    if (matchesDangerousFlag(opts.model)) {
      return `Model memuat flag terlarang pada denylist: ${opts.model}`;
    }
  }
  return null;
}
