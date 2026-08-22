// V051-004: prompt rendering without broken glyphs (spec 007 §6).
// Pure/node-safe checks for the xterm font stack and unicode addon wiring.

import { describe, it, expect } from 'vitest';
import { TERMINAL_FONT_STACK, applyTerminalAddons } from './terminalConfig';

describe('V051-004 TERMINAL_FONT_STACK', () => {
  it('leads with a Nerd Font so powerline PUA glyphs resolve', () => {
    expect(TERMINAL_FONT_STACK.startsWith("'JetBrainsMono Nerd Font Mono'")).toBe(true);
  });

  it('keeps monospace fallbacks after the Nerd Font', () => {
    const tail = TERMINAL_FONT_STACK.split(',').map(s => s.trim().replace(/['"]/g, ''));
    expect(tail).toContain('JetBrains Mono');
    expect(tail[tail.length - 1]).toBe('monospace');
  });
});

describe('V051-004 applyTerminalAddons', () => {
  interface Provider {
    version: string;
  }

  /** Mimic xterm.js semantics: loadAddon activates immediately; unicode.register
   *  only records the provider — activation to '11' must be done explicitly. */
  function makeStubTerm() {
    const registered: Provider[] = [];
    const term = {
      loadAddon(addon: { activate?: (t: unknown) => void }) {
        addon.activate?.(term);
      },
      unicode: {
        activeVersion: '6',
        register(p: Provider) {
          registered.push(p);
        },
      },
    };
    return { term, registered };
  }

  it('registers the unicode 11 provider via the addon and activates it', () => {
    const { term, registered } = makeStubTerm();
    applyTerminalAddons(term as never);
    expect(registered.map(p => p.version)).toContain('11');
    expect(term.unicode.activeVersion).toBe('11');
  });
});
