#!/usr/bin/env bash
set -e

# Mux Web UI — Termux & Linux Universal Installer (binary-first)
#
# DIST-007..010: download prebuilt release binary, verify SHA-256, and install
# WITHOUT a Rust toolchain. Compile-from-source is an explicit fallback when the
# download/verify path fails or the platform has no prebuilt binary.
#
# Config (precedence: CLI > env > default):
#   --version <ver>      pin a specific version (DIST-008)
#   MUX_WEB_VERSION      same, via env
#   MUX_WEB_BASE_URL     override download base URL (https:// or file://) for tests (DIST-013)
#   MUX_WEB_INSTALL_DIR  override install directory (DIST-007/B.7)

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

DEFAULT_BASE_URL="https://github.com/mcpe500/mux-web-ui/releases/download"
GITHUB_API="https://api.github.com/repos/mcpe500/mux-web-ui/releases/latest"
API_URL="${MUX_WEB_API_URL:-$GITHUB_API}"

usage() {
    cat <<EOF
Mux Web UI Installer (binary-first)

Usage: $0 [--version <ver>] [--help]

  --version <ver>   Install a specific version (default: latest release)
  --help            Show this help

Env:
  MUX_WEB_VERSION     Same as --version
  MUX_WEB_BASE_URL    Override download base URL (default: $DEFAULT_BASE_URL)
  MUX_WEB_API_URL     Override releases/latest API URL (tests; default: GitHub API)
  MUX_WEB_INSTALL_DIR Override install directory
EOF
}

die() {
    echo -e "${RED}Error: $1${RESET}" >&2
    exit 1
}

# --- CLI args --------------------------------------------------------------
VERSION=""
while [ $# -gt 0 ]; do
    case "$1" in
        --version) VERSION="$2"; shift 2 ;;
        --help|-h) usage; exit 0 ;;
        *) die "unknown argument: $1 (see --help)" ;;
    esac
done
VERSION="${MUX_WEB_VERSION:-$VERSION}"

# --- platform detection ----------------------------------------------------
IS_TERMUX=0
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux/files/usr/bin" ]; then
    IS_TERMUX=1
fi

ARCH=$(uname -m)
TARGET=""
case "$ARCH" in
    aarch64|arm64)
        if [ $IS_TERMUX -eq 1 ]; then TARGET="aarch64-linux-android"; else TARGET="aarch64-unknown-linux-gnu"; fi ;;
    x86_64|amd64)
        TARGET="x86_64-unknown-linux-gnu" ;;
    *)
        TARGET="" ;;
esac

if [ -n "$MUX_WEB_INSTALL_DIR" ]; then
    INSTALL_DIR="$MUX_WEB_INSTALL_DIR"
elif [ $IS_TERMUX -eq 1 ]; then
    INSTALL_DIR="/data/data/com.termux/files/usr/bin"
elif [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
fi
mkdir -p "$INSTALL_DIR"

BASE_URL="${MUX_WEB_BASE_URL:-$DEFAULT_BASE_URL}"

echo -e "${BOLD}${BLUE}=== Mux Web UI Installer ===${RESET}"
echo -e "${GREEN}Platform:${RESET} $([ $IS_TERMUX -eq 1 ] && echo "Termux/Android" || echo "Linux") ($ARCH)"
echo -e "${GREEN}Target installation directory:${RESET} $INSTALL_DIR"

# --- resolve version (DIST-008) --------------------------------------------
if [ -z "$VERSION" ]; then
    VERSION=$(curl -sSL "$API_URL" 2>/dev/null | grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/^v//' || true)
    if [ -z "$VERSION" ]; then
        if [ -f "Cargo.toml" ]; then
            VERSION=$(grep -m1 '^version' Cargo.toml | cut -d'"' -f2 || true)
        fi
        if [ -z "$VERSION" ]; then
            VERSION=$(curl -sSL "https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/Cargo.toml" 2>/dev/null | grep -m1 '^version' | cut -d'"' -f2 || true)
        fi
    fi
fi

if [ -z "$VERSION" ]; then
    VERSION="0.3.0"
fi

echo -e "${GREEN}Version:${RESET} $VERSION"

# --- binary-first install (DIST-007..009) -----------------------------------
install_from_release() {
    local tmp
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT

    local bin_url="$BASE_URL/v$VERSION/mux-web-$VERSION-$TARGET"
    local sha_url="$bin_url.sha256"

    echo -e "${BLUE}Downloading mux-web $VERSION ($TARGET)...${RESET}"
    if ! curl -fsSL -o "$tmp/mux-web-$VERSION-$TARGET" "$bin_url" 2>/dev/null; then
        echo -e "${YELLOW}Prebuilt binary not available at $bin_url${RESET}"
        return 1
    fi
    if ! curl -fsSL -o "$tmp/mux-web-$VERSION-$TARGET.sha256" "$sha_url" 2>/dev/null; then
        echo -e "${YELLOW}Checksum not available at $sha_url${RESET}"
        return 1
    fi

    echo -e "${BLUE}Verifying SHA-256 checksum...${RESET}"
    if ! (cd "$tmp" && sha256sum -c "mux-web-$VERSION-$TARGET.sha256" >/dev/null 2>&1); then
        echo -e "${RED}Checksum verification FAILED — refusing to install.${RESET}" >&2
        return 1
    fi

    if [ -f "$INSTALL_DIR/mux-web" ]; then
        echo -e "${BLUE}Backing up existing binary to mux-web.old...${RESET}"
        mv -f "$INSTALL_DIR/mux-web" "$INSTALL_DIR/mux-web.old"
    fi

    install -m 0755 "$tmp/mux-web-$VERSION-$TARGET" "$INSTALL_DIR/mux-web"
    echo -e "${BLUE}Smoke test: mux-web --version...${RESET}"
    if ! "$INSTALL_DIR/mux-web" --version 2>&1 | grep -q "$VERSION"; then
        echo -e "${RED}Smoke test failed — restoring previous binary.${RESET}" >&2
        [ -f "$INSTALL_DIR/mux-web.old" ] && mv -f "$INSTALL_DIR/mux-web.old" "$INSTALL_DIR/mux-web"
        return 1
    fi

    rm -f "$INSTALL_DIR/mux-web.old"
    return 0
}

# --- fallback: compile from source (DIST-010) -------------------------------
fallback_source() {
    echo -e "${YELLOW}No prebuilt binary for this platform (or download failed).${RESET}"
    echo -e "${YELLOW}Falling back to compile-from-source. A Rust toolchain is required.${RESET}"

    if ! command -v cargo >/dev/null 2>&1; then
        if [ $IS_TERMUX -eq 1 ] && command -v pkg >/dev/null 2>&1; then
            echo -e "${YELLOW}Fresh Termux environment: installing rust git tar...${RESET}"
            pkg update -y || true
            pkg install -y rust git tar || true
        fi
    fi

    if ! command -v cargo >/dev/null 2>&1; then
        die "Rust toolchain ('cargo') is required for fallback build. Install via: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    fi

    local tmp
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT

    echo -e "${BLUE}Fetching Mux Web UI source...${RESET}"
    if command -v git >/dev/null 2>&1; then
        git clone --depth 1 --branch "v$VERSION" https://github.com/mcpe500/mux-web-ui.git "$tmp" 2>/dev/null \
            || git clone --depth 1 https://github.com/mcpe500/mux-web-ui.git "$tmp"
    else
        curl -sSL "https://github.com/mcpe500/mux-web-ui/tarball/v$VERSION" | tar -xz -C "$tmp" --strip-components=1 \
            || curl -sSL https://github.com/mcpe500/mux-web-ui/tarball/main | tar -xz -C "$tmp" --strip-components=1
    fi

    echo -e "${BLUE}Compiling Mux Web UI (release)...${RESET}"
    (cd "$tmp" && cargo build --release)
    install -m 0755 "$tmp/target/release/mux-web" "$INSTALL_DIR/mux-web"
}

# --- main -------------------------------------------------------------------
if [ -z "$TARGET" ]; then
    fallback_source
else
    if ! install_from_release; then
        if [ "$MUX_WEB_NO_FALLBACK" = "1" ]; then
            die "install aborted (download/verify failed) — set MUX_WEB_NO_FALLBACK to 1 only for testing"
        fi
        fallback_source
    fi
fi

echo -e "\n${BOLD}${GREEN}✅ Mux Web UI successfully installed to $INSTALL_DIR/mux-web!${RESET}\n"
echo -e "${BOLD}To start Mux Web UI immediately:${RESET}"
echo -e "  ${GREEN}mux-web${RESET}          # Local desktop mode (http://127.0.0.1:7681)"
echo -e "  ${GREEN}mux-web --lan${RESET}    # LAN pairing mode"
echo ""
