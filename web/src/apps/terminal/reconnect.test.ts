// Spec 012 (v0.6.2) — AFK resiliensi: pure/node-safe reconnect logic tests.
import { describe, it, expect } from 'vitest';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  FrameOpcode,
  canOpenSocket,
  nextReconnectDelay,
  shouldStopOnAttachStatus,
  shouldStopOnFrame,
} from './reconnect';

describe('spec 012 nextReconnectDelay (AFK-001)', () => {
  it('doubles from 500ms up to the 10s cap', () => {
    expect(nextReconnectDelay(0)).toBe(500);
    expect(nextReconnectDelay(1)).toBe(1000);
    expect(nextReconnectDelay(2)).toBe(2000);
    expect(nextReconnectDelay(3)).toBe(4000);
    expect(nextReconnectDelay(4)).toBe(8000);
    expect(nextReconnectDelay(5)).toBe(BACKOFF_MAX_MS);
    expect(nextReconnectDelay(99)).toBe(BACKOFF_MAX_MS);
  });

  it('never exceeds the cap', () => {
    for (let i = 0; i < 20; i++) {
      expect(nextReconnectDelay(i)).toBeLessThanOrEqual(BACKOFF_MAX_MS);
    }
  });

  it('clamps negative / non-integer attempts', () => {
    expect(nextReconnectDelay(-1)).toBe(BACKOFF_BASE_MS);
    expect(nextReconnectDelay(0.5)).toBe(BACKOFF_BASE_MS);
  });
});

describe('spec 012 shouldStopOnFrame (AFK-004)', () => {
  it('stops the reconnect loop on EXIT and ERROR frames', () => {
    expect(shouldStopOnFrame(FrameOpcode.EXIT)).toBe(true);
    expect(shouldStopOnFrame(FrameOpcode.ERROR)).toBe(true);
  });

  it('does not stop on OUTPUT / PING / PONG', () => {
    expect(shouldStopOnFrame(FrameOpcode.OUTPUT)).toBe(false);
    expect(shouldStopOnFrame(FrameOpcode.PING)).toBe(false);
    expect(shouldStopOnFrame(FrameOpcode.PONG)).toBe(false);
  });
});

describe('spec 012 shouldStopOnAttachStatus (AFK-004)', () => {
  it('stops on 404 (SESSION_NOT_FOUND)', () => {
    expect(shouldStopOnAttachStatus(404)).toBe(true);
  });

  it('keeps retrying on other errors', () => {
    expect(shouldStopOnAttachStatus(500)).toBe(false);
    expect(shouldStopOnAttachStatus(0)).toBe(false);
  });
});

describe('spec 012 canOpenSocket (AFK-003)', () => {
  it('allows opening when there is no socket yet', () => {
    expect(canOpenSocket(null)).toBe(true);
    expect(canOpenSocket(undefined)).toBe(true);
  });

  it('blocks a second socket while one is OPEN (1) or CONNECTING (0)', () => {
    expect(canOpenSocket({ readyState: 1 })).toBe(false); // OPEN
    expect(canOpenSocket({ readyState: 0 })).toBe(false); // CONNECTING
  });

  it('allows opening after the previous socket is CLOSING/CLOSED', () => {
    expect(canOpenSocket({ readyState: 2 })).toBe(true); // CLOSING
    expect(canOpenSocket({ readyState: 3 })).toBe(true); // CLOSED
  });
});