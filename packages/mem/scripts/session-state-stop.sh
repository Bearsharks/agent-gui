#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MEM_DIR/.." && pwd)"
MEM_PYTHONPATH="$MEM_DIR/src${PYTHONPATH:+:$PYTHONPATH}"

if [ -x "$MEM_DIR/.venv/Scripts/python.exe" ]; then
  exec "$MEM_DIR/.venv/Scripts/python.exe" -m mem.session_stop_hook --repo-root "$REPO_ROOT" "$@"
fi
if [ -x "$MEM_DIR/.venv/bin/python" ]; then
  exec "$MEM_DIR/.venv/bin/python" -m mem.session_stop_hook --repo-root "$REPO_ROOT" "$@"
fi
if command -v uv >/dev/null 2>&1; then
  exec uv run --project "$MEM_DIR" python -m mem.session_stop_hook --repo-root "$REPO_ROOT" "$@"
fi
if command -v py >/dev/null 2>&1; then
  exec env PYTHONPATH="$MEM_PYTHONPATH" py -3 -m mem.session_stop_hook --repo-root "$REPO_ROOT" "$@"
fi
exec env PYTHONPATH="$MEM_PYTHONPATH" python3 -m mem.session_stop_hook --repo-root "$REPO_ROOT" "$@"
