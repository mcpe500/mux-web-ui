# Requirement Traceability Matrix

| Requirement | Test IDs | Test Level | Target Platforms | Status |
|---|---|---|---|---|
| BOOT-001 Default bind 127.0.0.1 | BOOT-001 | Integration | Linux x86_64 / ARM64, Termux ARM64 | Passed |
| BOOT-002 LAN mode bind 0.0.0.0 & IP display | BOOT-002 | Integration | Linux x86_64 / ARM64, Termux ARM64 | Passed |
| BOOT-003 Port collision actionable exit | BOOT-003 | Integration | Linux x86_64 / ARM64, Termux ARM64 | Passed |
| BOOT-004 Config precedence CLI > File > Env > Default | BOOT-004 | Unit | Portable | Passed |
| BOOT-005 Pre-listen config/cert validation | BOOT-005 | Unit | Portable | Passed |
| BOOT-006 Embedded asset content type & caching | BOOT-006 | Integration | Portable | Passed |
| BOOT-007 Graceful SIGINT/Ctrl+C shutdown | BOOT-007 | Integration | Portable | Passed |
| BOOT-008 Secret protection in production logs | BOOT-008 | Integration | Portable | Passed |
| AUTH-001 Single-use local bootstrap secret | AUTH-001 | Integration | Portable | Passed |
| AUTH-002 Pairing code cookie attributes | AUTH-002 | Integration | Portable | Passed |
| AUTH-003 Constant-time pairing rejection | AUTH-003 | Unit | Portable | Passed |
| AUTH-004 Global & per-IP rate limiting | AUTH-004 | Integration | Portable | Passed |
| AUTH-005 CSRF token validation | AUTH-005 | Integration | Portable | Passed |
| AUTH-006 Exact Origin/Host header checks | AUTH-006 | Integration | Portable | Passed |
| AUTH-007 Idle & absolute session expiry | AUTH-007 | Integration | Portable | Passed |
| AUTH-008 Client revocation from Settings | AUTH-008 | Integration | Portable | Passed |
| AUTH-009 Logout self-revocation | AUTH-009 | Integration | Portable | Passed |
| AUTH-010 Concurrency control on pairing code | AUTH-010 | Integration | Portable | Passed |
| AUTH-011 Cookie attribute security enforcement | AUTH-011 | Integration | Portable | Passed |
| AUTH-012 Omit secrets from logs & responses | AUTH-012 | Integration | Portable | Passed |
| AUTH-013 Anti session-fixation (cookie ID rotation) | AUTH-013 | Unit / Integration | Portable | Passed |
| AUTH-014 Regenerate bootstrap secret | AUTH-014 | Integration | Portable | Passed |
| SESS-001 Detach keeps PTY alive | SESS-001 | Integration | Portable | Passed |
| SESS-002 Reattach resumes live stream | SESS-002 | Integration | Portable | Passed |
| SESS-003 List active sessions without secret | SESS-003 | Integration | Portable | Passed |
| SESS-004 Idle timeout cleanup | SESS-004 | Integration | Portable | Passed |
| SESS-005 Max sessions limit enforcement | SESS-005 | Unit / Integration | Portable | Passed |
| SESS-006 Reconnect without duplicate reader/writer | SESS-006 | Integration | Portable | Passed |
| SESS-007 Ring buffer replay for detached output | SESS-007 | Unit / Integration | Portable | Passed |
| SESS-008 Single-attach kick previous client | SESS-008 | Unit / Integration | Portable | Passed |
| CI-001 Matrix build Linux & Android ARM64 | CI-001 | Build CI | Linux x86_64, Android ARM64 | Passed |
| CI-002 Traversal regression suite on CI | CI-002 | Build CI | Portable | Passed |
| CI-003 WS PTY integration suite on CI | CI-003 | Build CI | Portable | Passed |
| CI-004 Budget gate scripts/check_budget.sh | CI-004 | Build CI | Portable | Passed |
| CI-005 Release artifact + SHA-256 checksums | CI-005 | Build CI | Portable | Passed |
| CI-006 Frontend asset size & build check | CI-006 | Build CI | Portable | Passed |
| CI-007 Code quality fmt & clippy -D warnings | CI-007 | Build CI | Portable | Passed |
| DIST-001 Tag v* → binary x86_64-unknown-linux-gnu | DIST-001 | Build CI | Linux x86_64 | Planned |
| DIST-002 Tag v* → binary x86_64-unknown-linux-musl (static) | DIST-002 | Build CI | Linux x86_64 | Planned |
| DIST-003 Tag v* → binary aarch64-unknown-linux-gnu | DIST-003 | Build CI | Linux ARM64 | Planned |
| DIST-004 Tag v* → binary aarch64-linux-android (Termux) | DIST-004 | Build CI | Termux/Android ARM64 | Planned |
| DIST-005 SHA-256 per artifact + checksums.txt agregat | DIST-005 | Build CI | Portable | Planned |
| DIST-006 GitHub Release otomatis berisi seluruh artifact | DIST-006 | Build CI | Portable | Planned |
| DIST-007 install.sh binary-first tanpa Rust (detect OS/arch) | DIST-007 | Build CI (installer-test S1) | Linux x86_64, Termux ARM64 | Passed |
| DIST-008 install.sh --version pin versi spesifik | DIST-008 | Build CI (installer-test S2) | Portable | Passed |
| DIST-009 Verifikasi SHA-256 wajib sebelum install | DIST-009 | Build CI (installer-test S3) | Portable | Passed |
| DIST-010 Fallback build-from-source bila download/verify gagal | DIST-010 | Manual | Portable | Passed |
| DIST-011 update.sh binary-first + banding versi (tidak dari main) | DIST-011 | Build CI (installer-test S4a) | Portable | Passed |
| DIST-012 update.sh backup + auto-rollback saat update gagal | DIST-012 | Build CI (installer-test S4b/4c) | Portable | Passed |
| DIST-013 MUX_WEB_BASE_URL override untuk pengujian installer | DIST-013 | Build CI (installer-test) | Portable | Passed |
| DIST-014 README: install-dari-release vs build-source | DIST-014 | Docs | Portable | Passed |
| TERM-001 WebSocket binary codec validation | TERM-001 | Unit | Portable | Passed |
| TERM-002 Frame decoder safety & chunking | TERM-002 | Unit | Portable | Passed |
| TERM-003 Spawn interactive shell in PTY | TERM-003 | Integration | Linux, Termux ARM64 | Passed |
| TERM-004 UTF-8 input, paste, and raw bytes | TERM-004 | Integration | Portable | Passed |
| TERM-005 PTY output streaming & ordering | TERM-005 | Integration | Portable | Passed |
| TERM-006 Debounced resize signal propagation | TERM-006 | Integration | Portable | Passed |
| TERM-007 Ctrl+C targets process group | TERM-007 | Integration | Linux, Termux ARM64 | Passed |
| TERM-008 Alternate screen support (nano/vim/top) | TERM-008 | Integration / Manual | Portable | Passed |
| TERM-009 Single EXIT frame emission on shell exit | TERM-009 | Integration | Portable | Passed |
| TERM-010 Control sequence HTML injection safety | TERM-010 | Unit / E2E | Portable | Passed |
| TERM-011 Oversized paste / frame rejection | TERM-011 | Integration | Portable | Passed |
| TERM-012 Bounded channel backpressure | TERM-012 | Integration | Portable | Passed |
| TERM-013 Open Terminal Here opaque root check | TERM-013 | Integration | Portable | Passed |
| LIFE-001 Window close -> SIGTERM -> SIGKILL | LIFE-001 | Integration | Linux, Termux ARM64 | Passed |
| LIFE-002 No orphan process on shutdown | LIFE-002 | Integration | Linux, Termux ARM64 | Passed |
| LIFE-003 Idempotent terminal DELETE | LIFE-003 | Integration | Portable | Passed |
| LIFE-004 Reconnect within grace period | LIFE-004 | Integration | Portable | Passed |
| LIFE-005 Cleanup on grace period expiry | LIFE-005 | Integration | Portable | Passed |
| LIFE-006 Concurrent life actions thread safety | LIFE-006 | Integration | Portable | Passed |
| LIFE-007 Refresh does not duplicate reader/writer | LIFE-007 | Integration | Portable | Passed |
| LIFE-008 Server termination handled gracefully | LIFE-008 | E2E | Portable | Passed |
| LIFE-009 Memory & FD leak soak test | LIFE-009 | Integration | Portable | Passed |
| FS-001 Allowed root resolution by opaque ID | FS-001 | Unit / Integration | Portable | Passed |
| FS-002 Defense against path traversal attacks | FS-002 | Unit / Fuzz | Portable | Passed |
| FS-003 Symlink containment within allowed root | FS-003 | Integration | Portable | Passed |
| FS-004 TOCTOU symlink race prevention | FS-004 | Integration | Portable | Passed |
| FS-005 Paginated directory listing | FS-005 | Integration | Portable | Passed |
| FS-006 File/folder creation with collision check | FS-006 | Integration | Portable | Passed |
| FS-007 Atomic rename / safe move fallback | FS-007 | Integration | Portable | Passed |
| FS-008 Bounded streaming upload/download/copy | FS-008 | Integration | Portable | Passed |
| FS-009 Cleanup temp files on error/interrupt | FS-009 | Integration | Portable | Passed |
| FS-010 Trash recovery system | FS-010 | Integration | Portable | Passed |
| FS-011 Permanent delete confirmation flag | FS-011 | Integration | Portable | Passed |
| FS-012 Download headers (nosniff/disposition) | FS-012 | Integration | Portable | Passed |
| FS-013 Shared storage explicit configuration requirement | FS-013 | Integration | Termux ARM64 | Passed |
| FS-014 Independent source & dest root validation | FS-014 | Unit | Portable | Passed |
| FS-015 Scoped, non-symlink folder search | FS-015 | Integration | Portable | Passed |
| FS-016 Hardlink escape rejection | FS-016 | Unit / Integration | Portable | Passed |
| FS-017 Traversal encoding & literal matrix | FS-017 | Unit / Integration | Portable | Passed |
| EDIT-001 UTF-8 text file read/write | EDIT-001 | Unit / Integration | Portable | Passed |
| EDIT-002 Binary file protection in editor | EDIT-002 | Unit / Integration | Portable | Passed |
| EDIT-003 Dirty state tracking accuracy | EDIT-003 | Frontend Component | Portable | Passed |
| EDIT-004 Unsaved changes confirmation | EDIT-004 | Frontend Component | Portable | Passed |
| EDIT-005 Atomic save with file permissions preserved | EDIT-005 | Integration | Portable | Passed |
| EDIT-006 Conflict detection on external edits | EDIT-006 | Integration | Portable | Passed |
| EDIT-007 Save As allowed root restriction | EDIT-007 | Integration | Portable | Passed |
| EDIT-008 Retain buffer on failed save | EDIT-008 | Frontend Component | Portable | Passed |
| WIN-001 App launcher & window bounds instantiation | WIN-001 | Frontend Component | Portable | Passed |
| WIN-002 Dynamic z-index focus ordering | WIN-002 | Frontend Component | Portable | Passed |
| WIN-003 Minimize/maximize/restore state persistence | WIN-003 | Frontend Component | Portable | Passed |
| WIN-004 Pointer Event drag/resize clamping | WIN-004 | Frontend Component | Portable | Passed |
| WIN-005 Taskbar instance tracking | WIN-005 | Frontend Component | Portable | Passed |
| WIN-006 localStorage layout persistence & fallback | WIN-006 | Frontend Component | Portable | Passed |
| WIN-007 Desktop vs Mobile tabbed mode viewport switch | WIN-007 | Frontend Component / E2E | Portable | Passed |
| WIN-008 Virtual keyboard visualViewport adjustment | WIN-008 | E2E | Mobile Viewport | Passed |
| WIN-009 Lazy loading error recovery | WIN-009 | Frontend Component | Portable | Passed |
| A11Y-001 Keyboard navigation for launcher & windows | A11Y-001 | E2E | Portable | Passed |
| A11Y-002 Dialog focus trap & escape handling | A11Y-002 | Frontend Component | Portable | Passed |
| A11Y-003 ARIA labels & semantics | A11Y-003 | Frontend Component | Portable | Passed |
| A11Y-004 44x44px minimum touch targets | A11Y-004 | Frontend Component | Portable | Passed |
| A11Y-005 Prefers-reduced-motion compliance | A11Y-005 | Frontend Component | Portable | Passed |
| MON-001 System Metrics reporting | MON-001 | Integration | Portable | Passed |
| MON-002 Filter processes owned by server application | MON-002 | Integration | Portable | Passed |
| MON-003 Prevent polling leak on window close | MON-003 | Frontend Component | Portable | Passed |
| MON-004 Stop All Terminals execution | MON-004 | Integration | Portable | Passed |
| MON-005 Quick action preview before execution | MON-005 | Frontend Component | Portable | Passed |
| MON-006 Settings validation | MON-006 | Unit / Integration | Portable | Passed |
| LAN-001 Reject remote interface connections by default | LAN-001 | Integration | Portable | Passed |
| LAN-002 Discover and display private LAN IP addresses | LAN-002 | Unit / Integration | Portable | Passed |
| LAN-003 Laptop browser pairing workflow | LAN-003 | Integration / E2E | Portable | Passed |
| LAN-004 Multi-laptop independent sessions | LAN-004 | Integration | Portable | Passed |
| LAN-005 Network reconnect without terminal duplication | LAN-005 | Integration | Portable | Passed |
| LAN-006 TLS certificate configuration | LAN-006 | Integration | Portable | Passed |
| LAN-007 Plain HTTP security warning & clipboard fallback | LAN-007 | E2E | Portable | Passed |
| LAN-008 Reject unauthenticated LAN API requests | LAN-008 | Integration | Portable | Passed |
| SEC-001 Strict HTTP security headers | SEC-001 | Integration | Portable | Passed |
| SEC-002 Root execution prevention | SEC-002 | Integration | Portable | Passed |
| SEC-003 Rebinding and Origin spoofing rejection | SEC-003 | Integration | Portable | Passed |
| PERF-001 Binary size <= 10 MiB (hard limit <= 50 MiB) | PERF-001 | Build CI | Portable | Passed |
| PERF-002 Frontend assets <= 750 KiB (Brotli/gzip) | PERF-002 | Build CI | Portable | Passed |
| PERF-003 Idle RSS <= 35 MiB (hard limit <= 50 MiB) | PERF-003 | Integration | Portable | Passed |
| PERF-004 Cold startup time <= 1s | PERF-004 | Integration | Portable | Passed |
| PERF-005 4 active terminals responsive on 1 GiB RAM | PERF-005 | Soak Test | Portable | Passed |
| RSZ-001 RESIZE codec length validation | RSZ-001 | Unit | Portable | Passed |
| RSZ-002 Server clamp cols/rows before PTY | RSZ-002 | Unit / Integration | Linux x86_64 / ARM64, Termux ARM64 | Passed |
| RSZ-003 create_terminal initial size clamp | RSZ-003 | Unit / Integration | Portable | Passed |
| RSZ-004 Resize error surfaced as 0x04 | RSZ-004 | Integration | Portable | Passed |
| RSZ-005 Metadata cols/rows clamped & consistent | RSZ-005 | Integration | Portable | Passed |
| RSZ-006 Resize after closed session safe | RSZ-006 | Integration | Portable | Passed |
| RSZ-007 Frontend resize debounce & no 0x0 frame | RSZ-007 | Frontend Component | Portable | Passed |
| RSZ-008 fit() safe on 0x0 container | RSZ-008 | Frontend Component | Portable | Passed |
| RSZ-009 visualViewport & orientation resize | RSZ-009 | Frontend Component / E2E | Portable | Passed |
| RSZ-010 Flood resize no unbounded resource growth | RSZ-010 | Integration / Soak | Portable | Passed |


