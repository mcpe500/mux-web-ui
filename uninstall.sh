#!/usr/bin/env bash
set -e

# Mux Web UI — Uninstaller Script (Delete / Remove)

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}${RED}=== Uninstalling Mux Web UI ===${RESET}"

REMOVED=0

# Possible binary locations
POSSIBLE_PATHS=(
    "/data/data/com.termux/files/usr/bin/mux-web"
    "/usr/local/bin/mux-web"
    "$HOME/.local/bin/mux-web"
)

for BIN_PATH in "${POSSIBLE_PATHS[@]}"; do
    if [ -f "$BIN_PATH" ]; then
        echo -e "${YELLOW}Removing binary:${RESET} $BIN_PATH"
        rm -f "$BIN_PATH"
        REMOVED=$((REMOVED + 1))
    fi
done

if [ $REMOVED -gt 0 ]; then
    echo -e "\n${BOLD}${GREEN}✅ Mux Web UI has been cleanly uninstalled from your system.${RESET}\n"
else
    echo -e "\n${YELLOW}No installation of 'mux-web' was found on standard PATH locations.${RESET}\n"
fi
