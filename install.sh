#!/usr/bin/env bash
set -e

# Mux Web UI — Universal 1-Liner Installer

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}${BLUE}=== Installing Mux Web UI ===${RESET}"

# 1. Determine destination directory
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux/files/usr/bin" ]; then
    INSTALL_DIR="/data/data/com.termux/files/usr/bin"
elif [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
fi

echo -e "${GREEN}Destination directory:${RESET} $INSTALL_DIR"

# 2. Check Cargo availability
if ! command -v cargo >/dev/null 2>&1; then
    echo -e "${RED}Error: 'cargo' (Rust toolchain) was not found on your system.${RESET}"
    echo -e "Please install Rust first by running:"
    echo -e "  ${BOLD}${GREEN}curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${RESET}"
    exit 1
fi

# 3. Check if running inside local cloned repo with built binary
if [ -f "./Cargo.toml" ] && [ -f "./target/release/mux-web" ]; then
    echo -e "${BLUE}Found compiled release binary in current directory...${RESET}"
    cp ./target/release/mux-web "$INSTALL_DIR/mux-web"
else
    echo -e "${BLUE}Cloning latest Mux Web UI repository & building release binary...${RESET}"
    TEMP_DIR=$(mktemp -d)
    trap 'rm -rf "$TEMP_DIR"' EXIT

    git clone --depth 1 https://github.com/mcpe500/mux-web-ui.git "$TEMP_DIR"
    
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
