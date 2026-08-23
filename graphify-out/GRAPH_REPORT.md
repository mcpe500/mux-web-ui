# Graph Report - mux-web-ui  (2026-08-23)

## Corpus Check
- 88 files · ~90,144 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1250 nodes · 2151 edges · 78 communities (65 shown, 13 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 76 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c7e5620e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- http.rs
- SessionRegistry
- TextEditorView.tsx
- auth.rs
- Mux Web UI — TDD and verification plan
- Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI
- DesktopCanvas.tsx
- Mux Web UI — implementation plan
- PtySession
- package.json
- compilerOptions
- .new
- Mux Web UI — v0.5 plan: Workspace & Desktop System + File Manager (Windows Explorer Sempurna) + Editor (VS Code Sempurna) + Browser — Lebih Baik & Tidak Ngelag
- Mux Web UI — v0.2.1 plan: Distribution (prebuilt binary + installer tanpa Rust)
- 4. SISA PEKERJAAN — Apa yang Belum Selesai
- auth_tests.rs
- Mux Web UI — v0.3 plan: Terminal Resizing & Window Control Hardening
- ShareRegistry
- Mux Web UI — Implementation Checklist & Verification Matrix
- Handoff 003 — Security Audit v0.3 & Evaluasi v0.4 Developer Suite
- Ws
- Mux Web UI — v0.4 plan: Developer Suite (Git UI, Package Center, Read-only Share Links, Archive Manager)
- v0.2.1 Plan: Distribution (prebuilt binary + installer)
- Companion Checklist — v0.5 Workspace, Desktop & File Manager Sempurna (Windows Explorer + VS Code + Browser) — Lebih Baik & Tidak Ngelag
- Companion Checklist — v0.4 Plan: Developer Suite
- static_handler
- 003.plan-v0.3-terminal-resize.md
- install.sh
- check_budget.sh
- uninstall.sh
- update.sh
- Mux Web UI — v0.3 Implementation Checklist & Verification Matrix
- Mux Web UI — v0.6 plan: Editor Integrated Terminal (Beneran Jalan) + Open File & Open Folder ala VS Code — Sempurna & Tidak Ngelag
- 1. Milestone A — Integrated Terminal (`EDT-001..005`)
- ArchiveError
- Mux Web UI ⚡
- GitError
- archive_tests.rs
- Requirement Traceability Matrix
- Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix
- packages.rs
- CI & Release Workflow
- git_tests.rs
- TestServer
- ArchiveModal.tsx
- start_health_server
- 11. Definition of Done — Sempurna = Lengkap + Lebih Baik + Tidak Ngelag
- Mux Web UI — v0.2 Implementation Checklist & Verification Matrix
- 1. Latar Belakang, Risiko, dan Prinsip “Lebih Baik & Tidak Ngelag”
- 1. Workspace System — Sempurna (`WS-001..008`)
- 2. Desktop System — Sempurna (`DESK-001..008`) — Lebih Baik dari Windows
- 3. File Manager Windows-like — Sempurna (`FM-001..018`) — Recreation + Lebih Baik
- 3b. Browser Inside Desktop — Sempurna (`BR-001..006`) — Chrome-like
- 007 — Hotfix v0.5.1 Terminal CWD & Prompt Rendering
- Companion Checklist — v0.5.1 Terminal CWD & Prompt Hotfix
- 004 — Handoff: Hotfix v0.5.1 Terminal CWD & Prompt Rendering (spec 007)
- 008 — v0.5.2 Editor Multi-Terminal ala VS Code (Tabs, Split Side-by-Side, Drag & Drop)
- Config
- Companion Checklist — v0.5.2 Editor Multi-Terminal ala VS Code
- FolderPicker.tsx
- files.rs
- v0.2 Implementation Checklist & Verification Matrix
- 005 — Handoff: Multi-Terminal Editor ala VS Code v0.5.2 (spec 008)
- 1. Milestone A — Git UI (`GIT-001..010`) — v0.4.1
- 3. Milestone C — Read-only Share Links (`SHR-001..008`) — v0.4.0 (Bersama Archive)
- Response
- Error
- Default
- Duration
- HashMap
- Instant
- Mutex
- Self
- Sender

## God Nodes (most connected - your core abstractions)
1. `AppState` - 43 edges
2. `start_health_server()` - 34 edges
3. `SessionRegistry` - 30 edges
4. `TestServer` - 22 edges
5. `ShareRegistry` - 18 edges
6. `start_server()` - 18 edges
7. `TerminalSessionInstance` - 17 edges
8. `TextEditorView()` - 17 edges
9. `compilerOptions` - 17 edges
10. `Mux Web UI — v0.4 plan: Developer Suite (Git UI, Package Center, Read-only Share Links, Archive Manager)` - 16 edges

## Surprising Connections (you probably didn't know these)
- `test_edit_001_file_read_and_atomic_write()` --calls--> `create_router()`  [INFERRED]
  tests/editor_tests.rs → src/http.rs
- `Milestone B: Session Persistence` --references--> `RingBuffer`  [EXTRACTED]
  spec/handoff/001.progress-and-backlog.md → src/session.rs
- `Checklist Milestone B: Session Persistence (B.1-B.9)` --references--> `RingBuffer`  [EXTRACTED]
  spec/specs/001b.plan-checklist.md → src/session.rs
- `SESS Requirement Family` --conceptually_related_to--> `RingBuffer`  [INFERRED]
  tests/traceability.md → src/session.rs
- `Milestone B: Session Persistence` --references--> `SessionRegistry`  [EXTRACTED]
  spec/handoff/001.progress-and-backlog.md → src/session.rs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **v0.2.1 Distribution Workstream** — spec_specs_002_plan_v0_2_1_milestone_a_release_pipeline, spec_specs_002_plan_v0_2_1_milestone_b_installer, spec_specs_002_plan_v0_2_1_dist_family, install_sh, update_sh [EXTRACTED 1.00]
- **v0.2 Milestone B Session Persistence Workstream** — spec_handoff_001_progress_and_backlog_milestone_b, src_session_sessionregistry, src_session_ringbuffer, spec_handoff_001_progress_and_backlog_life_002_orphan_cleanup, tests_session_tests [INFERRED 0.85]
- **CI Release Gate (test-and-lint + cross-check + budget-check required)** — _github_workflows_ci_testandlint, _github_workflows_ci_crosscheck, _github_workflows_ci_budgetcheck, _github_workflows_ci_release [EXTRACTED 1.00]

## Communities (78 total, 13 thin omitted)

### Community 0 - "http.rs"
Cohesion: 0.06
Nodes (100): AllowedRoots, AuthState, Body, Bytes, ClientInfo, ConnectInfo, HeaderMap, IntoResponse (+92 more)

### Community 1 - "SessionRegistry"
Cohesion: 0.09
Nodes (36): AtomicBool, AtomicU64, Default, Duration, HashMap, Instant, Mutex, PtySession (+28 more)

### Community 2 - "TextEditorView.tsx"
Cohesion: 0.12
Nodes (41): clampRatio(), cwdPayload(), displayWorkDir(), EditorWS, gateState, isVersionAtLeast(), loadPersistedWorkspace(), MIN_SERVER_VERSION (+33 more)

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
Cohesion: 0.05
Nodes (39): SPA mount point (#app + main.tsx), App(), BrowserView(), Tab, DirectoryListing, FileEntry, FileExplorerView(), FileExplorerViewProps (+31 more)

### Community 7 - "Mux Web UI — implementation plan"
Cohesion: 0.06
Nodes (31): 10. Strategi test, 11. Definition of done v1, 12. Risiko khusus Android/Termux, 13. Aplikasi lanjutan setelah v1, 14. Keputusan yang sengaja ditunda, 1. Tujuan, 2. Keputusan stack, 3. Batas produk (+23 more)

### Community 8 - "PtySession"
Cohesion: 0.10
Nodes (18): File, OwnedFd, Pid, forkpty fd-table Inheritance Bug, PTY Fork Hardening (manual open + close_range), clamp_dimensions(), PtySession, reap_exit_code() (+10 more)

### Community 9 - "package.json"
Cohesion: 0.07
Nodes (27): preact, @preact/preset-vite, typescript, vite, vitest, dependencies, preact, @xterm/addon-fit (+19 more)

### Community 10 - "compilerOptions"
Cohesion: 0.09
Nodes (22): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+14 more)

### Community 11 - ".new"
Cohesion: 0.18
Nodes (17): AllowedRoots, PathError, Display, Error, Formatter, HashMap, PathBuf, Result (+9 more)

### Community 12 - "Mux Web UI — v0.5 plan: Workspace & Desktop System + File Manager (Windows Explorer Sempurna) + Editor (VS Code Sempurna) + Browser — Lebih Baik & Tidak Ngelag"
Cohesion: 0.12
Nodes (17): 10. Urutan TDD — Sempurna & Tidak Ngelag (Setelah Approve Final), 2. Hubungan dengan Rencana dan Requirement, 3. Threat Model — Diperluas untuk Explorer/Editor/Browser, 4. Milestone A — Workspace System (`WS-001..008`) — Sempurna, 5. Milestone B — Desktop System (`DESK-001..008`) — Sempurna, 6. Milestone C — File Manager Windows-like **Sempurna** (`FM-001..018`) — Lebih Baik dari Windows, 6a. Milestone D — Editor VS Code **Sempurna** (`ED-001..010`) — Lebih Baik dari VS Code, 6b. Milestone E — Browser Inside Desktop **Sempurna** (`BR-001..006`) — Chrome-like (+9 more)

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

### Community 21 - "Mux Web UI — v0.4 plan: Developer Suite (Git UI, Package Center, Read-only Share Links, Archive Manager)"
Cohesion: 0.04
Nodes (45): 10. Konfigurasi Baru (CLI Flags & Env Vars), 11. Bukan Scope (Out of Scope v0.4), 12.1 Apa Maunya v0.4?, 12.2 Apakah Sudah Cocok? — 85% Ya, 12.3 Apakah Sudah Sempurna? — Belum (Gap Audit), 12.4 Rencana Fase Bertahap (Keputusan: Opsi A — Recommended), 12.5 Alternatif Opsi B (Monolit — Tidak Dipilih), 12. Evaluasi Kelayakan v0.4: Apakah Cocok & Sempurna? (+37 more)

### Community 22 - "v0.2.1 Plan: Distribution (prebuilt binary + installer)"
Cohesion: 0.29
Nodes (14): install.sh, Backup & Auto-Rollback (mux-web.bak), Binary-first Distribution Principle, SHA-256 Checksum Verification, DIST Requirement Family (DIST-001..014), v0.2.1 Plan: Distribution (prebuilt binary + installer), v0.2.1 Milestone A: Multi-target Release Pipeline, v0.2.1 Milestone B: Binary-first Installer & Updater (+6 more)

### Community 23 - "Companion Checklist — v0.5 Workspace, Desktop & File Manager Sempurna (Windows Explorer + VS Code + Browser) — Lebih Baik & Tidak Ngelag"
Cohesion: 0.22
Nodes (7): 0. Keputusan Desain Final (Sudah Dijawab — Konfirmasi), 3a. Editor VS Code-like — Sempurna (`ED-001..010`) — Lebih Baik & Tidak Ngelag, 4. DoD & Quality Gates — Sempurna = Lengkap + Lebih Baik + Tidak Ngelag, Companion Checklist — v0.5 Workspace, Desktop & File Manager Sempurna (Windows Explorer + VS Code + Browser) — Lebih Baik & Tidak Ngelag, Green, Impl, Red Tests (`web/src/apps/editor/*.test.tsx`)

### Community 24 - "Companion Checklist — v0.4 Plan: Developer Suite"
Cohesion: 0.15
Nodes (13): 0. Milestone PRE — Hardening Gate (SEC-004..006) — WAJIB PERTAMA, 2. Milestone B — Package Center (`PKG-001..008`) — v0.4.2 (Terakhir, Non-Sudo Dulu), 4. Milestone D — Archive Manager (`ARC-001..008`) — v0.4.0 (Bersama Share), 5. Milestone E — Desktop Frontend & UI (`WIN-010..013`), 6. Definition of Done & Quality Checks (Per Fase + Final), Backend Implementation (`src/archive.rs` & `src/http.rs` / `src/routes/archive.rs`), Backend Implementation (`src/packages.rs` & `src/http.rs` / `src/routes/packages.rs`), Backend Implementation (`src/session.rs` & `src/http.rs` & `src/auth.rs` & `src/routes/*`) (+5 more)

### Community 25 - "static_handler"
Cohesion: 0.40
Nodes (4): Assets, Response, static_handler(), Uri

### Community 26 - "003.plan-v0.3-terminal-resize.md"
Cohesion: 0.33
Nodes (3): 1. Status Ringkas, 2. Git & Release Status, Handoff 002 — Terminal Resizing & Window Control Hardening (v0.3)

### Community 27 - "install.sh"
Cohesion: 0.67
Nodes (5): die(), fallback_source(), install_from_release(), install.sh script, usage()

### Community 31 - "update.sh"
Cohesion: 0.60
Nodes (3): die(), update.sh script, usage()

### Community 34 - "Mux Web UI — v0.3 Implementation Checklist & Verification Matrix"
Cohesion: 0.40
Nodes (5): Langkah 1 — Milestone A: Backend Dimension Clamping & Robustness, Langkah 2 — Milestone B: Frontend Window Resize Handles & Debouncing, Langkah 3 — Milestone C: Traceability, Documentation & Graph Update, Mux Web UI — v0.3 Implementation Checklist & Verification Matrix, TDD Execution Loop Standard

### Community 35 - "Mux Web UI — v0.6 plan: Editor Integrated Terminal (Beneran Jalan) + Open File & Open Folder ala VS Code — Sempurna & Tidak Ngelag"
Cohesion: 0.09
Nodes (23): 10. Urutan Pengerjaan TDD (Red → Green → Refactor), 11. Definition of Done (DoD) v0.6, 1.1 Fakta Kode Titik Awal (Bukti), 1. Latar Belakang, 2. Hubungan dengan Rencana & Requirement, 3. Threat Model, 4. Milestone A — Integrated Terminal Beneran Jalan (`EDT-001..005`), 5. Milestone B — Open File & Open Folder ala VS Code (`EDT-006..010`) (+15 more)

### Community 36 - "1. Milestone A — Integrated Terminal (`EDT-001..005`)"
Cohesion: 0.14
Nodes (14): 0. Ringkasan Deliverable, 1. Milestone A — Integrated Terminal (`EDT-001..005`), 2. Milestone B — Open File & Open Folder (`EDT-006..010`), 3. Quality Gates & DoD, 4. Out of Scope (ingat), Companion Checklist — v0.6 Editor Integrated Terminal + Open File/Folder ala VS Code, Green, Green (+6 more)

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
Cohesion: 0.18
Nodes (12): Single-Use Bootstrap Secret Pairing, File Explorer, PTY Interactive Terminal (xterm.js), Security & Authentication Model, AUTH Requirement Family, FS Requirement Family, LAN Requirement Family, LIFE Requirement Family (+4 more)

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

### Community 47 - "TestServer"
Cohesion: 0.09
Nodes (40): Client, JoinHandle, MaybeTlsStream, Router, create_router(), TcpStream, authed_ws_connect(), Drop (+32 more)

### Community 49 - "start_health_server"
Cohesion: 0.09
Nodes (45): Future, Output, Pin, start_health_server(), test_pkg_002_list_installed_packages_via_http(), test_pkg_003_search_repository_packages(), test_pkg_005_search_injection_blocked_http(), test_pkg_backend_http() (+37 more)

### Community 50 - "11. Definition of Done — Sempurna = Lengkap + Lebih Baik + Tidak Ngelag"
Cohesion: 0.40
Nodes (5): 11. Definition of Done — Sempurna = Lengkap + Lebih Baik + Tidak Ngelag, Lampiran A — API Contract Lengkap (Baru vs Reuse), Lampiran B — Component Map (File → Spec), Lampiran C — Performance Budget (Tidak Ngelag), Lampiran D — Traceability Baru

### Community 51 - "Mux Web UI — v0.2 Implementation Checklist & Verification Matrix"
Cohesion: 0.22
Nodes (9): Langkah 1 — Harness test + regression (harus hijau sejak awal), Langkah 2 — Milestone A: Auth + TLS, Langkah 3 — Milestone B: Session persistence, Langkah 4 — CI, Langkah 5-6 — Traceability, README, update.sh, Langkah 7 — Rilis, Mux Web UI — v0.2 Implementation Checklist & Verification Matrix, Open questions yang diputuskan saat implementasi (+1 more)

### Community 52 - "1. Latar Belakang, Risiko, dan Prinsip “Lebih Baik & Tidak Ngelag”"
Cohesion: 0.50
Nodes (4): 1.1 Kenapa Harus Sempurna, 1.2 Fakta Kode v0.4/v0.5 Saat Ini (Titik Awal), 1.3 Prinsip “Lebih Baik & Tidak Ngelag” — Arsitektur Performance (Wajib), 1. Latar Belakang, Risiko, dan Prinsip “Lebih Baik & Tidak Ngelag”

### Community 53 - "1. Workspace System — Sempurna (`WS-001..008`)"
Cohesion: 0.50
Nodes (4): 1. Workspace System — Sempurna (`WS-001..008`), Green, Impl, Red Tests (`tests/workspace_tests.rs`)

### Community 54 - "2. Desktop System — Sempurna (`DESK-001..008`) — Lebih Baik dari Windows"
Cohesion: 0.50
Nodes (4): 2. Desktop System — Sempurna (`DESK-001..008`) — Lebih Baik dari Windows, Green, Impl, Red Tests

### Community 55 - "3. File Manager Windows-like — Sempurna (`FM-001..018`) — Recreation + Lebih Baik"
Cohesion: 0.50
Nodes (4): 3. File Manager Windows-like — Sempurna (`FM-001..018`) — Recreation + Lebih Baik, Green, Impl, Red Tests (`tests/fs_tests.rs` + `web/src/apps/files/FileExplorerView.test.tsx`)

### Community 56 - "3b. Browser Inside Desktop — Sempurna (`BR-001..006`) — Chrome-like"
Cohesion: 0.50
Nodes (4): 3b. Browser Inside Desktop — Sempurna (`BR-001..006`) — Chrome-like, Green, Impl, Red Tests (`web/src/apps/browser/*.test.tsx`)

### Community 57 - "007 — Hotfix v0.5.1 Terminal CWD & Prompt Rendering"
Cohesion: 0.08
Nodes (25): 007 — Hotfix v0.5.1 Terminal CWD & Prompt Rendering, 10. Urutan Pengerjaan TDD (Red → Green → Refactor), 11. Definition of Done (DoD) v0.5.1, 1.1 Laporan Bug (verbatim ringkas), 1.2 Kondisi Saat Ini (fakta kode — titik awal), 1.3 Root-Cause Analysis, 1. Latar Belakang & Risiko, 2. Hubungan dengan Rencana & Requirement (+17 more)

### Community 58 - "Companion Checklist — v0.5.1 Terminal CWD & Prompt Hotfix"
Cohesion: 0.11
Nodes (18): 0. Ringkasan Deliverable, 1. Milestone A — Backend: `work_dir` di Respons + Bump `0.5.1` (`V051-001`, `V051-005`), 2. Milestone B — Frontend: Header = Server `work_dir` + Version Gate (`V051-002`, `V051-003`), 3. Milestone C — Prompt Rendering (`V051-004`), 4. Quality Gates & DoD (`V051-006`), 5. Out of Scope (ingat — jangan dikerjakan), 6. Keputusan & Open Question Log, 7. Estimasi (+10 more)

### Community 59 - "004 — Handoff: Hotfix v0.5.1 Terminal CWD & Prompt Rendering (spec 007)"
Cohesion: 0.20
Nodes (10): 004 — Handoff: Hotfix v0.5.1 Terminal CWD & Prompt Rendering (spec 007), 1. Yang Dikerjakan, 2. Bukti Gate (angka aktual), 3. Fakta Kode Penting (untuk session berikutnya), 4. Pending (bloker nol, tapi wajib ditutup), 5. Konteks untuk Session Berikutnya, 6. Lampiran (update 2026-08-22 sore) — Rilis v0.5.1 & Perbaikan CI, Milestone A — Backend (`V051-001`, `V051-005`) (+2 more)

### Community 60 - "008 — v0.5.2 Editor Multi-Terminal ala VS Code (Tabs, Split Side-by-Side, Drag & Drop)"
Cohesion: 0.10
Nodes (21): 008 — v0.5.2 Editor Multi-Terminal ala VS Code (Tabs, Split Side-by-Side, Drag & Drop), 10. Urutan Pengerjaan TDD (Red → Green → Refactor), 11. Definition of Done (DoD) v0.5.2, 1.1 Kondisi Saat Ini, 1.2 Prinsip Desain, 1. Latar Belakang & Risiko, 2. Hubungan dengan Rencana & Requirement, 3. Threat Model (+13 more)

### Community 61 - "Config"
Cohesion: 0.12
Nodes (16): Error, Config, IpAddr, Option, PathBuf, String, generate_self_signed_cert(), main() (+8 more)

### Community 62 - "Companion Checklist — v0.5.2 Editor Multi-Terminal ala VS Code"
Cohesion: 0.13
Nodes (15): 1. Milestone A — Backend `--max-sessions` + metrics (`TAB-001`, `TAB-009`), 2. Milestone B — Logic murni (`terminalTabsLogic.ts`), 3. Milestone C — Wiring editor (`TextEditorView.tsx`), 4. Final Gates & DoD, 5. Out of Scope, 6. Keputusan Log, Companion Checklist — v0.5.2 Editor Multi-Terminal ala VS Code, Green (+7 more)

### Community 63 - "FolderPicker.tsx"
Cohesion: 0.26
Nodes (9): FolderPicker(), FolderPickerProps, PickerRow, PickerSel, breadcrumbSegments(), Crumb, PickerEntry, entries (+1 more)

### Community 64 - "files.rs"
Cohesion: 0.39
Nodes (8): DirectoryListing, FileEntry, FsAction, list_directory(), Path, Result, String, Vec

### Community 65 - "v0.2 Implementation Checklist & Verification Matrix"
Cohesion: 0.36
Nodes (7): Handoff 001 - Progress & Backlog (v0.2), LIFE-002 Orphan Child Cleanup, Milestone B: Session Persistence, v0.2 Implementation Checklist & Verification Matrix, Checklist Milestone B: Session Persistence (B.1-B.9), TDD Execution Loop (Red-Green-Refactor), uninstall.sh

### Community 66 - "005 — Handoff: Multi-Terminal Editor ala VS Code v0.5.2 (spec 008)"
Cohesion: 0.25
Nodes (8): 005 — Handoff: Multi-Terminal Editor ala VS Code v0.5.2 (spec 008), 1. Yang Dikerjakan, 2. Bukti Gate, 3. Pending (user-side / CI), 4. Konteks untuk Sesi Berikutnya, Milestone A — Backend (`TAB-001`, `TAB-009`), Milestone B — Logic murni (`terminalTabsLogic.ts`), Milestone C — Wiring `TextEditorView.tsx` (`TAB-001..008`)

### Community 67 - "1. Milestone A — Git UI (`GIT-001..010`) — v0.4.1"
Cohesion: 0.67
Nodes (3): 1. Milestone A — Git UI (`GIT-001..010`) — v0.4.1, Backend Implementation (`src/git.rs` & `src/http.rs` / `src/routes/git.rs`), Test Suite (`tests/git_tests.rs`)

### Community 68 - "3. Milestone C — Read-only Share Links (`SHR-001..008`) — v0.4.0 (Bersama Archive)"
Cohesion: 0.67
Nodes (3): 3. Milestone C — Read-only Share Links (`SHR-001..008`) — v0.4.0 (Bersama Archive), Backend Implementation (`src/share.rs` & `src/http.rs` / `src/routes/share.rs`), Test Suite (`tests/share_tests.rs`)

## Knowledge Gaps
- **430 isolated node(s):** `Milestone A — Backend (`TAB-001`, `TAB-009`)`, `Milestone B — Logic murni (`terminalTabsLogic.ts`)`, `Milestone C — Wiring `TextEditorView.tsx` (`TAB-001..008`)`, `2. Bukti Gate`, `3. Pending (user-side / CI)` (+425 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Requirement Traceability Matrix` connect `Requirement Traceability Matrix` to `v0.2 Implementation Checklist & Verification Matrix`, `SessionRegistry`, `000a.plan-test.md`, `CI & Release Workflow`, `v0.2.1 Plan: Distribution (prebuilt binary + installer)`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `Handoff 001 - Progress & Backlog (v0.2)` connect `v0.2 Implementation Checklist & Verification Matrix` to `PtySession`, `000a.plan-test.md`, `CI & Release Workflow`, `4. SISA PEKERJAAN — Apa yang Belum Selesai`, `auth_tests.rs`, `TestServer`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `v0.2 Implementation Checklist & Verification Matrix` connect `v0.2 Implementation Checklist & Verification Matrix` to `Requirement Traceability Matrix`, `000a.plan-test.md`, `CI & Release Workflow`, `auth_tests.rs`, `Mux Web UI — v0.2 Implementation Checklist & Verification Matrix`, `v0.2.1 Plan: Distribution (prebuilt binary + installer)`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Are the 31 inferred relationships involving `start_health_server()` (e.g. with `test_pkg_002_list_installed_packages_via_http()` and `test_pkg_003_search_repository_packages()`) actually correct?**
  _`start_health_server()` has 31 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Milestone A — Backend (`TAB-001`, `TAB-009`)`, `Milestone B — Logic murni (`terminalTabsLogic.ts`)`, `Milestone C — Wiring `TextEditorView.tsx` (`TAB-001..008`)` to the rest of the system?**
  _430 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `http.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06348020911127707 - nodes in this community are weakly interconnected._
- **Should `SessionRegistry` be split into smaller, more focused modules?**
  _Cohesion score 0.08821548821548822 - nodes in this community are weakly interconnected._