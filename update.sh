#!/usr/bin/env bash
set -e

# Mux Web UI — Termux & Linux Universal Updater (binary-first)
#
# DIST-011..012: compare installed version against the latest release, download
# the prebuilt binary, verify SHA-256, backup + auto-rollback on smoke failure.
# Never installs from `main` on the normal path.
#
# Config (precedence: CLI > env > default):
#   --rollback        restore the previous binary from mux-web.bak (idempotent)
#   MUX_WEB_BASE_URL  override download base URL (https:// or file://) for tests (DIST-013)
#   MUX_WEB_INSTALL_DIR  override install directory
#   MUX_WEB_SMOKE_FAIL=1  force smoke failure (CI test hook, DIST-012)

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

DEFAULT_BASE_URL="https://github.com/mcpe500/mux-web-ui/releases/download"
GITHUB_API="https://api.github.com/repos/mcpe500/mux-web-ui/releases/latest"
API_URL="${MUX_WEB_API_URL:-$GITHUB_API}"

# ── SIGN-002 (spec 011): release signing pubkey (minisign) ──────────────────
# Keep in sync with share/minisign.pub and install.sh. Replace during the
# offline key ceremony; UNTRUSTED-PLACEHOLDER marker = not configured yet.
SIG_PUBKEY='untrusted comment: mux-web release signing key (UNTRUSTED-PLACEHOLDER)
RWS-placeholder-not-a-real-key-replace-me'

sig_verify_dir() {
    local d="$1"
    command -v minisign >/dev/null 2>&1 || return 2
    [ -f "$d/checksums.txt.minisig" ] || return 2
    local pub="${MUX_WEB_MINISIGN_PUB:-}"
    local pubtmp=""
    if [ -z "$pub" ] || [ ! -f "$pub" ]; then
        pubtmp=$(mktemp)
        printf '%s\n' "$SIG_PUBKEY" > "$pubtmp"
        pub="$pubtmp"
    fi
    if grep -q "UNTRUSTED-PLACEHOLDER" "$pub" 2>/dev/null; then
        [ -n "$pubtmp" ] && rm -f "$pubtmp"
        return 2
    fi
    local ok=0
    minisign -V -q -p "$pub" -m "$d/checksums.txt" -x "$d/checksums.txt.minisig" >/dev/null 2>&1 || ok=1
    [ -n "$pubtmp" ] && rm -f "$pubtmp"
    if [ $ok -eq 0 ]; then
        echo -e "${GREEN}✅ Release signature verified (minisign).${RESET}"
        return 0
    fi
    return 1
}

sig_gate() {
    local rc=0
    sig_verify_dir "$1" || rc=$?
    case $rc in
        0) return 0 ;;
        1) die "RELEASE SIGNATURE VERIFICATION FAILED — possible tampering. Update aborted." ;;
        *)
            if [ "${MUX_WEB_STRICT_VERIFY:-0}" = "1" ]; then
                die "MUX_WEB_STRICT_VERIFY=1 but the signature could not be verified (minisign / checksums.txt.minisig / trusted pubkey missing)."
            fi
            echo -e "${YELLOW}⚠️  Signature NOT verified — falling back to SHA-256-only integrity.${RESET}"
            echo -e "${YELLOW}   Install 'minisign' (Termux: pkg install minisign) for full supply-chain checks.${RESET}"
            ;;
    esac
}

usage() {
    cat <<EOF
Mux Web UI Updater (binary-first)

Usage: $0 [--rollback] [--help]

  --rollback   Restore the previous binary from mux-web.bak (idempotent)
  --help       Show this help

Env:
  MUX_WEB_BASE_URL    Override download base URL (default: $DEFAULT_BASE_URL)
  MUX_WEB_API_URL     Override releases/latest API URL (tests; default: GitHub API)
  MUX_WEB_INSTALL_DIR Override install directory
EOF
}

die() {
    echo -e "${RED}Error: $1${RESET}" >&2
    exit 1
}

# numeric x.y.z compare: prints lt / eq / gt
ver_cmp() {
    awk -v a="$1" -v b="$2" 'BEGIN {
        split(a, A, "."); split(b, B, ".");
        for (i = 1; i <= 3; i++) {
            if ((A[i] + 0) < (B[i] + 0)) { print "lt"; exit }
            if ((A[i] + 0) > (B[i] + 0)) { print "gt"; exit }
        }
        print "eq"
    }'
}

# --- CLI args --------------------------------------------------------------
ROLLBACK=0
while [ $# -gt 0 ]; do
    case "$1" in
        --rollback) ROLLBACK=1; shift ;;
        --help|-h) usage; exit 0 ;;
        *) die "unknown argument: $1 (see --help)" ;;
    esac
done

# --- install dir (same detection as install.sh) ------------------------------
IS_TERMUX=0
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux/files/usr/bin" ]; then
    IS_TERMUX=1
fi

if [ -n "$MUX_WEB_INSTALL_DIR" ]; then
    INSTALL_DIR="$MUX_WEB_INSTALL_DIR"
elif [ $IS_TERMUX -eq 1 ]; then
    INSTALL_DIR="/data/data/com.termux/files/usr/bin"
elif [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
fi

BASE_URL="${MUX_WEB_BASE_URL:-$DEFAULT_BASE_URL}"
BIN="$INSTALL_DIR/mux-web"

# --- manual rollback (C.5) ---------------------------------------------------
if [ $ROLLBACK -eq 1 ]; then
    echo -e "${BOLD}${BLUE}=== Mux Web UI Rollback ===${RESET}"
    if [ ! -f "$INSTALL_DIR/mux-web.bak" ]; then
        echo -e "${YELLOW}No backup found at $INSTALL_DIR/mux-web.bak — nothing to restore.${RESET}"
        exit 0
    fi
    mv -f "$INSTALL_DIR/mux-web.bak" "$BIN"
    chmod +x "$BIN"
    echo -e "${GREEN}✅ Restored previous Mux Web UI from backup.${RESET}"
    "$BIN" --version
    exit 0
fi

echo -e "${BOLD}${BLUE}=== Updating Mux Web UI ===${RESET}"

[ -f "$BIN" ] || die "mux-web is not installed at $INSTALL_DIR — run install.sh first"

# --- current version (C.2) ---------------------------------------------------
CURRENT=$("$BIN" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
[ -z "$CURRENT" ] && die "cannot parse installed version from: $("$BIN" --version 2>&1)"

LATEST=$(curl -sSL "$API_URL" 2>/dev/null | grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/^v//' || true)
if [ -z "$LATEST" ]; then
    if [ -f "Cargo.toml" ]; then
        LATEST=$(grep -m1 '^version' Cargo.toml | cut -d'"' -f2 || true)
    fi
    if [ -z "$LATEST" ]; then
        LATEST=$(curl -sSL "https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/Cargo.toml" 2>/dev/null | grep -m1 '^version' | cut -d'"' -f2 || true)
    fi
fi
[ -z "$LATEST" ] && die "cannot resolve latest version (check network / MUX_WEB_BASE_URL)"

echo -e "${GREEN}Installed version:${RESET} $CURRENT"
echo -e "${GREEN}Latest version:${RESET}    $LATEST"

if [ "$(ver_cmp "$CURRENT" "$LATEST")" != "lt" ]; then
    echo -e "${GREEN}✅ Mux Web UI is already up to date ($CURRENT).${RESET}"
    exit 0
fi

# --- download + verify (DIST-011) --------------------------------------------
ARCH=$(uname -m)
case "$ARCH" in
    aarch64|arm64)
        if [ $IS_TERMUX -eq 1 ]; then TARGET="aarch64-linux-android"; else TARGET="aarch64-unknown-linux-gnu"; fi ;;
    x86_64|amd64)
        TARGET="x86_64-unknown-linux-gnu" ;;
    *)
        die "no prebuilt binary for arch '$ARCH' — install via install.sh (source fallback)" ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo -e "${BLUE}Downloading mux-web $LATEST ($TARGET)...${RESET}"
curl -fsSL -o "$tmp/mux-web-$LATEST-$TARGET" "$BASE_URL/v$LATEST/mux-web-$LATEST-$TARGET" || die "download failed"
curl -fsSL -o "$tmp/mux-web-$LATEST-$TARGET.sha256" "$BASE_URL/v$LATEST/mux-web-$LATEST-$TARGET.sha256" || die "checksum download failed"

# SIGN-002 (spec 011): verify the aggregate checksum signature BEFORE trusting
# any per-file SHA-256 sums (supply-chain gate, fail-closed on tampering).
if curl -fsSL -o "$tmp/checksums.txt" "$BASE_URL/v$LATEST/checksums.txt" 2>/dev/null \
    && curl -fsSL -o "$tmp/checksums.txt.minisig" "$BASE_URL/v$LATEST/checksums.txt.minisig" 2>/dev/null; then
    sig_gate "$tmp"
else
    if [ "${MUX_WEB_STRICT_VERIFY:-0}" = "1" ]; then
        die "MUX_WEB_STRICT_VERIFY=1 but checksums.txt(.minisig) unavailable at $BASE_URL/v$LATEST"
    fi
    echo -e "${YELLOW}⚠️  checksums.txt(.minisig) unavailable — SHA-256-only mode.${RESET}"
fi

echo -e "${BLUE}Verifying SHA-256 checksum...${RESET}"
if ! (cd "$tmp" && sha256sum -c "mux-web-$LATEST-$TARGET.sha256" >/dev/null 2>&1); then
    die "checksum verification FAILED — update aborted (DIST-009)"
fi

# --- backup + install + smoke + rollback (DIST-012) --------------------------
echo -e "${BLUE}Backing up current binary to mux-web.bak...${RESET}"
mv -f "$BIN" "$INSTALL_DIR/mux-web.bak"

install -m 0755 "$tmp/mux-web-$LATEST-$TARGET" "$BIN"

echo -e "${BLUE}Smoke test: mux-web --version...${RESET}"
SMOKE_OK=1
if [ "$MUX_WEB_SMOKE_FAIL" = "1" ]; then
    SMOKE_OK=0
elif ! "$BIN" --version 2>&1 | grep -q "$LATEST"; then
    SMOKE_OK=0
fi

if [ $SMOKE_OK -ne 1 ]; then
    echo -e "${RED}Smoke test failed — rolling back to previous version...${RESET}" >&2
    mv -f "$INSTALL_DIR/mux-web.bak" "$BIN"
    chmod +x "$BIN"
    die "update failed; previous version restored ($("$BIN" --version 2>&1))"
fi

echo -e "\n${BOLD}${GREEN}✅ Mux Web UI updated successfully to $LATEST at $INSTALL_DIR/mux-web!${RESET}"
echo -e "${YELLOW}Notice: v0.2+ requires single-use token pairing for web access.${RESET}"
echo -e "${YELLOW}Run 'mux-web' and use the bootstrap URL / token printed on startup.${RESET}"
echo -e "${YELLOW}Previous version kept at mux-web.bak — restore anytime with '$0 --rollback'.${RESET}\n"
