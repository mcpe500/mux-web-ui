import { describe, expect, it } from 'vitest';
import { mapTracebackToOpenTarget, parsePythonTraceback } from './runPanelLogic';

describe('parsePythonTraceback', () => {
  it('extracts one file/line pair', () => {
    const lines = [
      'Traceback (most recent call last):',
      '  File "/sdcard/proj/main.py", line 4, in <module>',
      'ZeroDivisionError: division by zero',
    ];
    expect(parsePythonTraceback(lines)).toEqual([
      { file: '/sdcard/proj/main.py', line: 4 },
    ]);
  });

  it('multi-file chain orders LAST occurrence first', () => {
    const lines = [
      'Traceback (most recent call last):',
      '  File "app/main.py", line 10, in <module>',
      '  File "app/lib/util.py", line 33, in helper',
      '  File "app/lib/deep.py", line 7, in inner',
      'ValueError: bad',
    ];
    expect(parsePythonTraceback(lines)).toEqual([
      { file: 'app/lib/deep.py', line: 7 },
      { file: 'app/lib/util.py', line: 33 },
      { file: 'app/main.py', line: 10 },
    ]);
  });

  it('ignores plain output without File(...)', () => {
    expect(parsePythonTraceback(['hello world', '  indented but not python'])).toEqual([]);
    expect(parsePythonTraceback([])).toEqual([]);
  });

  it('keeps filenames containing nested escaped quotes', () => {
    const lines = ['  File "dir/we\\"ird name.py", line 2, in <module>'];
    expect(parsePythonTraceback(lines)).toEqual([{ file: 'dir/we"ird name.py', line: 2 }]);
  });

  it('multiple tracebacks in one stream: later one wins ordering', () => {
    const lines = [
      'File "old/a.py", line 1',
      '---- rerun ----',
      'File "new/b.py", line 9',
      'File "new/c.py", line 5',
    ];
    const got = parsePythonTraceback(lines);
    expect(got[0]).toEqual({ file: 'new/c.py', line: 5 });
    expect(got).toContainEqual({ file: 'old/a.py', line: 1 });
  });
});

describe('mapTracebackToOpenTarget', () => {
  const active = { rootId: 'home', filePath: '/proj/main.py' };

  it('same basename anywhere resolves to the ACTIVE tab path', () => {
    const tb = [{ file: 'elsewhere/main.py', line: 42 }];
    expect(mapTracebackToOpenTarget(tb, active.rootId, active.filePath)).toEqual({
      rootId: 'home',
      path: '/proj/main.py',
      line: 42,
    });
  });

  it('sibling in same directory joins to the active dir', () => {
    const tb = [
      { file: '/proj/lib/deep.py', line: 7 },
      { file: '/proj/util.py', line: 33 },
    ];
    // innermost first; util.py is same-dir sibling → first resolvable target
    expect(mapTracebackToOpenTarget(tb, active.rootId, active.filePath)).toEqual({
      rootId: 'home',
      path: '/proj/util.py',
      line: 33,
    });
  });

  it('unrelated directory returns null', () => {
    const tb = [{ file: '/opt/stuff/x.py', line: 1 }];
    expect(mapTracebackToOpenTarget(tb, active.rootId, active.filePath)).toBeNull();
  });

  it('empty traceback returns null', () => {
    expect(mapTracebackToOpenTarget([], active.rootId, active.filePath)).toBeNull();
  });
});
