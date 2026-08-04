#!/usr/bin/env bash
set -e

# Mux Web UI — Termux & Linux Universal 1-Liner Auto-Installer

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}${BLUE}=== Mux Web UI Universal Installer ===${RESET}"

IS_TERMUX=0
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux/files/usr/bin" ]; then
    IS_TERMUX=1
    INSTALL_DIR="/data/data/com.termux/files/usr/bin"
elif [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
fi

echo -e "${GREEN}Target installation directory:${RESET} $INSTALL_DIR"

# Fresh Termux environment handler: auto-install rust/git if missing
if [ $IS_TERMUX -eq 1 ]; then
    if ! command -v cargo >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
        echo -e "${YELLOW}Fresh Termux environment detected! Auto-installing required packages (rust, git)...${RESET}"
        pkg update -y || true
        pkg install -y rust git tar || true
    fi
fi

# Verify Cargo
if ! command -v cargo >/dev/null 2>&1; then
    echo -e "${RED}Error: Rust toolchain ('cargo') is required to build Mux Web UI.${RESET}"
    echo -e "Please install Rust by running:"
    echo -e "  ${BOLD}${GREEN}curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${RESET}"
    exit 1
fi

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Check if running inside local repo with prebuilt binary
if [ -f "./Cargo.toml" ] && [ -f "./target/release/mux-web" ]; then
    echo -e "${BLUE}Installing local compiled binary...${RESET}"
    cp ./target/release/mux-web "$INSTALL_DIR/mux-web"
else
    echo -e "${BLUE}Fetching latest Mux Web UI source...${RESET}"
    if command -v git >/dev/null 2>&1; then
        git clone --depth 1 https://github.com/mcpe500/mux-web-ui.git "$TEMP_DIR"
    else
        curl -sSL https://github.com/mcpe500/mux-web-ui/tarball/main | tar -xz -C "$TEMP_DIR" --strip-components=1
    fi

    echo -e "${BLUE}Compiling Mux Web UI with Cargo...${RESET}"
    (cd "$TEMP_DIR" && cargo build --release)
    cp "$TEMP_DIR/target/release/mux-web" "$INSTALL_DIR/mux-web"
fi

chmod +x "$INSTALL_DIR/mux-web"

echo -e "\n${BOLD}${GREEN}✅ Mux Web UI successfully installed to $INSTALL_DIR/mux-web!${RESET}\n"
echo -e "${BOLD}To start Mux Web UI immediately:${RESET}"
echo -e "  ${GREEN}mux-web${RESET}          # Local desktop mode (http://127.0.0.1:7681)"
echo -e "  ${GREEN}mux-web --lan${RESET}    # LAN pairing mode"
echo ""
