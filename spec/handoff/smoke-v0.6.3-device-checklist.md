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

## Peta perbaikan cepat

| Gejala | Fix |
|---|---|
| `S2-agy`: binary antigravity bukan `agy` | 1 baris registry `src/agents.rs` → commit → tag patch |
| Reconnect tidak jalan | Periksa konsol browser (backoff timer), laporkan `S5-*` |
| Signature gagal saat update | Cek pubkey ter-embed = `minisign.pub` ceremony; `MUX_WEB_MINISIGN_PUB` override untuk uji |
