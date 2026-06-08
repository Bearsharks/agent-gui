from __future__ import annotations

import json
from pathlib import Path

from click.testing import CliRunner

from mem.cli import cli


def test_session_cli_state_and_docs_flow(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    runner = CliRunner()
    session = "cli-flow"

    result = runner.invoke(
        cli,
        ["session", "set-goal", "Implement state", "--session-id", session],
    )
    assert result.exit_code == 0
    assert json.loads(result.output)["goal"] == "Implement state"

    result = runner.invoke(cli, ["session", "get", "--session-id", session])
    assert result.exit_code == 0
    assert json.loads(result.output)["goal"] == "Implement state"

    result = runner.invoke(cli, ["session", "docs", "list", "--session-id", session])
    assert result.exit_code == 0
    assert json.loads(result.output) == []

    result = runner.invoke(
        cli,
        [
            "session",
            "verification",
            "set-status",
            "검증중",
            "--report-path",
            ".agents/verification/reports/demo.md",
            "--session-id",
            session,
        ],
    )
    assert result.exit_code == 0
    verification = json.loads(result.output)
    assert verification["verification_status"] == "running"
    assert verification["verification_updated_at"]
    assert verification["verification_report_path"] == ".agents/verification/reports/demo.md"

    result = runner.invoke(cli, ["session", "verification", "get", "--session-id", session])
    assert result.exit_code == 0
    assert json.loads(result.output)["verification_status"] == "running"
    assert (tmp_path / ".mem" / "session-state" / f"{session}.json").exists()


def test_session_cli_checklist_and_external_commands_are_removed(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    runner = CliRunner()

    assert runner.invoke(cli, ["session", "checklist", "--help"]).exit_code != 0
    assert runner.invoke(cli, ["session", "external", "--help"]).exit_code != 0
    assert runner.invoke(cli, ["session", "stop-gate", "--help"]).exit_code != 0


def test_session_cli_ingests_transcript_docs(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    repo = tmp_path
    transcript = tmp_path / "transcript.jsonl"
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content")
    records = [
        {
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "call_id": "c1",
                "name": "exec_command",
                "arguments": json.dumps({"cmd": "sed -n '1,3p' docs/guide.md", "workdir": str(repo)}),
            },
        },
        {"type": "response_item", "payload": {"type": "function_call_output", "call_id": "c1", "output": "content"}},
    ]
    transcript.write_text("\n".join(json.dumps(record) for record in records))
    runner = CliRunner()

    result = runner.invoke(
        cli,
        [
            "session",
            "ingest-transcript-docs",
            "--transcript-path",
            str(transcript),
            "--repo-root",
            str(repo),
            "--session-id",
            "ingest-demo",
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["referenced_docs"][0]["path"] == "docs/guide.md"
    assert payload["referenced_docs"][0]["access"] == "content_read"
