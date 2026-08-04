#!/usr/bin/env bash
set -e

# Mux Web UI One-Liner Quick Installer

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RESET="\033[0m"

echo -e "${BOLD}${BLUE}=== Installing Mux Web UI ===${RESET}"

# Determine installation binary directory
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux/files/usr/bin" ]; then
    INSTALL_DIR="/data/data/com.termux/files/usr/bin"
elif [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
fi

echo -e "${GREEN}Installation directory:${RESET} $INSTALL_DIR"

# Check if pre-built binary exists in repo directory, or build from source
if [ -f "./target/release/mux-web" ]; then
    echo -e "${BLUE}Found local release binary, copying to $INSTALL_DIR/mux-web...${RESET}"
    cp ./target/release/mux-web "$INSTALL_DIR/mux-web"
    chmod +x "$INSTALL_DIR/mux-web"
elif command -v cargo >/dev/null 2>&1; then
    echo -e "${BLUE}Building Mux Web UI from source using Cargo...${RESET}"
    cargo build --release
    cp ./target/release/mux-web "$INSTALL_DIR/mux-web"
    chmod +x "$INSTALL_DIR/mux-web"
else
    echo -e "${YELLOW}Cargo not found. Downloading release binary...${RESET}"
    ARCH=$(uname -m)
    case "$ARCH" in
        aarch64|arm64)
            TARGET_ARCH="aarch64"
            ;;
        x86_64|amd64)
            TARGET_ARCH="x86_64"
            ;;
        *)
            echo "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac

    # Copy local compiled target if present in current directory
    if [ -f "target/release/mux-web" ]; then
        cp target/release/mux-web "$INSTALL_DIR/mux-web"
    else
        echo -e "${YELLOW}Please run 'cargo build --release' or run install.sh from inside the repository directory.${RESET}"
        exit 1
    fi
    chmod +x "$INSTALL_DIR/mux-web"
fi

echo -e "\n${BOLD}${GREEN}✅ Mux Web UI successfully installed to $INSTALL_DIR/mux-web!${RESET}\n"
echo -e "${BOLD}To start Mux Web UI:${RESET}"
echo -e "  ${GREEN}mux-web${RESET}          # Local mode (http://127.0.0.1:7681)"
echo -e "  ${GREEN}mux-web --lan${RESET}    # LAN pairing mode"
echo ""
