# Agent GUI PRD

## Product Summary

Agent GUI는 에이전트가 만든 graph plan을 브라우저에서 검토하고, 사용자의 target별 피드백과 에이전트의 답변/수정 revision을 MCP tool로 주고받는 로컬 리뷰 시스템이다.

핵심 제품 가치는 채팅만으로는 흐려지는 계획의 흐름, 판단 지점, 피드백 위치, revision 맥락을 브라우저 작업면과 구조화된 MCP event로 명확하게 유지하는 것이다.

## Users

- 사용자: 에이전트가 만든 작업 계획을 브라우저에서 읽고, 특정 위치에 피드백을 남기고, 최신 revision을 승인한다.
- 에이전트: MCP tool로 graph plan session을 만들고, 사용자의 feedback event를 읽고, 답변하거나 graph plan revision을 만든다.
- 대상 프로젝트: Preview Runtime을 실행해 node iframe preview를 local HTTP URL로 제공하고, 계획 검토에 필요한 실제 화면, 상태, 비교, 체크리스트를 보여준다.

## Product Components

### MCP/웹앱

Agent GUI repo가 제공하는 로컬 서버이다.

- review web UI
- session API
- SSE update stream
- MCP stdio/http route
- file-backed session store

서버는 기본적으로 `http://localhost:8787`에서 실행된다.

### 스킬

각 대상 프로젝트에 설치하는 에이전트 지침이다.

```bash
npx skills add https://github.com/Bearsharks/agent-gui/
```

스킬은 에이전트가 Agent GUI MCP workflow를 사용해 graph/html plan review session을 만들고, feedback/revision loop를 처리하도록 안내한다.

### Preview Runtime

각 대상 프로젝트가 node iframe preview 화면을 local HTTP URL로 제공하기 위해 실행하는 preview runtime이다.

현재는 Agent GUI repo의 Vite template을 대상 프로젝트 안으로 복사해 사용한다.

```txt
templates/preview-app-vite
```

복사 원본 template은 shell, preview host, registry 구조와 local web server 예시를 제공한다. 실제 preview/prototype TSX entry, mock data, 상태 fixture, 디자인시스템 연결은 대상 프로젝트가 소유한다.

목표는 대상 프로젝트가 entry file만 주입하면 여러 preview template과 공통 웹서버 shell을 통해 iframe review URL을 바로 얻는 것이다.

## Core Workflow

1. 사용자가 에이전트에게 작업 계획을 Agent GUI로 시각화해 달라고 요청한다.
2. 에이전트가 MCP tool로 graph plan session을 만든다.
3. 사용자가 session URL을 브라우저에서 연다.
4. 사용자가 graph 흐름과 node별 상세 화면, iframe preview를 검토한다.
5. 사용자가 graph, node, edge, iframe target에 피드백을 남긴다.
6. 에이전트가 MCP tool로 feedback event를 읽는다.
7. 에이전트가 답변하거나 targeted graph plan revision을 만든다.
8. 사용자가 최신 revision을 다시 검토한다.
9. 사용자가 승인하거나 후속 작업으로 넘어간다.

## Product Requirements

- graph plan session을 만들고 브라우저 URL을 반환할 수 있어야 한다.
- browser UI는 graph 흐름, selected node context, iframe preview, feedback thread, revision 상태를 보여줘야 한다.
- feedback은 plan, graph, node, edge, iframe 같은 명확한 target에 저장되어야 한다.
- 에이전트는 MCP tool만 보고 open feedback을 파악하고 처리할 수 있어야 한다.
- agent reply는 원래 feedback thread 아래에 연결되어야 한다.
- graph plan revision은 revision 번호와 change summary를 남겨야 한다.
- iframe preview URL은 local HTTP URL을 기본 contract로 사용해야 한다.
- Preview Runtime은 대상 프로젝트별 TSX entry file을 주입받아 preview/prototype 화면을 제공해야 한다.
- 대상 프로젝트 preview source를 추적해야 할 때 `iframes[].entryPath`를 사용할 수 있어야 한다.
- session별 events, revision, graph/iframe state는 서로 격리되어야 한다.

## Non-Goals

- 원격 hosted SaaS 제공
- 실시간 멀티유저 협업
- 임의 코드 실행 workflow engine
- PM tool 수준의 일정/담당자/마감일 관리
- 사용자가 직접 그래프를 자유 편집하는 full visual graph editor
- 대상 프로젝트 preview HTML의 구조를 Agent GUI React UI가 해석하는 기능

## Success Criteria

- 사용자가 긴 계획의 흐름과 판단 지점을 채팅보다 명확하게 파악한다.
- 피드백 위치를 별도로 설명하지 않아도 target으로 추적된다.
- 에이전트가 feedback event만 보고 다음 답변 또는 revision 범위를 결정할 수 있다.
- revision마다 무엇이 바뀌었는지 브라우저에서 확인할 수 있다.
- iframe preview가 UX, 상태, before/after, 체크리스트 검토를 구체화한다.
