import { describe, expect, it } from 'vitest';
import { routeForFile, routedAppForFile } from './windowRouter';

describe('windowRouter routeForFile', () => {
  it('.ipynb (any case) → notebooks', () => {
    expect(routeForFile('analysis.ipynb')).toBe('notebooks');
    expect(routeForFile('NESTED/IPYNB/Test.IPYNB')).toBe('notebooks');
    expect(routeForFile('path/to/Report.IPYNB')).toBe('notebooks');
  });
  it('.pdf (any case) → pdf', () => {
    expect(routeForFile('paper.pdf')).toBe('pdf');
    expect(routeForFile('DOC.PDF')).toBe('pdf');
    expect(routeForFile('path/to/file.PdF')).toBe('pdf');
  });
  it('unknown ext → editor (fallback)', () => {
    expect(routeForFile('main.py')).toBe('editor');
    expect(routeForFile('README.md')).toBe('editor');
    expect(routeForFile('file')).toBe('editor');
    expect(routeForFile('archive.zip')).toBe('editor');
    expect(routeForFile('notebook.ipynb.bak')).toBe('editor');
  });
  it('routedAppForFile includes ext tuple', () => {
    expect(routedAppForFile('x.ipynb')).toEqual({ appId: 'notebooks', ext: '.ipynb' });
    expect(routedAppForFile('y.pdf')).toEqual({ appId: 'pdf', ext: '.pdf' });
    expect(routedAppForFile('y.PDF')).toEqual({ appId: 'pdf', ext: '.pdf' });
    expect(routedAppForFile('z.txt')).toEqual({ appId: 'editor', ext: null });
  });
});
