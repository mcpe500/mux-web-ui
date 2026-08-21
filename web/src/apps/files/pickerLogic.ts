// Pure helpers for the VS Code-like Open File / Open Folder modal (spec 006 §B.1).

export interface PickerEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
}

export interface Crumb {
  label: string;
  path: string;
}

// Depth-1 listing only — the picker never scans recursively (no-lag budget).
// In 'folder' mode files stay visible but are not selectable; in 'file' mode
// it is the reverse.
export function withSelectability<T extends PickerEntry>(
  entries: T[],
  mode: 'folder' | 'file',
): Array<T & { selectable: boolean }> {
  return entries.map((e) => ({
    ...e,
    selectable: mode === 'file' ? !e.is_dir : e.is_dir,
  }));
}

// '/work/app' → [ {label:'/',path:'/'}, {label:'work',path:'/work'}, {label:'app',path:'/work/app'} ]
export function breadcrumbSegments(path: string): Crumb[] {
  const norm = path.startsWith('/') ? path : `/${path}`;
  if (norm === '/') return [{ label: '/', path: '/' }];
  const crumbs: Crumb[] = [{ label: '/', path: '/' }];
  let acc = '';
  for (const seg of norm.split('/').filter(Boolean)) {
    acc += `/${seg}`;
    crumbs.push({ label: seg, path: acc });
  }
  return crumbs;
}
