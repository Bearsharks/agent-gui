#!/usr/bin/env python3
"""Codex hook entrypoint for self-improvement session context."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def add_runtime_paths() -> None:
    runtime_root = Path(__file__).resolve().parents[2]
    for path in (runtime_root, runtime_root / "src"):
        text = str(path)
        if text not in sys.path:
            sys.path.insert(0, text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("event", choices=["session-start", "user-prompt-submit"])
    args = parser.parse_args(argv)

    add_runtime_paths()
    from codex_self_improvement import run_hook

    run_hook(args.event)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
