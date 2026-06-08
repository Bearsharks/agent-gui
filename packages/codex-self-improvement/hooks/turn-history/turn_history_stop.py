#!/usr/bin/env python3
"""Codex Stop hook runner for compact self-improvement turn history."""

from __future__ import annotations

import argparse
import contextlib
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

MAX_CONTEXT_CHARS = int(os.environ.get("AGENT_TURN_HISTORY_MAX_CONTEXT_CHARS", "120000") or "120000")
MAX_ERROR_RESULT_CHARS = int(os.environ.get("AGENT_TURN_HISTORY_MAX_ERROR_RESULT_CHARS", "800") or "800")
MAX_PREVIOUS_MEMOS = int(os.environ.get("AGENT_TURN_HISTORY_PREVIOUS_MEMOS", "10") or "10")
DEFAULT_CODEX_MODEL = "gpt-5.4-mini"
DEFAULT_CLAUDE_MODEL = "sonnet"
VALID_PROVIDERS = {"auto", "claude", "codex", "none"}


@dataclass
class HookContext:
    session_id: str
    turn_id: str
    cwd: str
    transcript_path: str
    history_root: Path
    turns_file: Path
    last_turn: str
    previous_memos: list[dict[str, Any]]


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def read_stdin_json() -> dict[str, Any]:
    raw = sys.stdin.read()
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
        except json.JSONDecodeError:
            return {}
    return read_stdin_json()


def json_get(data: dict[str, Any], dotted: str, default: Any = "") -> Any:
    value: Any = data
    for part in dotted.split("."):
        if isinstance(value, dict) and part in value:
            value = value[part]
        else:
            return default
    return value


def safe_id(value: str) -> str:
    value = value.strip()
    value = re.sub(r"^rollout-", "", value)
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", value)
    return value[:160]


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex").expanduser()


def resolve_history_root(raw: str | None = None) -> Path:
    value = (raw or os.environ.get("AGENT_TURN_HISTORY_ROOT") or "").strip()
    if value:
        path = Path(value).expanduser()
        if not path.is_absolute():
            path = codex_home() / path
        return path.resolve()
    return (codex_home() / "self-improvement" / "turn-history").resolve()


def derive_session_id(input_data: dict[str, Any], transcript_path: str) -> str:
    for key in ("session_id", "session.id", "conversation_id"):
        value = json_get(input_data, key, "")
        if isinstance(value, str) and value.strip():
            return safe_id(value)
    for env_key in ("CODEX_THREAD_ID", "MEM_SESSION_ID"):
        value = os.environ.get(env_key, "")
        if value:
            return safe_id(value)
    if transcript_path:
        return safe_id(Path(transcript_path).stem)
    return ""


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        with path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict):
                    records.append(data)
    except FileNotFoundError:
        return []
    except Exception:
        return []
    return records


def truncate(value: Any, max_chars: int) -> str:
    text = str(value)
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "...(truncated)"


def trim_middle(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    marker = f"\n[... omitted middle of last turn context, total_chars={len(text)}, max_chars={max_chars} ...]\n"
    if max_chars <= len(marker) + 2:
        return text[:max_chars]
    remaining = max_chars - len(marker)
    head_chars = remaining // 2
    tail_chars = remaining - head_chars
    return text[:head_chars] + marker + text[-tail_chars:]


def redact(text: str) -> str:
    text = str(text)
    text = re.sub(r"\bsk-[A-Za-z0-9_-]{12,}\b", "[REDACTED_SECRET]", text)
    text = re.sub(r"\bghp_[A-Za-z0-9_]{10,}\b", "[REDACTED_SECRET]", text)
    text = re.sub(r"(?i)\b(api[_-]?key|token|password|secret)\s*[:=]\s*\S+", r"\1=[REDACTED_SECRET]", text)
    return text


def message_text(payload: dict[str, Any]) -> str:
    content = payload.get("content")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for item in content:
        if isinstance(item, dict):
            text = item.get("text")
            if not isinstance(text, str):
                text = item.get("content")
            if not isinstance(text, str):
                text = item.get("input_text")
            if not isinstance(text, str):
                text = item.get("output_text")
            if isinstance(text, str):
                parts.append(text)
        elif isinstance(item, str):
            parts.append(item)
    return "\n".join(parts)


def summarize_args(args: Any) -> str:
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except Exception:
            return truncate(redact(args), 500)
    if isinstance(args, dict):
        parts = [f"{key}={truncate(redact(str(value)), 160)}" for key, value in args.items()]
        return truncate(", ".join(parts), 700)
    return truncate(redact(str(args)), 500)


def output_error_signal(output: Any) -> bool:
    text = str(output).lower()
    return any(
        marker in text
        for marker in (
            "error",
            "exception",
            "traceback",
            "failed",
            "failure",
            "permission denied",
            "command not found",
            "no such file",
            "timed out",
            "exit code 1",
        )
    )


def summarize_tool_output(payload: dict[str, Any]) -> str:
    output = payload.get("output", "")
    output_text = str(output)
    length = len(output_text)
    if output_error_signal(output_text):
        return f"[Tool output error excerpt, length={length}]: {truncate(redact(output_text), MAX_ERROR_RESULT_CHARS)}"
    return f"[Tool output omitted, length={length}]"


def is_codex_rollout(records: list[dict[str, Any]]) -> bool:
    return any(
        obj.get("type") == "event_msg" or obj.get("type") == "response_item"
        for obj in records
    )


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
        if obj.get("type") == "response_item":
            payload = obj.get("payload")
            if isinstance(payload, dict) and payload.get("role") == "user":
                return idx
    return None


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


def find_codex_turn_id(records: list[dict[str, Any]], start_idx: int) -> str:
    for obj in records[start_idx:]:
        if obj.get("type") == "event_msg":
            payload = obj.get("payload")
            if isinstance(payload, dict) and payload.get("type") == "user_message":
                text = str(payload.get("message") or "")
                fallback = "turn-" + hashlib.sha256(text.encode()).hexdigest()[:16]
                return line_identifier(obj, fallback)
        if obj.get("type") == "response_item":
            payload = obj.get("payload")
            if isinstance(payload, dict) and payload.get("role") == "user":
                text = message_text(payload)
                fallback = "turn-" + hashlib.sha256(text.encode()).hexdigest()[:16]
                return line_identifier(obj, fallback)
    seed = json.dumps(records[start_idx], ensure_ascii=False, sort_keys=True)
    return "turn-" + hashlib.sha256(seed.encode()).hexdigest()[:16]


def format_codex_turn(records: list[dict[str, Any]]) -> tuple[str, str]:
    start_idx = find_codex_turn_start(records)
    if start_idx is None:
        return "", ""
    output = ["=== Last Codex turn ==="]
    for obj in records[start_idx:]:
        line_type = obj.get("type")
        payload = obj.get("payload")
        payload = payload if isinstance(payload, dict) else {}
        if line_type == "event_msg":
            msg_type = payload.get("type", "")
            if msg_type == "user_message":
                text = str(payload.get("message") or "").strip()
                if text:
                    output.append(f"[User]: {redact(text)}")
            elif msg_type == "agent_message":
                text = str(payload.get("message") or "").strip()
                if text:
                    output.append(f"[Agent]: {redact(text)}")
        elif line_type == "response_item":
            item_type = payload.get("type", "")
            if item_type == "message":
                role = payload.get("role", "message")
                text = message_text(payload).strip()
                if text:
                    output.append(f"[{role}]: {redact(text)}")
            elif item_type == "function_call":
                output.append(f"[Tool call]: {payload.get('name', 'unknown')}({summarize_args(payload.get('arguments', ''))})")
            elif item_type == "function_call_output":
                output.append(summarize_tool_output(payload))
    return find_codex_turn_id(records, start_idx), "\n".join(output)


def extract_last_turn_from_transcript(path: Path) -> tuple[str, str]:
    records = read_jsonl(path)
    if not records:
        return "", ""
    if is_codex_rollout(records):
        return format_codex_turn(records)
    return "", ""


def extract_last_turn(input_data: dict[str, Any]) -> tuple[str, str]:
    transcript_path = str(json_get(input_data, "transcript_path", "") or "")
    explicit_turn_id = ""
    for key in ("turn_id", "turn.id", "last_turn_id", "uuid"):
        value = json_get(input_data, key, "")
        if isinstance(value, str) and value.strip():
            explicit_turn_id = value.strip()
            break
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
    parts: list[str] = []
    if user_text:
        parts.append(f"[User]: {redact(user_text)}")
    if assistant_text:
        parts.append(f"[Agent]: {redact(assistant_text)}")
    if not explicit_turn_id and user_text:
        explicit_turn_id = "turn-" + hashlib.sha256(user_text.encode()).hexdigest()[:16]
    return explicit_turn_id, "\n".join(parts)


def load_previous_memos(turns_file: Path) -> list[dict[str, Any]]:
    records = read_jsonl(turns_file)
    return records[-MAX_PREVIOUS_MEMOS:]


def build_context(input_data: dict[str, Any], history_root: Path) -> HookContext | None:
    transcript_path = str(json_get(input_data, "transcript_path", "") or "")
    session_id = derive_session_id(input_data, transcript_path)
    if not session_id:
        return None
    turn_id, last_turn = extract_last_turn(input_data)
    if not turn_id or not last_turn.strip():
        return None
    cwd = str(json_get(input_data, "cwd", os.getcwd()) or os.getcwd())
    turns_file = history_root / "sessions" / session_id / "turns.jsonl"
    return HookContext(
        session_id=session_id,
        turn_id=turn_id,
        cwd=cwd,
        transcript_path=transcript_path,
        history_root=history_root,
        turns_file=turns_file,
        last_turn=last_turn,
        previous_memos=load_previous_memos(turns_file),
    )


def prompt_path() -> Path:
    return Path(__file__).resolve().parent / "prompts" / "turn-history.txt"


def append_helper_path() -> Path:
    return Path(__file__).resolve().parent / "write_turn_history.py"


def build_prompt(ctx: HookContext) -> str:
    previous = [
        {
            "turn_id": item.get("turn_id"),
            "user_intent": item.get("user_intent"),
            "user_decisions": item.get("user_decisions"),
            "user_corrections": item.get("user_corrections"),
            "memory_requests": item.get("memory_requests"),
            "agent_issues": item.get("agent_issues"),
            "successful_patterns": item.get("successful_patterns"),
            "lesson_candidate": item.get("lesson_candidate"),
            "evidence": item.get("evidence"),
        }
        for item in ctx.previous_memos
    ]
    return "\n\n".join(
        [
            prompt_path().read_text(encoding="utf-8"),
            "Previous turn-history memos from this session:",
            json.dumps(previous, ensure_ascii=False, indent=2),
            "Last turn context:",
            trim_middle(ctx.last_turn, MAX_CONTEXT_CHARS),
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
    env["AGENT_TURN_HISTORY_IN_STOP_WORKER"] = "1"
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
        "Return only the requested JSON object.",
    ]
    env = os.environ.copy()
    env["AGENT_TURN_HISTORY_IN_STOP_WORKER"] = "1"
    try:
        proc = subprocess.run(cmd, input=prompt, text=True, capture_output=True, timeout=timeout_s, env=env)
    except (subprocess.TimeoutExpired, OSError):
        return ""
    return proc.stdout.strip() if proc.returncode == 0 else ""


def run_llm(prompt: str, provider: str, timeout_s: int, codex_model: str, claude_model: str) -> str:
    if provider == "none":
        return ""
    if provider == "claude":
        return run_claude(prompt, timeout_s, claude_model)
    if provider == "codex":
        return run_codex(prompt, timeout_s, codex_model)
    return run_claude(prompt, timeout_s, claude_model) or run_codex(prompt, timeout_s, codex_model)


def strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def parse_record(output: str) -> dict[str, Any]:
    if not output.strip():
        return {}
    text = strip_code_fence(output)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for match in re.finditer(r"\{", text):
            try:
                value, _ = decoder.raw_decode(text[match.start() :])
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                return value
        return {}
    return data if isinstance(data, dict) else {}


def fallback_record(ctx: HookContext) -> dict[str, str]:
    user_lines = [line.removeprefix("[User]: ").strip() for line in ctx.last_turn.splitlines() if line.startswith("[User]: ")]
    agent_lines = [line.removeprefix("[Agent]: ").strip() for line in ctx.last_turn.splitlines() if line.startswith("[Agent]: ")]
    tool_calls = [line for line in ctx.last_turn.splitlines() if line.startswith("[Tool call]: ")]
    return {
        "user_intent": truncate(" ".join(user_lines), 600),
        "user_decisions": "",
        "user_corrections": "",
        "memory_requests": "",
        "agent_workflow": truncate(" ".join(agent_lines + tool_calls[:5]), 800),
        "troubleshooting": "",
        "agent_issues": "",
        "successful_patterns": "",
        "lesson_candidate": "",
        "evidence": "",
    }


def run_append_helper(ctx: HookContext, record: dict[str, Any], dry_run: bool) -> dict[str, Any]:
    helper = append_helper_path()
    if not helper.is_file():
        return {"ok": False, "errors": [{"field": "append_helper", "message": f"missing helper: {helper}", "repair_hint": "Restore write_turn_history.py."}]}
    fd, record_path = tempfile.mkstemp(prefix="turn-history-record-", suffix=".json")
    os.close(fd)
    record_file = Path(record_path)
    try:
        record_file.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        cmd = [
            sys.executable,
            str(helper),
            "--history-root",
            str(ctx.history_root),
            "--session-id",
            ctx.session_id,
            "--turn-id",
            ctx.turn_id,
            "--cwd",
            ctx.cwd,
            "--transcript-path",
            ctx.transcript_path,
            "--record-file",
            str(record_file),
        ]
        if dry_run:
            cmd.append("--dry-run")
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "errors": [{"field": "append_helper", "message": str(exc), "repair_hint": "Retry after helper is executable by python."}]}
    finally:
        with contextlib.suppress(Exception):
            record_file.unlink()
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"ok": False, "errors": [{"field": "append_helper", "message": proc.stderr.strip() or proc.stdout.strip() or "append helper returned no JSON", "repair_hint": "Run helper directly."}]}
    return result if isinstance(result, dict) else {"ok": False, "errors": [{"field": "append_helper", "message": "non-object JSON response", "repair_hint": "Fix helper output."}]}


def write_debug_log(ctx: HookContext, raw_output: str, helper_result: dict[str, Any]) -> None:
    ctx.turns_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "ts": now_iso(),
        "turn_id": ctx.turn_id,
        "last_turn_context": trim_middle(ctx.last_turn, MAX_CONTEXT_CHARS),
        "llm_output": raw_output,
        "append_helper_result": helper_result,
    }
    (ctx.turns_file.parent / "last_input_output.log").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def process_payload(
    input_data: dict[str, Any],
    *,
    history_root: Path,
    provider: str,
    codex_model: str,
    claude_model: str,
    timeout_s: int,
    dry_run: bool,
    record_json: str,
    debug: bool,
) -> dict[str, Any]:
    if os.environ.get("AGENT_TURN_HISTORY_IN_STOP_WORKER") and not record_json:
        return {"ok": True, "skipped": "recursive_worker"}
    if str(json_get(input_data, "stop_hook_active", "false")).lower() == "true":
        return {"ok": True, "skipped": "active_continuation"}

    ctx = build_context(input_data, history_root)
    if not ctx:
        return {"ok": True, "skipped": "missing_context"}

    if record_json:
        raw_output = record_json
    elif provider == "none":
        raw_output = json.dumps(fallback_record(ctx), ensure_ascii=False)
    else:
        raw_output = run_llm(build_prompt(ctx), provider, timeout_s, codex_model, claude_model)
        if not raw_output:
            raw_output = json.dumps(fallback_record(ctx), ensure_ascii=False)

    record = parse_record(raw_output) or fallback_record(ctx)
    helper_result = run_append_helper(ctx, record, dry_run)
    if debug:
        write_debug_log(ctx, raw_output, helper_result)
    return helper_result


def launch_worker(args: argparse.Namespace, input_data: dict[str, Any], history_root: Path) -> int:
    fd, work_path = tempfile.mkstemp(prefix="turn-history-stop-", suffix=".json")
    os.close(fd)
    Path(work_path).write_text(
        json.dumps(
            {
                "input": input_data,
                "history_root": str(history_root),
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
    sys.stdout.write("{}\n")
    cmd = [sys.executable, str(Path(__file__).resolve()), "--worker", work_path]
    env = os.environ.copy()
    env["AGENT_TURN_HISTORY_IN_STOP_WORKER"] = "1"
    subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    return 0


def run_worker(path: str) -> int:
    work_file = Path(path)
    try:
        payload = json.loads(work_file.read_text(encoding="utf-8"))
    except Exception:
        return 0
    finally:
        with contextlib.suppress(Exception):
            work_file.unlink()
    input_data = payload.get("input")
    if not isinstance(input_data, dict):
        return 0
    os.environ.pop("AGENT_TURN_HISTORY_IN_STOP_WORKER", None)
    process_payload(
        input_data,
        history_root=Path(str(payload.get("history_root"))),
        provider=str(payload.get("provider") or "auto"),
        codex_model=str(payload.get("codex_model") or DEFAULT_CODEX_MODEL),
        claude_model=str(payload.get("claude_model") or DEFAULT_CLAUDE_MODEL),
        timeout_s=int(payload.get("timeout") or 30),
        dry_run=False,
        record_json="",
        debug=bool(payload.get("debug")),
    )
    return 0


def configured_provider(value: str | None) -> str:
    provider = (value or os.environ.get("AGENT_TURN_HISTORY_LLM") or "auto").strip().lower()
    return provider if provider in VALID_PROVIDERS else "auto"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--payload-json")
    parser.add_argument("--history-root", default="")
    parser.add_argument("--provider", choices=sorted(VALID_PROVIDERS), default=None)
    parser.add_argument("--codex-model", default=os.environ.get("AGENT_TURN_HISTORY_CODEX_MODEL", DEFAULT_CODEX_MODEL))
    parser.add_argument("--claude-model", default=os.environ.get("AGENT_TURN_HISTORY_CLAUDE_MODEL", DEFAULT_CLAUDE_MODEL))
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("AGENT_TURN_HISTORY_TIMEOUT", "30") or "30"))
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--record-json", default="")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--worker")
    args = parser.parse_args()

    if args.worker:
        return run_worker(args.worker)

    input_data = load_input(args)
    history_root = resolve_history_root(args.history_root)
    args.provider = configured_provider(args.provider)

    if args.dry_run or args.sync or args.record_json:
        result = process_payload(
            input_data,
            history_root=history_root,
            provider=args.provider,
            codex_model=args.codex_model,
            claude_model=args.claude_model,
            timeout_s=args.timeout,
            dry_run=args.dry_run,
            record_json=args.record_json,
            debug=args.debug,
        )
        sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2 if not result.get("ok") else None) + "\n")
        return 0

    return launch_worker(args, input_data, history_root)


if __name__ == "__main__":
    raise SystemExit(main())
