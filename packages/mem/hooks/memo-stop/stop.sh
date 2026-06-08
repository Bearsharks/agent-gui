#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEM_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -n "${AGENT_MEMO_IN_STOP_WORKER:-}" ]; then
  echo '{}'
  exit 0
fi

if [ -x "$MEM_DIR/.venv/Scripts/python.exe" ]; then
  exec "$MEM_DIR/.venv/Scripts/python.exe" "$SCRIPT_DIR/agent_memo_stop.py" "$@"
fi
if [ -x "$MEM_DIR/.venv/bin/python" ]; then
  exec "$MEM_DIR/.venv/bin/python" "$SCRIPT_DIR/agent_memo_stop.py" "$@"
fi
if command -v uv >/dev/null 2>&1; then
  exec uv run --project "$MEM_DIR" python "$SCRIPT_DIR/agent_memo_stop.py" "$@"
fi
if command -v py >/dev/null 2>&1; then
  exec py -3 "$SCRIPT_DIR/agent_memo_stop.py" "$@"
fi
exec python3 "$SCRIPT_DIR/agent_memo_stop.py" "$@"
