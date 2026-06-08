#!/usr/bin/env python3
"""Agent memo stop hook runner.

Reads stop-hook JSON, extracts last-turn context, asks a sessionless nested LLM
for durable memo candidates, and delegates schema validation plus JSONL append
through mem/src/mem/write_session_memo.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if sys.version_info >= (3, 11):
    import tomllib
else:
    try:
        import tomllib
    except ModuleNotFoundError:
        tomllib = None  # type: ignore[assignment]


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


MAX_CONTEXT_CHARS = env_int("AGENT_MEMO_MAX_CONTEXT_CHARS", 10000)
MAX_RESULT_CHARS = env_int("AGENT_MEMO_MAX_RESULT_CHARS", 600)
MAX_ARG_VALUE_CHARS = env_int("AGENT_MEMO_MAX_ARG_VALUE_CHARS", 120)
MAX_ARG_SUMMARY_CHARS = env_int("AGENT_MEMO_MAX_ARG_SUMMARY_CHARS", 400)
MAX_PREVIOUS_MEMOS = env_int("AGENT_MEMO_MAX_PREVIOUS_MEMOS", 50)
MAX_FILES = env_int("AGENT_MEMO_MAX_FILES", 30)
DEFAULT_MEMO_ROOT = ".mem/memo"
VALID_PROVIDERS = {"auto", "codex", "claude", "none"}
DEFAULT_CODEX_MODEL = "gpt-5.4-mini"
DEFAULT_CLAUDE_MODEL = "haiku"


@dataclass
class HookContext:
    project_root: Path
    memo_root: Path
    session_id: str
    session_file: Path
    turn_id: str
    last_turn: str
    previous_memos: list[dict[str, Any]]
    previous_refs: set[str]


def read_stdin_json() -> dict[str, Any]:
    try:
        raw = sys.stdin.buffer.read().decode("utf-8", errors="replace")
    except Exception:
        raw = ""
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def load_input(args: argparse.Namespace) -> dict[str, Any]:
    if args.input:
        try:
            data = json.loads(Path(args.input).read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    if args.payload_json:
        try:
            data = json.loads(args.payload_json)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return read_stdin_json()


def load_project_mem_toml(project_root: Path) -> dict[str, Any]:
    if tomllib is None:
        return {}
    path = project_root / ".mem" / "mem.toml"
    try:
        with path.open("rb") as f:
            data = tomllib.load(f)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def configured_provider(project_root: Path, cli_provider: str | None) -> str:
    if cli_provider:
        return cli_provider

    config = load_project_mem_toml(project_root)
    memo_stop = config.get("memo_stop")
    raw = ""
    if isinstance(memo_stop, dict):
        raw = str(memo_stop.get("provider") or memo_stop.get("llm_provider") or "").strip()
    if not raw:
        raw = os.environ.get("AGENT_MEMO_LLM", "auto").strip()

    provider = raw.lower() if raw else "auto"
    return provider if provider in VALID_PROVIDERS else "auto"


def configured_models(project_root: Path) -> tuple[str, str]:
    config = load_project_mem_toml(project_root)
    memo_stop = config.get("memo_stop")
    codex_model = ""
    claude_model = ""
    if isinstance(memo_stop, dict):
        codex_model = str(memo_stop.get("codex_model") or "").strip()
        claude_model = str(memo_stop.get("claude_model") or "").strip()

    if not codex_model:
        codex_model = os.environ.get("AGENT_MEMO_CODEX_MODEL", DEFAULT_CODEX_MODEL).strip()
    if not claude_model:
        claude_model = os.environ.get("AGENT_MEMO_CLAUDE_MODEL", DEFAULT_CLAUDE_MODEL).strip()

    return codex_model or DEFAULT_CODEX_MODEL, claude_model or DEFAULT_CLAUDE_MODEL


def git_root(cwd: Path) -> Path:
    try:
        out = subprocess.check_output(
            ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        if out:
            return Path(out)
    except Exception:
        pass
    return cwd


def configured_memo_root(project_root: Path) -> Path:
    raw = os.environ.get("AGENT_MEMO_ROOT", DEFAULT_MEMO_ROOT).strip() or DEFAULT_MEMO_ROOT
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = project_root / path
    return path.resolve()


def display_path(path: Path, project_root: Path) -> str:
    try:
        return str(path.relative_to(project_root))
    except ValueError:
        return str(path)


def json_get(data: dict[str, Any], dotted: str, default: Any = "") -> Any:
    value: Any = data
    for part in dotted.split("."):
        if isinstance(value, dict) and part in value:
            value = value[part]
        else:
            return default
    return value


def safe_session_id(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    value = re.sub(r"^rollout-", "", value)
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", value)
    return value[:160]


def derive_session_id(input_data: dict[str, Any], transcript_path: str) -> str:
    for key in ("session_id", "session.id", "conversation_id"):
        value = json_get(input_data, key, "")
        if isinstance(value, str) and value.strip():
            return safe_session_id(value)
    if transcript_path:
        return safe_session_id(Path(transcript_path).stem)
    return ""


def line_content_text(obj: dict[str, Any]) -> str:
    message = obj.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text") or item.get("content")
                    if isinstance(text, str):
                        parts.append(text)
                elif isinstance(item, str):
                    parts.append(item)
            return "\n".join(parts)
    payload = obj.get("payload")
    if isinstance(payload, dict):
        for key in ("message", "text", "content"):
            value = payload.get(key)
            if isinstance(value, str):
                return value
    for key in ("text", "content"):
        value = obj.get(key)
        if isinstance(value, str):
            return value
    return ""


def is_user_line(obj: dict[str, Any]) -> bool:
    if obj.get("type") == "user":
        return True
    if obj.get("role") == "user":
        return True
    if obj.get("type") == "event_msg":
        payload = obj.get("payload")
        return isinstance(payload, dict) and payload.get("type") == "user_message"
    return False


def line_identifier(obj: dict[str, Any], fallback: str) -> str:
    for key in ("uuid", "id", "event_id", "turn_id"):
        value = obj.get(key)
        if isinstance(value, str) and value:
            return value
    payload = obj.get("payload")
    if isinstance(payload, dict):
        for key in ("uuid", "id", "event_id", "turn_id"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
    return fallback


def truncate(text: Any, max_chars: int) -> str:
    value = str(text)
    if len(value) <= max_chars:
        return value
    return value[:max_chars] + "...(truncated)"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        with path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(obj, dict):
                    records.append(obj)
    except FileNotFoundError:
        return []
    except Exception:
        return []
    return records


def is_codex_rollout(records: list[dict[str, Any]]) -> bool:
    for obj in records:
        if obj.get("type") == "event_msg":
            payload = obj.get("payload")
            if isinstance(payload, dict) and payload.get("type") in {
                "task_started",
                "user_message",
                "agent_message",
            }:
                return True
        if obj.get("type") == "response_item":
            payload = obj.get("payload")
            if isinstance(payload, dict) and payload.get("type") in {
                "function_call",
                "function_call_output",
            }:
                return True
    return False


def is_claude_transcript(records: list[dict[str, Any]]) -> bool:
    for obj in records:
        if obj.get("type") in {"user", "assistant"} and isinstance(obj.get("message"), dict):
            return True
    return False


def summarize_args(args: Any) -> str:
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except Exception:
            return truncate(args, MAX_ARG_SUMMARY_CHARS)
    if isinstance(args, dict):
        parts = []
        for key, value in args.items():
            parts.append(f"{key}={truncate(value, MAX_ARG_VALUE_CHARS)}")
        return truncate(", ".join(parts), MAX_ARG_SUMMARY_CHARS)
    return truncate(args, MAX_ARG_SUMMARY_CHARS)


def find_codex_turn_start(records: list[dict[str, Any]]) -> int | None:
    for idx in range(len(records) - 1, -1, -1):
        obj = records[idx]
        if obj.get("type") == "event_msg":
            payload = obj.get("payload")
            if isinstance(payload, dict) and payload.get("type") == "task_started":
                return idx
    for idx in range(len(records) - 1, -1, -1):
        obj = records[idx]
        if obj.get("type") == "event_msg":
            payload = obj.get("payload")
            if isinstance(payload, dict) and payload.get("type") == "user_message":
                return idx
    return None


def find_codex_turn_id(records: list[dict[str, Any]], start_idx: int) -> str:
    for obj in records[start_idx:]:
        if obj.get("type") == "event_msg":
            payload = obj.get("payload")
            if isinstance(payload, dict) and payload.get("type") == "user_message":
                text = str(payload.get("message") or "")
                fallback = "turn-" + hashlib.sha256(text.encode()).hexdigest()[:16]
                return line_identifier(obj, fallback)
    fallback_seed = json.dumps(records[start_idx], ensure_ascii=False, sort_keys=True)
    return "turn-" + hashlib.sha256(fallback_seed.encode()).hexdigest()[:16]


def format_codex_rollout(records: list[dict[str, Any]]) -> tuple[str, str]:
    start_idx = find_codex_turn_start(records)
    if start_idx is None:
        return "", ""
    output = ["=== Transcript of a conversation between a human and Codex CLI ==="]
    for obj in records[start_idx:]:
        line_type = obj.get("type", "")
        payload = obj.get("payload")
        if not isinstance(payload, dict):
            payload = {}

        if line_type == "event_msg":
            msg_type = payload.get("type", "")
            if msg_type == "user_message":
                message = str(payload.get("message") or "").strip()
                if message:
                    output.append(f"[Human]: {message}")
            elif msg_type == "agent_message":
                message = str(payload.get("message") or "").strip()
                if message:
                    output.append(f"[Codex]: {message}")

        elif line_type == "response_item":
            item_type = payload.get("type", "")
            if item_type == "function_call":
                name = payload.get("name", "unknown")
                args_summary = summarize_args(payload.get("arguments", ""))
                output.append(f"[Codex calls tool]: {name}({args_summary})")
            elif item_type == "function_call_output":
                result = truncate(payload.get("output", ""), MAX_RESULT_CHARS)
                output.append(f"[Tool output]: {result}")

    return find_codex_turn_id(records, start_idx), "\n".join(output)


def find_claude_turn_start(records: list[dict[str, Any]]) -> int | None:
    for idx in range(len(records) - 1, -1, -1):
        obj = records[idx]
        if obj.get("type") != "user" or obj.get("isMeta"):
            continue
        content = obj.get("message", {}).get("content") if isinstance(obj.get("message"), dict) else None
        if isinstance(content, str) and content.strip():
            return idx
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text" and str(block.get("text", "")).strip():
                    return idx
    return None


def format_claude_transcript(records: list[dict[str, Any]]) -> tuple[str, str]:
    start_idx = find_claude_turn_start(records)
    if start_idx is None:
        return "", ""
    output = ["=== Transcript of a conversation between a human and Claude Code ==="]
    for obj in records[start_idx:]:
        msg_type = obj.get("type", "")
        if msg_type not in {"user", "assistant"}:
            continue
        message = obj.get("message")
        if not isinstance(message, dict):
            continue

        if msg_type == "user":
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                output.append(f"[Human]: {content.strip()}")
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "text":
                        text = str(block.get("text", "")).strip()
                        if text:
                            output.append(f"[Human]: {text}")
                    elif block.get("type") == "tool_result":
                        result = block.get("content", "")
                        if isinstance(result, list):
                            parts = []
                            for item in result:
                                if isinstance(item, dict):
                                    parts.append(str(item.get("text", "")))
                            result = "\n".join(parts)
                        result = truncate(result, MAX_RESULT_CHARS)
                        label = "[Tool error]" if block.get("is_error") else "[Tool output]"
                        output.append(f"{label}: {result}")

        elif msg_type == "assistant":
            content = message.get("content", [])
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                block_type = block.get("type", "")
                if block_type == "text":
                    text = str(block.get("text", "")).strip()
                    if text:
                        output.append(f"[Claude Code]: {text}")
                elif block_type == "tool_use":
                    name = block.get("name", "unknown")
                    input_summary = summarize_args(block.get("input", {}))
                    output.append(f"[Claude Code calls tool]: {name}({input_summary})")

    fallback_seed = json.dumps(records[start_idx], ensure_ascii=False, sort_keys=True)
    fallback = "turn-" + hashlib.sha256(fallback_seed.encode()).hexdigest()[:16]
    return line_identifier(records[start_idx], fallback), "\n".join(output)


def extract_last_turn_from_transcript(path: Path) -> tuple[str, str]:
    records = read_jsonl(path)
    if not records:
        return "", ""

    if is_codex_rollout(records):
        return format_codex_rollout(records)
    if is_claude_transcript(records):
        return format_claude_transcript(records)

    last_user_idx = -1
    last_user_obj: dict[str, Any] | None = None
    for idx, obj in enumerate(records):
        if is_user_line(obj):
            text = line_content_text(obj).strip()
            if text:
                last_user_idx = idx
                last_user_obj = obj

    if last_user_idx < 0:
        return "", ""

    selected = records[last_user_idx:]
    rendered: list[str] = []
    for obj in selected:
        kind = obj.get("type") or obj.get("role") or "event"
        payload = obj.get("payload")
        if isinstance(payload, dict) and payload.get("type"):
            kind = str(payload.get("type"))
        text = line_content_text(obj).strip()
        if text:
            rendered.append(f"[{kind}] {text}")
        else:
            compact = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
            rendered.append(f"[{kind}] {truncate(compact, MAX_RESULT_CHARS)}")

    fallback_seed = json.dumps(last_user_obj, ensure_ascii=False, sort_keys=True)
    fallback = "turn-" + hashlib.sha256(fallback_seed.encode()).hexdigest()[:16]
    turn_id = line_identifier(last_user_obj or {}, fallback)
    return turn_id, "\n".join(rendered)


def extract_last_turn(input_data: dict[str, Any]) -> tuple[str, str]:
    transcript_path = str(json_get(input_data, "transcript_path", "") or "")
    for key in ("turn_id", "turn.id", "last_turn_id", "uuid"):
        value = json_get(input_data, key, "")
        if isinstance(value, str) and value.strip():
            explicit_turn_id = value.strip()
            break
    else:
        explicit_turn_id = ""

    if transcript_path and Path(transcript_path).is_file():
        turn_id, content = extract_last_turn_from_transcript(Path(transcript_path))
        if explicit_turn_id:
            turn_id = explicit_turn_id
        if content:
            return turn_id, content

    user_text = ""
    for key in ("last_user_message", "user_message", "prompt"):
        value = json_get(input_data, key, "")
        if isinstance(value, str) and value.strip():
            user_text = value.strip()
            break

    assistant_text = str(json_get(input_data, "last_assistant_message", "") or "").strip()
    parts = []
    if user_text:
        parts.append(f"[user_message] {user_text}")
    if assistant_text:
        parts.append(f"[assistant_message] {assistant_text}")
    content = "\n".join(parts)
    if not explicit_turn_id and user_text:
        explicit_turn_id = "turn-" + hashlib.sha256(user_text.encode()).hexdigest()[:16]
    return explicit_turn_id, content


def load_previous_memos(session_file: Path, max_records: int = MAX_PREVIOUS_MEMOS) -> list[dict[str, Any]]:
    records = read_jsonl(session_file)
    if len(records) <= max_records:
        return records
    needs_review = [r for r in records if r.get("status") == "needs_review"]
    latest = records[-max_records:]
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in needs_review + latest:
        key = str(record.get("memo_ref") or id(record))
        if key not in seen:
            merged.append(record)
            seen.add(key)
    return merged[-max_records:]


def build_context(project_root: Path, input_data: dict[str, Any]) -> HookContext | None:
    transcript_path = str(json_get(input_data, "transcript_path", "") or "")
    session_id = derive_session_id(input_data, transcript_path)
    if not session_id:
        return None

    turn_id, last_turn = extract_last_turn(input_data)
    if not turn_id or not last_turn.strip():
        return None

    memo_root = configured_memo_root(project_root)
    session_file = memo_root / "sessions" / f"{session_id}.jsonl"
    previous_memos = load_previous_memos(session_file)
    previous_refs = {
        str(record.get("memo_ref"))
        for record in previous_memos
        if isinstance(record.get("memo_ref"), str)
    }
    return HookContext(
        project_root=project_root,
        memo_root=memo_root,
        session_id=session_id,
        session_file=session_file,
        turn_id=turn_id,
        last_turn=last_turn,
        previous_memos=previous_memos,
        previous_refs=previous_refs,
    )


def prompt_path() -> Path:
    return Path(__file__).resolve().parent / "prompts" / "memo-candidates.txt"


def append_helper_path(project_root: Path) -> Path:
    return project_root / "mem" / "src" / "mem" / "write_session_memo.py"


def build_prompt(ctx: HookContext) -> str:
    previous = []
    for record in ctx.previous_memos:
        previous.append(
            {
                "memo_ref": record.get("memo_ref"),
                "memo_type": record.get("memo_type", record.get("type")),
                "status": record.get("status"),
                "subject": record.get("subject", record.get("summary")),
                "context": record.get("context"),
                "rationale": record.get("rationale", record.get("reason")),
                "changed_artifacts": record.get("changed_artifacts", record.get("files", [])),
                "referenced_artifacts": record.get("referenced_artifacts", record.get("target_doc_hint", [])),
                "durable_value": record.get("durable_value"),
                "classification_clues": record.get("classification_clues"),
                "relations": record.get("relations", {
                    "supersedes": record.get("supersedes", []),
                    "conflicts_with": record.get("conflicts_with", []),
                }),
            }
        )
    return "\n\n".join(
        [
            prompt_path().read_text(encoding="utf-8"),
            "Append helper command available to the hook runner:",
            f"python3 {append_helper_path(ctx.project_root)} --repo-root {ctx.project_root} --memo-root {ctx.memo_root} --session-id {ctx.session_id} --turn-id {ctx.turn_id}",
            "Previous memo records:",
            json.dumps(previous, ensure_ascii=False, indent=2),
            "Last turn context:",
            ctx.last_turn[:MAX_CONTEXT_CHARS],
        ]
    )


def run_codex(prompt: str, timeout_s: int, model: str) -> str:
    if not shutil.which("codex"):
        return ""
    cmd = [
        "codex",
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "-s",
        "read-only",
        "-c",
        "features.codex_hooks=false",
        "-c",
        'model_reasoning_effort="low"',
        "-m",
        model,
        prompt,
    ]
    env = os.environ.copy()
    env["AGENT_MEMO_IN_STOP_WORKER"] = "1"
    try:
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout_s, env=env)
    except (subprocess.TimeoutExpired, OSError):
        return ""
    return proc.stdout.strip() if proc.returncode == 0 else ""


def run_claude(prompt: str, timeout_s: int, model: str) -> str:
    if not shutil.which("claude"):
        return ""
    cmd = [
        "claude",
        "-p",
        "--model",
        model,
        "--no-session-persistence",
        "--no-chrome",
        "--system-prompt",
        "Return only the requested JSON array.",
    ]
    env = os.environ.copy()
    env["AGENT_MEMO_IN_STOP_WORKER"] = "1"
    try:
        proc = subprocess.run(
            cmd,
            input=prompt,
            text=True,
            capture_output=True,
            timeout=timeout_s,
            env=env,
        )
    except (subprocess.TimeoutExpired, OSError):
        return ""
    return proc.stdout.strip() if proc.returncode == 0 else ""


def strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def parse_candidates(output: str) -> list[dict[str, Any]]:
    if not output.strip():
        return []
    decoder = json.JSONDecoder()
    try:
        data = json.loads(strip_code_fence(output))
    except json.JSONDecodeError:
        data = None
    if not isinstance(data, list):
        parsed_lists: list[list[Any]] = []
        text = strip_code_fence(output)
        for match in re.finditer(r"\[", text):
            try:
                value, _ = decoder.raw_decode(text[match.start() :])
            except json.JSONDecodeError:
                continue
            if isinstance(value, list):
                parsed_lists.append(value)
        if not parsed_lists:
            return []
        data = parsed_lists[-1]
    return [item for item in data if isinstance(item, dict)]


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def run_append_helper(ctx: HookContext, candidates: list[dict[str, Any]], dry_run: bool) -> dict[str, Any]:
    helper = append_helper_path(ctx.project_root)
    if not helper.is_file():
        return {
            "ok": False,
            "errors": [
                {
                    "field": "append_helper",
                    "message": f"missing helper: {helper}",
                    "repair_hint": "Restore `mem/src/mem/write_session_memo.py` before running the stop hook.",
                }
            ],
        }

    fd, memo_path = tempfile.mkstemp(prefix="agent-memo-candidates-", suffix=".json")
    os.close(fd)
    memo_file = Path(memo_path)
    try:
        memo_file.write_text(json.dumps(candidates, ensure_ascii=False), encoding="utf-8")
        cmd = [
            sys.executable,
            str(helper),
            "--repo-root",
            str(ctx.project_root),
            "--memo-root",
            str(ctx.memo_root),
            "--session-id",
            ctx.session_id,
            "--turn-id",
            ctx.turn_id,
            "--memo-file",
            str(memo_file),
        ]
        if dry_run:
            cmd.append("--dry-run")
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {
            "ok": False,
            "errors": [
                {
                    "field": "append_helper",
                    "message": str(exc),
                    "repair_hint": "Retry after the append helper is executable by python3.",
                }
            ],
        }
    finally:
        try:
            memo_file.unlink()
        except Exception:
            pass

    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {
            "ok": False,
            "errors": [
                {
                    "field": "append_helper",
                    "message": proc.stderr.strip() or proc.stdout.strip() or "append helper returned no JSON",
                    "repair_hint": "Run the append helper directly to inspect the failure.",
                }
            ],
        }
    return result if isinstance(result, dict) else {"ok": False, "errors": [{"field": "append_helper", "message": "non-object JSON response", "repair_hint": "Fix helper output."}]}


def write_debug_log(ctx: HookContext, raw_output: str, helper_result: dict[str, Any]) -> None:
    ctx.session_file.parent.mkdir(parents=True, exist_ok=True)
    log_path = ctx.session_file.parent / "last_input_output.log"
    payload = {
        "ts": now_iso(),
        "session_file": display_path(ctx.session_file, ctx.project_root),
        "turn_id": ctx.turn_id,
        "last_turn_context": ctx.last_turn[:MAX_CONTEXT_CHARS],
        "llm_output": raw_output,
        "append_helper_result": helper_result,
    }
    log_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_llm(prompt: str, provider: str, timeout_s: int, codex_model: str, claude_model: str) -> str:
    if provider == "none":
        return ""
    if provider == "claude":
        return run_claude(prompt, timeout_s, claude_model)
    if provider == "codex":
        return run_codex(prompt, timeout_s, codex_model)
    return run_codex(prompt, timeout_s, codex_model) or run_claude(prompt, timeout_s, claude_model)


def build_repair_prompt(original_prompt: str, raw_output: str, helper_result: dict[str, Any]) -> str:
    return "\n\n".join(
        [
            original_prompt,
            "The append helper rejected the previous memo candidates.",
            "Previous nested-agent output:",
            raw_output,
            "Append helper validation response:",
            json.dumps(helper_result, ensure_ascii=False, indent=2),
            "Return ONLY a corrected JSON array. Return [] if no valid durable memo remains.",
        ]
    )


def process_payload(
    input_data: dict[str, Any],
    project_root: Path,
    provider: str,
    codex_model: str,
    claude_model: str,
    timeout_s: int,
    dry_run: bool,
    candidate_json: str,
    debug: bool,
) -> int:
    if os.environ.get("AGENT_MEMO_IN_STOP_WORKER") and not candidate_json:
        return 0
    if str(json_get(input_data, "stop_hook_active", "false")).lower() == "true":
        return 0

    ctx = build_context(project_root, input_data)
    if not ctx:
        return 0

    prompt = build_prompt(ctx)
    if candidate_json:
        raw_output = candidate_json
    else:
        raw_output = run_llm(prompt, provider, timeout_s, codex_model, claude_model)

    candidates = parse_candidates(raw_output)
    helper_result: dict[str, Any] = {
        "ok": True,
        "appended": 0,
        "memo_refs": [],
        "records": [],
        "session_file": display_path(ctx.session_file, ctx.project_root),
        "dry_run": dry_run,
    }

    if candidates:
        check_result = run_append_helper(ctx, candidates, True)
        if (
            not check_result.get("ok")
            and not candidate_json
            and provider != "none"
            and int(os.environ.get("AGENT_MEMO_REPAIR_ATTEMPTS", "1") or "1") > 0
        ):
            raw_output = run_llm(build_repair_prompt(prompt, raw_output, check_result), provider, timeout_s, codex_model, claude_model)
            candidates = parse_candidates(raw_output)
            check_result = run_append_helper(ctx, candidates, True) if candidates else helper_result

        if check_result.get("ok"):
            helper_result = check_result if dry_run else run_append_helper(ctx, candidates, False)
        else:
            helper_result = check_result

    if dry_run:
        if debug:
            write_debug_log(ctx, raw_output, helper_result)
        print(json.dumps(helper_result, ensure_ascii=False, indent=2))
        return 0

    if debug:
        write_debug_log(ctx, raw_output, helper_result)
    return 0


def launch_worker(args: argparse.Namespace, input_data: dict[str, Any], project_root: Path) -> int:
    fd, work_path = tempfile.mkstemp(prefix="agent-memo-stop-", suffix=".json")
    os.close(fd)
    Path(work_path).write_text(
        json.dumps(
            {
                "input": input_data,
                "project_root": str(project_root),
                "provider": args.provider,
                "codex_model": args.codex_model,
                "claude_model": args.claude_model,
                "timeout": args.timeout,
                "debug": args.debug,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print("{}")
    cmd = [sys.executable, str(Path(__file__).resolve()), "--worker", work_path]
    env = os.environ.copy()
    env["AGENT_MEMO_IN_STOP_WORKER"] = "1"
    subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    return 0


def run_worker(path: str) -> int:
    work_file = Path(path)
    try:
        payload = json.loads(work_file.read_text(encoding="utf-8"))
    except Exception:
        return 0
    finally:
        try:
            work_file.unlink()
        except Exception:
            pass
    input_data = payload.get("input")
    if not isinstance(input_data, dict):
        return 0
    project_root = Path(str(payload.get("project_root") or os.getcwd()))
    provider = str(payload.get("provider") or "auto")
    codex_model = str(payload.get("codex_model") or DEFAULT_CODEX_MODEL)
    claude_model = str(payload.get("claude_model") or DEFAULT_CLAUDE_MODEL)
    timeout_s = int(payload.get("timeout") or 45)
    debug = bool(payload.get("debug"))
    # The recursion guard is set for nested LLM calls, but this worker is the
    # intended memo writer. Remove it before processing and set it only around
    # the nested LLM subprocess.
    os.environ.pop("AGENT_MEMO_IN_STOP_WORKER", None)
    return process_payload(input_data, project_root, provider, codex_model, claude_model, timeout_s, False, "", debug)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--payload-json")
    parser.add_argument("--provider", choices=["auto", "codex", "claude", "none"], default=None)
    parser.add_argument("--codex-model")
    parser.add_argument("--claude-model")
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("AGENT_MEMO_TIMEOUT", "45")))
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--candidate-json", default="")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--worker")
    args = parser.parse_args()

    if args.worker:
        return run_worker(args.worker)

    input_data = load_input(args)
    cwd = Path(str(json_get(input_data, "cwd", os.getcwd()) or os.getcwd()))
    project_root = git_root(cwd if cwd.exists() else Path.cwd())

    if args.dry_run or args.sync or args.candidate_json:
        provider = configured_provider(project_root, args.provider)
        codex_model, claude_model = configured_models(project_root)
        if args.codex_model:
            codex_model = args.codex_model
        if args.claude_model:
            claude_model = args.claude_model
        return process_payload(input_data, project_root, provider, codex_model, claude_model, args.timeout, args.dry_run, args.candidate_json, args.debug)

    args.provider = configured_provider(project_root, args.provider)
    codex_model, claude_model = configured_models(project_root)
    args.codex_model = args.codex_model or codex_model
    args.claude_model = args.claude_model or claude_model
    return launch_worker(args, input_data, project_root)


if __name__ == "__main__":
    raise SystemExit(main())
