# Device Smoke Checklist — v0.6.2/v0.6.3 (specs 010–013)

> Eksekusi: user-side di Termux nyata. Format: aksi → hasil diharapkan.
> Laporkan kegagalan dengan ID langkah (mis. `S2-agy`). Catatan: jalankan **S1
> setelah tag v0.6.3 terbit**; S2–S8 jalan dari binary main mana pun yang baru.

## Prasyarat

- Termux terupdate; `mux-web` v0.6.1 terpasang sebagai baseline.
- `pkg install proot-distro && proot-distro install ubuntu` (debian opsional).
- Siapkan kasus dengan/tanpa Node per env (untuk NODE_MISSING di S8).

---

## S1 — Installer/Updater + jalur signature (DIST/SIGN)

| Langkah | Harapan |
|---|---|
| Setelah rilis v0.6.3 live: `bash update.sh` di dir instalasi | Naik ke 0.6.3; log menyebut verifikasi minisign lalu sha256 |
| `MUX_WEB_STRICT_VERIFY=1 bash update.sh` selama rilis masih unsigned | GAGAL fail-closed (menolak rilis tanpa signature) |
| Setelah secret signing diset: `bash update.sh` | Verified tanpa warning |
| Uji tamper lokal: ubah 1 byte `checksums.txt` + sig lama (mirror `file://`) | install/update abort; binary lama tetap utuh |

## S2 — proot envs + quick-launch agent + Q1 `agy`

| Langkah | Harapan |
|---|---|
| Buka web → panel editor → header terminal | Chip env: Termux + distro terpasang, urut abjad |
| Klik chip ubuntu → tombol 🤖 | 4 agent; badge Found sesuai realita tiap env |
| Launch OpenCode @ ubuntu | Tab baru berlabel `[opencode@ubuntu]`; prompt di dalam distro |
| Workspace di `$HOME/...` atau `/sdcard/...`, cek `pwd` | Cwd dipertahankan (prefix shared); di luar prefix → HOME distro |
| `proot-distro login ubuntu -- sh -lc 'command -v agy'` | Ada → OK. Tidak ada → laporkan `S2-agy` (fix 1 baris `src/agents.rs`) |
| Agent streaming output → layar mati 10 menit → bangun | Session hidup (busy-grace extend selama ada output) |

## S3 — Editor mux-code

| Langkah | Harapan |
|---|---|
| Buka file Rust/TS dengan blok `/* ... */` ≥3 baris | Semua baris blok terwarnai komentar (stateful tokenizer) |
| Ketik `/*` tanpa penutup | Baris berikutnya ikut terwarnai; normal lagi setelah `*/` |
| Ketik `(` `{` `[` `"` | Auto-close pair; ketik penutup sama = skip-over; seleksi + `(` = wrap seleksi |
| Toggle wrap (toolbar / menu View / chip statusbar) | Teks wrap; gutter disembunyikan; preferensi persist per window |
| Buka file 5–10k baris, scroll cepat | Mulus; gutter + highlight ter-window; highlight aktif sampai ±2 MB |

## S4 — Agents cwd override + persist layout

| Langkah | Harapan |
|---|---|
| Ikon 📁 di area agents → FolderPicker → pilih proyek lain | Chip cwd override muncul (bisa dihapus); launch agent mendarat di folder itu (cek `pwd`) |
| Susun 2–3 tab/split terminal → reload halaman | Layout terpulihkan; hanya sessionId yang masih hidup dipulihkan |
| Isi localStorage layout dengan JSON korup → reload | Fallback kosong tanpa crash |

## S5 — AFK reconnect (spec 012)

| Langkah | Harapan |
|---|---|
| Jalankan job panjang (`yes` / codex) → lock screen 5 menit → kembali | Indicator "Menghubungkan ulang…" singkat; riwayat replay; job masih jalan |
| Matikan proses server saat streaming → hidupkan lagi | Client retry backoff 0.5→1→2→4→cap 10s; reconnect otomatis saat server kembali |
| Ketik `exit` / DELETE session saat terputus | Loop retry BERHENTI (tidak spam); overlay permanen informatif |
| Pindah tab background lama → kembali (visible) | Reconnect immediat, tanpa menunggu sisa backoff |

## S6 — Network hardening (NET-007/008)

| Langkah | Harapan |
|---|---|
| Reverse proxy + `--trusted-proxies <ip-proxy>`; spoof XFF dari klien | Rate-limit pairing menghitung IP klien asli (bukan proxy); 429 seperti biasa |
| `--allowed-hosts '*.ts.net'` lalu akses via `<apa>.ts.net` | Diterima (multi-level); `ts.net.evil.com` / lookalike ditolak 403 |
| Advertise/banner URL | Tetap exact-only (tanpa wildcard) |

## S7 — Distro management (DISTRO-001..004)

| Langkah | Harapan |
|---|---|
| Buka modal ⚙️ environment | Katalog installed vs available; status akurat |
| Install debian dari UI | Progress stream live; selesai → chip debian muncul |
| Coba install kedua bersamaan | 409 TASK_BUSY, ramah |
| Cancel mid-install | Task berhenti (SIGKILL); state bersih |
| Remove distro | Wajib konfirmasi ketik id; terhapus dari chips |

## S8 — Support Hub / Package Center / 9Router / Config (spec 013)

| Langkah | Harapan |
|---|---|
| StartMenu → 🛟 Support Hub | Window terbuka; kartu status live (distro, agents, router) akurat |
| Buka panduan accordion + onboarding checklist | Panduan per fitur ada; CTA cocok dengan kondisi nyata |
| Package Center: install opencode di env TANPA node | Gagal cepat dengan NODE_MISSING + hint (bukan spawn sia-sia) |
| Package Center: uninstall+install opencode di env ber-node | Stream progress; cancel jalan; duplikat → TASK_BUSY |
| 9Router jalan (`npm i -g 9router && 9router`) → kartu hub | Status hijau port 20128; daftar model terisi; tombol dashboard membuka browser app |
| Config Editor codex → Save | File tertulis; `.bak` dibuat; >256 KiB ditolak |
| Route via 9Router (codex) ×2 | Blok `[model_providers.9router]` + `model_provider` idempoten (tidak dobel) |
| Route via 9Router (claude) | `env.ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` di settings.json; field lain utuh |
| Model Selector dropdown | Terisi dari `/api/v1/router/models`; kosong/503 bila router mati |

---

## S9 — Notebooks 📓 (spec 014 M-A)

| Langkah | Harapan |
|---|---|
| File Explorer → double-klik `analysis.ipynb` 1–5 MiB | Jendela 📓 Notebooks terbuka via `windowRouter.ts:11` routing `*.ipynb→notebooks`; render <1.5 s mid-range device, scroll mulus; toolbar + tabs Origin/Hasil terlihat |
| Edit markdown cell → double-klik → ubah teks → Save | Perubahan persist setelah reload; `PUT /api/v1/fs/file` menyimpan nbformat valid (buka lagi parser tidak error); file `.ipynb` tetap valid JSON di disk |
| Execute All di env berjupyter → toolbar ▶ Jalankan Semua | Status bar busy spinner; `POST /api/v1/notebooks/execute` → WS `/api/v1/notebooks/:id/ws` stream `line` → `GET /api/v1/notebooks/executed/:id` mengisi tab Hasil dengan outputs baru yang hanya cell berubah re-render |
| Execute All di env tanpa jupyter | Pesan ramah `JUPYTER_MISSING` + hint `pip install jupyter` di Support Hub; tidak ada spawn jupyter sia-sia; status WS langsung `exit` error |
| Run Cell ▶ di cell ke-3 (L2) | `POST /api/v1/notebooks/cell` `{prefix_src,cell_src}` memakai `cellsToScript` marker `# %% MUXCELL N` → stdout segmen tepat masuk output cell tersebut (text/error saja; badge rich-media-limited); progress live |
| Dokumen bomb-lite 2500 cells / output >256 KiB | Editor menolak ramah `NOTEBOOK_CORRUPT`; output besar collapsed “show more” / banner `big` — webview tidak OOM (guard `notebookModel.ts:6-8`) |
| Kernel Bridge toggle (gear → checkbox) | Default OFF; hidden panel saat OFF; ON menampilkan info `EXPERIMENTAL — tersedia di gelombang berikutnya` — flag persist `mux_kernel_bridge` |

## S10 — Python Runner 🐍 (spec 014 M-B)

| Langkah | Harapan |
|---|---|
| Buka `main.py` di editor → toolbar | Tombol ▶ Run muncul hanya untuk `.py` (deteksi `.endsWith('.py')` di `TextEditorView.tsx`); picker env Termux/ubuntu |
| `print` loop di env ubuntu ber-python → ▶ Run | Drawer bawah stream live via WS `/api/v1/run/python/:id/ws` (`type:line`), chip exit `code` akurat; scroll panel |
| Tekan ■ Stop saat run panjang | Cancel = SIGKILL group (`run_tools.rs:282`); stream `exit` segera; `ps` di shell: proses hilang |
| Env tanpa `python3` → ▶ Run | `400 PYTHON_MISSING` + hint install python per-distro di notice banner; tidak spawn |
| Traceback `File "main.py", line 12` muncul di output | Baris link klik → membuka file `main.py:12` di editor (mapper `runPanelLogic.ts` last-frame-first) |
| Screen-off 10 menit saat run streaming → bangun | Session tetap hidup (busy-grace `src/config.rs:112` `run_timeout_secs`); drawer sinkron setelah reconnect backoff `500→10s` |

## S11 — PDF Reader 📄 (spec 014 M-C)

| Langkah | Harapan |
|---|---|
| Double-klik `paper.pdf` 1–10 MiB di File Explorer | Jendela 📄 PDF Reader terbuka via routing `*.pdf→pdf` (`windowRouter.ts`); render continuous scroll `±2` viewport; fitur fit-width default |
| Outline/bookmark ada → sidebar ☰ Outline | Tree `outlineFlatten` tampil; klik item jump ke halaman benar |
| Thumbnail rail ▦ → scroll | Small canvases lazy 110px width, click goto |
| Goto halaman input “42” Enter | Scroll ke halaman 42 |
| Pinch atau tombol ± / Fit | Zoom 0.25…4 step 0.25, fit-width reset |
| Cari “convolution” → Enter → ◀/▶ | Iterasi `getTextContent` + `searchPlan` page-scoped, hit counter `3/12` akurat; jump ke hit benar |
| Dokumen >25 MiB (default `MUX_WEB_DOC_MAX_BYTES`) | Pesan ramah `Ukuran dokumen melebihi batas 25 MiB … mux_doc_max_bytes`; tombol `Open ↗` / fallback membuka `/api/v1/fs/file` mentah di tab baru |
| Dokumen enkripsi / korup | Banner Indonesian spesifik `terenkripsi — dibuka tanpa sandi tidak didukung` / `File bukan PDF valid` sesuai `PdfViewerView.tsx:392` |
| Budget | `npm run build` + `scripts/check_budget.sh` kirim `Frontend Gzip 537 KiB` (index 141 + pdf chunk 118 + worker 279) — hard PASS `<750` |

## S12 — Codex Window 🤖 (spec 014 M-D)

| Langkah | Harapan |
|---|---|
| Start Menu → 🤖 Codex → launcher | Picker env (fetch `/api/v1/environments` fallback `termux`), models (fetch `/api/v1/router/models` deep-link Config Editor; `503 ROUTER_DOWN` notice), sandbox `read-only`/`workspace-write` radio + danger disabled, task prompt satu baris; gate `validateCodexOpts` tampil bila model mengandung metachar `;` atau sandbox bahaya |
| Isi task “jelaskan repo ini” → 🚀 Jalankan Sesi | Satu PTY dibuat via `POST /api/v1/terminals` (cwd/env); line `codex exec --json "tugas"` diketik persis sekali (via `composeLaunchInput` quoting) — satu-satunya channel eksekusi |
| Chat view (default) saat codex berjalan | Bubbles user kanan / assistant kiri, tool-call card collapsible nama+args, tool-result dim, error banner merah — stream `OutputPump` parsing `codexEvents.ts` tolerant ≥2 skema CLI |
| Approval muncul (tool meminta izin) | Kartu Approve/Deny → mengirim persis `keystrokesFor('y'/'n'/'esc')` (`'\n'` / `'\x1b'`) ke PTY yang sama; tidak ada jalur eksekusi kedua; default-deny |
| Prompt library drawer 📚 | CRUD per-workspace namespace `mux_codex_prompts_<sanitize>`; flag ⚠ untuk entry mengandung flag berbahaya; insert ke prompt → launcher terisi; quota penuh lapor `PROMPT_STORE_FULL` |
| Drift simulasi: edit `codexFixtures.ts` fixture tampered / CLI ubah format | Dalam window event, `unparsableRatio >0.2` atau `errorBurst ≥3` → toast `Mode chat dinonaktifkan sementara — beralih ke terminal` + otomatis switch Chat→Terminal; toggle manual tetap bisa Chat⇄Terminal satu sesi |
| History drawer (launcher) | Daftar 20 sesi terakhir ×200 event tertrim `trimHistory`; audit mini-log 50 entri |
| AFK: streaming codex → matikan layar 5 menit → nyala | Session PTY tetap jalan; client backoff retry `500→10s` (reuse `reconnect.ts` trio `canOpenSocket` single-guard); reconnect otomatis; exit `EXIT`/`ERROR` frame mengakhiri loop dengan overlay `Sesi codex selesai` |

---

## Peta perbaikan cepat

| Gejala | Fix |
|---|---|
| `S2-agy`: binary antigravity bukan `agy` | 1 baris registry `src/agents.rs` → commit → tag patch |
| Reconnect tidak jalan | Periksa konsol browser (backoff timer), laporkan `S5-*` |
| Signature gagal saat update | Cek pubkey ter-embed = `minisign.pub` ceremony; `MUX_WEB_MINISIGN_PUB` override untuk uji |
| Notebooks Execute All hang `TASK_BUSY` | `POST /api/v1/notebooks/execute` melakukan `reap_if_done` sebelum `spawn_run` — cek `src/http.rs:596` |
| Python Run line-flood OOM | Cek `MAX_LINE_BYTES 256 KiB` truncate di `src/run_tools.rs:152` + marker `<…truncated>` |
| PDF worker blank di WebView | Pastikan asset lokal `pdf.worker.min.mjs` terbawa di `web/dist/assets/` — bukan CDN; `pdfLoader.ts:7` `new URL(...)` |
| Codex approval tidak merespon | Tombol harus kirim `keystrokesFor` persis; cek `codexBridge.ts:91` mapping `y→\n` `esc→\x1b`; sandbox allowlist hanya `read-only`/`workspace-write` |
