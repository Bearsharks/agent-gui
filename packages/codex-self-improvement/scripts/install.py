#!/usr/bin/env python3
"""Install Codex self-improvement into ~/.codex."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path


BEGIN = "# BEGIN codex-self-improvement managed"
END = "# END codex-self-improvement managed"
MANAGED_HOOK_MARKERS = (
    "codex_self_improvement.py",
    "hooks/self-improvement/self_improvement_hook.py",
    "hooks/turn-history/stop.sh",
)


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")


def managed_block(target_script: Path) -> str:
    script = str(target_script)
    return f"""
{BEGIN}

[mcp_servers.codex-self-improvement]
command = "/usr/bin/python3"
args = ["{script}", "mcp"]
startup_timeout_sec = 10
tool_timeout_sec = 120
default_tools_approval_mode = "approve"

{END}
""".strip() + "\n"


def replace_managed_block(text: str, block: str) -> str:
    start = text.find(BEGIN)
    end = text.find(END)
    if start != -1 and end != -1 and end > start:
        end += len(END)
        while end < len(text) and text[end] in "\r\n":
            end += 1
        text = text[:start].rstrip() + "\n\n" + block + "\n" + text[end:].lstrip()
    else:
        text = text.rstrip() + "\n\n" + block
    if "[features]" in text and "hooks = true" not in text:
        text = text.replace("[features]\n", "[features]\nhooks = true\n", 1)
    elif "[features]" not in text:
        text = text.rstrip() + "\n\n[features]\nhooks = true\n"
    return text


def hook_group(command: str, *, status_message: str | None = None) -> dict:
    hook: dict[str, object] = {
        "type": "command",
        "command": command,
        "timeout": 10,
    }
    if status_message:
        hook["statusMessage"] = status_message
    return {"matcher": "", "hooks": [hook]}


def managed_hooks(self_improvement_hook: Path, turn_history_stop: Path) -> dict:
    script = str(self_improvement_hook)
    turn_history = str(turn_history_stop)
    return {
        "SessionStart": [
            hook_group(f"/usr/bin/python3 {script} session-start"),
        ],
        "UserPromptSubmit": [
            hook_group(f"/usr/bin/python3 {script} user-prompt-submit"),
        ],
        "Stop": [
            hook_group(turn_history, status_message="Writing turn history"),
        ],
    }


def merge_hooks_json(existing: dict, managed: dict) -> dict:
    data = existing if isinstance(existing, dict) else {}
    hooks = data.get("hooks")
    if not isinstance(hooks, dict):
        hooks = {}
    for event in ("SessionStart", "UserPromptSubmit", "Stop"):
        groups = managed.get(event, [])
        existing_groups = hooks.get(event)
        if not isinstance(existing_groups, list):
            existing_groups = []
        kept = []
        for group in existing_groups:
            if not isinstance(group, dict):
                kept.append(group)
                continue
            handlers = group.get("hooks")
            if not isinstance(handlers, list):
                kept.append(group)
                continue
            remaining = [h for h in handlers if not is_managed_hook_command(str(h.get("command", "")))]
            if remaining:
                new_group = dict(group)
                new_group["hooks"] = remaining
                kept.append(new_group)
        if kept or groups:
            hooks[event] = kept + groups
        else:
            hooks.pop(event, None)
    data["hooks"] = hooks
    return data


def is_managed_hook_command(command: str) -> bool:
    return any(marker in command for marker in MANAGED_HOOK_MARKERS)


def install_skills(source_root: Path, codex_home: Path) -> None:
    source = source_root / "skills"
    if not source.exists():
        raise SystemExit(f"missing skill source directory: {source}")
    target_root = codex_home / "skills"
    target_root.mkdir(parents=True, exist_ok=True)

    managed_names = {"codex-self-improvement", "codex-skill-curation"}
    stale_names = {"codex-manual-skill-update"}
    for name in stale_names:
        target = target_root / name
        if target.exists():
            shutil.rmtree(target)

    for name in sorted(managed_names):
        skill_source = source / name
        if not skill_source.exists():
            raise SystemExit(f"missing skill source: {skill_source}")
        target = target_root / name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(skill_source, target)


def install_hooks(package_root: Path, target_dir: Path) -> None:
    source = package_root / "hooks"
    if not source.exists():
        raise SystemExit(f"missing hooks source directory: {source}")
    target = target_dir / "hooks"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)
    for script in (
        "self-improvement/self_improvement_hook.py",
        "turn-history/stop.sh",
        "turn-history/turn_history_stop.py",
        "turn-history/write_turn_history.py",
    ):
        path = target / script
        if path.exists():
            path.chmod(0o755)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    package_root = Path(__file__).resolve().parents[1]
    parser.add_argument("--source", type=Path, default=package_root / "src")
    parser.add_argument("--package-root", type=Path, default=package_root)
    parser.add_argument("--codex-home", type=Path, default=codex_home())
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    source_script = args.source / "codex_self_improvement.py"
    if not source_script.exists():
        raise SystemExit(f"missing source script: {source_script}")

    target_dir = args.codex_home / "self-improvement"
    target_script = target_dir / "codex_self_improvement.py"
    target_curation = target_dir / "codex_self_improvement_curation.py"
    target_curation_clusters = target_dir / "codex_self_improvement_curation_clusters.py"
    target_review = target_dir / "codex_self_improvement_review.py"
    target_review_turn_history = target_dir / "codex_self_improvement_review_turn_history.py"
    target_self_improvement_hook = target_dir / "hooks" / "self-improvement" / "self_improvement_hook.py"
    target_turn_history_stop = target_dir / "hooks" / "turn-history" / "stop.sh"
    config_path = args.codex_home / "config.toml"
    hooks_path = args.codex_home / "hooks.json"
    block = managed_block(target_script)
    hooks_data = managed_hooks(target_self_improvement_hook, target_turn_history_stop)

    existing = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    updated = replace_managed_block(existing, block)
    existing_hooks = {}
    if hooks_path.exists():
        existing_hooks = json.loads(hooks_path.read_text(encoding="utf-8"))
    updated_hooks = merge_hooks_json(existing_hooks, hooks_data)

    if args.dry_run:
        print(updated)
        print(json.dumps(updated_hooks, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    target_dir.mkdir(parents=True, exist_ok=True)
    (args.codex_home / "skills").mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_script, target_script)
    shutil.copy2(args.source / "codex_self_improvement_curation.py", target_curation)
    shutil.copy2(args.source / "codex_self_improvement_curation_clusters.py", target_curation_clusters)
    shutil.copy2(args.source / "codex_self_improvement_review.py", target_review)
    shutil.copy2(args.source / "codex_self_improvement_review_turn_history.py", target_review_turn_history)
    target_script.chmod(0o755)
    install_hooks(args.package_root, target_dir)
    install_skills(args.package_root, args.codex_home)
    config_path.write_text(updated, encoding="utf-8")
    hooks_path.write_text(json.dumps(updated_hooks, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    import subprocess

    subprocess.run([sys.executable, str(target_script), "init"], check=True)
    print(f"Installed Codex self-improvement runtime at {target_dir}")
    print(f"Updated {config_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
