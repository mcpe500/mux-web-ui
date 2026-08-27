// PY-005 (spec 014): pure traceback parsing + open-target mapping for RunPanel.
export interface TraceFrame {
  file: string;
  line: number;
}

export interface TraceTarget {
  rootId: string;
  path: string;
  line: number;
}

const FILE_LINE = /File "(.+)", line (\d+)/;

/** Parse python traceback lines. Innermost frame (LAST printed) comes first. */
export function parsePythonTraceback(lines: string[]): TraceFrame[] {
  const out: TraceFrame[] = [];
  for (const raw of lines) {
    const m = FILE_LINE.exec(raw);
    if (m) {
      out.push({ file: m[1].replace(/\\"/g, '"'), line: Number(m[2]) });
    }
  }
  // last occurrence wins ordering (innermost first)
  out.reverse();
  return out;
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i) : '/';
}

/**
 * Map parsed frames to an editor-open target only when the frame's file
 * resolves same-dir-or-named-as the active tab. Else null (never open
 * arbitrary absolute paths from output — trust boundary).
 */
export function mapTracebackToOpenTarget(
  tb: TraceFrame[],
  rootId: string,
  filePath: string
): TraceTarget | null {
  const activeDir = dirname(filePath);
  const activeName = basename(filePath);
  for (const f of tb) {
    if (f.file === filePath || basename(f.file) === activeName) {
      return { rootId, path: filePath, line: f.line };
    }
    if (dirname(f.file) === activeDir && f.file !== '/') {
      return { rootId, path: `${activeDir}/${basename(f.file)}`, line: f.line };
    }
  }
  return null;
}
