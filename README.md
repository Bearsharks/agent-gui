# Agent GUI

Agent GUI는 에이전트 작업을 시각화하고, 작업 이력을 기록하며, 그 기록을 장기기억과 스킬 개선으로 연결하는 로컬 에이전트 도구 셋입니다.

핵심 아이디어는 에이전트의 계획과 실행 과정을 채팅 로그에만 남기지 않는 것입니다. Graph UI로 작업 흐름을 검토하고, target별 피드백과 revision 이력을 session event로 저장한 뒤, 필요한 정보는 검색 가능한 memory와 수동 승인형 self-improvement workflow로 이어갑니다.

## What It Does

- Graph review: 에이전트가 만든 graph plan을 브라우저에서 검토하고 node, edge, iframe 단위로 피드백을 남깁니다.
- Work history: feedback, reply, revision, approval 상태를 session event로 기록합니다.
- Preview runtime: 대상 프로젝트가 node별 HTML preview를 iframe으로 제공해 계획의 판단 지점을 더 구체적으로 보여줍니다.
- Long-term memory: `mem` 패키지로 markdown 기반 지식을 chunking, embedding, hybrid search 가능한 형태로 관리합니다.
- Self-improvement: Codex 세션 이력과 사용자 correction을 검토해, 명시적 승인 후 재사용 가능한 skill로 반영합니다.

## Why This Exists

에이전트와 협업할 때 어려운 부분은 단순히 코드를 생성하는 것이 아니라, 긴 작업의 맥락을 유지하고 피드백을 정확한 위치에 연결하는 것입니다.

이 프로젝트는 다음 질문을 실험합니다.

- 에이전트의 계획을 사람이 빠르게 검토할 수 있는 형태로 시각화할 수 있는가?
- 사용자의 피드백을 graph, node, edge, iframe 같은 명확한 target에 연결할 수 있는가?
- 작업 이력을 나중에 검색 가능한 장기기억으로 바꿀 수 있는가?
- 반복되는 사용자 correction과 성공 패턴을 수동 승인형 skill 개선으로 전환할 수 있는가?

## System Parts

Agent GUI는 네 가지 구성요소로 이루어져 있습니다.

- MCP/웹앱: graph plan session 저장소, review UI, API, SSE, MCP tool server
- Preview Runtime: 대상 프로젝트가 node iframe preview 화면을 local HTTP URL로 제공하는 runtime
- Memory: markdown 문서를 indexing하고 hybrid search로 검색하는 `mem` 패키지
- Self-Improvement: Codex turn history를 저장하고, 세션 리뷰를 통해 skill 개선 후보를 만드는 runtime

## Quickstart

GUI workflow는 다음 구성요소로 붙입니다.

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

## Memory And Self-Improvement Flow

이 저장소에는 GUI 외에도 에이전트의 장기적인 작업 품질을 개선하기 위한 실험이 포함되어 있습니다.

- `packages/mem`: markdown 문서를 heading 기반 chunk로 나누고, embedding + BM25 hybrid search로 검색하는 memory layer입니다.
- `packages/codex-self-improvement`: Codex 세션의 turn history를 저장하고, completed session review를 통해 skill 개선 후보를 찾는 수동 승인형 runtime입니다.

의도적으로 자동 수정을 피하고, 사용자가 명시적으로 요청하고 승인한 경우에만 skill을 생성하거나 수정합니다. 즉, 작업 이력은 먼저 관찰 가능한 기록으로 남기고, 반복적으로 유용한 패턴만 장기기억과 skill 개선으로 승격합니다.

## Portfolio Highlights

- GraphPlanDocument schema로 agent plan, subgraph, node iframe, validation rule을 명확하게 모델링했습니다.
- feedback target을 graph, node, edge, iframe으로 분리해 agent reply와 revision이 원래 맥락을 잃지 않도록 했습니다.
- local-first MCP server가 review UI, API, SSE, MCP stdio/http route를 함께 제공하도록 구성했습니다.
- iframe preview를 React review UI 바깥에 두어 대상 프로젝트가 자체 HTML detail 화면을 제공할 수 있게 했습니다.
- `mem`과 self-improvement runtime을 통해 시각화된 작업 이력을 장기기억과 skill 개선 workflow로 확장했습니다.

## Documentation

- [prd.md](docs/core/prd.md): 제품 목적, 구성요소, 핵심 workflow
- [system-parts.md](docs/core/system-parts.md): MCP/웹앱, 스킬, Preview Runtime의 역할과 책임
- [preview-runtime-requirements.md](docs/core/preview-runtime-requirements.md): Preview Runtime 목적, 계약, 구현 요구사항
- [development.md](docs/core/development.md): 로컬 실행, 검증 명령, MCP 운영 흐름
- [repository-structure.md](docs/core/repository-structure.md): monorepo 디렉터리 구성
