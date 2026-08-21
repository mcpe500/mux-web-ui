# Graph Report - mux-web-ui  (2026-08-21)

## Corpus Check
- 68 files · ~63,642 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 977 nodes · 1768 edges · 53 communities (50 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 67 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9e77d30e`
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
- Config
- Mux Web UI — v0.5 plan: Workspace & Desktop System + File Manager (Windows Explorer) + Editor (VS Code) + Browser
- Mux Web UI — v0.2.1 plan: Distribution (prebuilt binary + installer tanpa Rust)
- 4. SISA PEKERJAAN — Apa yang Belum Selesai
- auth_tests.rs
- Mux Web UI — v0.3 plan: Terminal Resizing & Window Control Hardening
- ShareRegistry
- Mux Web UI — Implementation Checklist & Verification Matrix
- Handoff 003 — Security Audit v0.3 & Evaluasi v0.4 Developer Suite
- files.rs
- Mux Web UI — v0.4 plan: Developer Suite (Git UI, Package Center, Read-only Share Links, Archive Manager)
- v0.2.1 Plan: Distribution (prebuilt binary + installer)
- protocol.rs
- Companion Checklist — v0.4 Plan: Developer Suite
- static_handler
- install.sh
- check_budget.sh
- uninstall.sh
- update.sh
- Mux Web UI — v0.3 Implementation Checklist & Verification Matrix
- Handoff 002 — Terminal Resizing & Window Control Hardening (v0.3)
- 1. Milestone A — Git UI (`GIT-001..010`) — v0.4.1
- ArchiveError
- Mux Web UI ⚡
- GitError
- archive_tests.rs
- Requirement Traceability Matrix
- Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix
- packages.rs
- CI & Release Workflow
- git_tests.rs
- 0. Milestone PRE — Hardening Gate (SEC-004..006) — WAJIB PERTAMA
- ArchiveModal.tsx
- start_health_server
- resize_tests.rs
- Mux Web UI — v0.2 Implementation Checklist & Verification Matrix
- session_tests.rs

## God Nodes (most connected - your core abstractions)
1. `AppState` - 43 edges
2. `SessionRegistry` - 28 edges
3. `start_health_server()` - 28 edges
4. `TestServer` - 25 edges
5. `ShareRegistry` - 19 edges
6. `PtySession` - 17 edges
7. `TerminalSessionInstance` - 17 edges
8. `compilerOptions` - 17 edges
9. `AuthState` - 16 edges
10. `Mux Web UI — v0.4 plan: Developer Suite (Git UI, Package Center, Read-only Share Links, Archive Manager)` - 16 edges

## Surprising Connections (you probably didn't know these)
- `test_edit_001_file_read_and_atomic_write()` --calls--> `create_router()`  [INFERRED]
  tests/editor_tests.rs → src/http.rs
- `SESS Requirement Family` --conceptually_related_to--> `RingBuffer`  [INFERRED]
  tests/traceability.md → src/session.rs
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

## Communities (53 total, 3 thin omitted)

### Community 0 - "http.rs"
Cohesion: 0.08
Nodes (86): Body, ConnectInfo, HeaderMap, IntoResponse, Json, Next, Query, Request (+78 more)

### Community 1 - "SessionRegistry"
Cohesion: 0.08
Nodes (40): AtomicBool, AtomicU64, Handoff 001 - Progress & Backlog (v0.2), LIFE-002 Orphan Child Cleanup, Milestone B: Session Persistence, Checklist Milestone B: Session Persistence (B.1-B.9), AttachError, AttachInfo (+32 more)

### Community 2 - "TestServer"
Cohesion: 0.12
Nodes (22): Client, JoinHandle, MaybeTlsStream, TcpStream, authed_ws_connect(), Drop, Option, PathBuf (+14 more)

### Community 3 - "auth.rs"
Cohesion: 0.11
Nodes (28): auth(), AuthConfig, AuthError, AuthInner, AuthState, ClientInfo, ClientSession, constant_time_eq() (+20 more)

### Community 4 - "Mux Web UI — TDD and verification plan"
Cohesion: 0.05
Nodes (41): 10. TDD sequence per milestone, 11. Manual exploratory charters, 12. Evidence dan definition of tested, 1. Tujuan, 2. Aturan kerja TDD, 3. Test ID dan traceability, 4. Test stack, 5. Test architecture dan determinism (+33 more)

### Community 5 - "Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI"
Cohesion: 0.06
Nodes (34): 10. Keputusan desain dan open questions, 11. Bukan scope v0.2, 12. Urutan pengerjaan (TDD), 13. Risiko Termux/Android untuk auth, 14. Definition of done v0.2, 1.1 Fakta kode v0.1 yang menjadi titik awal, 1.2 Scope v0.2, 1. Latar belakang dan risiko (+26 more)

### Community 6 - "DesktopCanvas.tsx"
Cohesion: 0.07
Nodes (32): SPA mount point (#app + main.tsx), App(), BrowserView(), Tab, FsEntry, FsRoot, TabData, TextEditorView() (+24 more)

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

### Community 11 - "Config"
Cohesion: 0.08
Nodes (33): Box, Config, IpAddr, Option, PathBuf, String, generate_self_signed_cert(), main() (+25 more)

### Community 12 - "Mux Web UI — v0.5 plan: Workspace & Desktop System + File Manager (Windows Explorer) + Editor (VS Code) + Browser"
Cohesion: 0.07
Nodes (28): 10. Urutan TDD (Setelah Approve), 11. DoD v0.5, 1.1 Fakta Kode v0.4 sebagai Titik Awal, 1. Latar Belakang dan Risiko, 2. Hubungan dengan Rencana dan Requirement, 3. Threat Model, 4. Milestone A — Workspace System (`WS-001..006`), 5. Milestone B — Desktop System (`DESK-001..006`) (+20 more)

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
Cohesion: 0.15
Nodes (13): 1.1 Fakta Kode Titik Awal, 1. Latar Belakang dan Fakta Kode, 2. Hubungan dengan Rencana dan Requirement, 3. Threat Model, 4. Milestone A — Backend Dimension Clamping & Robustness, 5. Milestone B — Frontend Window Resize Handles & Debounce, 6. Milestone C — Automated Test Suite & Traceability, 7. Definition of Done (DoD) (+5 more)

### Community 17 - "ShareRegistry"
Cohesion: 0.11
Nodes (23): Err, FromStr, Arc, Default, Duration, HashMap, Instant, Mutex (+15 more)

### Community 18 - "Mux Web UI — Implementation Checklist & Verification Matrix"
Cohesion: 0.22
Nodes (9): Definition of Done (DoD) Final Audit, Milestone 0 — Baseline Infrastructure & Budget Gate, Milestone 1 — Vertical Slice: PTY Terminal Backend & xterm.js, Milestone 2 — Desktop Window Manager, Launcher & Multi-Window, Milestone 3 — File Explorer & Lightweight Text Editor, Milestone 4 — Control Center, Security Hardening & LAN Pairing, Milestone 5 — Optimization, Low-End Performance & Release Artifacts, Mux Web UI — Implementation Checklist & Verification Matrix (+1 more)

### Community 19 - "Handoff 003 — Security Audit v0.3 & Evaluasi v0.4 Developer Suite"
Cohesion: 0.20
Nodes (10): 1. Status Ringkas, 2. Temuan Audit — Aksi Wajib, 3. v0.4 — Evaluasi & Phasing Baru, 4. Sisa Pekerjaan (Next Agent — Build Mode), 5. Rekomendasi Urutan & Catatan Teknis, 6. Verifikasi Handoff Ini, Handoff 003 — Security Audit v0.3 & Evaluasi v0.4 Developer Suite, HIGH (Blokir v0.4 Fitur) (+2 more)

### Community 20 - "files.rs"
Cohesion: 0.39
Nodes (8): DirectoryListing, FileEntry, FsAction, list_directory(), Path, Result, String, Vec

### Community 21 - "Mux Web UI — v0.4 plan: Developer Suite (Git UI, Package Center, Read-only Share Links, Archive Manager)"
Cohesion: 0.04
Nodes (45): 10. Konfigurasi Baru (CLI Flags & Env Vars), 11. Bukan Scope (Out of Scope v0.4), 12.1 Apa Maunya v0.4?, 12.2 Apakah Sudah Cocok? — 85% Ya, 12.3 Apakah Sudah Sempurna? — Belum (Gap Audit), 12.4 Rencana Fase Bertahap (Keputusan: Opsi A — Recommended), 12.5 Alternatif Opsi B (Monolit — Tidak Dipilih), 12. Evaluasi Kelayakan v0.4: Apakah Cocok & Sempurna? (+37 more)

### Community 22 - "v0.2.1 Plan: Distribution (prebuilt binary + installer)"
Cohesion: 0.22
Nodes (17): install.sh, v0.2 Implementation Checklist & Verification Matrix, TDD Execution Loop (Red-Green-Refactor), Backup & Auto-Rollback (mux-web.bak), Binary-first Distribution Principle, SHA-256 Checksum Verification, DIST Requirement Family (DIST-001..014), v0.2.1 Plan: Distribution (prebuilt binary + installer) (+9 more)

### Community 23 - "protocol.rs"
Cohesion: 0.20
Nodes (12): Bytes, CodecError, decode_frame(), encode_frame(), Frame, Display, Error, Formatter (+4 more)

### Community 24 - "Companion Checklist — v0.4 Plan: Developer Suite"
Cohesion: 0.15
Nodes (13): 2. Milestone B — Package Center (`PKG-001..008`) — v0.4.2 (Terakhir, Non-Sudo Dulu), 3. Milestone C — Read-only Share Links (`SHR-001..008`) — v0.4.0 (Bersama Archive), 4. Milestone D — Archive Manager (`ARC-001..008`) — v0.4.0 (Bersama Share), 5. Milestone E — Desktop Frontend & UI (`WIN-010..013`), 6. Definition of Done & Quality Checks (Per Fase + Final), Backend Implementation (`src/archive.rs` & `src/http.rs` / `src/routes/archive.rs`), Backend Implementation (`src/packages.rs` & `src/http.rs` / `src/routes/packages.rs`), Backend Implementation (`src/share.rs` & `src/http.rs` / `src/routes/share.rs`) (+5 more)

### Community 25 - "static_handler"
Cohesion: 0.40
Nodes (4): Assets, Response, static_handler(), Uri

### Community 27 - "install.sh"
Cohesion: 0.67
Nodes (5): die(), fallback_source(), install_from_release(), install.sh script, usage()

### Community 31 - "update.sh"
Cohesion: 0.60
Nodes (3): die(), update.sh script, usage()

### Community 34 - "Mux Web UI — v0.3 Implementation Checklist & Verification Matrix"
Cohesion: 0.40
Nodes (5): Langkah 1 — Milestone A: Backend Dimension Clamping & Robustness, Langkah 2 — Milestone B: Frontend Window Resize Handles & Debouncing, Langkah 3 — Milestone C: Traceability, Documentation & Graph Update, Mux Web UI — v0.3 Implementation Checklist & Verification Matrix, TDD Execution Loop Standard

### Community 35 - "Handoff 002 — Terminal Resizing & Window Control Hardening (v0.3)"
Cohesion: 0.67
Nodes (3): 1. Status Ringkas, 2. Git & Release Status, Handoff 002 — Terminal Resizing & Window Control Hardening (v0.3)

### Community 36 - "1. Milestone A — Git UI (`GIT-001..010`) — v0.4.1"
Cohesion: 0.67
Nodes (3): 1. Milestone A — Git UI (`GIT-001..010`) — v0.4.1, Backend Implementation (`src/git.rs` & `src/http.rs` / `src/routes/git.rs`), Test Suite (`tests/git_tests.rs`)

### Community 37 - "ArchiveError"
Cohesion: 0.17
Nodes (18): ArchiveEntry, ArchiveError, ArchiveInspect, ArchiveService, ExtractBudgets, is_symlink_target_safe(), Default, Display (+10 more)

### Community 38 - "Mux Web UI ⚡"
Cohesion: 0.12
Nodes (16): 🛠️ Building from Source, ✨ Features, 📥 Install (Create), 📜 License, Mux Web UI ⚡, 📊 Performance & Size Benchmarks, Prerequisites, ⚡ Quick 1-Line Commands (Create / Update / Delete) (+8 more)

### Community 39 - "GitError"
Cohesion: 0.24
Nodes (8): GitError, GitService, Display, Formatter, Path, Result, String, Value

### Community 40 - "archive_tests.rs"
Cohesion: 0.28
Nodes (9): create_sample_tar_gz(), create_sample_zip(), create_traversal_zip(), Path, PathBuf, test_arc_001_inspect_zip_and_tar(), test_arc_002_extract_zip_clean(), test_arc_003_extract_tar_gz_clean() (+1 more)

### Community 41 - "Requirement Traceability Matrix"
Cohesion: 0.20
Nodes (11): Single-Use Bootstrap Secret Pairing, File Explorer, PTY Interactive Terminal (xterm.js), Security & Authentication Model, AUTH Requirement Family, FS Requirement Family, LAN Requirement Family, PERF Requirement Family (+3 more)

### Community 42 - "Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix"
Cohesion: 0.25
Nodes (8): Langkah 1 — Milestone A: Release pipeline multi-target, Langkah 2 — Milestone B: `install.sh` binary-first, Langkah 3 — Milestone B: `update.sh` binary-first, Langkah 4 — CI `installer-test` (DIST-013), Langkah 5 — Traceability, README, rilis, Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix, Open questions yang diputuskan saat implementasi, TDD Execution Loop Standard

### Community 43 - "packages.rs"
Cohesion: 0.20
Nodes (8): PackageBackend, PackageBackendKind, PackageInfo, PackageService, Display, Formatter, Result, String

### Community 45 - "CI & Release Workflow"
Cohesion: 0.42
Nodes (9): budget-check Job (check_budget.sh), cross-check Job (Android ARM64 cargo check), release Job (artifact + checksum upload), test-and-lint Job (fmt, clippy, tests), CI & Release Workflow, check_budget.sh Budget Gate Script, Checklist Langkah 4: CI (C.1-C.6), 4-Target Build Matrix (gnu/musl/arm64/android) (+1 more)

### Community 46 - "git_tests.rs"
Cohesion: 0.36
Nodes (5): init_git_repo(), Path, test_git_001_status_porcelain_parsing(), test_git_002_diff_unified_parser(), test_git_005_branch_list()

### Community 47 - "0. Milestone PRE — Hardening Gate (SEC-004..006) — WAJIB PERTAMA"
Cohesion: 0.67
Nodes (3): 0. Milestone PRE — Hardening Gate (SEC-004..006) — WAJIB PERTAMA, Backend Implementation (`src/session.rs` & `src/http.rs` & `src/auth.rs` & `src/routes/*`), Test Suite Baru (`tests/security_tests.rs`)

### Community 49 - "start_health_server"
Cohesion: 0.14
Nodes (13): start_health_server(), test_pkg_002_list_installed_packages_via_http(), test_pkg_003_search_repository_packages(), test_pkg_005_search_injection_blocked_http(), test_pkg_backend_http(), test_sec_004_security_headers_on_all_routes(), test_sec_005_csrf_token_required_for_post(), test_sec_006_real_ip_rate_limit() (+5 more)

### Community 50 - "resize_tests.rs"
Cohesion: 0.41
Nodes (13): connect_ws(), create_terminal_with_size(), get_terminal_metadata(), request_attach(), Option, Value, Ws, send_resize() (+5 more)

### Community 51 - "Mux Web UI — v0.2 Implementation Checklist & Verification Matrix"
Cohesion: 0.22
Nodes (9): Langkah 1 — Harness test + regression (harus hijau sejak awal), Langkah 2 — Milestone A: Auth + TLS, Langkah 3 — Milestone B: Session persistence, Langkah 4 — CI, Langkah 5-6 — Traceability, README, update.sh, Langkah 7 — Rilis, Mux Web UI — v0.2 Implementation Checklist & Verification Matrix, Open questions yang diputuskan saat implementasi (+1 more)

### Community 52 - "session_tests.rs"
Cohesion: 0.34
Nodes (18): connect(), create_terminal(), read_kick_message(), read_until(), read_until_exit(), request_attach(), String, Value (+10 more)

## Knowledge Gaps
- **296 isolated node(s):** `check_budget.sh script`, `Assets`, `uninstall.sh script`, `name`, `private` (+291 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `v0.2 Implementation Checklist & Verification Matrix` connect `v0.2.1 Plan: Distribution (prebuilt binary + installer)` to `SessionRegistry`, `Requirement Traceability Matrix`, `000a.plan-test.md`, `CI & Release Workflow`, `auth_tests.rs`, `Mux Web UI — v0.2 Implementation Checklist & Verification Matrix`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Why does `Handoff 001 - Progress & Backlog (v0.2)` connect `SessionRegistry` to `TestServer`, `PtySession`, `000a.plan-test.md`, `CI & Release Workflow`, `4. SISA PEKERJAAN — Apa yang Belum Selesai`, `auth_tests.rs`, `v0.2.1 Plan: Distribution (prebuilt binary + installer)`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `TestServer` connect `TestServer` to `http.rs`, `SessionRegistry`, `auth_tests.rs`, `start_health_server`, `resize_tests.rs`, `session_tests.rs`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Are the 25 inferred relationships involving `start_health_server()` (e.g. with `test_pkg_002_list_installed_packages_via_http()` and `test_pkg_003_search_repository_packages()`) actually correct?**
  _`start_health_server()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **What connects `check_budget.sh script`, `Assets`, `uninstall.sh script` to the rest of the system?**
  _296 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `http.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.08340016038492382 - nodes in this community are weakly interconnected._
- **Should `SessionRegistry` be split into smaller, more focused modules?**
  _Cohesion score 0.08287961282516637 - nodes in this community are weakly interconnected._