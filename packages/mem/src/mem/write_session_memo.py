#!/usr/bin/env python3
"""Validate and append one or more session memo records.

This helper is the schema gate for stop-hook session memos. It accepts
candidate records without hook-owned metadata, validates the current memo
schema, injects ordering metadata, and appends JSONL records only when every
candidate is valid.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ALLOWED_MEMO_TYPES = {
    "decision",
    "change",
    "constraint",
    "conflict",
    "deferred",
    "rejected_alternative",
}
ALLOWED_STATUS = {"accepted", "needs_review"}
ALLOWED_CANDIDATE_FORMS = {
    "Analysis",
    "Decision",
    "Guide",
    "Model",
    "Overview",
    "Policy",
    "Reference",
    "Spec",
    "Status",
    "Verification",
    "Troubleshooting",
    "Change Index",
}
ALLOWED_AFFECTED_SURFACES = {
    "frontend",
    "backend",
    "desktop",
    "agent",
    "contracts",
    "docs_system",
    "memo_system",
    "docs_search",
    "search_system",
    "tooling",
}
ALLOWED_AUDIENCE = {"agent", "developer", "operator", "reviewer"}
HOOK_OWNED_FIELDS = {"ts", "turn_id", "memo_index", "memo_ref", "session_id"}
REQUIRED_FIELDS = {
    "memo_type",
    "status",
    "subject",
    "context",
    "rationale",
    "changed_artifacts",
    "durable_value",
    "classification_clues",
    "relations",
}
OPTIONAL_FIELDS = {"referenced_artifacts"}
ALLOWED_FIELDS = REQUIRED_FIELDS | OPTIONAL_FIELDS
DEFAULT_MEMO_ROOT = ".mem/memo"


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def safe_session_id(value: str) -> str:
    value = value.strip()
    value = re.sub(r"^rollout-", "", value)
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", value)
    return value[:160]


def resolve_memo_root(repo_root: Path, memo_root: str | None) -> Path:
    raw = (memo_root or os.environ.get("AGENT_MEMO_ROOT") or DEFAULT_MEMO_ROOT).strip() or DEFAULT_MEMO_ROOT
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = repo_root / path
    return path.resolve()


def display_path(path: Path, repo_root: Path) -> str:
    try:
        return str(path.relative_to(repo_root))
    except ValueError:
        return str(path)


def repo_relative(path: Any) -> bool:
    if not isinstance(path, str) or not path.strip():
        return False
    value = Path(path)
    return not value.is_absolute() and ".." not in value.parts


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        with path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(item, dict):
                    records.append(item)
    except FileNotFoundError:
        return []
    return records


def response(ok: bool, **kwargs: Any) -> dict[str, Any]:
    payload = {"ok": ok}
    payload.update(kwargs)
    return payload


def error(field: str, message: str, repair_hint: str) -> dict[str, str]:
    return {"field": field, "message": message, "repair_hint": repair_hint}


def validate_non_empty_string(record: dict[str, Any], field: str, errors: list[dict[str, str]]) -> None:
    value = record.get(field)
    if not isinstance(value, str) or not value.strip():
        errors.append(error(field, "required non-empty string", f"Set `{field}` to a specific durable memo value."))


def validate_path_list(record: dict[str, Any], field: str, required: bool, errors: list[dict[str, str]]) -> list[str]:
    value = record.get(field)
    if value is None and not required:
        return []
    if not isinstance(value, list):
        errors.append(error(field, "required array of repository-relative paths", f"Set `{field}` to [] or repository-relative paths."))
        return []
    result: list[str] = []
    for idx, item in enumerate(value):
        if not repo_relative(item):
            errors.append(
                error(
                    f"{field}[{idx}]",
                    "must be a repository-relative path without '..'",
                    "Use paths such as `docs_canonical/AGENT_MEMO_RULES.md`; do not use absolute paths.",
                )
            )
            continue
        result.append(str(item).strip())
    return result


def validate_string_list(
    value: Any,
    field: str,
    errors: list[dict[str, str]],
    *,
    required: bool = False,
    allow_empty: bool = True,
    allowed: set[str] | None = None,
) -> list[str]:
    if value is None and not required:
        return []
    if not isinstance(value, list):
        errors.append(error(field, "required array", f"Set `{field}` to an array."))
        return []
    if required and not allow_empty and not value:
        errors.append(error(field, "required non-empty array", f"Add at least one value to `{field}`."))
        return []
    result: list[str] = []
    for idx, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            errors.append(error(f"{field}[{idx}]", "must be a non-empty string", "Remove empty values or replace them with specific strings."))
            continue
        item = item.strip()
        if allowed is not None and item not in allowed:
            errors.append(
                error(
                    f"{field}[{idx}]",
                    f"unsupported value `{item}`",
                    f"Use one of: {', '.join(sorted(allowed))}.",
                )
            )
            continue
        result.append(item)
    return result


def validate_relations(value: Any, previous_refs: set[str], errors: list[dict[str, str]]) -> dict[str, list[str]]:
    if not isinstance(value, dict):
        errors.append(error("relations", "required object", "Set `relations` with `supersedes` and `conflicts_with` arrays."))
        return {"supersedes": [], "conflicts_with": []}

    allowed = {"supersedes", "conflicts_with", "related_memos"}
    for key in value:
        if key not in allowed:
            errors.append(error(f"relations.{key}", "unknown field", "Remove unknown relation fields."))

    relations: dict[str, list[str]] = {}
    for key in ("supersedes", "conflicts_with"):
        refs = validate_string_list(value.get(key), f"relations.{key}", errors, required=True)
        relations[key] = refs
    if "related_memos" in value:
        relations["related_memos"] = validate_string_list(value.get("related_memos"), "relations.related_memos", errors)

    for key, refs in relations.items():
        for idx, ref in enumerate(refs):
            if ref not in previous_refs:
                errors.append(
                    error(
                        f"relations.{key}[{idx}]",
                        f"unknown memo_ref `{ref}`",
                        "Reference only older memo_ref values already present in this session file, or remove the relation.",
                    )
                )
    return relations


def validate_classification(value: Any, errors: list[dict[str, str]]) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append(error("classification_clues", "required object", "Set `classification_clues` with at least `concepts`."))
        return {"concepts": []}

    allowed = {"work_area", "concepts", "candidate_forms", "affected_surfaces", "audience"}
    for key in value:
        if key not in allowed:
            errors.append(error(f"classification_clues.{key}", "unknown field", "Remove unknown classification clue fields."))

    result: dict[str, Any] = {}
    work_area = value.get("work_area")
    if work_area is not None:
        if isinstance(work_area, str) and work_area.strip():
            result["work_area"] = work_area.strip()
        else:
            errors.append(error("classification_clues.work_area", "must be a non-empty string when present", "Remove `work_area` or set a concise work area."))

    result["concepts"] = validate_string_list(value.get("concepts"), "classification_clues.concepts", errors, required=True, allow_empty=False)
    if "candidate_forms" in value:
        result["candidate_forms"] = validate_string_list(
            value.get("candidate_forms"),
            "classification_clues.candidate_forms",
            errors,
            allowed=ALLOWED_CANDIDATE_FORMS,
        )
    if "affected_surfaces" in value:
        result["affected_surfaces"] = validate_string_list(
            value.get("affected_surfaces"),
            "classification_clues.affected_surfaces",
            errors,
            allowed=ALLOWED_AFFECTED_SURFACES,
        )
    if "audience" in value:
        result["audience"] = validate_string_list(
            value.get("audience"),
            "classification_clues.audience",
            errors,
            allowed=ALLOWED_AUDIENCE,
        )
    return result


def validate_candidate(candidate: Any, previous_refs: set[str]) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    errors: list[dict[str, str]] = []
    if not isinstance(candidate, dict):
        return None, [error("$", "memo candidate must be an object", "Pass a JSON object with the session memo schema fields.")]

    for field in HOOK_OWNED_FIELDS:
        if field in candidate:
            errors.append(error(field, "hook-owned field is not accepted", f"Remove `{field}`; the append helper injects it."))
    for field in candidate:
        if field not in ALLOWED_FIELDS and field not in HOOK_OWNED_FIELDS:
            errors.append(error(field, "unknown field", "Remove fields outside the current session memo schema."))
    for field in REQUIRED_FIELDS:
        if field not in candidate:
            errors.append(error(field, "missing required field", f"Add `{field}` using the current session memo schema."))

    memo_type = candidate.get("memo_type")
    if memo_type not in ALLOWED_MEMO_TYPES:
        errors.append(error("memo_type", f"unsupported value `{memo_type}`", f"Use one of: {', '.join(sorted(ALLOWED_MEMO_TYPES))}."))
    status = candidate.get("status")
    if status not in ALLOWED_STATUS:
        errors.append(error("status", f"unsupported value `{status}`", "Use `accepted` or `needs_review`."))

    for field in ("subject", "context", "rationale", "durable_value"):
        validate_non_empty_string(candidate, field, errors)

    changed = validate_path_list(candidate, "changed_artifacts", True, errors)
    referenced = validate_path_list(candidate, "referenced_artifacts", False, errors)
    classification = validate_classification(candidate.get("classification_clues"), errors)
    relations = validate_relations(candidate.get("relations"), previous_refs, errors)

    if errors:
        return None, errors

    record: dict[str, Any] = {
        "memo_type": memo_type,
        "status": status,
        "subject": str(candidate["subject"]).strip(),
        "context": str(candidate["context"]).strip(),
        "rationale": str(candidate["rationale"]).strip(),
        "changed_artifacts": changed,
        "durable_value": str(candidate["durable_value"]).strip(),
        "classification_clues": classification,
        "relations": relations,
    }
    if "referenced_artifacts" in candidate:
        record["referenced_artifacts"] = referenced
    return record, []


def next_index(existing: list[dict[str, Any]], turn_id: str) -> int:
    indexes = [
        item.get("memo_index")
        for item in existing
        if item.get("turn_id") == turn_id and isinstance(item.get("memo_index"), int)
    ]
    return max(indexes, default=0) + 1


def material_key(record: dict[str, Any]) -> tuple[str, str, str, str, str]:
    return (
        str(record.get("memo_type", "")),
        str(record.get("status", "")),
        re.sub(r"\s+", " ", str(record.get("subject", "")).strip()),
        re.sub(r"\s+", " ", str(record.get("context", "")).strip()),
        re.sub(r"\s+", " ", str(record.get("rationale", "")).strip()),
    )


def append_memos(
    *,
    repo_root: Path,
    memo_root: Path,
    session_id: str,
    turn_id: str,
    candidates: list[Any],
    dry_run: bool,
) -> dict[str, Any]:
    session_id = safe_session_id(session_id)
    if not session_id:
        return response(False, errors=[error("session_id", "required non-empty session id", "Pass `--session-id` from hook input or transcript filename.")])
    if not turn_id.strip():
        return response(False, errors=[error("turn_id", "required non-empty turn id", "Pass a stable host-provided or transcript-derived `--turn-id`.")])

    session_file = memo_root / "sessions" / f"{session_id}.jsonl"
    existing = read_jsonl(session_file)
    previous_refs = {str(item.get("memo_ref")) for item in existing if isinstance(item.get("memo_ref"), str)}

    normalized: list[dict[str, Any]] = []
    all_errors: list[dict[str, str]] = []
    for idx, candidate in enumerate(candidates):
        record, errors = validate_candidate(candidate, previous_refs)
        if errors:
            for item in errors:
                item = dict(item)
                item["candidate_index"] = str(idx)
                all_errors.append(item)
        elif record is not None:
            normalized.append(record)

    if all_errors:
        return response(
            False,
            errors=all_errors,
            repair_hint="Fix the reported fields and retry. No memo was appended.",
            session_file=display_path(session_file, repo_root),
        )

    seen_existing = {
        material_key(item)
        for item in existing
        if item.get("status") == "accepted" and not item.get("relations", {}).get("supersedes") and not item.get("relations", {}).get("conflicts_with")
    }
    unique_records: list[dict[str, Any]] = []
    seen_new: set[tuple[str, str, str, str, str]] = set()
    for record in normalized:
        key = material_key(record)
        if key in seen_new:
            continue
        if key in seen_existing and not record["relations"].get("supersedes") and not record["relations"].get("conflicts_with"):
            continue
        seen_new.add(key)
        unique_records.append(record)

    start = next_index(existing, turn_id)
    ts = now_iso()
    appended: list[dict[str, Any]] = []
    for offset, record in enumerate(unique_records):
        memo_index = start + offset
        full_record = {
            "ts": ts,
            "turn_id": turn_id.strip(),
            "memo_index": memo_index,
            "memo_ref": f"{turn_id.strip()}#{memo_index}",
        }
        full_record.update(record)
        appended.append(full_record)

    if not dry_run and appended:
        session_file.parent.mkdir(parents=True, exist_ok=True)
        with session_file.open("a", encoding="utf-8") as f:
            for record in appended:
                f.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
                f.write("\n")

    return response(
        True,
        appended=len(appended),
        memo_refs=[item["memo_ref"] for item in appended],
        records=appended,
        session_file=display_path(session_file, repo_root),
        dry_run=dry_run,
    )


def load_candidates(args: argparse.Namespace) -> list[Any]:
    if args.memo_json:
        data = json.loads(args.memo_json)
    elif args.memo_file:
        data = json.loads(Path(args.memo_file).read_text(encoding="utf-8"))
    else:
        data = json.loads(sys.stdin.read() or "[]")
    if isinstance(data, list):
        return data
    return [data]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=os.getcwd())
    parser.add_argument("--memo-root", default="")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--turn-id", required=True)
    parser.add_argument("--memo-json", default="")
    parser.add_argument("--memo-file", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        candidates = load_candidates(args)
    except Exception as exc:
        print(json.dumps(response(False, errors=[error("input", f"invalid JSON input: {exc}", "Pass a valid JSON object or array.")]), ensure_ascii=False))
        return 1

    result = append_memos(
        repo_root=Path(args.repo_root).resolve(),
        memo_root=resolve_memo_root(Path(args.repo_root).resolve(), args.memo_root),
        session_id=args.session_id,
        turn_id=args.turn_id,
        candidates=candidates,
        dry_run=args.dry_run,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2 if not result.get("ok") else None))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
