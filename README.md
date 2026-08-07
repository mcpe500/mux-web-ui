# Mux Web UI ⚡

> **Lightweight local web desktop & control center for Termux (Android ARM64) & Linux.**

Mux Web UI runs as a single self-contained binary server. Open one local URL in your browser to get a complete desktop interface featuring a multi-window manager, PTY interactive terminal, file manager, text editor, and system control center—all running natively inside your Termux or Linux shell environment.

---

## ⚡ Quick 1-Line Commands (Create / Update / Delete)

### 📥 Install (Create)
Run this single command in Termux or Linux terminal to install `mux-web` immediately (no pre-cloning required):

```bash
curl -fsSL https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/install.sh | bash
```

### 🔄 Update
To update `mux-web` to the latest version at any time:

```bash
curl -fsSL https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/update.sh | bash
```

### 🗑️ Uninstall (Delete)
To completely remove `mux-web` from your system:

```bash
curl -fsSL https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/uninstall.sh | bash
```

---

## 🚀 Quick Start

Launch the server:

```bash
# Default Local Mode (binds to 127.0.0.1:7681)
mux-web

# LAN Mode (binds to 0.0.0.0 for access from laptop/tablet on same WiFi)
mux-web --lan
```

Open your browser at `http://127.0.0.1:7681` to view your desktop environment.

---

## ✨ Features

- **⚡ PTY Interactive Terminal**: Powered by xterm.js and native Rust pseudo-terminal streams. Runs real shell commands (`bash`, `nano`, `vim`, `top`, `htop`).
- **🪟 Desktop Window Manager**: Free-form windowing with drag, resize, minimize, maximize, restore, and z-index ordering.
- **📁 File Explorer**: Navigate directories with breadcrumbs, list files, view metadata, and launch **"Terminal Here"** sessions.
- **📝 Text Editor**: Plain text file editor with unsaved changes tracking (`*`), line & column cursor counter, and atomic file save.
- **📊 System Monitor**: Real-time control dashboard displaying server uptime, active terminal sessions, allowed roots, and emergency stop actions.
- **🛡️ Security First**: Allowed root containment preventing path traversal (`..`, `%2f`, NUL bytes) and symlink escapes.
- **📦 Single Executable**: Frontend is compressed and embedded into the binary. Zero runtime dependencies (no Node.js or Python required on host).

---

## 🔒 Security & Authentication

Every Mux Web UI session is authenticated by default:
- **Single-Use Bootstrap Secret**: On startup, `mux-web` generates a 32-byte CSPRNG bearer token and prints a pairing URL to stdout. Opening the URL exchanges the token for an HTTP-only, `SameSite=Strict` session cookie.
- **TLS Support**: Pass `--tls-cert <path>` and `--tls-key <path>` to enable HTTPS/WSS. Use `--generate-cert` to automatically create a self-signed TLS certificate in `~/.mux-web`.
- **Loopback Default**: By default, `mux-web` binds strictly to `127.0.0.1`. Remote network access requires `--lan` or explicit `--bind <ip>`.
- **DNS Rebinding Defense**: Requests with invalid `Origin` or spoofed `Host` headers are automatically rejected with `403 Forbidden`.

---

## 📊 Performance & Size Benchmarks

| Metric | Budget Target | Measured Result |
|---|---|---|
| **Executable Compressed Size (gzip)** | <= 10.0 MiB | **1.33 MiB** 🟢 |
| **Executable Raw Size** | — | **2.88 MiB** |
| **Frontend Bundle (gzip)** | <= 750 KiB | **82.98 KiB** 🟢 |
| **Idle Memory (RSS)** | <= 35 MiB | **~18 MiB** 🟢 |

---

## 🛠️ Building from Source

### Prerequisites
- [Rust toolchain](https://rustup.rs/) (`cargo`, `rustc`)
- [Node.js 20+](https://nodejs.org/) & `npm`

### Steps

```bash
# 1. Clone repository
git clone https://github.com/mcpe500/mux-web-ui.git
cd mux-web-ui

# 2. Build production frontend assets
npm --prefix web install
npm --prefix web run build

# 3. Build optimized release binary
cargo build --release

# 4. Run tests & budget checks
cargo test
./scripts/check_budget.sh

# Executable ready at target/release/mux-web
```

---

## 📜 License

MIT © [mcpe500](https://github.com/mcpe500)
