import { useEffect, useState } from 'preact/hooks';

interface TextEditorViewProps {
  rootId: string;
  filePath: string;
}

export function TextEditorView({ rootId, filePath }: TextEditorViewProps) {
  const [content, setContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const url = `/api/v1/fs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(filePath)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        setContent(text);
        setInitialContent(text);
        setIsLoading(false);
      })
      .catch((err) => {
        setError('Failed to open file: ' + err.message);
        setIsLoading(false);
      });
  }, [rootId, filePath]);

  const handleSave = () => {
    setIsSaving(true);
    setSaveMessage(null);
    setError(null);

    const url = `/api/v1/fs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(filePath)}`;

    fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: content,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setInitialContent(content);
        setSaveMessage('File saved successfully');
        setIsSaving(false);
        setTimeout(() => setSaveMessage(null), 3000);
      })
      .catch((err) => {
        setError('Failed to save file: ' + err.message);
        setIsSaving(false);
      });
  };

  const handleTextareaSelect = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    const textBefore = target.value.substring(0, target.selectionStart);
    const lines = textBefore.split('\n');
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    });
  };

  const isDirty = content !== initialContent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0f172a' }}>
      {/* Editor Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: '#1e293b',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <span>{filePath}</span>
          {isDirty && <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>* (unsaved)</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {saveMessage && <span style={{ color: '#10b981', fontSize: '0.8rem' }}>{saveMessage}</span>}
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            style={{
              padding: '4px 12px',
              background: isDirty ? '#6366f1' : '#475569',
              color: 'white',
              borderRadius: '4px',
              fontSize: '0.8rem',
              cursor: isDirty ? 'pointer' : 'default',
            }}
          >
            {isSaving ? 'Saving...' : '💾 Save'}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      {error && <div style={{ padding: '8px', color: '#ef4444' }}>{error}</div>}
      {isLoading ? (
        <div style={{ padding: '12px', color: '#94a3b8' }}>Loading file...</div>
      ) : (
        <textarea
          value={content}
          onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
          onClick={handleTextareaSelect}
          onKeyUp={handleTextareaSelect}
          style={{
            flex: 1,
            width: '100%',
            padding: '10px',
            background: '#0f172a',
            color: '#f8fafc',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: '14px',
            lineHeight: '1.5',
            border: 'none',
            outline: 'none',
            resize: 'none',
          }}
        />
      )}

      {/* Status Bar */}
      <div
        style={{
          height: '24px',
          background: '#020617',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 10px',
          fontSize: '0.75rem',
          color: '#94a3b8',
        }}
      >
        <span>
          Ln {cursorPos.line}, Col {cursorPos.col}
        </span>
      </div>
    </div>
  );
}
