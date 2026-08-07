# Graph Report - mux-web-ui  (2026-08-07)

## Corpus Check
- 35 files · ~21,042 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 355 nodes · 492 edges · 24 communities (19 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `02ad6cf1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DesktopCanvas.tsx
- http.rs
- package.json
- SessionRegistry
- AllowedRoots
- protocol.rs
- PtySession
- compilerOptions
- Config
- list_directory
- static_handler
- Mux Web UI — TDD and verification plan
- install.sh
- check_budget.sh
- Mux Web UI — implementation plan
- uninstall.sh
- update.sh
- Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI
- Mux Web UI ⚡
- Mux Web UI — Implementation Checklist & Verification Matrix
- traceability.md

## God Nodes (most connected - your core abstractions)
1. `SessionRegistry` - 18 edges
2. `compilerOptions` - 17 edges
3. `Mux Web UI — implementation plan` - 15 edges
4. `AppState` - 14 edges
5. `PtySession` - 13 edges
6. `Mux Web UI — TDD and verification plan` - 13 edges
7. `AllowedRoots` - 12 edges
8. `list_entries_handler()` - 11 edges
9. `8. Test plan per area` - 11 edges
10. `Config` - 10 edges

## Surprising Connections (you probably didn't know these)
- `test_edit_001_file_read_and_atomic_write()` --calls--> `create_router()`  [INFERRED]
  tests/editor_tests.rs → src/http.rs
- `list_entries_handler()` --calls--> `list_directory()`  [INFERRED]
  src/http.rs → src/files.rs
- `handle_terminal_ws()` --calls--> `decode_frame()`  [INFERRED]
  src/http.rs → src/protocol.rs
- `handle_terminal_ws()` --calls--> `encode_frame()`  [INFERRED]
  src/http.rs → src/protocol.rs
- `SPA mount point (#app + main.tsx)` --references--> `root`  [EXTRACTED]
  web/index.html → web/src/main.tsx

## Import Cycles
- None detected.

## Communities (24 total, 5 thin omitted)

### Community 0 - "DesktopCanvas.tsx"
Cohesion: 0.09
Nodes (23): SPA mount point (#app + main.tsx), App(), FsEntry, FsRoot, TabData, TextEditorView(), TextEditorViewProps, DirectoryListing (+15 more)

### Community 1 - "http.rs"
Cohesion: 0.18
Nodes (30): IntoResponse, Json, Query, AppState, create_terminal_handler(), CreateTerminalReq, delete_terminal_handler(), FileQuery (+22 more)

### Community 2 - "package.json"
Cohesion: 0.08
Nodes (25): preact, @preact/preset-vite, typescript, vite, vitest, dependencies, preact, @xterm/addon-fit (+17 more)

### Community 3 - "SessionRegistry"
Cohesion: 0.17
Nodes (15): rand_id(), Arc, HashMap, Mutex, Option, PathBuf, Receiver, Result (+7 more)

### Community 4 - "AllowedRoots"
Cohesion: 0.20
Nodes (15): AllowedRoots, PathError, Display, Error, Formatter, HashMap, PathBuf, Result (+7 more)

### Community 5 - "protocol.rs"
Cohesion: 0.20
Nodes (12): Bytes, CodecError, decode_frame(), encode_frame(), Frame, Display, Error, Formatter (+4 more)

### Community 6 - "PtySession"
Cohesion: 0.13
Nodes (13): File, OwnedFd, Pid, Sender, PtySession, Arc, Mutex, Option (+5 more)

### Community 7 - "compilerOptions"
Cohesion: 0.09
Nodes (22): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+14 more)

### Community 8 - "Config"
Cohesion: 0.15
Nodes (12): Box, IpAddr, Router, Config, Option, PathBuf, String, create_router() (+4 more)

### Community 9 - "list_directory"
Cohesion: 0.39
Nodes (8): DirectoryListing, FileEntry, FsAction, list_directory(), Path, Result, String, Vec

### Community 10 - "static_handler"
Cohesion: 0.40
Nodes (4): Response, Assets, static_handler(), Uri

### Community 11 - "Mux Web UI — TDD and verification plan"
Cohesion: 0.05
Nodes (41): 10. TDD sequence per milestone, 11. Manual exploratory charters, 12. Evidence dan definition of tested, 1. Tujuan, 2. Aturan kerja TDD, 3. Test ID dan traceability, 4. Test stack, 5. Test architecture dan determinism (+33 more)

### Community 14 - "Mux Web UI — implementation plan"
Cohesion: 0.06
Nodes (31): 10. Strategi test, 11. Definition of done v1, 12. Risiko khusus Android/Termux, 13. Aplikasi lanjutan setelah v1, 14. Keputusan yang sengaja ditunda, 1. Tujuan, 2. Keputusan stack, 3. Batas produk (+23 more)

### Community 18 - "Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI"
Cohesion: 0.10
Nodes (21): 1. Latar belakang dan risiko, 2. Hubungan dengan rencana v1, 3. Milestone A — Autentikasi + TLS, 4. Milestone B — Session persistence (detach/reattach), 5. Milestone C — Test suite + CI, 6. Milestone D (opsional) — Upload/download & share links, 7. Urutan pengerjaan (TDD), 8. Definition of done v0.2 (+13 more)

### Community 19 - "Mux Web UI ⚡"
Cohesion: 0.15
Nodes (12): 🛠️ Building from Source, ✨ Features, 📥 Install (Create), 📜 License, Mux Web UI ⚡, 📊 Performance & Size Benchmarks, Prerequisites, ⚡ Quick 1-Line Commands (Create / Update / Delete) (+4 more)

### Community 20 - "Mux Web UI — Implementation Checklist & Verification Matrix"
Cohesion: 0.19
Nodes (9): Definition of Done (DoD) Final Audit, Milestone 0 — Baseline Infrastructure & Budget Gate, Milestone 1 — Vertical Slice: PTY Terminal Backend & xterm.js, Milestone 2 — Desktop Window Manager, Launcher & Multi-Window, Milestone 3 — File Explorer & Lightweight Text Editor, Milestone 4 — Control Center, Security Hardening & LAN Pairing, Milestone 5 — Optimization, Low-End Performance & Release Artifacts, Mux Web UI — Implementation Checklist & Verification Matrix (+1 more)

## Knowledge Gaps
- **142 isolated node(s):** `install.sh script`, `check_budget.sh script`, `Assets`, `uninstall.sh script`, `update.sh script` (+137 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SessionRegistry` connect `SessionRegistry` to `Config`, `http.rs`, `PtySession`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `Mux Web UI — TDD and verification plan` connect `Mux Web UI — TDD and verification plan` to `Mux Web UI — Implementation Checklist & Verification Matrix`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `Mux Web UI — implementation plan` connect `Mux Web UI — implementation plan` to `Mux Web UI — Implementation Checklist & Verification Matrix`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `install.sh script`, `check_budget.sh script`, `Assets` to the rest of the system?**
  _142 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DesktopCanvas.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09274193548387097 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `PtySession` be split into smaller, more focused modules?**
  _Cohesion score 0.12857142857142856 - nodes in this community are weakly interconnected._