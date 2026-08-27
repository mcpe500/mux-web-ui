// D11 (spec 014): pure routing table: file ext → appId + payload.
// Framework-free for vitest table-driven tests.

export type RoutedAppId = 'notebooks' | 'pdf' | 'editor';

interface RouteEntry {
  ext: string;
  appId: RoutedAppId;
}

const TABLE: RouteEntry[] = [
  { ext: '.ipynb', appId: 'notebooks' },
  { ext: '.pdf', appId: 'pdf' },
];

export function routeForFile(fileName: string): RoutedAppId {
  const lower = fileName.toLowerCase();
  for (const { ext, appId } of TABLE) {
    if (lower.endsWith(ext)) return appId;
  }
  return 'editor';
}

export function routedAppForFile(fileName: string): { appId: RoutedAppId; ext: string | null } {
  const lower = fileName.toLowerCase();
  for (const { ext, appId } of TABLE) {
    if (lower.endsWith(ext)) return { appId, ext };
  }
  return { appId: 'editor', ext: null };
}
