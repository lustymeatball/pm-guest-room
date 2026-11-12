#!/usr/bin/env bash
# Launcher for PM - Guest Room. Uses Chromium's sandbox when it can, otherwise falls back to --no-sandbox.
DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
ARGS=()
SB="$DIR/chrome-sandbox"
sandbox_ok=0
if [[ "$(stat -c '%u %a' "$SB" 2>/dev/null)" == "0 4755" ]]; then
  sandbox_ok=1
elif [[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" == "0" ]] \
  && [[ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo 1)" == "1" ]]; then
  sandbox_ok=1
fi
[[ $sandbox_ok == 1 ]] || ARGS+=(--no-sandbox)
exec "$DIR/pm-guest-room" "${ARGS[@]}" "$@"
