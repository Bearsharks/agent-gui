#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "${AGENT_TURN_HISTORY_IN_STOP_WORKER:-}" ]; then
  echo '{}'
  exit 0
fi

if command -v py >/dev/null 2>&1; then
  exec py -3 "$SCRIPT_DIR/turn_history_stop.py" "$@"
fi
exec python3 "$SCRIPT_DIR/turn_history_stop.py" "$@"
