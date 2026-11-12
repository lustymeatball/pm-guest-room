#!/usr/bin/env bash
# Installs PM - Guest Room for the current user (no root needed, except the optional sandbox step).
# Usage: ./install.sh            install / update
#        ./install.sh --uninstall
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.local/opt/pm-guest-room"
BIN="$HOME/.local/bin/pm-guest-room"
DESKTOP="$HOME/.local/share/applications/pm-guest-room.desktop"
ICON="$HOME/.local/share/icons/hicolor/512x512/apps/pm-guest-room.png"

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -rf "$DEST" "$BIN" "$DESKTOP" "$ICON"
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  echo "PM - Guest Room removed. Settings remain in ~/.config/PM - Guest Room"
  exit 0
fi

mkdir -p "$DEST" "$(dirname "$BIN")" "$(dirname "$DESKTOP")" "$(dirname "$ICON")"
rm -rf "$DEST"/*
cp -a "$SRC"/. "$DEST"/
rm -f "$DEST/install.sh"
cp "$SRC/pm-guest-room.png" "$ICON"
ln -sf "$DEST/pm-guest-room.sh" "$BIN"

cat > "$DESKTOP" <<DESK
[Desktop Entry]
Type=Application
Name=PM - Guest Room
Comment=Desktop client for Proxmox VE
Exec="$DEST/pm-guest-room.sh" %U
Icon=pm-guest-room
Terminal=false
Categories=System;Network;
StartupWMClass=PM - Guest Room
DESK
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

echo "Installed to $DEST"
echo "Launch it from your app menu, or run: pm-guest-room"

# Chromium's sandbox helper must be owned by root to work on distros that restrict
# unprivileged user namespaces (e.g. Ubuntu 24.04). Without it the app falls back to --no-sandbox.
if [[ -t 0 ]] && command -v sudo >/dev/null; then
  read -r -p "Set up the Chromium sandbox helper with sudo (recommended)? [Y/n] " ans
  if [[ ! "$ans" =~ ^[Nn] ]]; then
    sudo chown root:root "$DEST/chrome-sandbox" && sudo chmod 4755 "$DEST/chrome-sandbox" && echo "Sandbox helper configured."
  fi
fi
