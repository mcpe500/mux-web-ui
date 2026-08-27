// PDF-001: lazy singleton loader for pdfjs-dist. ONLY module in the app that
// imports 'pdfjs-dist' — keeps it out of the main bundle via dynamic import.
// Worker asset resolved locally (offline LAN, no CDN) through Vite asset URL.

export type PdfjsModule = typeof import('pdfjs-dist');

const WORKER_URL = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url);

let memo: Promise<unknown> | null = null;

const defaultImport = (): Promise<PdfjsModule> => import('pdfjs-dist');

export function loadPdfjs<T extends object = PdfjsModule>(
  importer: () => Promise<T> = defaultImport as () => Promise<T>
): Promise<T> {
  if (!memo) {
    memo = importer().then((m) => {
      const opts = m as { GlobalWorkerOptions?: { workerSrc?: string } };
      if (opts.GlobalWorkerOptions) opts.GlobalWorkerOptions.workerSrc = WORKER_URL.href;
      return m;
    });
  }
  return memo as Promise<T>;
}

export function resetPdfjsLoaderForTest(): void {
  memo = null;
}
