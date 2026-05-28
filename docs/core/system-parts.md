# System Parts

Agent GUI는 세 가지 축으로 동작한다.

- MCP/웹앱
- 스킬
- Preview Runtime

이 세 축은 같은 제품 흐름에 참여하지만 설치 위치와 책임이 다르다.

## MCP/웹앱

MCP/웹앱은 Agent GUI repo에서 실행되는 로컬 서버다.

역할:

- graph plan session 저장
- browser review UI 제공
- session API 제공
- SSE update stream 제공
- MCP stdio/http tool 제공
- feedback, reply, revision, approval event 저장

설치 위치:

```txt
agent-gui repo
```

실행:

```bash
pnpm install
pnpm dev
```

기본 URL:

```txt
http://localhost:8787
```

에이전트가 MCP tool을 쓰려면 Codex 또는 Claude에 `apps/server/src/mcp/stdioServer.ts`를 MCP server로 등록한다.

## 스킬

스킬은 Agent GUI를 사용할 대상 프로젝트에 설치하는 에이전트 지침이다.

역할:

- 에이전트가 Agent GUI MCP workflow를 떠올리게 한다.
- graph/html plan session을 만드는 기준을 제공한다.
- node iframe entry 작성 기준을 제공한다.
- feedback event를 읽고 reply/revision을 처리하는 절차를 안내한다.
- 실제 preview는 대상 프로젝트의 local HTTP URL을 우선 사용하게 한다.

설치 위치:

```txt
Agent GUI를 사용할 대상 프로젝트
```

설치:

```bash
npx skills add https://github.com/Bearsharks/agent-gui/
```

스킬은 Agent GUI 서버를 대신 실행하지 않는다. MCP/웹앱 서버는 별도로 실행되어 있어야 한다.

## Preview Runtime

Preview Runtime은 대상 프로젝트 안에서 실행되는 iframe preview runtime이다.

Agent GUI repo가 제공하는 `templates/preview-app-vite`는 복사 원본인 Preview Template이고, 대상 프로젝트 안에 복사되어 실행되는 것이 Preview Runtime이다. 현재 설치 방식은 임시로 복사/붙여넣기지만, 제품 개념은 대상 프로젝트별 preview runtime이다.

역할:

- node 판단에 필요한 실제 화면 상태를 local HTTP URL로 제공한다.
- before/after 비교, 체크리스트, 상태 matrix, prototype, preview 화면을 iframe으로 보여준다.
- 대상 프로젝트의 컴포넌트, 디자인시스템, mock data, fixture state를 직접 사용한다.
- 프로젝트별 TSX entry file을 주입하면 preview 화면으로 렌더링한다.
- 여러 preview template과 공통 웹서버 shell을 제공해 entry 주입만으로 쓰기 쉽게 만든다.
- Agent GUI graph plan node의 `iframes[].url`과 연결된다.
- source entry 추적이 필요하면 `iframes[].entryPath`와 연결된다.

설치 위치:

```txt
Agent GUI를 사용할 대상 프로젝트
```

복사 원본:

```txt
templates/preview-app-vite
```

현재 복사형 설치 및 실행:

```bash
cp -R /path/to/agent-gui/templates/preview-app-vite ./agent-gui-preview
cd agent-gui-preview
pnpm install
pnpm dev --host 127.0.0.1 --port 5173
```

iframe entry 예시:

```json
{
  "id": "iframe-project-preview",
  "description": "프로젝트 preview",
  "url": "http://127.0.0.1:5173/?preview=search-panel",
  "entryPath": "agent-gui-preview/src/previews/search-panel.tsx"
}
```

Preview Runtime은 Agent GUI repo의 `docs/prototypes`에 실제 preview를 만들기 위한 장치가 아니다. 실제 preview content는 대상 프로젝트가 소유한다.

## Preview Runtime Direction

Preview Runtime의 목표는 대상 프로젝트가 화면 entry만 주입하면 Agent GUI에서 검토 가능한 iframe URL을 바로 얻는 것이다.

기본 개념:

- Preview Template: Agent GUI repo가 제공하는 복사 원본
- Preview Runtime: 대상 프로젝트 안에서 실행되는 복사본
- Preview Entry: `src/previews/*.tsx` 같은 TSX entry file
- Preview Registry: `?preview=<id>`를 TSX entry와 연결하는 명시적 registry
- Preview URL: Agent GUI node iframe에 등록되는 local HTTP URL

현재는 복사형 설치를 사용한다.

```txt
agent-gui/templates/preview-app-vite
  -> target-project/agent-gui-preview
```

장기적으로는 여러 template과 공통 웹서버 shell을 제공해, 대상 프로젝트가 preview/prototype entry file만 추가하면 바로 iframe review에 연결되는 형태를 지향한다.

Preview Runtime의 상세 요구사항은 [preview-runtime-requirements.md](preview-runtime-requirements.md)를 따른다.

## Responsibility Boundary

```txt
Agent GUI repo
  MCP/웹앱 서버
  review UI
  session/event 저장소
  MCP tool contract
  preview template

대상 프로젝트
  Agent GUI skill 설치
  preview runtime 복사본
  실제 preview/prototype TSX entry
  preview mock data / fixture state
  iframe URL / entryPath source

에이전트
  graph plan session 생성
  target별 feedback 조회
  reply 작성
  revision 생성
```

핵심 원칙은 Agent GUI가 계획 리뷰와 event loop를 소유하고, 대상 프로젝트가 iframe preview의 실제 화면과 상태를 소유하는 것이다.
