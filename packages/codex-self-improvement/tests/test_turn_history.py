from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TURN_HISTORY_ROOT = ROOT / "hooks" / "turn-history"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class TurnHistoryTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)
        self.stop = load_module("turn_history_stop", TURN_HISTORY_ROOT / "turn_history_stop.py")
        self.writer = load_module("write_turn_history", TURN_HISTORY_ROOT / "write_turn_history.py")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_append_turn_history_writes_session_scoped_jsonl(self) -> None:
        result = self.writer.append_turn_history(
            history_root=self.tmp_path / "history",
            session_id="rollout-demo/session",
            turn_id="turn-1",
            cwd="/repo",
            transcript_path="/tmp/transcript.jsonl",
            record={
                "importance": "low",
                "user_intent": "조사해 달라고 요청했다.",
                "user_decisions": "",
                "user_corrections": "",
                "memory_requests": "",
                "agent_workflow": "관련 파일을 읽었다.",
                "troubleshooting": "",
                "agent_issues": "",
                "successful_patterns": "범위를 좁혔다.",
                "lesson_candidate": "",
                "evidence": "",
            },
            dry_run=False,
        )

        self.assertTrue(result["ok"])
        session_file = self.tmp_path / "history" / "sessions" / "demo-session" / "session.json"
        session = json.loads(session_file.read_text(encoding="utf-8"))
        self.assertEqual(session["schema_version"], 3)
        self.assertEqual(session["session_id"], "demo-session")
        self.assertEqual(session["cwd"], "/repo")
        self.assertEqual(session["transcript_path"], "/tmp/transcript.jsonl")
        turns_file = self.tmp_path / "history" / "sessions" / "demo-session" / "turns.jsonl"
        rows = [json.loads(line) for line in turns_file.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["schema_version"], 3)
        self.assertNotIn("session_id", rows[0])
        self.assertEqual(rows[0]["turn_id"], "turn-1")
        self.assertNotIn("cwd", rows[0])
        self.assertEqual(rows[0]["importance"], "low")
        self.assertEqual(rows[0]["user_intent"], "조사해 달라고 요청했다.")
        self.assertEqual(rows[0]["agent_workflow"], "관련 파일을 읽었다.")
        self.assertEqual(rows[0]["successful_patterns"], "범위를 좁혔다.")

    def test_append_turn_history_rejects_hook_owned_and_unknown_fields(self) -> None:
        result = self.writer.append_turn_history(
            history_root=self.tmp_path / "history",
            session_id="demo",
            turn_id="turn-1",
            cwd="/repo",
            transcript_path="",
            record={
                "session_id": "wrong",
                "importance": "low",
                "user_intent": "request",
                "user_decisions": "",
                "user_corrections": "",
                "memory_requests": "",
                "agent_workflow": "action",
                "troubleshooting": "",
                "agent_issues": "",
                "successful_patterns": "",
                "lesson_candidate": "",
                "evidence": "",
                "extra": "nope",
            },
            dry_run=False,
        )

        self.assertFalse(result["ok"])
        fields = {item["field"] for item in result["errors"]}
        self.assertIn("session_id", fields)
        self.assertIn("extra", fields)
        self.assertFalse((self.tmp_path / "history" / "sessions" / "demo" / "turns.jsonl").exists())

    def test_append_turn_history_rejects_invalid_importance(self) -> None:
        result = self.writer.append_turn_history(
            history_root=self.tmp_path / "history",
            session_id="demo",
            turn_id="turn-1",
            cwd="/repo",
            transcript_path="",
            record={
                "importance": "urgent",
                "user_intent": "request",
                "user_decisions": "",
                "user_corrections": "",
                "memory_requests": "",
                "agent_workflow": "action",
                "troubleshooting": "",
                "agent_issues": "",
                "successful_patterns": "",
                "lesson_candidate": "",
                "evidence": "",
            },
            dry_run=False,
        )

        self.assertFalse(result["ok"])
        fields = {item["field"] for item in result["errors"]}
        self.assertIn("importance", fields)
        self.assertFalse((self.tmp_path / "history" / "sessions" / "demo" / "turns.jsonl").exists())

    def test_turn_history_hook_appends_record_json_from_last_turn(self) -> None:
        transcript = self.tmp_path / "rollout-demo.jsonl"
        records = [
            {
                "type": "response_item",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "조사만 해주세요."}],
                },
            },
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "call_id": "c1",
                    "name": "exec_command",
                    "arguments": json.dumps({"cmd": "sed -n '1,10p' file.txt", "workdir": str(self.tmp_path)}),
                },
            },
            {"type": "response_item", "payload": {"type": "function_call_output", "call_id": "c1", "output": "content"}},
            {
                "type": "response_item",
                "payload": {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "조사 결과입니다."}],
                },
            },
        ]
        transcript.write_text("\n".join(json.dumps(record, ensure_ascii=False) for record in records), encoding="utf-8")

        result = self.stop.process_payload(
            {
                "transcript_path": str(transcript),
                "cwd": str(self.tmp_path),
                "session_id": "demo",
                "turn_id": "turn-1",
            },
            history_root=self.tmp_path / "history",
            provider="none",
            codex_model="unused",
            claude_model="unused",
            timeout_s=1,
            dry_run=False,
            record_json=json.dumps(
                {
                    "importance": "low",
                    "user_intent": "사용자는 조사만 요청했다.",
                    "user_decisions": "",
                    "user_corrections": "",
                    "memory_requests": "",
                    "agent_workflow": "에이전트는 파일을 읽고 조사 결과를 답했다.",
                    "troubleshooting": "",
                    "agent_issues": "",
                    "successful_patterns": "요청 범위를 확인했다.",
                    "lesson_candidate": "",
                    "evidence": "조사만 해주세요.",
                },
                ensure_ascii=False,
            ),
            debug=False,
        )

        self.assertTrue(result["ok"])
        session_file = self.tmp_path / "history" / "sessions" / "demo" / "session.json"
        session = json.loads(session_file.read_text(encoding="utf-8"))
        self.assertEqual(session["session_id"], "demo")
        self.assertEqual(session["cwd"], str(self.tmp_path))
        self.assertEqual(session["transcript_path"], str(transcript))
        turns_file = self.tmp_path / "history" / "sessions" / "demo" / "turns.jsonl"
        row = json.loads(turns_file.read_text(encoding="utf-8").strip())
        self.assertNotIn("session_id", row)
        self.assertNotIn("cwd", row)
        self.assertEqual(row["importance"], "low")
        self.assertEqual(row["user_intent"], "사용자는 조사만 요청했다.")
        self.assertEqual(row["agent_workflow"], "에이전트는 파일을 읽고 조사 결과를 답했다.")
        self.assertEqual(row["evidence"], "조사만 해주세요.")

    def test_turn_history_omits_successful_tool_output(self) -> None:
        records = [
            {
                "type": "response_item",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "파일을 확인해 주세요."}],
                },
            },
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "call_id": "c1",
                    "name": "exec_command",
                    "arguments": json.dumps({"cmd": "cat huge.txt"}),
                },
            },
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "c1",
                    "output": "A" * 5000,
                },
            },
        ]

        _turn_id, rendered = self.stop.format_codex_turn(records)

        self.assertIn("[Tool output omitted, length=5000]", rendered)
        self.assertNotIn("AAAA", rendered)

    def test_turn_history_keeps_short_error_tool_output_excerpt(self) -> None:
        records = [
            {
                "type": "response_item",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "테스트를 실행해 주세요."}],
                },
            },
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call_output",
                    "call_id": "c1",
                    "output": "FAILED tests/test_demo.py::test_demo\napi_key=secret-value\nTraceback details",
                },
            },
        ]

        _turn_id, rendered = self.stop.format_codex_turn(records)

        self.assertIn("[Tool output error excerpt", rendered)
        self.assertIn("FAILED tests/test_demo.py::test_demo", rendered)
        self.assertIn("api_key=[REDACTED_SECRET]", rendered)
        self.assertNotIn("secret-value", rendered)

    def test_turn_history_uses_large_default_context_budget(self) -> None:
        self.assertEqual(self.stop.MAX_CONTEXT_CHARS, 120000)

    def test_turn_history_trims_long_context_with_head_and_tail(self) -> None:
        text = "HEAD-" + ("A" * 100) + "-MIDDLE-" + ("B" * 100) + "-TAIL"

        trimmed = self.stop.trim_middle(text, 160)

        self.assertTrue(trimmed.startswith("HEAD-"))
        self.assertTrue(trimmed.endswith("-TAIL"))
        self.assertIn("omitted middle of last turn context", trimmed)
        self.assertNotIn("-MIDDLE-", trimmed)
        self.assertLessEqual(len(trimmed), 160)

    def test_auto_provider_prefers_claude_then_falls_back_to_codex(self) -> None:
        calls: list[str] = []
        original_claude = self.stop.run_claude
        original_codex = self.stop.run_codex
        try:
            self.stop.run_claude = lambda *_args: calls.append("claude") or ""
            self.stop.run_codex = lambda *_args: calls.append("codex") or '{"user_intent": ""}'

            output = self.stop.run_llm("prompt", "auto", 1, "codex-model", "claude-model")
        finally:
            self.stop.run_claude = original_claude
            self.stop.run_codex = original_codex

        self.assertEqual(output, '{"user_intent": ""}')
        self.assertEqual(calls, ["claude", "codex"])

    def test_claude_provider_does_not_call_codex(self) -> None:
        calls: list[str] = []
        original_claude = self.stop.run_claude
        original_codex = self.stop.run_codex
        try:
            self.stop.run_claude = lambda *_args: calls.append("claude") or '{"user_intent": ""}'
            self.stop.run_codex = lambda *_args: calls.append("codex") or ""

            output = self.stop.run_llm("prompt", "claude", 1, "codex-model", "claude-model")
        finally:
            self.stop.run_claude = original_claude
            self.stop.run_codex = original_codex

        self.assertEqual(output, '{"user_intent": ""}')
        self.assertEqual(calls, ["claude"])

    def test_install_managed_hooks_include_stop_turn_history(self) -> None:
        install = load_module("install_runtime", ROOT / "scripts" / "install.py")

        hooks = install.managed_hooks(
            Path("/tmp/hooks/self-improvement/self_improvement_hook.py"),
            Path("/tmp/hooks/turn-history/stop.sh"),
        )

        self.assertIn("SessionStart", hooks)
        self.assertIn("UserPromptSubmit", hooks)
        self.assertIn("Stop", hooks)
        self.assertEqual(
            hooks["SessionStart"][0]["hooks"][0]["command"],
            "/usr/bin/python3 /tmp/hooks/self-improvement/self_improvement_hook.py session-start",
        )
        self.assertEqual(
            hooks["UserPromptSubmit"][0]["hooks"][0]["command"],
            "/usr/bin/python3 /tmp/hooks/self-improvement/self_improvement_hook.py user-prompt-submit",
        )
        self.assertEqual(hooks["Stop"][0]["hooks"][0]["command"], "/tmp/hooks/turn-history/stop.sh")
        self.assertEqual(hooks["Stop"][0]["hooks"][0]["statusMessage"], "Writing turn history")

        merged = install.merge_hooks_json(
            {
                "hooks": {
                    "Stop": [
                        {
                            "matcher": "",
                            "hooks": [
                                {"type": "command", "command": "/old/hooks/turn-history/stop.sh"},
                                {"type": "command", "command": "/keep/custom-stop.sh"},
                            ],
                        }
                    ]
                }
            },
            hooks,
        )

        commands = [
            hook["command"]
            for group in merged["hooks"]["Stop"]
            for hook in group["hooks"]
        ]
        self.assertIn("/keep/custom-stop.sh", commands)
        self.assertIn("/tmp/hooks/turn-history/stop.sh", commands)
        self.assertNotIn("/old/hooks/turn-history/stop.sh", commands)


if __name__ == "__main__":
    unittest.main()
