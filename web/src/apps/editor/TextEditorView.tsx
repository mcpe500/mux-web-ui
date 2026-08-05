
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';

interface TextEditorViewProps {
  rootId?: string;
  filePath?: string;
  initialRoot?: string;
}

interface FsRoot {
  id: string;
  path: string;
}

interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  modified_ms: number;
}

interface TabData {
  id: string;
  rootId: string;
  filePath: string;
  fileName: string;
  content: string;
  initialContent: string;
  isLoading: boolean;
  error?: string;
  cursorLine: number;
  cursorCol: number;
}

export function TextEditorView({ rootId: propRootId, filePath: propFilePath, initialRoot }: TextEditorViewProps) {
  // Tree State
  const [roots, setRoots] = useState<FsRoot[]>([]);
  const [selectedRootId, setSelectedRootId] = useState<string | undefined>(initialRoot || propRootId);
  
  // path -> entries
  const [dirEntries, setDirEntries] = useState<Record<string, FsEntry[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']));
  
  // Tabs State
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Load roots
  useEffect(() => {
    fetch('/api/v1/fs/roots')
      .then(res => res.json())
      .then((data: [string, string][]) => {
        const r = data.map(([id, path]) => ({ id, path }));
        setRoots(r);
        if (!selectedRootId && r.length > 0) {
          setSelectedRootId(r[0].id);
        }
      })
      .catch(err => console.error("Failed to load roots", err));
  }, []);

  // Load initial file if provided
  useEffect(() => {
    if (propRootId && propFilePath) {
      openFile(propRootId, propFilePath);
    }
  }, [propRootId, propFilePath]);

  const loadDir = useCallback((rootId: string, dirPath: string) => {
    fetch(`/api/v1/fs/entries?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(dirPath)}`)
      .then(res => res.json())
      .then(data => {
        setDirEntries(prev => ({ ...prev, [dirPath]: data.entries || [] }));
      })
      .catch(err => console.error("Failed to load dir", dirPath, err));
  }, []);

  // Load root dir when selectedRootId changes
  useEffect(() => {
    if (selectedRootId) {
      setExpandedDirs(new Set(['/']));
      loadDir(selectedRootId, '/');
    }
  }, [selectedRootId, loadDir]);

  const toggleDir = (dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
        if (selectedRootId && !dirEntries[dirPath]) {
          loadDir(selectedRootId, dirPath);
        }
      }
      return next;
    });
  };

  const openFile = (rootId: string, filePath: string) => {
    const tabId = `${rootId}:${filePath}`;
    const fileName = filePath.split('/').pop() || filePath;
    
    // Check if already open
    if (tabs.some(t => t.id === tabId)) {
      setActiveTabId(tabId);
      return;
    }

    const newTab: TabData = {
      id: tabId,
      rootId,
      filePath,
      fileName,
      content: '',
      initialContent: '',
      isLoading: true,
      cursorLine: 1,
      cursorCol: 1,
    };
    
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);

    fetch(`/api/v1/fs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(filePath)}`)
      .then(res => res.text())
      .then(text => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, content: text, initialContent: text, isLoading: false } : t));
      })
      .catch(err => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, error: String(err), isLoading: false } : t));
      });
  };

  const closeTab = (e: Event, tabId: string) => {
    e.stopPropagation();
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        if (next.length > 0) {
          setActiveTabId(next[next.length - 1].id);
        } else {
          setActiveTabId(null);
        }
      }
      return next;
    });
  };

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId]);

  const updateActiveTab = (updates: Partial<TabData>) => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };

  const handleSave = async () => {
    if (!activeTab) return;
    try {
      updateActiveTab({ isLoading: true });
      const res = await fetch(`/api/v1/fs/file?root=${encodeURIComponent(activeTab.rootId)}&path=${encodeURIComponent(activeTab.filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: activeTab.content
      });
      if (res.ok) {
        updateActiveTab({ initialContent: activeTab.content, isLoading: false });
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      updateActiveTab({ error: String(e), isLoading: false });
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      const newContent = val.substring(0, start) + '  ' + val.substring(end);
      
      updateActiveTab({ content: newContent });
      
      setTimeout(() => {
        if (target) {
          target.selectionStart = target.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const handleEditorChange = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    updateActiveTab({ content: target.value });
  };

  const handleEditorSelect = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    const textBeforeCursor = target.value.substring(0, target.selectionStart);
    const lines = textBeforeCursor.split('\n');
    updateActiveTab({
      cursorLine: lines.length,
      cursorCol: lines[lines.length - 1].length + 1
    });
  };

  // Render tree recursively
  const renderTree = (dirPath: string, depth: number) => {
    const entries = dirEntries[dirPath] || [];
    // Sort dirs first, then files
    const sorted = [...entries].sort((a, b) => {
      if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
      return a.is_dir ? -1 : 1;
    });

    return sorted.map(entry => {
      const isExpanded = expandedDirs.has(entry.path);
      const paddingLeft = depth * 12 + 8;
      
      return (
        <div key={entry.path}>
          <div 
            style={{
              padding: `4px 8px 4px ${paddingLeft}px`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: '#f8fafc',
              fontSize: '13px',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.06)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
            onClick={() => {
              if (entry.is_dir) {
                toggleDir(entry.path);
              } else if (selectedRootId) {
                openFile(selectedRootId, entry.path);
              }
            }}
          >
            <span style={{ marginRight: '6px', fontSize: '14px' }}>
              {entry.is_dir ? (isExpanded ? '📂' : '📁') : '📄'}
            </span>
            {entry.name}
          </div>
          {entry.is_dir && isExpanded && (
            <div>{renderTree(entry.path, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const renderLineNumbers = () => {
    if (!activeTab) return null;
    const linesCount = activeTab.content.split('\n').length;
    const lines = Array.from({ length: Math.max(1, linesCount) }, (_, i) => i + 1);
    
    return (
      <div style={{
        padding: '16px 8px',
        textAlign: 'right',
        color: '#64748b',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '14px',
        lineHeight: '1.5',
        userSelect: 'none',
        backgroundColor: '#0f172a',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        minWidth: '40px',
      }}>
        {lines.map(l => <div key={l}>{l}</div>)}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif' }}>
      {/* Sidebar */}
      <div style={{ width: '220px', backgroundColor: '#0c1222', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <select 
            value={selectedRootId || ''} 
            onChange={e => setSelectedRootId((e.target as HTMLSelectElement).value)}
            style={{ width: '100%', padding: '4px', backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}
          >
            {roots.map(r => (
              <option key={r.id} value={r.id}>{r.id}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {selectedRootId && renderTree('/', 1)}
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Tab Bar */}
        <div style={{ display: 'flex', backgroundColor: '#1e293b', overflowX: 'auto', flexShrink: 0, height: '36px' }}>
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId;
            const isDirty = tab.content !== tab.initialContent;
            return (
              <div 
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  backgroundColor: isActive ? '#0f172a' : 'transparent',
                  borderTop: isActive ? '2px solid #6366f1' : '2px solid transparent',
                  borderRight: '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: isActive ? '#f8fafc' : '#94a3b8',
                  minWidth: '100px',
                  maxWidth: '200px'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {tab.fileName}
                </span>
                {isDirty && <span style={{ color: '#f59e0b', margin: '0 6px', fontSize: '10px' }}>●</span>}
                <span 
                  onClick={(e) => closeTab(e, tab.id)}
                  style={{ marginLeft: '6px', fontSize: '16px', opacity: 0.6, cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.opacity = '1'}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.opacity = '0.6'}
                >
                  ×
                </span>
              </div>
            );
          })}
        </div>

        {/* Editor Area */}
        {activeTab ? (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {renderLineNumbers()}
            <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
              {activeTab.isLoading ? (
                <div style={{ position: 'absolute', top: 16, left: 16, color: '#94a3b8' }}>Loading...</div>
              ) : activeTab.error ? (
                <div style={{ position: 'absolute', top: 16, left: 16, color: '#ef4444' }}>Error: {activeTab.error}</div>
              ) : (
                <textarea
                  value={activeTab.content}
                  onInput={handleEditorChange}
                  onKeyDown={handleKeyDown}
                  onSelect={handleEditorSelect}
                  onMouseUp={handleEditorSelect}
                  onKeyUp={handleEditorSelect}
                  spellcheck={false}
                  style={{
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'transparent',
                    color: '#f8fafc',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '14px',
                    lineHeight: '1.5',
                    padding: '16px',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    whiteSpace: 'pre',
                    overflow: 'auto',
                    boxSizing: 'border-box'
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            Select a file to open
          </div>
        )}

        {/* Status Bar */}
        <div style={{ 
          height: '24px', 
          backgroundColor: '#0c1222', 
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', 
          alignItems: 'center', 
          padding: '0 12px',
          fontSize: '12px',
          color: '#94a3b8',
          flexShrink: 0,
          justifyContent: 'space-between'
        }}>
          <div>
            {activeTab ? `${activeTab.rootId} : ${activeTab.filePath}` : 'Ready'}
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            {activeTab && (
              <span>
                Ln {activeTab.cursorLine}, Col {activeTab.cursorCol}
              </span>
            )}
            {activeTab && (
              <span>
                {activeTab.content !== activeTab.initialContent ? 'Unsaved' : 'Saved'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
