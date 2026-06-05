#!/usr/bin/env python3
"""Uninstall Codex self-improvement registrations from ~/.codex."""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path


BEGIN = "# BEGIN codex-self-improvement managed"
END = "# END codex-self-improvement managed"
MANAGED_SKILLS = {"codex-self-improvement", "codex-skill-curation", "codex-manual-skill-update"}


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")


def remove_managed_block(text: str) -> str:
    start = text.find(BEGIN)
    end = text.find(END)
    if start == -1 or end == -1 or end <= start:
        return text
    end += len(END)
    while end < len(text) and text[end] in "\r\n":
        end += 1
    return (text[:start].rstrip() + "\n\n" + text[end:].lstrip()).strip() + "\n"


def remove_managed_hooks(existing: dict) -> dict:
    data = existing if isinstance(existing, dict) else {}
    hooks = data.get("hooks")
    if not isinstance(hooks, dict):
        data["hooks"] = {}
        return data

    for event in ("SessionStart", "UserPromptSubmit", "Stop"):
        existing_groups = hooks.get(event)
        if not isinstance(existing_groups, list):
            continue
        kept = []
        for group in existing_groups:
            if not isinstance(group, dict):
                kept.append(group)
                continue
            handlers = group.get("hooks")
            if not isinstance(handlers, list):
                kept.append(group)
                continue
            remaining = [
                h for h in handlers
                if "codex_self_improvement.py" not in str(h.get("command", ""))
            ]
            if remaining:
                new_group = dict(group)
                new_group["hooks"] = remaining
                kept.append(new_group)
        if kept:
            hooks[event] = kept
        else:
            hooks.pop(event, None)
    data["hooks"] = hooks
    return data


def remove_installed_skills(home: Path) -> list[str]:
    removed: list[str] = []
    for name in sorted(MANAGED_SKILLS):
        target = home / "skills" / name
        if target.exists():
            shutil.rmtree(target)
            removed.append(str(target))
    return removed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--codex-home", type=Path, default=codex_home())
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--purge",
        action="store_true",
        help="also remove ~/.codex/self-improvement runtime state",
    )
    args = parser.parse_args(argv)

    config_path = args.codex_home / "config.toml"
    hooks_path = args.codex_home / "hooks.json"
    runtime_dir = args.codex_home / "self-improvement"

    existing_config = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    updated_config = remove_managed_block(existing_config)

    existing_hooks = {}
    if hooks_path.exists():
        existing_hooks = json.loads(hooks_path.read_text(encoding="utf-8"))
    updated_hooks = remove_managed_hooks(existing_hooks)

    planned = {
        "config_path": str(config_path),
        "hooks_path": str(hooks_path),
        "skills": [str(args.codex_home / "skills" / name) for name in sorted(MANAGED_SKILLS)],
        "purge_runtime": str(runtime_dir) if args.purge else None,
    }

    if args.dry_run:
        print(json.dumps({
            "planned": planned,
            "config": updated_config,
            "hooks": updated_hooks,
        }, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    if config_path.exists():
        config_path.write_text(updated_config, encoding="utf-8")
    if hooks_path.exists():
        hooks_path.write_text(json.dumps(updated_hooks, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    removed = remove_installed_skills(args.codex_home)
    purged = False
    if args.purge and runtime_dir.exists():
        shutil.rmtree(runtime_dir)
        purged = True

    print(json.dumps({
        "success": True,
        "removed_skills": removed,
        "purged_runtime": purged,
        "updated": [str(p) for p in (config_path, hooks_path) if p.exists()],
    }, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
