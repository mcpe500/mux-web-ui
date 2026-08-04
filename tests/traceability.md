# Requirement Traceability Matrix

| Requirement | Test IDs | Test Level | Target Platforms | Status |
|---|---|---|---|---|
| BOOT-001 Default bind 127.0.0.1 | BOOT-001 | Integration | Linux x86_64 / ARM64, Termux ARM64 | Planned |
| BOOT-002 LAN mode bind 0.0.0.0 & IP display | BOOT-002 | Integration | Linux x86_64 / ARM64, Termux ARM64 | Planned |
| BOOT-003 Port collision actionable exit | BOOT-003 | Integration | Linux x86_64 / ARM64, Termux ARM64 | Planned |
| BOOT-004 Config precedence CLI > File > Env > Default | BOOT-004 | Unit | Portable | Planned |
| BOOT-005 Pre-listen config/cert validation | BOOT-005 | Unit | Portable | Planned |
| BOOT-006 Embedded asset content type & caching | BOOT-006 | Integration | Portable | Planned |
| BOOT-007 Graceful SIGINT/Ctrl+C shutdown | BOOT-007 | Integration | Portable | Planned |
| BOOT-008 Secret protection in production logs | BOOT-008 | Integration | Portable | Planned |
| AUTH-001 Single-use local bootstrap secret | AUTH-001 | Integration | Portable | Planned |
| AUTH-002 Pairing code cookie attributes | AUTH-002 | Integration | Portable | Planned |
| AUTH-003 Constant-time pairing rejection | AUTH-003 | Unit | Portable | Planned |
| AUTH-004 Global & per-IP rate limiting | AUTH-004 | Integration | Portable | Planned |
| AUTH-005 CSRF token validation | AUTH-005 | Integration | Portable | Planned |
| AUTH-006 Exact Origin/Host header checks | AUTH-006 | Integration | Portable | Planned |
| AUTH-007 Idle & absolute session expiry | AUTH-007 | Integration | Portable | Planned |
| AUTH-008 Client revocation from Settings | AUTH-008 | Integration | Portable | Planned |
| AUTH-009 Logout self-revocation | AUTH-009 | Integration | Portable | Planned |
| AUTH-010 Concurrency control on pairing code | AUTH-010 | Integration | Portable | Planned |
| AUTH-011 Cookie attribute security enforcement | AUTH-011 | Integration | Portable | Planned |
| AUTH-012 Omit secrets from logs & responses | AUTH-012 | Integration | Portable | Planned |
| TERM-001 WebSocket binary codec validation | TERM-001 | Unit | Portable | Planned |
| TERM-002 Frame decoder safety & chunking | TERM-002 | Unit | Portable | Planned |
| TERM-003 Spawn interactive shell in PTY | TERM-003 | Integration | Linux, Termux ARM64 | Planned |
| TERM-004 UTF-8 input, paste, and raw bytes | TERM-004 | Integration | Portable | Planned |
| TERM-005 PTY output streaming & ordering | TERM-005 | Integration | Portable | Planned |
| TERM-006 Debounced resize signal propagation | TERM-006 | Integration | Portable | Planned |
| TERM-007 Ctrl+C targets process group | TERM-007 | Integration | Linux, Termux ARM64 | Planned |
| TERM-008 Alternate screen support (nano/vim/top) | TERM-008 | Integration / Manual | Portable | Planned |
| TERM-009 Single EXIT frame emission on shell exit | TERM-009 | Integration | Portable | Planned |
| TERM-010 Control sequence HTML injection safety | TERM-010 | Unit / E2E | Portable | Planned |
| TERM-011 Oversized paste / frame rejection | TERM-011 | Integration | Portable | Planned |
| TERM-012 Bounded channel backpressure | TERM-012 | Integration | Portable | Planned |
| TERM-013 Open Terminal Here opaque root check | TERM-013 | Integration | Portable | Planned |
| LIFE-001 Window close -> SIGTERM -> SIGKILL | LIFE-001 | Integration | Linux, Termux ARM64 | Planned |
| LIFE-002 No orphan process on shutdown | LIFE-002 | Integration | Linux, Termux ARM64 | Planned |
| LIFE-003 Idempotent terminal DELETE | LIFE-003 | Integration | Portable | Planned |
| LIFE-004 Reconnect within grace period | LIFE-004 | Integration | Portable | Planned |
| LIFE-005 Cleanup on grace period expiry | LIFE-005 | Integration | Portable | Planned |
| LIFE-006 Concurrent life actions thread safety | LIFE-006 | Integration | Portable | Planned |
| LIFE-007 Refresh does not duplicate reader/writer | LIFE-007 | Integration | Portable | Planned |
| LIFE-008 Server termination handled gracefully | LIFE-008 | E2E | Portable | Planned |
| LIFE-009 Memory & FD leak soak test | LIFE-009 | Integration | Portable | Planned |
| FS-001 Allowed root resolution by opaque ID | FS-001 | Unit / Integration | Portable | Planned |
| FS-002 Defense against path traversal attacks | FS-002 | Unit / Fuzz | Portable | Planned |
| FS-003 Symlink containment within allowed root | FS-003 | Integration | Portable | Planned |
| FS-004 TOCTOU symlink race prevention | FS-004 | Integration | Portable | Planned |
| FS-005 Paginated directory listing | FS-005 | Integration | Portable | Planned |
| FS-006 File/folder creation with collision check | FS-006 | Integration | Portable | Planned |
| FS-007 Atomic rename / safe move fallback | FS-007 | Integration | Portable | Planned |
| FS-008 Bounded streaming upload/download/copy | FS-008 | Integration | Portable | Planned |
| FS-009 Cleanup temp files on error/interrupt | FS-009 | Integration | Portable | Planned |
| FS-010 Trash recovery system | FS-010 | Integration | Portable | Planned |
| FS-011 Permanent delete confirmation flag | FS-011 | Integration | Portable | Planned |
| FS-012 Download headers (nosniff/disposition) | FS-012 | Integration | Portable | Planned |
| FS-013 Shared storage explicit configuration requirement | FS-013 | Integration | Termux ARM64 | Planned |
| FS-014 Independent source & dest root validation | FS-014 | Unit | Portable | Planned |
| FS-015 Scoped, non-symlink folder search | FS-015 | Integration | Portable | Planned |
| EDIT-001 UTF-8 text file read/write | EDIT-001 | Unit / Integration | Portable | Planned |
| EDIT-002 Binary file protection in editor | EDIT-002 | Unit / Integration | Portable | Planned |
| EDIT-003 Dirty state tracking accuracy | EDIT-003 | Frontend Component | Portable | Planned |
| EDIT-004 Unsaved changes confirmation | EDIT-004 | Frontend Component | Portable | Planned |
| EDIT-005 Atomic save with file permissions preserved | EDIT-005 | Integration | Portable | Planned |
| EDIT-006 Conflict detection on external edits | EDIT-006 | Integration | Portable | Planned |
| EDIT-007 Save As allowed root restriction | EDIT-007 | Integration | Portable | Planned |
| EDIT-008 Retain buffer on failed save | EDIT-008 | Frontend Component | Portable | Planned |
| WIN-001 App launcher & window bounds instantiation | WIN-001 | Frontend Component | Portable | Planned |
| WIN-002 Dynamic z-index focus ordering | WIN-002 | Frontend Component | Portable | Planned |
| WIN-003 Minimize/maximize/restore state persistence | WIN-003 | Frontend Component | Portable | Planned |
| WIN-004 Pointer Event drag/resize clamping | WIN-004 | Frontend Component | Portable | Planned |
| WIN-005 Taskbar instance tracking | WIN-005 | Frontend Component | Portable | Planned |
| WIN-006 localStorage layout persistence & fallback | WIN-006 | Frontend Component | Portable | Planned |
| WIN-007 Desktop vs Mobile tabbed mode viewport switch | WIN-007 | Frontend Component / E2E | Portable | Planned |
| WIN-008 Virtual keyboard visualViewport adjustment | WIN-008 | E2E | Mobile Viewport | Planned |
| WIN-009 Lazy loading error recovery | WIN-009 | Frontend Component | Portable | Planned |
| A11Y-001 Keyboard navigation for launcher & windows | A11Y-001 | E2E | Portable | Planned |
| A11Y-002 Dialog focus trap & escape handling | A11Y-002 | Frontend Component | Portable | Planned |
| A11Y-003 ARIA labels & semantics | A11Y-003 | Frontend Component | Portable | Planned |
| A11Y-004 44x44px minimum touch targets | A11Y-004 | Frontend Component | Portable | Planned |
| A11Y-005 Prefers-reduced-motion compliance | A11Y-005 | Frontend Component | Portable | Planned |
| MON-001 System Metrics reporting | MON-001 | Integration | Portable | Planned |
| MON-002 Filter processes owned by server application | MON-002 | Integration | Portable | Planned |
| MON-003 Prevent polling leak on window close | MON-003 | Frontend Component | Portable | Planned |
| MON-004 Stop All Terminals execution | MON-004 | Integration | Portable | Planned |
| MON-005 Quick action preview before execution | MON-005 | Frontend Component | Portable | Planned |
| MON-006 Settings validation | MON-006 | Unit / Integration | Portable | Planned |
| LAN-001 Reject remote interface connections by default | LAN-001 | Integration | Portable | Planned |
| LAN-002 Discover and display private LAN IP addresses | LAN-002 | Unit / Integration | Portable | Planned |
| LAN-003 Laptop browser pairing workflow | LAN-003 | Integration / E2E | Portable | Planned |
| LAN-004 Multi-laptop independent sessions | LAN-004 | Integration | Portable | Planned |
| LAN-005 Network reconnect without terminal duplication | LAN-005 | Integration | Portable | Planned |
| LAN-006 TLS certificate configuration | LAN-006 | Integration | Portable | Planned |
| LAN-007 Plain HTTP security warning & clipboard fallback | LAN-007 | E2E | Portable | Planned |
| LAN-008 Reject unauthenticated LAN API requests | LAN-008 | Integration | Portable | Planned |
| SEC-001 Strict HTTP security headers | SEC-001 | Integration | Portable | Planned |
| SEC-002 Root execution prevention | SEC-002 | Integration | Portable | Planned |
| PERF-001 Binary size <= 10 MiB (hard limit <= 50 MiB) | PERF-001 | Build CI | Portable | Planned |
| PERF-002 Frontend assets <= 750 KiB (Brotli/gzip) | PERF-002 | Build CI | Portable | Planned |
| PERF-003 Idle RSS <= 35 MiB (hard limit <= 50 MiB) | PERF-003 | Integration | Portable | Planned |
| PERF-004 Cold startup time <= 1s | PERF-004 | Integration | Portable | Planned |
| PERF-005 4 active terminals responsive on 1 GiB RAM | PERF-005 | Soak Test | Portable | Planned |
