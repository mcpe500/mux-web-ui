#!/usr/bin/env bash
set -e

# Mux Web UI — Universal Updater Script

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}${BLUE}=== Updating Mux Web UI ===${RESET}"

# 1. Determine destination directory
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux/files/usr/bin" ]; then
    INSTALL_DIR="/data/data/com.termux/files/usr/bin"
elif [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
fi

if ! command -v cargo >/dev/null 2>&1; then
    echo -e "${RED}Error: 'cargo' is required to update Mux Web UI.${RESET}"
    exit 1
fi

# 2. Update execution
if [ -f "./Cargo.toml" ] && [ -d ".git" ]; then
    echo -e "${BLUE}Updating current repository...${RESET}"
    git pull origin main
    cargo build --release
    cp ./target/release/mux-web "$INSTALL_DIR/mux-web"
else
    echo -e "${BLUE}Cloning latest Mux Web UI release...${RESET}"
    TEMP_DIR=$(mktemp -d)
    trap 'rm -rf "$TEMP_DIR"' EXIT

    git clone --depth 1 https://github.com/mcpe500/mux-web-ui.git "$TEMP_DIR"
    (cd "$TEMP_DIR" && cargo build --release)
    cp "$TEMP_DIR/target/release/mux-web" "$INSTALL_DIR/mux-web"
fi

chmod +x "$INSTALL_DIR/mux-web"

echo -e "\n${BOLD}${GREEN}✅ Mux Web UI updated successfully at $INSTALL_DIR/mux-web!${RESET}\n"
