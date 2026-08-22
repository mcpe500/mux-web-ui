// V051-004 (spec 007 §6): prompt rendering without broken glyphs.
// Pure/node-safe config extracted from TerminalView for unit testing.
import { Unicode11Addon } from '@xterm/addon-unicode11';

/**
 * Nerd Font Mono first so PUA powerline/icon glyphs (starship/p10k/oh-my-zsh
 * prompts) resolve instead of rendering as tofu boxes; plain mono fallbacks
 * follow for everything the subset does not cover.
 */
export const TERMINAL_FONT_STACK =
  "'JetBrainsMono Nerd Font Mono', 'JetBrains Mono', 'Fira Code', monospace";

interface TerminalLike {
  loadAddon(addon: unknown): void;
  unicode: { activeVersion: string };
}

/**
 * Wide-char/combining correctness (emoji, CJK punctuation in prompts).
 * WAJIB: Terminal dibuat dengan `allowProposedApi: true` — accessor
 * `term.unicode` adalah proposed API di @xterm/xterm 5.x; tanpa itu
 * loadAddon melempar Error saat activate() mengakses term.unicode.
 */
export function applyTerminalAddons(term: TerminalLike): void {
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
}
