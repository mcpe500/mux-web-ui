# Graph Report - .  (2026-08-09)

## Corpus Check
- 28 files · ~36,303 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 647 nodes · 1143 edges · 34 communities (30 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- HTTP Request Handling
- Session Persistence Milestone
- HTTP Server & Router
- Auth & Pairing
- Test Plan & TDD
- v0.2 Spec Milestones
- Frontend Apps
- v1 Product Plan
- PTY & Fork
- Web Build Tooling
- TypeScript Config
- Path Resolution
- Server Config
- v0.2.1 Distribution Spec
- Handoff & Bug Report
- Auth Test Suite
- README Documentation
- Protocol Framing
- Requirements Traceability
- Distribution & Checksum
- Implementation Checklists
- v1 Milestone Checklists
- v0.2 Checklist Steps
- v0.2.1 Checklist Steps
- CI Pipelines
- Static Assets
- Install Script
- Budget Check Script
- Uninstall Script
- Update Script

## God Nodes (most connected - your core abstractions)
1. `SessionRegistry` - 28 edges
2. `AppState` - 26 edges
3. `TestServer` - 21 edges
4. `compilerOptions` - 17 edges
5. `PtySession` - 17 edges
6. `TerminalSessionInstance` - 17 edges
7. `AuthState` - 16 edges
8. `Mux Web UI — implementation plan` - 15 edges
9. `Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI` - 15 edges
10. `start_server()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `SESS Requirement Family` --conceptually_related_to--> `RingBuffer`  [INFERRED]
  tests/traceability.md → src/session.rs
- `test_edit_001_file_read_and_atomic_write()` --calls--> `create_router()`  [INFERRED]
  tests/editor_tests.rs → src/http.rs
- `Handoff 001 - Progress & Backlog (v0.2)` --references--> `TestServer`  [EXTRACTED]
  spec/handoff/001.progress-and-backlog.md → tests/common/mod.rs
- `PERF Requirement Family` --references--> `check_budget.sh Budget Gate Script`  [INFERRED]
  tests/traceability.md → .github/workflows/ci.yml
- `PTY Interactive Terminal (xterm.js)` --semantically_similar_to--> `TERM Requirement Family`  [INFERRED] [semantically similar]
  README.md → tests/traceability.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **v0.2.1 Distribution Workstream** — spec_specs_002_plan_v0_2_1_milestone_a_release_pipeline, spec_specs_002_plan_v0_2_1_milestone_b_installer, spec_specs_002_plan_v0_2_1_dist_family, install_sh, update_sh [EXTRACTED 1.00]
- **v0.2 Milestone B Session Persistence Workstream** — spec_handoff_001_progress_and_backlog_milestone_b, src_session_sessionregistry, src_session_ringbuffer, spec_handoff_001_progress_and_backlog_life_002_orphan_cleanup, tests_session_tests [INFERRED 0.85]
- **CI Release Gate (test-and-lint + cross-check + budget-check required)** — _github_workflows_ci_testandlint, _github_workflows_ci_crosscheck, _github_workflows_ci_budgetcheck, _github_workflows_ci_release [EXTRACTED 1.00]

## Communities (34 total, 4 thin omitted)

### Community 0 - "HTTP Request Handling"
Cohesion: 0.11
Nodes (56): Body, HeaderMap, IntoResponse, Json, Next, Query, Request, AppState (+48 more)

### Community 1 - "Session Persistence Milestone"
Cohesion: 0.09
Nodes (38): AtomicBool, AtomicU64, Handoff 001 - Progress & Backlog (v0.2), LIFE-002 Orphan Child Cleanup, Milestone B: Session Persistence, Checklist Milestone B: Session Persistence (B.1-B.9), AttachError, AttachInfo (+30 more)

### Community 2 - "HTTP Server & Router"
Cohesion: 0.10
Nodes (44): Client, JoinHandle, MaybeTlsStream, Router, create_router(), TcpStream, authed_ws_connect(), Drop (+36 more)

### Community 3 - "Auth & Pairing"
Cohesion: 0.09
Nodes (36): auth(), AuthConfig, AuthError, AuthInner, AuthState, ClientInfo, ClientSession, constant_time_eq() (+28 more)

### Community 4 - "Test Plan & TDD"
Cohesion: 0.05
Nodes (41): 10. TDD sequence per milestone, 11. Manual exploratory charters, 12. Evidence dan definition of tested, 1. Tujuan, 2. Aturan kerja TDD, 3. Test ID dan traceability, 4. Test stack, 5. Test architecture dan determinism (+33 more)

### Community 5 - "v0.2 Spec Milestones"
Cohesion: 0.06
Nodes (34): 10. Keputusan desain dan open questions, 11. Bukan scope v0.2, 12. Urutan pengerjaan (TDD), 13. Risiko Termux/Android untuk auth, 14. Definition of done v0.2, 1.1 Fakta kode v0.1 yang menjadi titik awal, 1.2 Scope v0.2, 1. Latar belakang dan risiko (+26 more)

### Community 6 - "Frontend Apps"
Cohesion: 0.09
Nodes (23): SPA mount point (#app + main.tsx), App(), FsEntry, FsRoot, TabData, TextEditorView(), TextEditorViewProps, DirectoryListing (+15 more)

### Community 7 - "v1 Product Plan"
Cohesion: 0.06
Nodes (31): 10. Strategi test, 11. Definition of done v1, 12. Risiko khusus Android/Termux, 13. Aplikasi lanjutan setelah v1, 14. Keputusan yang sengaja ditunda, 1. Tujuan, 2. Keputusan stack, 3. Batas produk (+23 more)

### Community 8 - "PTY & Fork"
Cohesion: 0.10
Nodes (17): File, OwnedFd, Pid, forkpty fd-table Inheritance Bug, PTY Fork Hardening (manual open + close_range), PtySession, reap_exit_code(), Arc (+9 more)

### Community 9 - "Web Build Tooling"
Cohesion: 0.08
Nodes (25): preact, @preact/preset-vite, typescript, vite, vitest, dependencies, preact, @xterm/addon-fit (+17 more)

### Community 10 - "TypeScript Config"
Cohesion: 0.09
Nodes (22): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+14 more)

### Community 11 - "Path Resolution"
Cohesion: 0.18
Nodes (17): AllowedRoots, PathError, Display, Error, Formatter, HashMap, PathBuf, Result (+9 more)

### Community 12 - "Server Config"
Cohesion: 0.13
Nodes (16): Box, Config, IpAddr, Option, PathBuf, String, generate_self_signed_cert(), main() (+8 more)

### Community 13 - "v0.2.1 Distribution Spec"
Cohesion: 0.10
Nodes (20): 10. Definition of done v0.2.1, 1.1 Fakta kode v0.2 yang menjadi titik awal, 1.2 Scope v0.2.1, 1. Latar belakang dan risiko, 2. Hubungan dengan rencana v1 dan requirement, 3. Threat model (supply chain), 4. Milestone A — Release pipeline multi-target, 5. Milestone B — Installer & updater binary-first (+12 more)

### Community 14 - "Handoff & Bug Report"
Cohesion: 0.11
Nodes (19): 1. Status Ringkas, 2. Progress Lengkap, 3.1 Gejala, 3.2 Root cause (terbukti empiris), 3.3 Fix (`src/pty.rs`, § OPEN PTY + FORK), 3.4 Verifikasi, 3. BUG KRITIS BARU SAJA DIFIX — JANGAN DI-REGRESI, 4.1 [SELESAI] Hardening `src/pty.rs` (+11 more)

### Community 15 - "Auth Test Suite"
Cohesion: 0.27
Nodes (16): Milestone A: Auth + TLS, Checklist Milestone A: Auth + TLS (A.1-A.13), pair_body(), String, start_auth_server(), test_auth_001_unauthorized_request_rejected(), test_auth_004_brute_force_rate_limited_429(), test_auth_006_mismatched_origin_rejected_403() (+8 more)

### Community 16 - "README Documentation"
Cohesion: 0.12
Nodes (16): 🛠️ Building from Source, ✨ Features, 📥 Install (Create), 📜 License, Mux Web UI ⚡, 📊 Performance & Size Benchmarks, Prerequisites, ⚡ Quick 1-Line Commands (Create / Update / Delete) (+8 more)

### Community 17 - "Protocol Framing"
Cohesion: 0.20
Nodes (12): Bytes, CodecError, decode_frame(), encode_frame(), Frame, Display, Error, Formatter (+4 more)

### Community 18 - "Requirements Traceability"
Cohesion: 0.15
Nodes (13): Single-Use Bootstrap Secret Pairing, File Explorer, PTY Interactive Terminal (xterm.js), Security & Authentication Model, AUTH Requirement Family, FS Requirement Family, LAN Requirement Family, LIFE Requirement Family (+5 more)

### Community 19 - "Distribution & Checksum"
Cohesion: 0.33
Nodes (11): cross-check Job (Android ARM64 cargo check), install.sh, Backup & Auto-Rollback (mux-web.bak), Binary-first Distribution Principle, SHA-256 Checksum Verification, DIST Requirement Family (DIST-001..014), v0.2.1 Plan: Distribution (prebuilt binary + installer), v0.2.1 Milestone A: Multi-target Release Pipeline (+3 more)

### Community 20 - "Implementation Checklists"
Cohesion: 0.31
Nodes (8): v0.2 Implementation Checklist & Verification Matrix, TDD Execution Loop (Red-Green-Refactor), MUX_WEB_* Configuration (BASE_URL/VERSION/INSTALL_DIR), v0.2.1 Implementation Checklist & Verification Matrix, CI installer-test Job (4 scenarios), TDD Execution Loop (scenario-based), uninstall.sh, update.sh

### Community 21 - "v1 Milestone Checklists"
Cohesion: 0.22
Nodes (9): Definition of Done (DoD) Final Audit, Milestone 0 — Baseline Infrastructure & Budget Gate, Milestone 1 — Vertical Slice: PTY Terminal Backend & xterm.js, Milestone 2 — Desktop Window Manager, Launcher & Multi-Window, Milestone 3 — File Explorer & Lightweight Text Editor, Milestone 4 — Control Center, Security Hardening & LAN Pairing, Milestone 5 — Optimization, Low-End Performance & Release Artifacts, Mux Web UI — Implementation Checklist & Verification Matrix (+1 more)

### Community 22 - "v0.2 Checklist Steps"
Cohesion: 0.22
Nodes (9): Langkah 1 — Harness test + regression (harus hijau sejak awal), Langkah 2 — Milestone A: Auth + TLS, Langkah 3 — Milestone B: Session persistence, Langkah 4 — CI, Langkah 5-6 — Traceability, README, update.sh, Langkah 7 — Rilis, Mux Web UI — v0.2 Implementation Checklist & Verification Matrix, Open questions yang diputuskan saat implementasi (+1 more)

### Community 23 - "v0.2.1 Checklist Steps"
Cohesion: 0.25
Nodes (8): Langkah 1 — Milestone A: Release pipeline multi-target, Langkah 2 — Milestone B: `install.sh` binary-first, Langkah 3 — Milestone B: `update.sh` binary-first, Langkah 4 — CI `installer-test` (DIST-013), Langkah 5 — Traceability, README, rilis, Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix, Open questions yang diputuskan saat implementasi, TDD Execution Loop Standard

### Community 24 - "CI Pipelines"
Cohesion: 0.57
Nodes (7): budget-check Job (check_budget.sh), release Job (artifact + checksum upload), test-and-lint Job (fmt, clippy, tests), CI & Release Workflow, check_budget.sh Budget Gate Script, Checklist Langkah 4: CI (C.1-C.6), CI Requirement Family

### Community 25 - "Static Assets"
Cohesion: 0.40
Nodes (4): Assets, Response, static_handler(), Uri

## Knowledge Gaps
- **205 isolated node(s):** `install.sh script`, `check_budget.sh script`, `uninstall.sh script`, `name`, `private` (+200 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `v0.2 Implementation Checklist & Verification Matrix` connect `Implementation Checklists` to `Session Persistence Milestone`, `Auth Test Suite`, `Requirements Traceability`, `Distribution & Checksum`, `v0.2 Checklist Steps`, `CI Pipelines`, `Spec Documents Index`?**
  _High betweenness centrality (0.187) - this node is a cross-community bridge._
- **Why does `Handoff 001 - Progress & Backlog (v0.2)` connect `Session Persistence Milestone` to `HTTP Server & Router`, `PTY & Fork`, `Handoff & Bug Report`, `Auth Test Suite`, `Implementation Checklists`, `CI Pipelines`, `Spec Documents Index`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `v0.2.1 Plan: Distribution (prebuilt binary + installer)` connect `Distribution & Checksum` to `v0.2.1 Distribution Spec`, `Requirements Traceability`, `Implementation Checklists`, `CI Pipelines`, `Spec Documents Index`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **What connects `install.sh script`, `check_budget.sh script`, `uninstall.sh script` to the rest of the system?**
  _205 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `HTTP Request Handling` be split into smaller, more focused modules?**
  _Cohesion score 0.10588972431077694 - nodes in this community are weakly interconnected._
- **Should `Session Persistence Milestone` be split into smaller, more focused modules?**
  _Cohesion score 0.08766233766233766 - nodes in this community are weakly interconnected._
- **Should `HTTP Server & Router` be split into smaller, more focused modules?**
  _Cohesion score 0.0988235294117647 - nodes in this community are weakly interconnected._