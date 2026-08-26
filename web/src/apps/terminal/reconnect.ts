// Spec 012 (v0.6.2) — AFK resiliensi: pure, node-safe reconnect logic.
// Kept framework-free and DOM-free so the same module is unit-testable with
// vitest (node environment) and usable from TerminalView.

/** Base delay for the first reconnect attempt (milliseconds). */
export const BACKOFF_BASE_MS = 500;
/** Hard cap for a single reconnect delay (milliseconds). */
export const BACKOFF_MAX_MS = 10_000;

/**
 * Frame opcodes — MUST mirror src/protocol.rs.
 */
export enum FrameOpcode {
  OUTPUT = 0x00,
  INPUT = 0x01,
  RESIZE = 0x02,
  EXIT = 0x03,
  ERROR = 0x04,
  PING = 0x05,
  PONG = 0x06,
}

/**
 * Exponential backoff for reconnect attempt `attempt` (0-based), capped at
 * BACKOFF_MAX_MS: 500, 1000, 2000, 4000, 8000, 10000, 10000, …
 */
export function nextReconnectDelay(attempt: number): number {
  const clamped = Math.max(0, Math.floor(attempt));
  const delay = BACKOFF_BASE_MS * 2 ** clamped;
  return Math.min(delay, BACKOFF_MAX_MS);
}

/**
 * AFK-004: a server frame that must permanently stop the reconnect loop —
 * the session exited (EXIT) or was taken over elsewhere (ERROR), so retrying
 * would be pointless (and would kick another client).
 */
export function shouldStopOnFrame(opcode: number): boolean {
  return opcode === FrameOpcode.EXIT || opcode === FrameOpcode.ERROR;
}

/**
 * AFK-004: an attach HTTP status that must permanently stop the reconnect
 * loop. 404 = SESSION_NOT_FOUND — the session is gone, retrying is futile.
 */
export function shouldStopOnAttachStatus(status: number): boolean {
  return status === 404;
}

/** Minimal view of a WebSocket needed by the single-socket guard (AFK-003). */
export interface SocketLike {
  readyState: number;
}

const WS_CONNECTING = 0;
const WS_OPEN = 1;

/**
 * AFK-003: only ever allow one live socket. Returns false while the current
 * socket is CONNECTING (0) or OPEN (1), so reconnect never stacks a second
 * WebSocket on top of a healthy one.
 */
export function canOpenSocket(socket: SocketLike | null | undefined): boolean {
  if (!socket) return true;
  return socket.readyState !== WS_OPEN && socket.readyState !== WS_CONNECTING;
}