#!/usr/bin/env bash
set -e

# Mux Web UI — Updater Script (Update)

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RESET="\033[0m"

echo -e "${BOLD}${BLUE}=== Updating Mux Web UI ===${RESET}"

# 1. Determine installation directory
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux/files/usr/bin" ]; then
    INSTALL_DIR="/data/data/com.termux/files/usr/bin"
elif [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
fi

# 2. Update execution
if [ -d ".git" ]; then
    echo -e "${BLUE}Pulling latest code from GitHub...${RESET}"
    git pull origin main
    echo -e "${BLUE}Rebuilding release binary...${RESET}"
    cargo build --release
    cp ./target/release/mux-web "$INSTALL_DIR/mux-web"
else
    echo -e "${BLUE}Updating Mux Web UI from GitHub...${RESET}"
    TEMP_DIR=$(mktemp -d)
    git clone --depth 1 https://github.com/mcpe500/mux-web-ui.git "$TEMP_DIR"
    (cd "$TEMP_DIR" && cargo build --release)
    cp "$TEMP_DIR/target/release/mux-web" "$INSTALL_DIR/mux-web"
    rm -rf "$TEMP_DIR"
fi

chmod +x "$INSTALL_DIR/mux-web"

echo -e "\n${BOLD}${GREEN}✅ Mux Web UI updated successfully at $INSTALL_DIR/mux-web!${RESET}\n"
