# Graph Report - mux-web-ui  (2026-08-19)

## Corpus Check
- 49 files · ~41,553 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 696 nodes · 1243 edges · 35 communities (33 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9fded3f9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- http.rs
- SessionRegistry
- TestServer
- auth.rs
- Mux Web UI — TDD and verification plan
- Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI
- DesktopCanvas.tsx
- Mux Web UI — implementation plan
- PtySession
- package.json
- compilerOptions
- AllowedRoots
- Config
- Mux Web UI — v0.2.1 plan: Distribution (prebuilt binary + installer tanpa Rust)
- 4. SISA PEKERJAAN — Apa yang Belum Selesai
- auth_tests.rs
- Mux Web UI — v0.3 plan: Terminal Resizing & Window Control Hardening
- protocol.rs
- Mux Web UI — v0.2 Implementation Checklist & Verification Matrix
- v0.2.1 Plan: Distribution (prebuilt binary + installer)
- files.rs
- Mux Web UI — Implementation Checklist & Verification Matrix
- Mux Web UI ⚡
- static_handler
- install.sh
- check_budget.sh
- uninstall.sh
- update.sh
- Requirement Traceability Matrix
- CI & Release Workflow
- Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix
- v0.2 Implementation Checklist & Verification Matrix

## God Nodes (most connected - your core abstractions)
1. `SessionRegistry` - 28 edges
2. `AppState` - 26 edges
3. `TestServer` - 25 edges
4. `PtySession` - 17 edges
5. `TerminalSessionInstance` - 17 edges
6. `compilerOptions` - 17 edges
7. `AuthState` - 16 edges
8. `start_health_server()` - 16 edges
9. `start_server()` - 15 edges
10. `Mux Web UI — implementation plan` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Milestone B: Session Persistence` --references--> `RingBuffer`  [EXTRACTED]
  spec/handoff/001.progress-and-backlog.md → src/session.rs
- `Checklist Milestone B: Session Persistence (B.1-B.9)` --references--> `RingBuffer`  [EXTRACTED]
  spec/specs/001b.plan-checklist.md → src/session.rs
- `SESS Requirement Family` --conceptually_related_to--> `RingBuffer`  [INFERRED]
  tests/traceability.md → src/session.rs
- `Milestone B: Session Persistence` --references--> `SessionRegistry`  [EXTRACTED]
  spec/handoff/001.progress-and-backlog.md → src/session.rs
- `Checklist Milestone B: Session Persistence (B.1-B.9)` --references--> `SessionRegistry`  [EXTRACTED]
  spec/specs/001b.plan-checklist.md → src/session.rs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **v0.2.1 Distribution Workstream** — spec_specs_002_plan_v0_2_1_milestone_a_release_pipeline, spec_specs_002_plan_v0_2_1_milestone_b_installer, spec_specs_002_plan_v0_2_1_dist_family, install_sh, update_sh [EXTRACTED 1.00]
- **v0.2 Milestone B Session Persistence Workstream** — spec_handoff_001_progress_and_backlog_milestone_b, src_session_sessionregistry, src_session_ringbuffer, spec_handoff_001_progress_and_backlog_life_002_orphan_cleanup, tests_session_tests [INFERRED 0.85]
- **CI Release Gate (test-and-lint + cross-check + budget-check required)** — _github_workflows_ci_testandlint, _github_workflows_ci_crosscheck, _github_workflows_ci_budgetcheck, _github_workflows_ci_release [EXTRACTED 1.00]

## Communities (35 total, 2 thin omitted)

### Community 0 - "http.rs"
Cohesion: 0.09
Nodes (60): Body, HeaderMap, IntoResponse, Json, Next, Query, Request, Router (+52 more)

### Community 1 - "SessionRegistry"
Cohesion: 0.09
Nodes (35): AtomicBool, AtomicU64, AttachError, AttachInfo, PendingAttach, rand_id(), RingBuffer, Arc (+27 more)

### Community 2 - "TestServer"
Cohesion: 0.09
Nodes (54): Client, JoinHandle, MaybeTlsStream, TcpStream, authed_ws_connect(), Drop, Option, PathBuf (+46 more)

### Community 3 - "auth.rs"
Cohesion: 0.12
Nodes (27): auth(), AuthConfig, AuthError, AuthInner, AuthState, ClientInfo, ClientSession, constant_time_eq() (+19 more)

### Community 4 - "Mux Web UI — TDD and verification plan"
Cohesion: 0.05
Nodes (41): 10. TDD sequence per milestone, 11. Manual exploratory charters, 12. Evidence dan definition of tested, 1. Tujuan, 2. Aturan kerja TDD, 3. Test ID dan traceability, 4. Test stack, 5. Test architecture dan determinism (+33 more)

### Community 5 - "Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI"
Cohesion: 0.06
Nodes (34): 10. Keputusan desain dan open questions, 11. Bukan scope v0.2, 12. Urutan pengerjaan (TDD), 13. Risiko Termux/Android untuk auth, 14. Definition of done v0.2, 1.1 Fakta kode v0.1 yang menjadi titik awal, 1.2 Scope v0.2, 1. Latar belakang dan risiko (+26 more)

### Community 6 - "DesktopCanvas.tsx"
Cohesion: 0.09
Nodes (24): SPA mount point (#app + main.tsx), App(), FsEntry, FsRoot, TabData, TextEditorView(), TextEditorViewProps, DirectoryListing (+16 more)

### Community 7 - "Mux Web UI — implementation plan"
Cohesion: 0.06
Nodes (31): 10. Strategi test, 11. Definition of done v1, 12. Risiko khusus Android/Termux, 13. Aplikasi lanjutan setelah v1, 14. Keputusan yang sengaja ditunda, 1. Tujuan, 2. Keputusan stack, 3. Batas produk (+23 more)

### Community 8 - "PtySession"
Cohesion: 0.10
Nodes (18): File, OwnedFd, Pid, forkpty fd-table Inheritance Bug, PTY Fork Hardening (manual open + close_range), clamp_dimensions(), PtySession, reap_exit_code() (+10 more)

### Community 9 - "package.json"
Cohesion: 0.08
Nodes (25): preact, @preact/preset-vite, typescript, vite, vitest, dependencies, preact, @xterm/addon-fit (+17 more)

### Community 10 - "compilerOptions"
Cohesion: 0.09
Nodes (22): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+14 more)

### Community 11 - "AllowedRoots"
Cohesion: 0.18
Nodes (17): AllowedRoots, PathError, Display, Error, Formatter, HashMap, PathBuf, Result (+9 more)

### Community 12 - "Config"
Cohesion: 0.15
Nodes (15): Box, Config, IpAddr, Option, PathBuf, String, generate_self_signed_cert(), main() (+7 more)

### Community 13 - "Mux Web UI — v0.2.1 plan: Distribution (prebuilt binary + installer tanpa Rust)"
Cohesion: 0.10
Nodes (20): 10. Definition of done v0.2.1, 1.1 Fakta kode v0.2 yang menjadi titik awal, 1.2 Scope v0.2.1, 1. Latar belakang dan risiko, 2. Hubungan dengan rencana v1 dan requirement, 3. Threat model (supply chain), 4. Milestone A — Release pipeline multi-target, 5. Milestone B — Installer & updater binary-first (+12 more)

### Community 14 - "4. SISA PEKERJAAN — Apa yang Belum Selesai"
Cohesion: 0.11
Nodes (19): 1. Status Ringkas, 2. Progress Lengkap, 3.1 Gejala, 3.2 Root cause (terbukti empiris), 3.3 Fix (`src/pty.rs`, § OPEN PTY + FORK), 3.4 Verifikasi, 3. BUG KRITIS BARU SAJA DIFIX — JANGAN DI-REGRESI, 4.1 [SELESAI] Hardening `src/pty.rs` (+11 more)

### Community 15 - "auth_tests.rs"
Cohesion: 0.27
Nodes (16): Milestone A: Auth + TLS, Checklist Milestone A: Auth + TLS (A.1-A.13), pair_body(), String, start_auth_server(), test_auth_001_unauthorized_request_rejected(), test_auth_004_brute_force_rate_limited_429(), test_auth_006_mismatched_origin_rejected_403() (+8 more)

### Community 16 - "Mux Web UI — v0.3 plan: Terminal Resizing & Window Control Hardening"
Cohesion: 0.09
Nodes (21): 1. Status Ringkas, 2. Git & Release Status, Handoff 002 — Terminal Resizing & Window Control Hardening (v0.3), 1.1 Fakta Kode Titik Awal, 1. Latar Belakang dan Fakta Kode, 2. Hubungan dengan Rencana dan Requirement, 3. Threat Model, 4. Milestone A — Backend Dimension Clamping & Robustness (+13 more)

### Community 17 - "protocol.rs"
Cohesion: 0.20
Nodes (12): Bytes, CodecError, decode_frame(), encode_frame(), Frame, Display, Error, Formatter (+4 more)

### Community 18 - "Mux Web UI — v0.2 Implementation Checklist & Verification Matrix"
Cohesion: 0.22
Nodes (9): Langkah 1 — Harness test + regression (harus hijau sejak awal), Langkah 2 — Milestone A: Auth + TLS, Langkah 3 — Milestone B: Session persistence, Langkah 4 — CI, Langkah 5-6 — Traceability, README, update.sh, Langkah 7 — Rilis, Mux Web UI — v0.2 Implementation Checklist & Verification Matrix, Open questions yang diputuskan saat implementasi (+1 more)

### Community 19 - "v0.2.1 Plan: Distribution (prebuilt binary + installer)"
Cohesion: 0.25
Nodes (15): install.sh, Backup & Auto-Rollback (mux-web.bak), Binary-first Distribution Principle, SHA-256 Checksum Verification, DIST Requirement Family (DIST-001..014), v0.2.1 Plan: Distribution (prebuilt binary + installer), v0.2.1 Milestone A: Multi-target Release Pipeline, v0.2.1 Milestone B: Binary-first Installer & Updater (+7 more)

### Community 20 - "files.rs"
Cohesion: 0.33
Nodes (9): DirectoryListing, FileEntry, FsAction, list_directory(), Path, Result, String, Vec (+1 more)

### Community 21 - "Mux Web UI — Implementation Checklist & Verification Matrix"
Cohesion: 0.22
Nodes (9): Definition of Done (DoD) Final Audit, Milestone 0 — Baseline Infrastructure & Budget Gate, Milestone 1 — Vertical Slice: PTY Terminal Backend & xterm.js, Milestone 2 — Desktop Window Manager, Launcher & Multi-Window, Milestone 3 — File Explorer & Lightweight Text Editor, Milestone 4 — Control Center, Security Hardening & LAN Pairing, Milestone 5 — Optimization, Low-End Performance & Release Artifacts, Mux Web UI — Implementation Checklist & Verification Matrix (+1 more)

### Community 22 - "Mux Web UI ⚡"
Cohesion: 0.12
Nodes (16): 🛠️ Building from Source, ✨ Features, 📥 Install (Create), 📜 License, Mux Web UI ⚡, 📊 Performance & Size Benchmarks, Prerequisites, ⚡ Quick 1-Line Commands (Create / Update / Delete) (+8 more)

### Community 25 - "static_handler"
Cohesion: 0.40
Nodes (4): Assets, Response, static_handler(), Uri

### Community 27 - "install.sh"
Cohesion: 0.67
Nodes (5): die(), fallback_source(), install_from_release(), install.sh script, usage()

### Community 31 - "update.sh"
Cohesion: 0.60
Nodes (3): die(), update.sh script, usage()

### Community 39 - "Requirement Traceability Matrix"
Cohesion: 0.17
Nodes (12): Single-Use Bootstrap Secret Pairing, File Explorer, PTY Interactive Terminal (xterm.js), Security & Authentication Model, AUTH Requirement Family, FS Requirement Family, LAN Requirement Family, LIFE Requirement Family (+4 more)

### Community 41 - "CI & Release Workflow"
Cohesion: 0.42
Nodes (9): budget-check Job (check_budget.sh), cross-check Job (Android ARM64 cargo check), release Job (artifact + checksum upload), test-and-lint Job (fmt, clippy, tests), CI & Release Workflow, check_budget.sh Budget Gate Script, Checklist Langkah 4: CI (C.1-C.6), 4-Target Build Matrix (gnu/musl/arm64/android) (+1 more)

### Community 42 - "Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix"
Cohesion: 0.25
Nodes (8): Langkah 1 — Milestone A: Release pipeline multi-target, Langkah 2 — Milestone B: `install.sh` binary-first, Langkah 3 — Milestone B: `update.sh` binary-first, Langkah 4 — CI `installer-test` (DIST-013), Langkah 5 — Traceability, README, rilis, Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix, Open questions yang diputuskan saat implementasi, TDD Execution Loop Standard

### Community 43 - "v0.2 Implementation Checklist & Verification Matrix"
Cohesion: 0.36
Nodes (6): Handoff 001 - Progress & Backlog (v0.2), LIFE-002 Orphan Child Cleanup, Milestone B: Session Persistence, v0.2 Implementation Checklist & Verification Matrix, Checklist Milestone B: Session Persistence (B.1-B.9), TDD Execution Loop (Red-Green-Refactor)

## Knowledge Gaps
- **217 isolated node(s):** `check_budget.sh script`, `Assets`, `uninstall.sh script`, `name`, `private` (+212 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `v0.2 Implementation Checklist & Verification Matrix` connect `v0.2 Implementation Checklist & Verification Matrix` to `Requirement Traceability Matrix`, `CI & Release Workflow`, `auth_tests.rs`, `Mux Web UI — v0.2 Implementation Checklist & Verification Matrix`, `v0.2.1 Plan: Distribution (prebuilt binary + installer)`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `Handoff 001 - Progress & Backlog (v0.2)` connect `v0.2 Implementation Checklist & Verification Matrix` to `TestServer`, `PtySession`, `CI & Release Workflow`, `4. SISA PEKERJAAN — Apa yang Belum Selesai`, `auth_tests.rs`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Why does `TestServer` connect `TestServer` to `http.rs`, `SessionRegistry`, `v0.2 Implementation Checklist & Verification Matrix`, `auth_tests.rs`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **What connects `check_budget.sh script`, `Assets`, `uninstall.sh script` to the rest of the system?**
  _217 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `http.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.09360126916975145 - nodes in this community are weakly interconnected._
- **Should `SessionRegistry` be split into smaller, more focused modules?**
  _Cohesion score 0.09143686502177069 - nodes in this community are weakly interconnected._
- **Should `TestServer` be split into smaller, more focused modules?**
  _Cohesion score 0.088841882601798 - nodes in this community are weakly interconnected._