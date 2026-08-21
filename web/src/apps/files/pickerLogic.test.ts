import { describe, it, expect } from 'vitest';
import { withSelectability, breadcrumbSegments } from './pickerLogic';

const entries = [
  { name: 'src', path: '/src', is_dir: true, is_symlink: false },
  { name: 'main.rs', path: '/main.rs', is_dir: false, is_symlink: false },
];

// EDT-006 folder mode: folders selectable, files visible-but-disabled.
describe('test_edt_006_picker_mode_folder', () => {
  it('marks only directories selectable', () => {
    const rows = withSelectability(entries, 'folder');
    expect(rows.find((r) => r.name === 'src')?.selectable).toBe(true);
    expect(rows.find((r) => r.name === 'main.rs')?.selectable).toBe(false);
  });
});

// EDT-006 file mode + breadcrumb navigation segments.
describe('test_edt_006_picker_mode_file_and_breadcrumb', () => {
  it('marks only files selectable', () => {
    const rows = withSelectability(entries, 'file');
    expect(rows.find((r) => r.name === 'main.rs')?.selectable).toBe(true);
    expect(rows.find((r) => r.name === 'src')?.selectable).toBe(false);
  });

  it('builds clickable breadcrumb chain (depth-1 lazy nav)', () => {
    expect(breadcrumbSegments('/work/app')).toEqual([
      { label: '/', path: '/' },
      { label: 'work', path: '/work' },
      { label: 'app', path: '/work/app' },
    ]);
    expect(breadcrumbSegments('/')).toEqual([{ label: '/', path: '/' }]);
  });
});
