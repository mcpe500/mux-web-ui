// Spec 016 (v0.6.7) CDX-005 tests — resume builder, thread-id guard, --search.
import { describe, it, expect } from 'vitest';
import {
  buildCodexExecArgs,
  buildCodexResumeArgs,
  isValidThreadId,
  RESUME_THREAD_ID_INVALID,
  validateResumeOpts,
} from './codexArgs';

describe('CDX-015 --search flag', () => {
  it('omits --search by default (backward compatible)', () => {
    expect(buildCodexExecArgs({ prompt: 'p' })).not.toContain('--search');
  });

  it('adds --search when requested', () => {
    const args = buildCodexExecArgs({ prompt: 'p', search: true });
    expect(args).toEqual(['exec', '--search', '--sandbox', 'workspace-write', '--json', 'p']);
  });
});

describe('CDX-005 thread-id allowlist', () => {
  it('accepts word chars, hyphen, underscore up to 64', () => {
    expect(isValidThreadId('0af9e3a2-1b4c-4e7d')).toBe(true);
    expect(isValidThreadId('A9_z')).toBe(true);
    expect(isValidThreadId('a'.repeat(64))).toBe(true);
  });

  it('rejects metachars, whitespace, empty, >64', () => {
    expect(isValidThreadId('')).toBe(false);
    expect(isValidThreadId('abc;rm -rf')).toBe(false);
    expect(isValidThreadId('$(evil)')).toBe(false);
    expect(isValidThreadId('a b')).toBe(false);
    expect(isValidThreadId('a`b')).toBe(false);
    expect(isValidThreadId('a'.repeat(65))).toBe(false);
    expect(isValidThreadId('id\nnext')).toBe(false);
  });
});

describe('CDX-005 buildCodexResumeArgs', () => {
  it('emits exec resume <id> with default sandbox', () => {
    expect(buildCodexResumeArgs({ threadId: 'thr-1', prompt: 'lanjutkan' })).toEqual([
      'exec',
      'resume',
      'thr-1',
      '--sandbox',
      'workspace-write',
      '--json',
      'lanjutkan',
    ]);
  });

  it('supports model + search + sandbox override', () => {
    expect(
      buildCodexResumeArgs({
        threadId: 'thr_2',
        prompt: 'p',
        model: 'gpt-5-codex',
        sandbox: 'read-only',
        search: true,
      }),
    ).toEqual([
      'exec',
      'resume',
      'thr_2',
      '-m',
      'gpt-5-codex',
      '--search',
      '--sandbox',
      'read-only',
      '--json',
      'p',
    ]);
  });

  it('throws on unsafe thread ids (T1)', () => {
    expect(() => buildCodexResumeArgs({ threadId: 'a;rm', prompt: 'p' })).toThrow(
      RESUME_THREAD_ID_INVALID,
    );
    expect(() => buildCodexResumeArgs({ threadId: '', prompt: 'p' })).toThrow(
      RESUME_THREAD_ID_INVALID,
    );
    expect(() => buildCodexResumeArgs({ threadId: 'x'.repeat(65), prompt: 'p' })).toThrow(
      RESUME_THREAD_ID_INVALID,
    );
  });
});

describe('CDX-005 validateResumeOpts', () => {
  it('rejects invalid thread id with Indonesian message', () => {
    expect(validateResumeOpts({ threadId: 'a b', prompt: 'p' })).toBe('Thread ID tidak valid');
  });

  it('delegates model/sandbox checks to validateCodexOpts', () => {
    expect(validateResumeOpts({ threadId: 'ok', prompt: 'p', sandbox: 'danger-full-access' as never })).toBe(
      'Sandbox tidak diizinkan',
    );
    expect(validateResumeOpts({ threadId: 'ok', prompt: 'p', model: 'a;b' })).toBe(
      'Model mengandung karakter shell berbahaya',
    );
    expect(validateResumeOpts({ threadId: 'ok', prompt: 'p' })).toBeNull();
  });
});
