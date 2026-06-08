from __future__ import annotations

from mem.session_mcp import create_server


def test_session_mcp_registers_required_tools_only(tmp_path) -> None:
    server = create_server(session_id="mcp-demo", cwd=str(tmp_path))
    tool_manager = server._tool_manager
    tool_names = set(tool_manager._tools)

    assert {
        "state.get",
        "state.set_goal",
        "docs.list",
        "verification.get",
        "verification.set_status",
    } == tool_names
    assert "docs.mark_read" not in tool_names
    assert "docs.remove" not in tool_names


def test_session_mcp_tools_require_session_id(tmp_path) -> None:
    server = create_server(cwd=str(tmp_path))
    tool_manager = server._tool_manager

    for name in {
        "state.get",
        "state.set_goal",
        "docs.list",
        "verification.get",
        "verification.set_status",
    }:
        tool = tool_manager._tools[name]
        assert "sessionId" in tool.parameters["properties"]
        assert "sessionId" in tool.parameters["required"]
        assert "Codex session" in tool.description
