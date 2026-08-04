#!/usr/bin/env bash
set -e

# Mux Web UI — One-Liner Universal Installer (Create / Install)

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}${BLUE}=== Installing Mux Web UI ===${RESET}"

# 1. Determine installation directory
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux/files/usr/bin" ]; then
    INSTALL_DIR="/data/data/com.termux/files/usr/bin"
elif [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
fi

echo -e "${GREEN}Destination directory:${RESET} $INSTALL_DIR"

# 2. Check architecture
ARCH=$(uname -m)
case "$ARCH" in
    aarch64|arm64)
        TARGET_ARCH="aarch64"
        ;;
    x86_64|amd64)
        TARGET_ARCH="x86_64"
        ;;
    *)
        echo -e "${RED}Unsupported architecture: $ARCH${RESET}"
        exit 1
        ;;
esac

# 3. Installation logic (Standalone execution support)
if [ -f "./target/release/mux-web" ]; then
    echo -e "${BLUE}Installing local release binary...${RESET}"
    cp ./target/release/mux-web "$INSTALL_DIR/mux-web"
elif command -v cargo >/dev/null 2>&1; then
    echo -e "${BLUE}Building & installing latest Mux Web UI from GitHub via Cargo...${RESET}"
    cargo install --git https://github.com/mcpe500/mux-web-ui --root "$HOME/.local" 2>/dev/null || {
        echo -e "${YELLOW}Cargo install fallback: cloning repository to temp workspace...${RESET}"
        TEMP_DIR=$(mktemp -d)
        git clone --depth 1 https://github.com/mcpe500/mux-web-ui.git "$TEMP_DIR"
        (cd "$TEMP_DIR" && cargo build --release)
        cp "$TEMP_DIR/target/release/mux-web" "$INSTALL_DIR/mux-web"
        rm -rf "$TEMP_DIR"
    }
    if [ -f "$HOME/.local/bin/mux-web" ] && [ "$INSTALL_DIR" != "$HOME/.local/bin" ]; then
        cp "$HOME/.local/bin/mux-web" "$INSTALL_DIR/mux-web"
    fi
else
    echo -e "${RED}Error: Cargo is required to build Mux Web UI from source.${RESET}"
    echo -e "Please install Rust using: ${BOLD}curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${RESET}"
    exit 1
fi

chmod +x "$INSTALL_DIR/mux-web"

echo -e "\n${BOLD}${GREEN}✅ Mux Web UI successfully installed to $INSTALL_DIR/mux-web!${RESET}\n"
echo -e "${BOLD}To start Mux Web UI immediately:${RESET}"
echo -e "  ${GREEN}mux-web${RESET}          # Local desktop mode (http://127.0.0.1:7681)"
echo -e "  ${GREEN}mux-web --lan${RESET}    # LAN pairing mode"
echo ""
