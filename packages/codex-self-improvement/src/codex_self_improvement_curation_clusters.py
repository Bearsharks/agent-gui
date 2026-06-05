#!/usr/bin/env python3
"""Prefix/domain cluster analysis for Codex skill curation."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any


KNOWN_DOMAIN_PREFIXES = {
    "skill-update",
    "skill-curation",
    "skill-runtime",
    "memory",
    "hook",
    "mcp",
    "workflow",
    "repo",
    "project",
    "browser",
    "docs",
    "test",
    "setup",
    "codex",
}

NARROW_NAME_PATTERNS = [
    r"\bpr[-_]?\d+\b",
    r"\bissue[-_]?\d+\b",
    r"\bbug[-_]?\d+\b",
    r"\b(audit|diagnosis|debug|fix|today|session)\b",
]

SUPPORT_DIRS = {"references", "templates", "scripts", "assets"}
BOUNDARY_TERMS = {
    "approval",
    "archive",
    "browser",
    "curation",
    "docs",
    "hook",
    "mcp",
    "memory",
    "mutation",
    "review",
    "runtime",
    "test",
    "workflow",
}


def skill_tokens(name: str) -> list[str]:
    return [token for token in re.split(r"[-_.\s]+", name.lower()) if token]


def cluster_keys_for_name(name: str) -> list[str]:
    tokens = skill_tokens(name)
    keys: list[str] = []
    if tokens:
        keys.append(tokens[0])
    joined_pairs = {f"{tokens[i]}-{tokens[i + 1]}" for i in range(len(tokens) - 1)}
    for prefix in sorted(KNOWN_DOMAIN_PREFIXES):
        prefix_tokens = prefix.split("-")
        if prefix in joined_pairs or all(token in tokens for token in prefix_tokens):
            keys.append(prefix)
    return list(dict.fromkeys(keys))


def is_narrow_name(name: str) -> bool:
    return any(re.search(pattern, name, re.IGNORECASE) for pattern in NARROW_NAME_PATTERNS)


def inspect_package(skill_dir: str) -> dict[str, Any]:
    root = Path(skill_dir)
    support_files: list[str] = []
    for dirname in SUPPORT_DIRS:
        support_dir = root / dirname
        if support_dir.exists():
            support_files.extend(
                str(path.relative_to(root))
                for path in sorted(support_dir.rglob("*"))
                if path.is_file()
            )
    skill_md = root / "SKILL.md"
    text = skill_md.read_text(encoding="utf-8", errors="replace") if skill_md.exists() else ""
    relative_links = sorted(
        {
            match.group(0)
            for match in re.finditer(r"\b(?:references|templates|scripts|assets)/[^\s)\]]+", text)
        }
    )
    return {
        "support_files": support_files,
        "relative_links": relative_links,
        "package_integrity_warning": bool(support_files or relative_links),
    }


def text_tokens(text: str) -> set[str]:
    return {
        token
        for token in re.split(r"[^a-zA-Z0-9가-힣]+", text.lower())
        if len(token) >= 4
    }


def overlap_score(a: set[str], b: set[str]) -> int:
    if not a or not b:
        return 0
    return len(a & b)


def score_cluster_member(member: dict[str, Any], all_tokens: set[str]) -> dict[str, Any]:
    name = str(member["name"])
    text = f"{name} {member.get('description') or ''} {member.get('body_preview') or ''}"
    tokens = text_tokens(text)
    boundary_hits = sorted(tokens & BOUNDARY_TERMS)
    score = 0
    if not is_narrow_name(name):
        score += 5
    if any(word in str(member.get("description") or "").lower() for word in ("workflow", "umbrella", "class", "curation", "runtime")):
        score += 3
    score += min(6, overlap_score(tokens, all_tokens - tokens))
    score += min(4, len(boundary_hits))
    score -= max(0, len(skill_tokens(name)) - 3)
    return {
        "name": name,
        "score": score,
        "shared_token_count": overlap_score(tokens, all_tokens - tokens),
        "boundary_terms": boundary_hits,
        "narrow_name": is_narrow_name(name),
    }


def propose_support_path(source_name: str, relative_path: str) -> str:
    path = Path(relative_path)
    stem = re.sub(r"[^a-zA-Z0-9_.-]+", "-", source_name.lower()).strip("-._")
    return str(path.with_name(f"{stem}-{path.name}"))


def plan_package_merge(source: dict[str, Any], target: dict[str, Any], packages: dict[str, dict[str, Any]]) -> dict[str, Any]:
    source_name = str(source["name"])
    target_name = str(target["name"])
    source_pkg = packages.get(source_name, {})
    target_pkg = packages.get(target_name, {})
    target_files = set(target_pkg.get("support_files") or [])
    moves: list[dict[str, Any]] = []
    for support_file in source_pkg.get("support_files") or []:
        proposed = propose_support_path(source_name, str(support_file))
        moves.append(
            {
                "from": support_file,
                "to": proposed,
                "conflict": proposed in target_files,
            }
        )
    rewrites = [
        {
            "from": link,
            "to": propose_support_path(source_name, str(link)),
        }
        for link in source_pkg.get("relative_links") or []
    ]
    return {
        "from": source_name,
        "into": target_name,
        "moves": moves,
        "rewrites": rewrites,
        "has_conflicts": any(move["conflict"] for move in moves),
        "action": "dry_run_only",
    }


def choose_umbrella_candidate(members: list[dict[str, Any]]) -> str:
    all_tokens: set[str] = set()
    for member in members:
        all_tokens |= text_tokens(f"{member.get('name')} {member.get('description') or ''} {member.get('body_preview') or ''}")
    scored = [(int(score_cluster_member(member, all_tokens)["score"]), str(member["name"])) for member in members]
    scored.sort(key=lambda item: (-item[0], item[1]))
    return scored[0][1] if scored else ""


def analyze_clusters(rows: list[dict[str, Any]]) -> dict[str, Any]:
    buckets: dict[str, list[dict[str, Any]]] = {}
    orphan_candidates: list[str] = []
    packages: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = str(row["name"])
        keys = cluster_keys_for_name(name)
        if not keys:
            orphan_candidates.append(name)
        for key in keys:
            buckets.setdefault(key, []).append(row)
        packages[name] = inspect_package(str(row["skill_dir"]))

    clusters: list[dict[str, Any]] = []
    for key, members in sorted(buckets.items()):
        unique_members = {str(member["name"]): member for member in members}
        if len(unique_members) < 2:
            continue
        member_rows = list(unique_members.values())
        umbrella = choose_umbrella_candidate(member_rows)
        umbrella_row = unique_members[umbrella]
        all_tokens: set[str] = set()
        for member in member_rows:
            all_tokens |= text_tokens(f"{member.get('name')} {member.get('description') or ''} {member.get('body_preview') or ''}")
        member_scores = sorted(
            [score_cluster_member(member, all_tokens) for member in member_rows],
            key=lambda item: (-int(item["score"]), str(item["name"])),
        )
        warnings = [
            name for name in sorted(unique_members)
            if packages.get(name, {}).get("package_integrity_warning")
        ]
        merge_plans = [
            plan_package_merge(member, umbrella_row, packages)
            for member in member_rows
            if str(member["name"]) != umbrella and packages.get(str(member["name"]), {}).get("package_integrity_warning")
        ]
        clusters.append(
            {
                "cluster_prefix": key,
                "members": sorted(unique_members),
                "umbrella_candidate": umbrella,
                "decision_candidate": "review_for_umbrella",
                "why_not_merge_required": True,
                "package_integrity_warnings": warnings,
                "member_scores": member_scores,
                "package_merge_plans": merge_plans,
            }
        )

    narrow_names = sorted(str(row["name"]) for row in rows if is_narrow_name(str(row["name"])))
    return {
        "clusters": clusters,
        "orphan_naming_candidates": sorted(orphan_candidates),
        "narrow_name_candidates": narrow_names,
        "package_integrity": packages,
    }
