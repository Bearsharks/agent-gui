#!/usr/bin/env python3
"""Deterministic review rubric for Codex self-improvement sessions."""

from __future__ import annotations

import datetime as _dt
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any


SIGNAL_PATTERNS: dict[str, list[str]] = {
    "user_correction": [
        r"\b(stop doing|don't|do not|remember|always|next time|too verbose|just give)\b",
        r"(다음부터|기억|하지 마|하지마|항상|너무|싫|그렇게 하세요|수정하세요)",
    ],
    "workflow_correction": [
        r"\b(workflow|process|sequence|first|before|after|verify|test|approval)\b",
        r"(순서|절차|먼저|나중에|확인|검증|테스트|승인)",
    ],
    "reusable_fix": [
        r"\b(fix|workaround|retry|resolved|passed|succeeded|root cause)\b",
        r"(수정|해결|재시도|성공|통과|원인|우회)",
    ],
    "loaded_or_consulted_skill": [
        r"\bskill_view\b",
        r"\$[a-zA-Z0-9_.-]+",
        r"\bUse the [a-zA-Z0-9_.-]+ skill\b",
    ],
    "transient_failure_only": [
        r"\b(command not found|missing binary|unconfigured credentials|fresh install|not installed)\b",
        r"(명령어 없음|설치되지|자격 증명|환경 오류|일시적)",
    ],
    "secret_or_private_data_risk": [
        r"\b(password|secret|token|api[_-]?key|credential)\b",
        r"\b(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{10,})\b",
        r"(비밀번호|토큰|시크릿|자격 증명|개인정보)",
    ],
    "one_off_task": [
        r"\b(today'?s|one-off|single task|this PR|this bug only)\b",
        r"(오늘만|일회성|이번 PR|이번 버그|단발)",
    ],
}


def now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def now_iso() -> str:
    return now().isoformat()


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")


def reviews_dir() -> Path:
    return codex_home() / "self-improvement" / "reviews" / "self-improvement"


def skills_dir() -> Path:
    return codex_home() / "self-improvement" / "skills"


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def atomic_write_json(path: Path, data: Any) -> None:
    atomic_write_text(path, json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text
    raw = text[4:end].strip()
    body = text[text.find("\n", end + 1) + 1 :]
    fm: dict[str, str] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fm[key.strip()] = value.strip().strip("\"'")
    return fm, body


def iter_skill_index() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    base = skills_dir()
    if not base.exists():
        return rows
    for skill_md in sorted(base.rglob("SKILL.md")):
        if any(part in {".archive", ".hub", ".git", "__pycache__"} for part in skill_md.parts):
            continue
        text = skill_md.read_text(encoding="utf-8", errors="replace")
        fm, body = parse_frontmatter(text)
        name = fm.get("name") or skill_md.parent.name
        rows.append(
            {
                "name": name,
                "description": fm.get("description", ""),
                "body_preview": " ".join(body.split())[:500],
            }
        )
    return rows


def evidence_snippet(text: str, start: int, end: int, *, width: int = 160) -> str:
    left = max(0, start - width // 2)
    right = min(len(text), end + width // 2)
    return " ".join(text[left:right].split())


def detect_signals(transcript: str) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for signal_type, patterns in SIGNAL_PATTERNS.items():
        seen: set[str] = set()
        for pattern in patterns:
            for match in re.finditer(pattern, transcript, re.IGNORECASE):
                snippet = evidence_snippet(transcript, match.start(), match.end())
                if snippet in seen:
                    continue
                seen.add(snippet)
                signals.append(
                    {
                        "type": signal_type,
                        "pattern": pattern,
                        "evidence": snippet,
                    }
                )
                if len(seen) >= 3:
                    break
            if len(seen) >= 3:
                break
    return signals


def extract_loaded_skill_names(transcript: str, skill_index: list[dict[str, str]]) -> list[str]:
    names = {row["name"] for row in skill_index}
    found: list[str] = []
    for name in sorted(names):
        escaped = re.escape(name)
        patterns = [
            rf"\${escaped}\b",
            rf"\bskill_view\b[\s\S]{{0,120}}\b{escaped}\b",
            rf"\bUse the {escaped} skill\b",
            rf"\b{escaped}\b",
        ]
        if any(re.search(pattern, transcript, re.IGNORECASE) for pattern in patterns):
            found.append(name)
    return found


def score_skill_target(row: dict[str, str], transcript: str, loaded: set[str]) -> int:
    name = row["name"]
    score = 0
    if name in loaded:
        score += 100
    tokens = {
        token
        for token in re.split(r"[^a-zA-Z0-9가-힣]+", f"{name} {row.get('description', '')}")
        if len(token) >= 3
    }
    lower = transcript.lower()
    score += sum(1 for token in tokens if token.lower() in lower)
    if "umbrella" in row.get("body_preview", "").lower() or "class-level" in row.get("body_preview", "").lower():
        score += 5
    return score


def rank_targets(transcript: str, skill_index: list[dict[str, str]], loaded_names: list[str]) -> list[dict[str, Any]]:
    loaded = set(loaded_names)
    ranked: list[dict[str, Any]] = []
    for row in skill_index:
        score = score_skill_target(row, transcript, loaded)
        if score <= 0:
            continue
        reason = "loaded_or_consulted_skill" if row["name"] in loaded else "existing_umbrella_candidate"
        ranked.append({"name": row["name"], "score": score, "reason": reason})
    return sorted(ranked, key=lambda item: (-int(item["score"]), str(item["name"])))[:10]


def build_rubric(signals: list[dict[str, Any]], ranked_targets: list[dict[str, Any]]) -> dict[str, Any]:
    types = {signal["type"] for signal in signals}
    durable_types = {"user_correction", "workflow_correction", "reusable_fix", "loaded_or_consulted_skill"}
    has_durable = bool(types & durable_types)
    transient_only = bool(types & {"transient_failure_only"}) and not bool(types & (durable_types - {"reusable_fix"}))
    secret_risk = "secret_or_private_data_risk" in types
    one_off = "one_off_task" in types and not has_durable
    recommended = "none"
    if has_durable and not transient_only and not secret_risk and not one_off:
        if ranked_targets:
            recommended = "patch"
        else:
            recommended = "needs_user_judgment"
    return {
        "has_durable_signal": has_durable,
        "has_loaded_skill_candidate": any(target["reason"] == "loaded_or_consulted_skill" for target in ranked_targets),
        "has_existing_umbrella_candidate": bool(ranked_targets),
        "contains_transient_failure_only": transient_only,
        "contains_secret_or_private_data_risk": secret_risk,
        "contains_one_off_only": one_off,
        "recommended_operation": recommended,
        "requires_approval": True,
    }


def review_session_text(transcript: str, *, skill_index: list[dict[str, str]] | None = None) -> dict[str, Any]:
    index = skill_index if skill_index is not None else iter_skill_index()
    signals = detect_signals(transcript)
    loaded = extract_loaded_skill_names(transcript, index)
    targets = rank_targets(transcript, index, loaded)
    rubric = build_rubric(signals, targets)
    return {
        "success": True,
        "started_at": now_iso(),
        "signals": signals,
        "loaded_skills": loaded,
        "candidate_targets": targets,
        "rubric": rubric,
        "do_not_store": [
            signal for signal in signals
            if signal["type"] in {"transient_failure_only", "secret_or_private_data_risk", "one_off_task"}
        ],
    }


def write_review_report(review: dict[str, Any]) -> Path:
    run_id = now().strftime("%Y%m%d-%H%M%S")
    report_dir = reviews_dir() / run_id
    report_dir.mkdir(parents=True, exist_ok=True)
    review["run_id"] = run_id
    lines = [
        "# Codex Self-Improvement Review Report",
        "",
        f"- run_id: {run_id}",
        f"- recommended_operation: {review['rubric']['recommended_operation']}",
        f"- requires_approval: {review['rubric']['requires_approval']}",
        f"- signals: {len(review['signals'])}",
        f"- candidate_targets: {len(review['candidate_targets'])}",
    ]
    if review["candidate_targets"]:
        lines.extend(["", "## candidate_targets"])
        for target in review["candidate_targets"]:
            lines.append(f"- {target['name']}: score={target['score']} reason={target['reason']}")
    if review["signals"]:
        lines.extend(["", "## signals"])
        for signal in review["signals"]:
            lines.append(f"- {signal['type']}: {signal['evidence']}")
    if review["do_not_store"]:
        lines.extend(["", "## do_not_store"])
        for signal in review["do_not_store"]:
            lines.append(f"- {signal['type']}: {signal['evidence']}")
    atomic_write_json(report_dir / "run.json", review)
    atomic_write_text(report_dir / "REPORT.md", "\n".join(lines) + "\n")
    return report_dir


def run_review(transcript: str) -> dict[str, Any]:
    review = review_session_text(transcript)
    report_dir = write_review_report(review)
    review["report_path"] = str(report_dir)
    return review
