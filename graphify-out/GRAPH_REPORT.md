# Graph Report - mux-web-ui  (2026-08-26)

## Corpus Check
- 125 files · ~273,550 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2262 nodes · 3610 edges · 138 communities (113 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 88 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7980c436`
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
- DistroTaskRegistry
- Mux Web UI — v0.3 plan: Terminal Resizing & Window Control Hardening
- ShareRegistry
- Mux Web UI — Implementation Checklist & Verification Matrix
- Handoff 003 — Security Audit v0.3 & Evaluasi v0.4 Developer Suite
- 009 — v0.5.3 Akses VPN / Jaringan Khusus / Domain Kustom (Host Allowlist & Advertise)
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
- Rencana v0.6.2 — Editor Polish, Agents UX, Network/Supply-chain Hardening & Distro Management
- Mux Web UI — v0.6 plan: Editor Integrated Terminal (Beneran Jalan) + Open File & Open Folder ala VS Code — Sempurna & Tidak Ngelag
- 1. Milestone A — Integrated Terminal (`EDT-001..005`)
- 012 — v0.6.2 Terminal Resiliensi saat AFK (Auto-Reconnect + Retensi Sesi)
- Mux Web UI ⚡
- GitError
- archive_tests.rs
- Requirement Traceability Matrix
- Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix
- packages.rs
- v0.2 Implementation Checklist & Verification Matrix
- agent_pkg.rs
- TestServer
- ArchiveModal.tsx
- session_tests.rs
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
- tokenizer.ts
- AtomicBool
- environments.rs
- 005 — Handoff: Multi-Terminal Editor ala VS Code v0.5.2 (spec 008)
- 011 — v0.6.2 Editor Polish & Virtualisasi Penuh, Agents UX, Persist Layout, Network Hardening, Release Signing, Manajemen Distro
- start_health_server
- security_tests.rs
- protocol.rs
- Companion Checklist — v0.5.3 VPN / Jaringan Khusus / Domain Kustom
- resize_tests.rs
- 010 — v0.6.1 Coding Agents & proot-distro, Anti-Timeout/Banter, dan Editor Engine In-house
- 006 — Handoff: VPN / Jaringan Khusus / Domain Kustom v0.5.3 (spec 009)
- Companion Checklist — v0.6.1 Coding Agents & proot-distro, Anti-Timeout, Editor Engine
- 1. Milestone A — proot-distro (`PROOT-001..006`)
- 1. Latar Belakang & Risiko
- 4. Milestone A — Environment proot-distro (`PROOT-001..006`)
- 5. Milestone B — Coding Agents (`AGT-001..005`)
- 6. Milestone C — Anti-Timeout & Banter (`SESS-009/010`, `LIFE-010`, `PERF-006`) — PRIORITAS #1 USER
- 7. Milestone D — Editor Engine In-house "mux-code" (`EDIT-009..016`, `PERF-007`)
- 007 — Handoff: Coding Agents & proot-distro, Anti-Timeout, Editor mux-code (spec 010, v0.6.1)
- 3. Milestone C — Anti-Timeout & Banter (`SESS-009/010`, `LIFE-010`, `PERF-006`) — PRIORITAS #1
- 4. Milestone D — Editor Engine "mux-code" (`EDIT-009..016`, `PERF-007`)
- IpAddr
- 1. Yang Dikerjakan
- v0.6.2 development planning from specs
- Arc
- Companion Checklist — v0.6.2 Editor Polish & Virtualisasi, Agents UX, Persist Layout, Network Hardening, Signing, Distro Mgmt
- Handoff 008 — v0.6.2 Editor Polish & Virtualisasi Penuh, Agents UX, Persist Layout, Network Hardening, Signing, Distro Mgmt
- 1. Latar Belakang & Risiko
- 4. Milestone A — mux-code Polish: Komentar Blok Multi-line, Bracket Auto-close, Wrap Toggle (`EDIT-017`, `EDIT-013`, `EDIT-014`)
- 5. Milestone B — Virtualisasi Penuh (`EDIT-018`)
- 6. Milestone C — FolderPicker untuk cwd Quick-launch Agent (`AGT-006`)
- 8. Milestone E — Network Hardening: Trusted Proxy + Wildcard Allowlist (`NET-007/008`)
- 9. Milestone F/G — Release Signing (`SIGN-001..003`) & Manajemen Distro (`DISTRO-001..004`)
- 1. Milestone A — mux-code Polish (`EDIT-017`, `EDIT-013`, `EDIT-014`)
- 2. Milestone B — Virtualisasi Penuh (`EDIT-018`)
- 3. Milestone C — FolderPicker cwd Agents (`AGT-006`)
- 4. Milestone D — Persist Layout Terminal (`TAB-010/011`)
- 5. Milestone E — Trusted Proxy + Wildcard Allowlist (`NET-007/008`)
- 7. Milestone G — Manajemen Distro + Agent Hints (`DISTRO-001..004`)
- FolderPicker.tsx
- TerminalView.tsx
- windowStore.ts
- terminalTabsLogic.ts
- FileExplorerView.tsx
- app.tsx
- 013 — v0.6.3 Support Hub & Discoverability, Agents Package Center, Integrasi 9Router, Config Editor + Model Selector
- SupportHubView.tsx
- agent_cfg.rs
- router9.rs
- engine.ts
- brackets.ts
- start_server_with_session_limit
- AtomicBool
- Mux Web UI — v0.3 Implementation Checklist & Verification Matrix
- 1. Milestone A — Git UI (`GIT-001..010`) — v0.4.1
- 3. Milestone C — Read-only Share Links (`SHR-001..008`) — v0.4.0 (Bersama Archive)
- mux-web
- Default
- Duration
- HashMap
- Instant
- Mutex
- Receiver
- Self
- Sender
- Box
- Value
- Ws
- Child
- HashMap
- Sender
- Response
- Value
- Error

## God Nodes (most connected - your core abstractions)
1. `Rencana v0.6.2 — Editor Polish, Agents UX, Network/Supply-chain Hardening & Distro Management` - 369 edges
2. `AppState` - 52 edges
3. `start_health_server()` - 38 edges
4. `TextEditorView()` - 29 edges
5. `SessionRegistry` - 28 edges
6. `v0.6.2 development planning from specs` - 28 edges
7. `TestServer` - 25 edges
8. `ShareRegistry` - 18 edges
9. `start_server()` - 18 edges
10. `compilerOptions` - 17 edges

## Surprising Connections (you probably didn't know these)
- `SESS Requirement Family` --conceptually_related_to--> `RingBuffer`  [INFERRED]
  tests/traceability.md → src/session.rs
- `Handoff 001 - Progress & Backlog (v0.2)` --references--> `TestServer`  [EXTRACTED]
  spec/handoff/001.progress-and-backlog.md → tests/common/mod.rs
- `File Explorer` --semantically_similar_to--> `FS Requirement Family`  [INFERRED] [semantically similar]
  README.md → tests/traceability.md
- `PTY Interactive Terminal (xterm.js)` --semantically_similar_to--> `TERM Requirement Family`  [INFERRED] [semantically similar]
  README.md → tests/traceability.md
- `PERF Requirement Family` --references--> `check_budget.sh Budget Gate Script`  [INFERRED]
  tests/traceability.md → .github/workflows/ci.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **v0.2.1 Distribution Workstream** — spec_specs_002_plan_v0_2_1_milestone_a_release_pipeline, spec_specs_002_plan_v0_2_1_milestone_b_installer, spec_specs_002_plan_v0_2_1_dist_family, install_sh, update_sh [EXTRACTED 1.00]
- **CI Release Gate (test-and-lint + cross-check + budget-check required)** — _github_workflows_ci_testandlint, _github_workflows_ci_crosscheck, _github_workflows_ci_budgetcheck, _github_workflows_ci_release [EXTRACTED 1.00]
- **v0.2 Milestone B Session Persistence Workstream** — spec_handoff_001_progress_and_backlog_milestone_b, src_session_sessionregistry, src_session_ringbuffer, spec_handoff_001_progress_and_backlog_life_002_orphan_cleanup, tests_session_tests [INFERRED 0.85]

## Communities (138 total, 25 thin omitted)

### Community 0 - "http.rs"
Cohesion: 0.05
Nodes (135): AllowedRoots, AuthState, Body, ClientInfo, Config, ConnectInfo, DistroTaskRegistry, Error (+127 more)

### Community 1 - "SessionRegistry"
Cohesion: 0.10
Nodes (34): Arc, AtomicU64, Default, Instant, Mutex, PtySession, Receiver, Self (+26 more)

### Community 2 - "TextEditorView.tsx"
Cohesion: 0.14
Nodes (32): AgentCwdSel, clampRatio(), cwdPayload(), displayWorkDir(), EditorWS, gateState, isVersionAtLeast(), loadPersistedWorkspace() (+24 more)

### Community 3 - "auth.rs"
Cohesion: 0.07
Nodes (52): Milestone A: Auth + TLS, Checklist Milestone A: Auth + TLS (A.1-A.13), auth(), AuthConfig, AuthError, AuthInner, AuthState, ClientInfo (+44 more)

### Community 4 - "Mux Web UI — TDD and verification plan"
Cohesion: 0.05
Nodes (41): 10. TDD sequence per milestone, 11. Manual exploratory charters, 12. Evidence dan definition of tested, 1. Tujuan, 2. Aturan kerja TDD, 3. Test ID dan traceability, 4. Test stack, 5. Test architecture dan determinism (+33 more)

### Community 5 - "Mux Web UI — v0.2 plan: Auth + TLS, Session Persistence, Test Suite & CI"
Cohesion: 0.06
Nodes (34): 10. Keputusan desain dan open questions, 11. Bukan scope v0.2, 12. Urutan pengerjaan (TDD), 13. Risiko Termux/Android untuk auth, 14. Definition of done v0.2, 1.1 Fakta kode v0.1 yang menjadi titik awal, 1.2 Scope v0.2, 1. Latar belakang dan risiko (+26 more)

### Community 6 - "DesktopCanvas.tsx"
Cohesion: 0.11
Nodes (16): BrowserView(), Tab, GitView(), GitViewProps, MetricsData, SystemMonitorView(), PackageCenterView(), ShareModal() (+8 more)

### Community 7 - "Mux Web UI — implementation plan"
Cohesion: 0.06
Nodes (31): 10. Strategi test, 11. Definition of done v1, 12. Risiko khusus Android/Termux, 13. Aplikasi lanjutan setelah v1, 14. Keputusan yang sengaja ditunda, 1. Tujuan, 2. Keputusan stack, 3. Batas produk (+23 more)

### Community 8 - "PtySession"
Cohesion: 0.07
Nodes (36): File, OwnedFd, Pid, forkpty fd-table Inheritance Bug, PTY Fork Hardening (manual open + close_range), ArchiveEntry, ArchiveError, ArchiveInspect (+28 more)

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

### Community 15 - "DistroTaskRegistry"
Cohesion: 0.09
Nodes (31): Into, catalog(), DistroCatalog, DistroTaskRegistry, install_argv(), MgmtTaskStatus, parse_proot_list(), remove_argv() (+23 more)

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

### Community 20 - "009 — v0.5.3 Akses VPN / Jaringan Khusus / Domain Kustom (Host Allowlist & Advertise)"
Cohesion: 0.09
Nodes (23): 009 — v0.5.3 Akses VPN / Jaringan Khusus / Domain Kustom (Host Allowlist & Advertise), 10. Urutan Pengerjaan TDD (Red → Green → Refactor), 11. Definition of Done (DoD) v0.5.3, 1.1 Skenario User, 1.2 Kondisi Saat Ini (fakta kode — titik awal), 1.3 Risiko Tanpa Desain, 1. Latar Belakang & Risiko, 2. Hubungan dengan Rencana & Requirement (+15 more)

### Community 21 - "Mux Web UI — v0.4 plan: Developer Suite (Git UI, Package Center, Read-only Share Links, Archive Manager)"
Cohesion: 0.04
Nodes (45): 10. Konfigurasi Baru (CLI Flags & Env Vars), 11. Bukan Scope (Out of Scope v0.4), 12.1 Apa Maunya v0.4?, 12.2 Apakah Sudah Cocok? — 85% Ya, 12.3 Apakah Sudah Sempurna? — Belum (Gap Audit), 12.4 Rencana Fase Bertahap (Keputusan: Opsi A — Recommended), 12.5 Alternatif Opsi B (Monolit — Tidak Dipilih), 12. Evaluasi Kelayakan v0.4: Apakah Cocok & Sempurna? (+37 more)

### Community 22 - "v0.2.1 Plan: Distribution (prebuilt binary + installer)"
Cohesion: 0.25
Nodes (15): install.sh, Backup & Auto-Rollback (mux-web.bak), Binary-first Distribution Principle, SHA-256 Checksum Verification, DIST Requirement Family (DIST-001..014), v0.2.1 Plan: Distribution (prebuilt binary + installer), v0.2.1 Milestone A: Multi-target Release Pipeline, v0.2.1 Milestone B: Binary-first Installer & Updater (+7 more)

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
Cohesion: 0.57
Nodes (7): die(), fallback_source(), install_from_release(), install.sh script, sig_gate(), sig_verify_dir(), usage()

### Community 31 - "update.sh"
Cohesion: 0.52
Nodes (5): die(), update.sh script, sig_gate(), sig_verify_dir(), usage()

### Community 34 - "Rencana v0.6.2 — Editor Polish, Agents UX, Network/Supply-chain Hardening & Distro Management"
Cohesion: 0.01
Nodes (369): Assistant (Code · Ox Alpha), Assistant (Code · Ox Alpha · 103.2s), Assistant (Code · Ox Alpha · 103.7s), Assistant (Code · Ox Alpha · 106.1s), Assistant (Code · Ox Alpha · 107.1s), Assistant (Code · Ox Alpha · 108.3s), Assistant (Code · Ox Alpha · 109.0s), Assistant (Code · Ox Alpha · 10.0s) (+361 more)

### Community 35 - "Mux Web UI — v0.6 plan: Editor Integrated Terminal (Beneran Jalan) + Open File & Open Folder ala VS Code — Sempurna & Tidak Ngelag"
Cohesion: 0.09
Nodes (23): 10. Urutan Pengerjaan TDD (Red → Green → Refactor), 11. Definition of Done (DoD) v0.6, 1.1 Fakta Kode Titik Awal (Bukti), 1. Latar Belakang, 2. Hubungan dengan Rencana & Requirement, 3. Threat Model, 4. Milestone A — Integrated Terminal Beneran Jalan (`EDT-001..005`), 5. Milestone B — Open File & Open Folder ala VS Code (`EDT-006..010`) (+15 more)

### Community 36 - "1. Milestone A — Integrated Terminal (`EDT-001..005`)"
Cohesion: 0.13
Nodes (14): 0. Ringkasan Deliverable, 1. Milestone A — Integrated Terminal (`EDT-001..005`), 2. Milestone B — Open File & Open Folder (`EDT-006..010`), 3. Quality Gates & DoD, 4. Out of Scope (ingat), Companion Checklist — v0.6 Editor Integrated Terminal + Open File/Folder ala VS Code, Green, Green (+6 more)

### Community 37 - "012 — v0.6.2 Terminal Resiliensi saat AFK (Auto-Reconnect + Retensi Sesi)"
Cohesion: 0.06
Nodes (29): 012 — v0.6.2 Terminal Resiliensi saat AFK (Auto-Reconnect + Retensi Sesi), 1.1 Skenario User, 1.2 Kondisi Saat Ini (fakta kode — titik awal), 1.3 Risiko Tanpa Desain, 1. Latar Belakang, 2. Persyaratan, 3. Milestone, 4. Verifikasi (+21 more)

### Community 38 - "Mux Web UI ⚡"
Cohesion: 0.12
Nodes (16): 🛠️ Building from Source, ✨ Features, 📥 Install (Create), 📜 License, Mux Web UI ⚡, 📊 Performance & Size Benchmarks, Prerequisites, ⚡ Quick 1-Line Commands (Create / Update / Delete) (+8 more)

### Community 39 - "GitError"
Cohesion: 0.24
Nodes (8): GitError, GitService, Display, Formatter, Path, Result, String, Value

### Community 40 - "archive_tests.rs"
Cohesion: 0.09
Nodes (21): TempDir, apkg_002_argv_builders_distro_wrapper(), apkg_007_spawn_stream_success_busy_cancel(), fake_home_with_ubuntu(), Path, PathBuf, write_fixture(), create_sample_tar_gz() (+13 more)

### Community 41 - "Requirement Traceability Matrix"
Cohesion: 0.17
Nodes (13): Single-Use Bootstrap Secret Pairing, File Explorer, PTY Interactive Terminal (xterm.js), Security & Authentication Model, AUTH Requirement Family, FS Requirement Family, LAN Requirement Family, LIFE Requirement Family (+5 more)

### Community 42 - "Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix"
Cohesion: 0.25
Nodes (8): Langkah 1 — Milestone A: Release pipeline multi-target, Langkah 2 — Milestone B: `install.sh` binary-first, Langkah 3 — Milestone B: `update.sh` binary-first, Langkah 4 — CI `installer-test` (DIST-013), Langkah 5 — Traceability, README, rilis, Mux Web UI — v0.2.1 Implementation Checklist & Verification Matrix, Open questions yang diputuskan saat implementasi, TDD Execution Loop Standard

### Community 43 - "packages.rs"
Cohesion: 0.20
Nodes (8): PackageBackend, PackageBackendKind, PackageInfo, PackageService, Display, Formatter, Result, String

### Community 45 - "v0.2 Implementation Checklist & Verification Matrix"
Cohesion: 0.30
Nodes (12): budget-check Job (check_budget.sh), cross-check Job (Android ARM64 cargo check), release Job (artifact + checksum upload), test-and-lint Job (fmt, clippy, tests), CI & Release Workflow, check_budget.sh Budget Gate Script, Handoff 001 - Progress & Backlog (v0.2), Checklist Langkah 4: CI (C.1-C.6) (+4 more)

### Community 46 - "agent_pkg.rs"
Cohesion: 0.08
Nodes (40): AtomicBool, Child, HashMap, ProbeCache, Sender, AgentTaskRegistry, AgentTaskStatus, base_argv() (+32 more)

### Community 47 - "TestServer"
Cohesion: 0.09
Nodes (28): Client, JoinHandle, MaybeTlsStream, Router, create_router(), TcpStream, authed_ws_connect(), Drop (+20 more)

### Community 49 - "session_tests.rs"
Cohesion: 0.27
Nodes (21): connect(), create_terminal(), read_kick_message(), read_until(), read_until_exit(), request_attach(), String, send_input() (+13 more)

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
Cohesion: 0.09
Nodes (30): IpAddr, Ipv4Addr, Ipv6Addr, collect_access_urls(), Config, is_cgnat_v4(), is_gate_ok_ip(), Option (+22 more)

### Community 62 - "Companion Checklist — v0.5.2 Editor Multi-Terminal ala VS Code"
Cohesion: 0.13
Nodes (15): 1. Milestone A — Backend `--max-sessions` + metrics (`TAB-001`, `TAB-009`), 2. Milestone B — Logic murni (`terminalTabsLogic.ts`), 3. Milestone C — Wiring editor (`TextEditorView.tsx`), 4. Final Gates & DoD, 5. Out of Scope, 6. Keputusan Log, Companion Checklist — v0.5.2 Editor Multi-Terminal ala VS Code, Green (+7 more)

### Community 63 - "tokenizer.ts"
Cohesion: 0.14
Nodes (19): createCache(), LINE_H, LineFold, LineStateCache, recomputeFrom(), syncLines(), fold(), fullTokens() (+11 more)

### Community 65 - "environments.rs"
Cohesion: 0.26
Nodes (16): build_argv(), capitalize(), EnvInfo, list_distros(), list_environments(), Option, Path, PathBuf (+8 more)

### Community 66 - "005 — Handoff: Multi-Terminal Editor ala VS Code v0.5.2 (spec 008)"
Cohesion: 0.22
Nodes (9): 005 — Handoff: Multi-Terminal Editor ala VS Code v0.5.2 (spec 008), 1. Yang Dikerjakan, 2. Bukti Gate, 3. Pending (user-side / CI), 4. Konteks untuk Sesi Berikutnya, 5. Final (2026-08-23 sore) — Rilis Terverifikasi, Milestone A — Backend (`TAB-001`, `TAB-009`), Milestone B — Logic murni (`terminalTabsLogic.ts`) (+1 more)

### Community 67 - "011 — v0.6.2 Editor Polish & Virtualisasi Penuh, Agents UX, Persist Layout, Network Hardening, Release Signing, Manajemen Distro"
Cohesion: 0.14
Nodes (14): 011 — v0.6.2 Editor Polish & Virtualisasi Penuh, Agents UX, Persist Layout, Network Hardening, Release Signing, Manajemen Distro, 10. Milestone H — Security Assurance (`SEC-007/008`) — Syarat Mutlak User, 11. Konfigurasi Baru, 12. Keputusan Desain & Open Questions, 13. Bukan Scope, 14. Urutan Pengerjaan (TDD), 15. Definition of Done, 2. Hubungan dengan Requirement (+6 more)

### Community 68 - "start_health_server"
Cohesion: 0.13
Nodes (16): start_health_server(), test_pkg_002_list_installed_packages_via_http(), test_pkg_003_search_repository_packages(), test_pkg_005_search_injection_blocked_http(), test_pkg_backend_http(), test_edt_002_cwd_nul_400(), test_edt_002_cwd_traversal_400(), test_tab_001_default_limit_409_at_5() (+8 more)

### Community 69 - "security_tests.rs"
Cohesion: 0.12
Nodes (15): PathBuf, String, server_port(), start_server_with_hosts(), status_with_host(), test_net_001_allowed_host_accepted(), test_net_001_case_insensitive(), test_net_002_cgnat_ip_accepted() (+7 more)

### Community 70 - "protocol.rs"
Cohesion: 0.20
Nodes (12): Bytes, CodecError, decode_frame(), encode_frame(), Frame, Display, Error, Formatter (+4 more)

### Community 71 - "Companion Checklist — v0.5.3 VPN / Jaringan Khusus / Domain Kustom"
Cohesion: 0.13
Nodes (15): 0. Ringkasan Deliverable, 1. Milestone A — Parser & Gate (`NET-001`, `NET-002`, `NET-006`, `NET-007`), 2. Milestone B — Advertise & Banner (`NET-003`, `NET-004`, `NET-005`), 3. Milestone C — Docs & Traceability (`NET-004`, `NET-007`), 4. Quality Gates & DoD, 5. Out of Scope (ingat), 6. Keputusan & Open Question Log, Companion Checklist — v0.5.3 VPN / Jaringan Khusus / Domain Kustom (+7 more)

### Community 72 - "resize_tests.rs"
Cohesion: 0.41
Nodes (13): connect_ws(), create_terminal_with_size(), get_terminal_metadata(), request_attach(), Option, Value, Ws, send_resize() (+5 more)

### Community 73 - "010 — v0.6.1 Coding Agents & proot-distro, Anti-Timeout/Banter, dan Editor Engine In-house"
Cohesion: 0.20
Nodes (10): 010 — v0.6.1 Coding Agents & proot-distro, Anti-Timeout/Banter, dan Editor Engine In-house, 10. Bukan Scope, 11. Urutan Pengerjaan (TDD), 12. Definition of Done, 2. Hubungan dengan Rencana & Requirement, 3. Threat Model, 8. Konfigurasi Baru, 9. Keputusan Desain & Open Questions (+2 more)

### Community 74 - "006 — Handoff: VPN / Jaringan Khusus / Domain Kustom v0.5.3 (spec 009)"
Cohesion: 0.22
Nodes (9): 006 — Handoff: VPN / Jaringan Khusus / Domain Kustom v0.5.3 (spec 009), 1. Yang Dikerjakan, 2. Bukti Gate (angka aktual, 2026-08-23), 3. Pending (user-side / deferred), 4. Konteks untuk Sesi Berikutnya, 5. Fakta Kode Penting, Milestone A — Parser & Gate (`NET-001`, `NET-002`, `NET-006`, `NET-007`), Milestone B — Advertise & Banner (`NET-003`, `NET-004`, `NET-005`) (+1 more)

### Community 75 - "Companion Checklist — v0.6.1 Coding Agents & proot-distro, Anti-Timeout, Editor Engine"
Cohesion: 0.22
Nodes (9): 0. Ringkasan Deliverable, 2. Milestone B — Coding Agents (`AGT-001..005`), 5. Quality Gates & DoD, 6. Out of Scope (ingat), 7. Keputusan & Open Question Log, Companion Checklist — v0.6.1 Coding Agents & proot-distro, Anti-Timeout, Editor Engine, Green & gates, Impl (+1 more)

### Community 76 - "1. Milestone A — proot-distro (`PROOT-001..006`)"
Cohesion: 0.40
Nodes (5): 1. Milestone A — proot-distro (`PROOT-001..006`), Frontend, Green & gates, Impl backend, Red

### Community 77 - "1. Latar Belakang & Risiko"
Cohesion: 0.50
Nodes (4): 1.1 Skenario User, 1.2 Kondisi Saat Ini (fakta kode — titik awal), 1.3 Risiko Tanpa Desain, 1. Latar Belakang & Risiko

### Community 78 - "4. Milestone A — Environment proot-distro (`PROOT-001..006`)"
Cohesion: 0.50
Nodes (4): 4. Milestone A — Environment proot-distro (`PROOT-001..006`), Acceptance criteria, Keputusan desain, Perilaku

### Community 79 - "5. Milestone B — Coding Agents (`AGT-001..005`)"
Cohesion: 0.50
Nodes (4): 5. Milestone B — Coding Agents (`AGT-001..005`), Acceptance criteria, Keputusan desain, Perilaku

### Community 80 - "6. Milestone C — Anti-Timeout & Banter (`SESS-009/010`, `LIFE-010`, `PERF-006`) — PRIORITAS #1 USER"
Cohesion: 0.50
Nodes (4): 6. Milestone C — Anti-Timeout & Banter (`SESS-009/010`, `LIFE-010`, `PERF-006`) — PRIORITAS #1 USER, Acceptance criteria, Keputusan desain, Perilaku

### Community 81 - "7. Milestone D — Editor Engine In-house "mux-code" (`EDIT-009..016`, `PERF-007`)"
Cohesion: 0.50
Nodes (4): 7. Milestone D — Editor Engine In-house "mux-code" (`EDIT-009..016`, `PERF-007`), Acceptance criteria, Keputusan desain, Perilaku

### Community 82 - "007 — Handoff: Coding Agents & proot-distro, Anti-Timeout, Editor mux-code (spec 010, v0.6.1)"
Cohesion: 0.33
Nodes (4): 007 — Handoff: Coding Agents & proot-distro, Anti-Timeout, Editor mux-code (spec 010, v0.6.1), 2. Bukti Gate (2026-08-24), 3. Pending (user-side / deferred), 4. Konteks untuk Sesi Berikutnya

### Community 83 - "3. Milestone C — Anti-Timeout & Banter (`SESS-009/010`, `LIFE-010`, `PERF-006`) — PRIORITAS #1"
Cohesion: 0.50
Nodes (4): 3. Milestone C — Anti-Timeout & Banter (`SESS-009/010`, `LIFE-010`, `PERF-006`) — PRIORITAS #1, Green & gates, Impl, Red

### Community 84 - "4. Milestone D — Editor Engine "mux-code" (`EDIT-009..016`, `PERF-007`)"
Cohesion: 0.50
Nodes (4): 4. Milestone D — Editor Engine "mux-code" (`EDIT-009..016`, `PERF-007`), Green & gates, Impl, Red (logic murni — vitest)

### Community 86 - "1. Yang Dikerjakan"
Cohesion: 0.40
Nodes (5): 1. Yang Dikerjakan, Milestone A — proot-distro (`PROOT-001..006`), Milestone B — Coding agents (`AGT-001..005`), Milestone C — Anti-Timeout & Banter (PRIORITAS #1) (`SESS-009/010`, `LIFE-010`, `PERF-006`), Milestone D — Editor mux-code (`EDIT-009..016`, `PERF-007`)

### Community 87 - "v0.6.2 development planning from specs"
Cohesion: 0.07
Nodes (28): Assistant (Plan · Ox Alpha · 0.3s), Assistant (Plan · Ox Alpha · 10.9s), Assistant (Plan · Ox Alpha · 14.1s), Assistant (Plan · Ox Alpha · 17.2s), Assistant (Plan · Ox Alpha · 17.2s), Assistant (Plan · Ox Alpha · 18.7s), Assistant (Plan · Ox Alpha · 19.4s), Assistant (Plan · Ox Alpha · 206.8s) (+20 more)

### Community 89 - "Companion Checklist — v0.6.2 Editor Polish & Virtualisasi, Agents UX, Persist Layout, Network Hardening, Signing, Distro Mgmt"
Cohesion: 0.20
Nodes (10): 0. Ringkasan Deliverable, 10. Out of Scope (ingat), 11. Keputusan & Open Question Log, 6. Milestone F — Release Signing (`SIGN-001..003`), 8. Milestone H — Security Assurance (`SEC-007/008`), 9. Quality Gates & DoD, Companion Checklist — v0.6.2 Editor Polish & Virtualisasi, Agents UX, Persist Layout, Network Hardening, Signing, Distro Mgmt, Green & gates (+2 more)

### Community 90 - "Handoff 008 — v0.6.2 Editor Polish & Virtualisasi Penuh, Agents UX, Persist Layout, Network Hardening, Signing, Distro Mgmt"
Cohesion: 0.25
Nodes (5): 1. Yang dikerjakan (semua milestone A–H), 2. Keputusan implementasi (D-log), 3. Gates (semua hijau), 4. Pending (user-side), Handoff 008 — v0.6.2 Editor Polish & Virtualisasi Penuh, Agents UX, Persist Layout, Network Hardening, Signing, Distro Mgmt

### Community 91 - "1. Latar Belakang & Risiko"
Cohesion: 0.50
Nodes (4): 1.1 Skenario User, 1.2 Kondisi Saat Ini (fakta kode — titik awal), 1.3 Risiko Tanpa Desain, 1. Latar Belakang & Risiko

### Community 92 - "4. Milestone A — mux-code Polish: Komentar Blok Multi-line, Bracket Auto-close, Wrap Toggle (`EDIT-017`, `EDIT-013`, `EDIT-014`)"
Cohesion: 0.50
Nodes (4): 4. Milestone A — mux-code Polish: Komentar Blok Multi-line, Bracket Auto-close, Wrap Toggle (`EDIT-017`, `EDIT-013`, `EDIT-014`), Acceptance criteria, Keputusan desain, Perilaku

### Community 93 - "5. Milestone B — Virtualisasi Penuh (`EDIT-018`)"
Cohesion: 0.50
Nodes (4): 5. Milestone B — Virtualisasi Penuh (`EDIT-018`), Acceptance criteria, Keputusan desain, Perilaku

### Community 94 - "6. Milestone C — FolderPicker untuk cwd Quick-launch Agent (`AGT-006`)"
Cohesion: 0.50
Nodes (4): 6. Milestone C — FolderPicker untuk cwd Quick-launch Agent (`AGT-006`), Acceptance criteria, Keputusan desain, Perilaku

### Community 95 - "8. Milestone E — Network Hardening: Trusted Proxy + Wildcard Allowlist (`NET-007/008`)"
Cohesion: 0.50
Nodes (4): 8. Milestone E — Network Hardening: Trusted Proxy + Wildcard Allowlist (`NET-007/008`), Acceptance criteria, Keputusan desain, Perilaku

### Community 96 - "9. Milestone F/G — Release Signing (`SIGN-001..003`) & Manajemen Distro (`DISTRO-001..004`)"
Cohesion: 0.50
Nodes (4): 9. Milestone F/G — Release Signing (`SIGN-001..003`) & Manajemen Distro (`DISTRO-001..004`), Acceptance criteria, Milestone F — Signing, Milestone G — Manajemen distro + hint agent

### Community 97 - "1. Milestone A — mux-code Polish (`EDIT-017`, `EDIT-013`, `EDIT-014`)"
Cohesion: 0.50
Nodes (4): 1. Milestone A — mux-code Polish (`EDIT-017`, `EDIT-013`, `EDIT-014`), Green & gates, Impl, Red

### Community 98 - "2. Milestone B — Virtualisasi Penuh (`EDIT-018`)"
Cohesion: 0.50
Nodes (4): 2. Milestone B — Virtualisasi Penuh (`EDIT-018`), Green & gates, Impl, Red

### Community 99 - "3. Milestone C — FolderPicker cwd Agents (`AGT-006`)"
Cohesion: 0.50
Nodes (4): 3. Milestone C — FolderPicker cwd Agents (`AGT-006`), Green & gates, Impl, Red

### Community 100 - "4. Milestone D — Persist Layout Terminal (`TAB-010/011`)"
Cohesion: 0.50
Nodes (4): 4. Milestone D — Persist Layout Terminal (`TAB-010/011`), Green & gates, Impl, Red

### Community 101 - "5. Milestone E — Trusted Proxy + Wildcard Allowlist (`NET-007/008`)"
Cohesion: 0.50
Nodes (4): 5. Milestone E — Trusted Proxy + Wildcard Allowlist (`NET-007/008`), Green & gates, Impl, Red

### Community 102 - "7. Milestone G — Manajemen Distro + Agent Hints (`DISTRO-001..004`)"
Cohesion: 0.50
Nodes (4): 7. Milestone G — Manajemen Distro + Agent Hints (`DISTRO-001..004`), Green & gates, Impl, Red

### Community 103 - "FolderPicker.tsx"
Cohesion: 0.26
Nodes (9): FolderPicker(), FolderPickerProps, PickerRow, PickerSel, breadcrumbSegments(), Crumb, PickerEntry, entries (+1 more)

### Community 104 - "TerminalView.tsx"
Cohesion: 0.12
Nodes (22): BACKOFF_BASE_MS, BACKOFF_MAX_MS, canOpenSocket(), FrameOpcode, ERROR, EXIT, INPUT, OUTPUT (+14 more)

### Community 105 - "windowStore.ts"
Cohesion: 0.33
Nodes (7): ResizeDirection, WindowFrame(), WindowFrameProps, tileWindowsGrid(), WindowAction, windowReducer(), WindowState

### Community 106 - "terminalTabsLogic.ts"
Cohesion: 0.17
Nodes (26): adjustGroupFlex(), clampSplit(), closeTab(), createTab(), focusTargetIndex(), maxReached(), moveTab(), nextKey() (+18 more)

### Community 107 - "FileExplorerView.tsx"
Cohesion: 0.29
Nodes (6): DirectoryListing, FileEntry, FileExplorerView(), FileExplorerViewProps, SortBy, ViewMode

### Community 108 - "app.tsx"
Cohesion: 0.47
Nodes (4): SPA mount point (#app + main.tsx), App(), DesktopCanvas(), root

### Community 109 - "013 — v0.6.3 Support Hub & Discoverability, Agents Package Center, Integrasi 9Router, Config Editor + Model Selector"
Cohesion: 0.09
Nodes (21): 013 — v0.6.3 Support Hub & Discoverability, Agents Package Center, Integrasi 9Router, Config Editor + Model Selector, 10. Bukan Scope, 11. Definition of Done, 1.1 Masalah, 1.2 Kondisi Saat Ini (fakta kode — titik awal), 1.3 Risiko Tanpa Desain, 1. Latar Belakang & Risiko, 2. Threat Model (+13 more)

### Community 110 - "SupportHubView.tsx"
Cohesion: 0.19
Nodes (15): btn(), CatalogResp, chip(), ENVS, SupportHubView(), agentBadge(), buildOnboarding(), Guide (+7 more)

### Community 111 - "agent_cfg.rs"
Cohesion: 0.22
Nodes (16): acfg_004_claude_patch_empty_start(), acfg_004_claude_patch_keeps_fields(), acfg_004_opencode_patch_keeps_fields(), acfg_006_toml_upsert_idempotent(), acfg_006_toml_upsert_replaces_old_block(), acfg_006_write_backup_roundtrip_and_limit(), config_rel_path(), patch_claude_settings() (+8 more)

### Community 112 - "router9.rs"
Cohesion: 0.20
Nodes (13): Duration, addr(), fetch_models(), parse_models_response(), router_running(), Result, SocketAddr, String (+5 more)

### Community 113 - "engine.ts"
Cohesion: 0.26
Nodes (10): createModel(), deleteRange(), findMatches(), getText(), gotoLine(), insert(), replaceAll(), SearchHit (+2 more)

### Community 114 - "brackets.ts"
Cohesion: 0.36
Nodes (6): CLOSERS, InsertResult, isWordChar(), onSelfInsert(), PAIRS, wrapSelection()

### Community 115 - "start_server_with_session_limit"
Cohesion: 0.33
Nodes (6): Box, Future, Output, Pin, start_server_with_session_limit(), test_tab_001_registry_configurable_limit()

### Community 117 - "Mux Web UI — v0.3 Implementation Checklist & Verification Matrix"
Cohesion: 0.40
Nodes (5): Langkah 1 — Milestone A: Backend Dimension Clamping & Robustness, Langkah 2 — Milestone B: Frontend Window Resize Handles & Debouncing, Langkah 3 — Milestone C: Traceability, Documentation & Graph Update, Mux Web UI — v0.3 Implementation Checklist & Verification Matrix, TDD Execution Loop Standard

### Community 118 - "1. Milestone A — Git UI (`GIT-001..010`) — v0.4.1"
Cohesion: 0.67
Nodes (3): 1. Milestone A — Git UI (`GIT-001..010`) — v0.4.1, Backend Implementation (`src/git.rs` & `src/http.rs` / `src/routes/git.rs`), Test Suite (`tests/git_tests.rs`)

### Community 119 - "3. Milestone C — Read-only Share Links (`SHR-001..008`) — v0.4.0 (Bersama Archive)"
Cohesion: 0.67
Nodes (3): 3. Milestone C — Read-only Share Links (`SHR-001..008`) — v0.4.0 (Bersama Archive), Backend Implementation (`src/share.rs` & `src/http.rs` / `src/routes/share.rs`), Test Suite (`tests/share_tests.rs`)

## Knowledge Gaps
- **1042 isolated node(s):** `mux-web`, `1.1 Masalah`, `1.2 Kondisi Saat Ini (fakta kode — titik awal)`, `1.3 Risiko Tanpa Desain`, `2. Threat Model` (+1037 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `v0.2 Implementation Checklist & Verification Matrix` connect `v0.2 Implementation Checklist & Verification Matrix` to `SessionRegistry`, `auth.rs`, `Requirement Traceability Matrix`, `000a.plan-test.md`, `Mux Web UI — v0.2 Implementation Checklist & Verification Matrix`, `v0.2.1 Plan: Distribution (prebuilt binary + installer)`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `Handoff 001 - Progress & Backlog (v0.2)` connect `v0.2 Implementation Checklist & Verification Matrix` to `SessionRegistry`, `auth.rs`, `PtySession`, `000a.plan-test.md`, `4. SISA PEKERJAAN — Apa yang Belum Selesai`, `TestServer`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `Requirement Traceability Matrix` connect `Requirement Traceability Matrix` to `000a.plan-test.md`, `v0.2 Implementation Checklist & Verification Matrix`, `v0.2.1 Plan: Distribution (prebuilt binary + installer)`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `mux-web`, `1.1 Masalah`, `1.2 Kondisi Saat Ini (fakta kode — titik awal)` to the rest of the system?**
  _1042 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `http.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.051309574924860456 - nodes in this community are weakly interconnected._
- **Should `SessionRegistry` be split into smaller, more focused modules?**
  _Cohesion score 0.0992313067784766 - nodes in this community are weakly interconnected._
- **Should `TextEditorView.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13949579831932774 - nodes in this community are weakly interconnected._