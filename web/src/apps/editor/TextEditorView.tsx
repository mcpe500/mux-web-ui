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
  const [customPathInput, setCustomPathInput] = useState<string>('');
  
  // path -> entries
  const [dirEntries, setDirEntries] = useState<Record<string, FsEntry[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']));
  
  // Tabs State
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // VS Code-like extras
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showTerminal, setShowTerminal] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string|null>(null);

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
      .then(async res => {
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        return res.json();
      })
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
    // Normalize path leading slash
    const normPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const tabId = `${rootId}:${normPath}`;
    const fileName = normPath.split('/').pop() || normPath;
    
    // Check if already open
    if (tabs.some(t => t.id === tabId)) {
      setActiveTabId(tabId);
      return;
    }

    const newTab: TabData = {
      id: tabId,
      rootId,
      filePath: normPath,
      fileName,
      content: '',
      initialContent: '',
      isLoading: true,
      cursorLine: 1,
      cursorCol: 1,
    };
    
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);

    fetch(`/api/v1/fs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(normPath)}`)
      .then(async res => {
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        return res.text();
      })
      .then(text => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, content: text, initialContent: text, isLoading: false } : t));
      })
      .catch(err => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, error: String(err.message || err), isLoading: false } : t));
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
      updateActiveTab({ isLoading: true, error: undefined });
      const res = await fetch(`/api/v1/fs/file?root=${encodeURIComponent(activeTab.rootId)}&path=${encodeURIComponent(activeTab.filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: activeTab.content
      });
      if (res.ok) {
        updateActiveTab({ initialContent: activeTab.content, isLoading: false });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e: any) {
      updateActiveTab({ error: `Save failed: ${e.message || e}`, isLoading: false });
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setShowFind(true);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
      e.preventDefault();
      setShowFind(true);
    } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      setShowTerminal(!showTerminal);
    } else if (e.key === 'Escape' && showFind) {
      setShowFind(false);
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

  const doFind = (_next: boolean) => {
    if (!activeTab || !findQuery) return;
    // Simple: just alert count
    const count = (activeTab.content.match(new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    alert(`Found ${count} matches for "${findQuery}"`);
  };
  const doReplace = () => {
    if (!activeTab || !findQuery) return;
    const newContent = activeTab.content.split(findQuery).join(replaceQuery);
    updateActiveTab({ content: newContent });
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

  const handleOpenCustomPath = () => {
    if (!customPathInput.trim() || !selectedRootId) return;
    openFile(selectedRootId, customPathInput.trim());
  };

  const selectedRootObj = roots.find(r => r.id === selectedRootId);

  // Render tree recursively
  const renderTree = (dirPath: string, depth: number) => {
    const entries = dirEntries[dirPath] || [];
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
      <div style={{ width: '250px', backgroundColor: '#0c1222', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Root Selector & Full Path Display */}
        <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
            Root Directory:
          </label>
          <select 
            value={selectedRootId || ''} 
            onChange={e => setSelectedRootId((e.target as HTMLSelectElement).value)}
            style={{ width: '100%', padding: '6px', backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', fontSize: '12px' }}
          >
            {roots.map(r => (
              <option key={r.id} value={r.id}>
                {r.id.toUpperCase()}: {r.path}
              </option>
            ))}
          </select>
          {selectedRootObj && (
            <div style={{ fontSize: '11px', color: '#6366f1', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📍 {selectedRootObj.path}
            </div>
          )}
        </div>

        {/* Quick Open File Path Input */}
        <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
            Open File by Path:
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type="text"
              placeholder="e.g. src/main.rs or Makefile"
              value={customPathInput}
              onInput={e => setCustomPathInput((e.target as HTMLInputElement).value)}
              onKeyDown={e => e.key === 'Enter' && handleOpenCustomPath()}
              style={{ flex: 1, padding: '4px 6px', backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', fontSize: '12px' }}
            />
            <button
              onClick={handleOpenCustomPath}
              style={{ padding: '4px 8px', backgroundColor: '#6366f1', color: 'white', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
            >
              Open
            </button>
          </div>
        </div>

        {/* File Tree Explorer */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ padding: '6px 8px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            Files & Folders:
          </div>
          {selectedRootId && renderTree('/', 1)}
        </div>
      </div>

      {/* Main Editor Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Notepad Menu Bar - Windows 11 */}
        <div style={{ display: 'flex', gap: '2px', padding: '4px 8px', background: '#0c1222', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px', alignItems: 'center' }}>
          {['File','Edit','View'].map((m)=> (
            <div key={m} onClick={()=> setMenuOpen(menuOpen===m?null:m)} style={{ padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', background: menuOpen===m?'#1e293b':'transparent', color: '#e2e8f0' }}>{m}</div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '11px' }}>Notepad</span>
            <span style={{ width: '8px', height: '8px', borderRadius: '4px', background: highlight?'#10b981':'#64748b' }} title="Highlight"></span>
          </div>
        </div>
        {menuOpen && (
          <div style={{ position: 'absolute', top: '72px', left: menuOpen==='File'? '260px' : menuOpen==='Edit'? '300px' : '340px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 10, minWidth: '180px', padding: '4px 0', fontSize: '13px' }} onMouseLeave={()=> setMenuOpen(null)}>
            {menuOpen==='File' && (<>
              <div style={{ padding: '6px 12px', hover: 'background: #334155', cursor: 'pointer' }} onClick={()=>{ setMenuOpen(null); if(activeTab) handleSave(); }}>💾 Save Ctrl+S</div>
              <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=> setMenuOpen(null)}>📄 New Tab Ctrl+N</div>
              <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=> setMenuOpen(null)}>📂 Open Ctrl+O</div>
            </>)}
            {menuOpen==='Edit' && (<>
              <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ setMenuOpen(null); setShowFind(true); }}>🔍 Find Ctrl+F</div>
              <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=>{ setMenuOpen(null); setShowFind(true); }}>🔄 Replace Ctrl+H</div>
              <div style={{ height: '1px', background: '#334155', margin: '4px 0' }} />
              <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=> document.execCommand('undo')}>↩️ Undo</div>
            </>)}
            {menuOpen==='View' && (<>
              <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=> setHighlight(!highlight)}>✨ Syntax Highlight {highlight?'ON':'OFF'}</div>
              <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={()=> setShowTerminal(!showTerminal)}>💻 Terminal {showTerminal?'ON':'OFF'}</div>
              <div style={{ padding: '6px 12px', cursor: 'pointer' }}>🔍 Zoom In Ctrl++</div>
            </>)}
          </div>
        )}
        {/* Tab Bar */}
        <div style={{ display: 'flex', backgroundColor: '#1e293b', overflowX: 'auto', flexShrink: 0, height: '36px' }}>
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId;
            const isDirty = tab.content !== tab.initialContent;
            return (
              <div 
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                title={`${tab.rootId}:${tab.filePath}`}
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
                  minWidth: '110px',
                  maxWidth: '220px'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {tab.fileName}
                </span>
                {isDirty && <span style={{ color: '#f59e0b', margin: '0 6px', fontSize: '10px' }}>●</span>}
                <span 
                  onClick={(e) => closeTab(e, tab.id)}
                  style={{ marginLeft: '6px', color: '#94a3b8', padding: '2px 4px', borderRadius: '3px' }}
                >
                  ✕
                </span>
              </div>
            );
          })}
        </div>

        {/* Editor Toolbar - VS Code */}
        <div style={{ display: 'flex', gap: '6px', padding: '4px 8px', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center', fontSize: '11px' }}>
          <button onClick={()=> setShowFind(!showFind)} style={{ padding: '4px 8px', background: showFind?'#3b82f6':'#334155', color: 'white', borderRadius: '3px' }}>🔍 Find (Ctrl+F)</button>
          <button onClick={()=> setShowTerminal(!showTerminal)} style={{ padding: '4px 8px', background: showTerminal?'#10b981':'#334155', color: 'white', borderRadius: '3px' }}>💻 Terminal (Ctrl+`)</button>
          <button onClick={()=> setHighlight(!highlight)} style={{ padding: '4px 8px', background: highlight?'#f59e0b':'#334155', color: 'white', borderRadius: '3px' }}>{highlight?'✨ Highlight ON':'✨ Highlight OFF'}</button>
          <span style={{ marginLeft: 'auto', color: '#64748b' }}>{activeTab ? `${activeTab.content.split('\n').length} lines` : ''}</span>
        </div>

        {/* VS Code Find/Replace Bar */}
        {showFind && activeTab && (
          <div style={{ display: 'flex', gap: '6px', padding: '6px 8px', background: '#1e293b', borderBottom: '1px solid #334155', alignItems: 'center' }}>
            <input value={findQuery} onInput={(e)=> setFindQuery((e.target as HTMLInputElement).value)} placeholder="Find (Ctrl+F)" style={{ padding: '4px 6px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '3px', fontSize: '12px', width: '180px' }} />
            <input value={replaceQuery} onInput={(e)=> setReplaceQuery((e.target as HTMLInputElement).value)} placeholder="Replace (Ctrl+H)" style={{ padding: '4px 6px', background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '3px', fontSize: '12px', width: '140px' }} />
            <button onClick={()=> doFind(true)} style={{ padding: '4px 8px', background: '#3b82f6', color: 'white', borderRadius: '3px', fontSize: '11px' }}>Find</button>
            <button onClick={doReplace} style={{ padding: '4px 8px', background: '#10b981', color: 'white', borderRadius: '3px', fontSize: '11px' }}>Replace All</button>
            <button onClick={()=> setShowFind(false)} style={{ marginLeft: 'auto', padding: '4px 6px', background: '#334155', color: 'white', borderRadius: '3px' }}>✕</button>
          </div>
        )}

        {/* Content Area */}
        {activeTab ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Save Error / Loading banner */}
            {activeTab.error && (
              <div style={{ padding: '6px 12px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', borderBottom: '1px solid #ef4444', fontSize: '12px' }}>
                ⚠️ {activeTab.error}
              </div>
            )}
            {activeTab.isLoading ? (
              <div style={{ padding: '20px', color: '#94a3b8' }}>Loading file content...</div>
            ) : (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {renderLineNumbers()}
                <textarea
                  value={activeTab.content}
                  onInput={e => updateActiveTab({ content: (e.target as HTMLTextAreaElement).value })}
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
                {/* Minimap - VS Code */}
                <div style={{ width: '64px', background: '#0f172a', borderLeft: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', padding: '4px 2px', fontSize: '2px', lineHeight: '3px', color: '#475569', fontFamily: 'monospace', opacity: 0.6 }}>
                  {activeTab.content.slice(0, 3000).split('\n').slice(0, 100).map((line, i)=> (
                    <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip' }}>{line.slice(0, 40) || ' '}</div>
                  ))}
                </div>
              </div>
            )}
            {/* Integrated Terminal - VS Code (placeholder, full PTY via separate window) */}
            {showTerminal && (
              <div style={{ height: '100px', borderTop: '2px solid #334155', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '12px', gap: '6px' }}>
                <div>💻 Integrated Terminal — open via Taskbar → Terminal</div>
                <button onClick={()=> setShowTerminal(false)} style={{ padding: '4px 8px', background: '#334155', color: 'white', borderRadius: '4px' }}>Close (Ctrl+`)</button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', gap: '12px' }}>
            <div style={{ fontSize: '32px' }}>📝</div>
            <div>Select a file from the sidebar tree or type a file path above to start editing.</div>
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
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeTab ? `[${activeTab.rootId.toUpperCase()}] ${selectedRootObj ? selectedRootObj.path : ''}${activeTab.filePath}` : 'Ready'}
          </div>
          <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
            {activeTab && (
              <span>
                Ln {activeTab.cursorLine}, Col {activeTab.cursorCol}
              </span>
            )}
            {activeTab && (
              <span>
                {activeTab.content !== activeTab.initialContent ? '● Unsaved' : 'Saved'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
