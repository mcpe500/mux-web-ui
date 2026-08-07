#!/usr/bin/env bash
set -e

# Mux Web UI — Termux & Linux Universal 1-Liner Updater

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}${BLUE}=== Updating Mux Web UI ===${RESET}"

IS_TERMUX=0
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux/files/usr/bin" ]; then
    IS_TERMUX=1
    INSTALL_DIR="/data/data/com.termux/files/usr/bin"
elif [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
fi

if [ $IS_TERMUX -eq 1 ]; then
    if ! command -v cargo >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
        echo -e "${YELLOW}Auto-installing required packages in Termux (rust, git)...${RESET}"
        pkg update -y || true
        pkg install -y rust git tar || true
    fi
fi

if ! command -v cargo >/dev/null 2>&1; then
    echo -e "${RED}Error: 'cargo' is required to update Mux Web UI.${RESET}"
    exit 1
fi

if [ -f "./Cargo.toml" ] && [ -d ".git" ]; then
    echo -e "${BLUE}Updating current repository...${RESET}"
    git pull origin main
    cargo build --release
    cp ./target/release/mux-web "$INSTALL_DIR/mux-web"
else
    echo -e "${BLUE}Fetching latest release...${RESET}"
    TEMP_DIR=$(mktemp -d)
    trap 'rm -rf "$TEMP_DIR"' EXIT

    if command -v git >/dev/null 2>&1; then
        git clone --depth 1 https://github.com/mcpe500/mux-web-ui.git "$TEMP_DIR"
    else
        curl -sSL https://github.com/mcpe500/mux-web-ui/tarball/main | tar -xz -C "$TEMP_DIR" --strip-components=1
    fi

    (cd "$TEMP_DIR" && cargo build --release)
    cp "$TEMP_DIR/target/release/mux-web" "$INSTALL_DIR/mux-web"
fi

echo -e "\n${BOLD}${GREEN}✅ Mux Web UI updated successfully at $INSTALL_DIR/mux-web!${RESET}"
echo -e "${YELLOW}Notice: v0.2+ requires single-use token pairing for web access.${RESET}"
echo -e "${YELLOW}Run 'mux-web' and use the bootstrap URL / token printed on startup.${RESET}\n"
