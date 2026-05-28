# Agent GUI

Agent GUI는 에이전트가 만든 graph plan을 브라우저에서 검토하고, 사용자의 target별 피드백과 에이전트의 답변/수정 revision을 MCP tool로 주고받는 로컬 리뷰 시스템입니다.

## Why Agent GUI

긴 계획을 채팅으로만 검토하면 작업 흐름, 판단 지점, 피드백 위치, revision 변경점이 쉽게 흐려집니다.

Agent GUI는 에이전트와 사용자가 같은 브라우저 작업면을 보면서 계획을 검토하고, 피드백과 수정 이력을 구조화된 session event로 남기기 위해 존재합니다.

## Quickstart

Agent GUI는 세 가지 구성요소로 붙입니다.

- MCP/웹앱: graph plan session 저장소, review UI, API, SSE, MCP tool server
- 스킬: 각 프로젝트의 에이전트가 Agent GUI MCP workflow를 올바르게 쓰도록 하는 지침
- Preview Runtime: 각 프로젝트가 node iframe preview 화면을 local HTTP URL로 제공하는 대상 프로젝트별 runtime

### 1. MCP/웹앱 설정

Agent GUI repo를 로컬에 준비하고 서버를 실행합니다.

```bash
git clone https://github.com/Bearsharks/agent-gui.git
cd agent-gui
pnpm install
pnpm dev
```

서버는 기본적으로 `http://localhost:8787`에서 실행됩니다.

에이전트가 MCP tool을 호출할 수 있도록 MCP server도 등록합니다.

Codex 설정 예시:

```toml
# ~/.codex/config.toml
[mcp_servers.agent-gui-plan-review]
command = "pnpm"
args = [
  "--dir", "/path/to/agent-gui",
  "--filter", "@agent-gui/server",
  "exec",
  "tsx",
  "src/mcp/stdioServer.ts"
]
```

Claude Desktop 설정 예시:

```json
{
  "mcpServers": {
    "agent-gui-plan-review": {
      "command": "pnpm",
      "args": [
        "--dir",
        "/path/to/agent-gui",
        "--filter",
        "@agent-gui/server",
        "exec",
        "tsx",
        "src/mcp/stdioServer.ts"
      ]
    }
  }
}
```

설정 후 Codex나 Claude를 재시작하세요.

### 2. 스킬 설정

Agent GUI를 사용할 대상 프로젝트마다 skill을 추가합니다.

```bash
npx skills add https://github.com/Bearsharks/agent-gui/
```

이 skill은 에이전트가 graph/html plan review session을 만들고, node iframe entry를 붙이고, target별 feedback을 읽고, reply/revision을 처리하는 방식을 안내합니다.

### 3. Preview Runtime 설정

iframe preview가 필요한 프로젝트에서는 현재 임시 방식으로 template을 대상 프로젝트 안으로 복사해 preview runtime을 만듭니다.

```bash
cp -R /path/to/agent-gui/templates/preview-app-vite ./agent-gui-preview
cd agent-gui-preview
pnpm install
pnpm dev --host 127.0.0.1 --port 5173
```

프로젝트별 preview/prototype entry는 `src/previews/*.tsx`에 주입하고 registry에 등록합니다. Agent GUI graph plan node에는 실행 중인 local HTTP URL을 iframe entry로 넣습니다.

```json
{
  "id": "iframe-project-preview",
  "description": "프로젝트 preview",
  "url": "http://127.0.0.1:5173/?preview=search-panel",
  "entryPath": "agent-gui-preview/src/previews/search-panel.tsx"
}
```

## Usage Scenario

1. 해야할 작업에 대해 agent gui로 시각화 해달라고 에이전트에게 요청합니다.
2. 에이전트가 mcp tool을 사용하여 graph plan session을 만듭니다.
3. 에이전트가 주는 링크로 접속합니다.
4. 브라우저에서 계획 흐름과 node별 상세 화면을 검토합니다.
5. 사용자가 graph, node, edge, iframe 같은 target에 피드백을 남깁니다.
6. 에이전트에게 피드백 확인하라고 합니다.
7. 계획이 마음에 들때까지 반복합니다.
8. 사용자가 최신 revision을 검토하고 승인합니다.
9. SEED 생성, 혹은 바로 작업 진행, 혹은 아티팩트 생성 등등 후속작업을 이어서 하면됩니다.


## Documentation

- [prd.md](docs/core/prd.md): 제품 목적, 구성요소, 핵심 workflow
- [system-parts.md](docs/core/system-parts.md): MCP/웹앱, 스킬, Preview Runtime의 역할과 책임
- [preview-runtime-requirements.md](docs/core/preview-runtime-requirements.md): Preview Runtime 목적, 계약, 구현 요구사항
- [development.md](docs/core/development.md): 로컬 실행, 검증 명령, MCP 운영 흐름
- [repository-structure.md](docs/core/repository-structure.md): monorepo 디렉터리 구성
