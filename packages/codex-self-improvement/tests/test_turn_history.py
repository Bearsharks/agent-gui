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
            record={
                "user_request": "조사해 달라고 요청했다.",
                "agent_action": "관련 파일을 읽었다.",
                "went_well": "범위를 좁혔다.",
                "went_wrong": "",
                "lesson_candidate": "",
                "evidence": "",
            },
            dry_run=False,
        )

        self.assertTrue(result["ok"])
        turns_file = self.tmp_path / "history" / "sessions" / "demo-session" / "turns.jsonl"
        rows = [json.loads(line) for line in turns_file.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["schema_version"], 1)
        self.assertEqual(rows[0]["session_id"], "demo-session")
        self.assertEqual(rows[0]["turn_id"], "turn-1")
        self.assertEqual(rows[0]["cwd"], "/repo")
        self.assertEqual(rows[0]["user_request"], "조사해 달라고 요청했다.")

    def test_append_turn_history_rejects_hook_owned_and_unknown_fields(self) -> None:
        result = self.writer.append_turn_history(
            history_root=self.tmp_path / "history",
            session_id="demo",
            turn_id="turn-1",
            cwd="/repo",
            record={
                "session_id": "wrong",
                "user_request": "request",
                "agent_action": "action",
                "went_well": "",
                "went_wrong": "",
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
            timeout_s=1,
            dry_run=False,
            record_json=json.dumps(
                {
                    "user_request": "사용자는 조사만 요청했다.",
                    "agent_action": "에이전트는 파일을 읽고 조사 결과를 답했다.",
                    "went_well": "요청 범위를 확인했다.",
                    "went_wrong": "",
                    "lesson_candidate": "",
                    "evidence": "조사만 해주세요.",
                },
                ensure_ascii=False,
            ),
            debug=False,
        )

        self.assertTrue(result["ok"])
        turns_file = self.tmp_path / "history" / "sessions" / "demo" / "turns.jsonl"
        row = json.loads(turns_file.read_text(encoding="utf-8").strip())
        self.assertEqual(row["user_request"], "사용자는 조사만 요청했다.")
        self.assertEqual(row["agent_action"], "에이전트는 파일을 읽고 조사 결과를 답했다.")
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
