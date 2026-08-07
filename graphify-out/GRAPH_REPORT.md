# Graph Report - mux-web-ui  (2026-08-08)

## Corpus Check
- 42 files · ~33,836 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 572 nodes · 997 edges · 28 communities (23 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d5abf6bf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DesktopCanvas.tsx
- Mux Web UI — implementation plan
- Mux Web UI — TDD and verification plan
- http.rs
- Mux Web UI — Implementation Checklist & Verification Matrix
- package.json
- compilerOptions
- SessionRegistry
- TestServer
- AllowedRoots
- protocol.rs
- PtySession
- Config
- Mux Web UI ⚡
- auth.rs
- files.rs
- static_handler
- install.sh
- uninstall.sh
- Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI
- check_budget.sh
- traceability.md
- update.sh
- session_tests.rs
- 4. SISA PEKERJAAN — Apa yang Belum Selesai

## God Nodes (most connected - your core abstractions)
1. `AppState` - 26 edges
2. `SessionRegistry` - 25 edges
3. `TestServer` - 20 edges
4. `PtySession` - 17 edges
5. `TerminalSessionInstance` - 17 edges
6. `compilerOptions` - 17 edges
7. `AuthState` - 16 edges
8. `start_server()` - 15 edges
9. `Mux Web UI — implementation plan` - 15 edges
10. `Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI` - 15 edges

## Surprising Connections (you probably didn't know these)
- `test_edit_001_file_read_and_atomic_write()` --calls--> `create_router()`  [INFERRED]
  tests/editor_tests.rs → src/http.rs
- `send_input()` --calls--> `encode_frame()`  [INFERRED]
  tests/session_tests.rs → src/protocol.rs
- `test_auth()` --references--> `AuthState`  [EXTRACTED]
  tests/common/mod.rs → src/auth.rs
- `start_server_with_state()` --references--> `AppState`  [EXTRACTED]
  tests/common/mod.rs → src/http.rs
- `start_server_with_state()` --calls--> `create_router()`  [INFERRED]
  tests/common/mod.rs → src/http.rs

## Import Cycles
- None detected.

## Communities (28 total, 5 thin omitted)

### Community 0 - "DesktopCanvas.tsx"
Cohesion: 0.09
Nodes (23): SPA mount point (#app + main.tsx), App(), FsEntry, FsRoot, TabData, TextEditorView(), TextEditorViewProps, DirectoryListing (+15 more)

### Community 1 - "Mux Web UI — implementation plan"
Cohesion: 0.06
Nodes (31): 10. Strategi test, 11. Definition of done v1, 12. Risiko khusus Android/Termux, 13. Aplikasi lanjutan setelah v1, 14. Keputusan yang sengaja ditunda, 1. Tujuan, 2. Keputusan stack, 3. Batas produk (+23 more)

### Community 2 - "Mux Web UI — TDD and verification plan"
Cohesion: 0.05
Nodes (41): 10. TDD sequence per milestone, 11. Manual exploratory charters, 12. Evidence dan definition of tested, 1. Tujuan, 2. Aturan kerja TDD, 3. Test ID dan traceability, 4. Test stack, 5. Test architecture dan determinism (+33 more)

### Community 3 - "http.rs"
Cohesion: 0.11
Nodes (56): Body, HeaderMap, IntoResponse, Json, Next, Query, Request, AppState (+48 more)

### Community 4 - "Mux Web UI — Implementation Checklist & Verification Matrix"
Cohesion: 0.10
Nodes (18): Definition of Done (DoD) Final Audit, Milestone 0 — Baseline Infrastructure & Budget Gate, Milestone 1 — Vertical Slice: PTY Terminal Backend & xterm.js, Milestone 2 — Desktop Window Manager, Launcher & Multi-Window, Milestone 3 — File Explorer & Lightweight Text Editor, Milestone 4 — Control Center, Security Hardening & LAN Pairing, Milestone 5 — Optimization, Low-End Performance & Release Artifacts, Mux Web UI — Implementation Checklist & Verification Matrix (+10 more)

### Community 5 - "package.json"
Cohesion: 0.08
Nodes (25): preact, @preact/preset-vite, typescript, vite, vitest, dependencies, preact, @xterm/addon-fit (+17 more)

### Community 6 - "compilerOptions"
Cohesion: 0.09
Nodes (22): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+14 more)

### Community 7 - "SessionRegistry"
Cohesion: 0.09
Nodes (34): AtomicBool, AtomicU64, AttachError, AttachInfo, PendingAttach, rand_id(), RingBuffer, Arc (+26 more)

### Community 8 - "TestServer"
Cohesion: 0.08
Nodes (39): Client, JoinHandle, MaybeTlsStream, Router, create_router(), TcpStream, pair_body(), String (+31 more)

### Community 9 - "AllowedRoots"
Cohesion: 0.18
Nodes (17): AllowedRoots, PathError, Display, Error, Formatter, HashMap, PathBuf, Result (+9 more)

### Community 10 - "protocol.rs"
Cohesion: 0.20
Nodes (12): Bytes, CodecError, decode_frame(), encode_frame(), Frame, Display, Error, Formatter (+4 more)

### Community 11 - "PtySession"
Cohesion: 0.11
Nodes (15): File, OwnedFd, Pid, PtySession, reap_exit_code(), Arc, Drop, Mutex (+7 more)

### Community 12 - "Config"
Cohesion: 0.13
Nodes (16): Box, Config, IpAddr, Option, PathBuf, String, generate_self_signed_cert(), main() (+8 more)

### Community 13 - "Mux Web UI ⚡"
Cohesion: 0.14
Nodes (13): 🛠️ Building from Source, ✨ Features, 📥 Install (Create), 📜 License, Mux Web UI ⚡, 📊 Performance & Size Benchmarks, Prerequisites, ⚡ Quick 1-Line Commands (Create / Update / Delete) (+5 more)

### Community 14 - "auth.rs"
Cohesion: 0.12
Nodes (27): auth(), AuthConfig, AuthError, AuthInner, AuthState, ClientInfo, ClientSession, constant_time_eq() (+19 more)

### Community 15 - "files.rs"
Cohesion: 0.33
Nodes (9): DirectoryListing, FileEntry, FsAction, list_directory(), Path, Result, String, Vec (+1 more)

### Community 16 - "static_handler"
Cohesion: 0.40
Nodes (4): Assets, Response, static_handler(), Uri

### Community 21 - "Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI"
Cohesion: 0.06
Nodes (34): 10. Keputusan desain dan open questions, 11. Bukan scope v0.2, 12. Urutan pengerjaan (TDD), 13. Risiko Termux/Android untuk auth, 14. Definition of done v0.2, 1.1 Fakta kode v0.1 yang menjadi titik awal, 1.2 Scope v0.2, 1. Latar belakang dan risiko (+26 more)

### Community 25 - "session_tests.rs"
Cohesion: 0.34
Nodes (19): start_health_server(), connect(), create_terminal(), read_kick_message(), read_until(), read_until_exit(), request_attach(), String (+11 more)

### Community 26 - "4. SISA PEKERJAAN — Apa yang Belum Selesai"
Cohesion: 0.11
Nodes (19): 1. Status Ringkas, 2. Progress Lengkap, 3.1 Gejala, 3.2 Root cause (terbukti empiris), 3.3 Fix (`src/pty.rs`, § OPEN PTY + FORK), 3.4 Verifikasi, 3. BUG KRITIS BARU SAJA DIFIX — JANGAN DI-REGRESI, 4.1 [SELESAI] Hardening `src/pty.rs` (+11 more)

## Knowledge Gaps
- **178 isolated node(s):** `TerminalViewProps`, `install.sh script`, `check_budget.sh script`, `Assets`, `uninstall.sh script` (+173 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SessionRegistry` connect `SessionRegistry` to `TestServer`, `http.rs`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `AppState` connect `http.rs` to `SessionRegistry`, `TestServer`, `AllowedRoots`, `Config`, `auth.rs`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `PtySession` connect `PtySession` to `SessionRegistry`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **What connects `TerminalViewProps`, `install.sh script`, `check_budget.sh script` to the rest of the system?**
  _178 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DesktopCanvas.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09274193548387097 - nodes in this community are weakly interconnected._
- **Should `Mux Web UI — implementation plan` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `Mux Web UI — TDD and verification plan` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._