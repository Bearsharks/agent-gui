from __future__ import annotations

import json
from pathlib import Path

import pytest

from mem.config import save_config
from mem.session_state import load_state, save_state, set_verification_status
from mem.session_stop_hook import main, process_payload


def _assistant_message(text: str, *, phase: str | None = None) -> dict:
    payload = {
        "type": "message",
        "role": "assistant",
        "content": [{"type": "output_text", "text": text}],
    }
    if phase:
        payload["phase"] = phase
    return {"type": "response_item", "payload": payload}


def _transcript(path: Path, repo: Path, cmd: str, output: str, *, assistant_text: str = "") -> Path:
    transcript = path / "rollout-demo.jsonl"
    records = [
        {"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "work"}]}},
        {
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "call_id": "c1",
                "name": "exec_command",
                "arguments": json.dumps({"cmd": cmd, "workdir": str(repo)}),
            },
        },
        {"type": "response_item", "payload": {"type": "function_call_output", "call_id": "c1", "output": output}},
    ]
    if assistant_text:
        records.append(_assistant_message(assistant_text))
    transcript.write_text("\n".join(json.dumps(record) for record in records), encoding="utf-8")
    return transcript


def _claude_transcript(path: Path, *, tool_name: str, tool_input: dict, tool_output: str, assistant_text: str = "") -> Path:
    transcript = path / "claude-demo.jsonl"
    records = [
        {"type": "user", "message": {"content": "work"}},
        {
            "type": "assistant",
            "message": {
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu_1",
                        "name": tool_name,
                        "input": tool_input,
                    }
                ]
            },
        },
        {
            "type": "user",
            "message": {
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "toolu_1",
                        "content": [{"type": "text", "text": tool_output}],
                    }
                ]
            },
        },
    ]
    if assistant_text:
        records.append({"type": "assistant", "message": {"content": [{"type": "text", "text": assistant_text}]}})
    transcript.write_text("\n".join(json.dumps(record) for record in records), encoding="utf-8")
    return transcript


def test_stop_hook_ingests_docs_and_allows_when_checklist_absent(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content", encoding="utf-8")
    transcript = _transcript(tmp_path, repo, "sed -n '1,3p' docs/guide.md", "content")

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo", "turn_id": "turn-1"},
        project_root=repo,
    )

    state = load_state(repo / ".mem" / "session-state" / "demo.json", session_id="demo")
    assert result == {}
    assert state["referenced_docs"][0]["path"] == "docs/guide.md"
    assert state["referenced_docs"][0]["access"] == "content_read"


def test_stop_hook_allows_existing_pending_checklist_state(tmp_path: Path) -> None:
    repo = tmp_path
    state_path = repo / ".mem" / "session-state" / "demo.json"
    state = load_state(state_path, session_id="demo")
    state["checklist"]["current_item_id"] = "phase1"
    state["checklist"]["items"].append({"id": "phase1", "text": "finish phase", "status": "pending"})
    save_state(state, state_path)

    result = process_payload({"cwd": str(repo), "session_id": "demo"}, project_root=repo)

    assert result == {}


def test_stop_hook_allows_completion_without_magic_keyword_when_verification_not_run(tmp_path: Path) -> None:
    repo = tmp_path
    transcript = _transcript(tmp_path, repo, "true", "", assistant_text="Done without the magic phrase.")

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo"},
        project_root=repo,
    )

    assert result == {}


def test_stop_hook_blocks_completion_magic_when_verification_not_run(tmp_path: Path) -> None:
    repo = tmp_path
    transcript = _transcript(tmp_path, repo, "true", "", assistant_text="MISSION COMPLETE!!")

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo"},
        project_root=repo,
    )

    assert result["decision"] == "block"
    assert "completion was declared with MISSION COMPLETE!!" in result["reason"]
    assert "verification_status is 'passed' or 'error'" in result["reason"]
    assert "Current verification_status is 'not_run'" in result["reason"]


def test_stop_hook_does_not_treat_inline_magic_keyword_as_completion(tmp_path: Path) -> None:
    repo = tmp_path
    transcript = _transcript(
        tmp_path,
        repo,
        "true",
        "",
        assistant_text="The magic keyword is MISSION COMPLETE!!, but this is explanatory text.",
    )

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo"},
        project_root=repo,
    )

    assert result == {}


def test_stop_hook_detects_completion_magic_as_standalone_line(tmp_path: Path) -> None:
    repo = tmp_path
    transcript = _transcript(tmp_path, repo, "true", "", assistant_text="Summary\nMISSION COMPLETE!!")

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo"},
        project_root=repo,
    )

    assert result == {}


def test_stop_hook_detects_completion_magic_only_when_entire_message_matches(tmp_path: Path) -> None:
    repo = tmp_path
    transcript = _transcript(tmp_path, repo, "true", "", assistant_text="MISSION COMPLETE!!")

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo"},
        project_root=repo,
    )

    assert result["decision"] == "block"
    assert "Current verification_status is 'not_run'" in result["reason"]


def test_stop_hook_allows_completion_magic_when_verification_passed_or_error(tmp_path: Path) -> None:
    repo = tmp_path
    transcript = _transcript(tmp_path, repo, "true", "", assistant_text="MISSION COMPLETE!!")
    state_path = repo / ".mem" / "session-state" / "demo.json"
    state = set_verification_status(load_state(state_path, session_id="demo"), "passed")
    save_state(state, state_path)

    assert process_payload({"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo"}, project_root=repo) == {}

    state = set_verification_status(load_state(state_path, session_id="demo"), "error")
    save_state(state, state_path)

    assert process_payload({"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo"}, project_root=repo) == {}


def test_stop_hook_ignores_completion_magic_in_commentary_when_final_message_has_no_magic(tmp_path: Path) -> None:
    repo = tmp_path
    transcript = tmp_path / "rollout-demo.jsonl"
    records = [
        {"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "work"}]}},
        _assistant_message("I will look for MISSION COMPLETE!! only in the final answer.", phase="commentary"),
        _assistant_message("Done without declaring completion."),
    ]
    transcript.write_text("\n".join(json.dumps(record) for record in records), encoding="utf-8")

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo"},
        project_root=repo,
    )

    assert result == {}


def test_stop_hook_active_continuation_still_ingests_docs_before_allow(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content", encoding="utf-8")
    transcript = _transcript(tmp_path, repo, "cat docs/guide.md", "content")

    result = process_payload(
        {
            "transcript_path": str(transcript),
            "cwd": str(repo),
            "session_id": "demo",
            "turn_id": "turn-1",
            "stop_hook_active": "true",
        },
        project_root=repo,
    )

    state = load_state(repo / ".mem" / "session-state" / "demo.json", session_id="demo")
    assert result == {}
    assert state["referenced_docs"][0]["path"] == "docs/guide.md"


def test_stop_hook_ingests_docs_from_claude_bash_transcript(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content", encoding="utf-8")
    transcript = _claude_transcript(
        tmp_path,
        tool_name="Bash",
        tool_input={"command": "sed -n '1,3p' docs/guide.md"},
        tool_output="content",
    )

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo", "turn_id": "turn-1"},
        project_root=repo,
    )

    state = load_state(repo / ".mem" / "session-state" / "demo.json", session_id="demo")
    assert result == {}
    assert state["referenced_docs"][0]["path"] == "docs/guide.md"
    assert state["referenced_docs"][0]["access"] == "content_read"


def test_stop_hook_ingests_docs_from_claude_read_transcript(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content", encoding="utf-8")
    transcript = _claude_transcript(
        tmp_path,
        tool_name="Read",
        tool_input={"file_path": str(repo / "docs" / "guide.md")},
        tool_output="content",
    )

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo", "turn_id": "turn-1"},
        project_root=repo,
    )

    state = load_state(repo / ".mem" / "session-state" / "demo.json", session_id="demo")
    assert result == {}
    assert state["referenced_docs"][0]["path"] == "docs/guide.md"
    assert state["referenced_docs"][0]["access"] == "content_read"


def test_stop_hook_blocks_claude_completion_magic_when_verification_not_run(tmp_path: Path) -> None:
    repo = tmp_path
    transcript = _claude_transcript(
        tmp_path,
        tool_name="Bash",
        tool_input={"command": "true"},
        tool_output="",
        assistant_text="MISSION COMPLETE!!",
    )

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo"},
        project_root=repo,
    )

    assert result["decision"] == "block"
    assert "completion was declared with MISSION COMPLETE!!" in result["reason"]


def test_stop_hook_filters_referenced_docs_by_project_config(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / ".mem").mkdir()
    save_config({"session": {"referenced_doc_include_paths": ["docs/allowed"]}}, repo / ".mem" / "mem.toml")
    (repo / "docs" / "allowed").mkdir(parents=True)
    (repo / "docs" / "other").mkdir(parents=True)
    (repo / "docs" / "allowed" / "guide.md").write_text("allowed", encoding="utf-8")
    (repo / "docs" / "other" / "guide.md").write_text("other", encoding="utf-8")
    transcript = _transcript(
        tmp_path,
        repo,
        "rg guide docs",
        "docs/allowed/guide.md:allowed\n" "docs/other/guide.md:other\n",
    )

    result = process_payload(
        {"transcript_path": str(transcript), "cwd": str(repo), "session_id": "demo", "turn_id": "turn-1"},
        project_root=repo,
    )

    state = load_state(repo / ".mem" / "session-state" / "demo.json", session_id="demo")
    assert result == {}
    assert [doc["path"] for doc in state["referenced_docs"]] == ["docs/allowed/guide.md"]


def test_stop_hook_main_converts_internal_errors_to_block(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def fail(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr("mem.session_stop_hook.process_payload", fail)
    monkeypatch.setattr("sys.argv", ["session_stop_hook"])
    monkeypatch.setattr("sys.stdin", type("DummyStdin", (), {"read": lambda self: "{}"})())

    assert main() == 0
    captured = capsys.readouterr()
    assert '"decision": "block"' in captured.out
    assert "RuntimeError: boom" in captured.out
