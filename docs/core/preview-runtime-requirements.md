# Preview Runtime Requirements

## Purpose

Preview Runtime은 대상 프로젝트 안에서 실행되는 local HTTP preview server다.

목적은 에이전트가 만든 graph plan의 node에 실제 화면 상태, prototype, before/after 비교, 체크리스트, 검토용 UI를 iframe으로 연결할 수 있게 하는 것이다.

Agent GUI는 plan review UI와 feedback/revision loop를 소유한다. Preview Runtime은 대상 프로젝트의 실제 컴포넌트와 상태를 iframe URL로 제공한다.

## Product Position

Preview Runtime은 세 가지 개념으로 나뉜다.

- Preview Runtime Package: `@agent-gui/preview-runtime`
- Preview Config: 대상 프로젝트가 소유하는 `agent-gui.preview.config.ts`
- Preview Entry: 대상 프로젝트가 주입하는 TSX entry file

Runtime package는 `node_modules`에 있고, 대상 프로젝트는 config와 entry file만 소유한다.

```txt
node_modules/@agent-gui/preview-runtime
target-project/agent-gui.preview.config.ts
target-project/src/agent-gui-previews/**/*.preview.tsx
```

제품 계약은 package runtime과 대상 프로젝트 config/entry의 분리다.

## Core Requirements

### 1. Entry Injection

대상 프로젝트는 TSX entry file만 추가해서 preview 화면을 만들 수 있어야 한다.

```txt
src/agent-gui-previews/search-panel.preview.tsx
```

Preview Runtime package는 대상 프로젝트 파일을 하드코딩 import하지 않는다. 대상 프로젝트의 config가 entry glob을 선언하고, runtime Vite plugin이 그 glob으로 virtual registry를 생성한다.

설정 예시:

```ts
import { definePreviewConfig } from "@agent-gui/preview-runtime/config";

export default definePreviewConfig({
  entries: ["src/agent-gui-previews/**/*.preview.tsx"],
  devServer: {
    host: "127.0.0.1",
    port: 5173,
  },
});
```

entry 예시:

```tsx
import { SingleScreenPreview, definePreview } from "@agent-gui/preview-runtime";

export default definePreview({
  id: "search-panel",
  title: "Search Panel Preview",
  description: "검색 패널 기본/빈 상태 검토",
  component() {
    return <SingleScreenPreview title="Default state">...</SingleScreenPreview>;
  },
});
```

필수 조건:

- preview id는 안정적인 문자열이어야 한다.
- preview id는 URL에서 `?preview=<id>`로 선택할 수 있어야 한다.
- preview id는 `definePreview()`의 `id`와 정확히 일치해야 한다.
- entry는 `id`, `title`, 선택 `description`, `component`를 가져야 한다.
- `component`는 Runtime이 제공하는 shell 안에 렌더링되는 React component다.
- entry file은 대상 프로젝트의 컴포넌트, 디자인시스템, mock data를 import할 수 있어야 한다.
- entry file path는 Agent GUI iframe entry의 `entryPath`에 기록할 수 있어야 한다.
- 사람이 `registry.ts`를 직접 수정하지 않아야 한다.
- Runtime Vite plugin은 `virtual:agent-gui-preview-registry`를 생성해야 한다.
- Runtime은 registry에 없는 preview id를 fallback 화면으로 처리하고, 등록된 preview 목록을 보여줘야 한다.

### 2. Local HTTP URL

Preview Runtime은 Agent GUI iframe이 열 수 있는 local HTTP URL을 제공해야 한다.

허용 URL:

- `http://localhost:<port>/...`
- `http://127.0.0.1:<port>/...`

기본 URL 형태:

```txt
http://127.0.0.1:5173/?preview=<preview-id>
```

필수 조건:

- explicit port를 사용해야 한다.
- `file://` URL을 사용하지 않는다.
- 원격 `https://` URL을 기본 contract로 가정하지 않는다.
- preview id가 없거나 잘못되면 등록된 preview 목록을 보여줘야 한다.

### 3. Preview Presets

Preview Runtime은 단일 빈 shell만 제공하지 않고, 반복적으로 필요한 preview layout을 preset으로 제공해야 한다.

초기 preset 후보:

- Single screen: 한 상태를 크게 보여주는 화면
- Before/after: 변경 전후를 나란히 비교하는 화면
- State matrix: 여러 상태를 표나 grid로 비교하는 화면
- Checklist review: 검토 항목과 화면을 함께 보여주는 화면
- Flow review: 여러 step 화면을 순서대로 보여주는 화면

필수 조건:

- preset은 entry 작성자가 선택해서 사용할 수 있어야 한다.
- preset은 대상 프로젝트의 실제 컴포넌트를 children으로 받을 수 있어야 한다.
- preset은 Agent GUI plan schema를 직접 import하지 않아야 한다.
- preset은 preview 화면 표현을 돕는 역할만 해야 한다.

### 4. Runtime Shell

Preview Runtime은 모든 preview entry가 공유하는 웹서버 shell을 제공해야 한다.

필수 조건:

- `?preview=<id>`를 읽고 registry에서 component를 찾는다.
- 등록되지 않은 id는 fallback 화면으로 처리한다.
- preview 목록을 확인할 수 있어야 한다.
- iframe 안에서 독립적으로 렌더링되어야 한다.
- Agent GUI review web UI와 React state를 공유하지 않아야 한다.

### 5. Source Traceability

Agent GUI에서 iframe preview를 보고 에이전트가 source를 다시 읽을 수 있어야 한다.

iframe entry 예시:

```json
{
  "id": "iframe-project-preview",
  "description": "프로젝트 preview",
  "url": "http://127.0.0.1:5173/?preview=search-panel",
  "entryPath": "src/agent-gui-previews/search-panel.preview.tsx"
}
```

필수 조건:

- `entryPath`는 대상 프로젝트 workspace 기준 source entry file path를 가리킨다.
- `entryPath`에는 상태 설명이나 검토 기준을 넣지 않는다.
- 상태 의미, 검토 기준, 시나리오는 `description` 또는 preview 화면 안에서 표현한다.

### 6. Agent Authoring

에이전트가 대상 프로젝트에 preview entry를 추가하기 쉬워야 한다.

필수 조건:

- entry file 작성 패턴이 단순해야 한다.
- 주입 설정 위치가 명확해야 한다.
- preview id와 iframe URL을 쉽게 만들 수 있어야 한다.
- 에이전트가 preview source를 수정한 뒤 같은 URL로 다시 확인할 수 있어야 한다.
- 실제 제품 코드와 preview-only fixture code의 경계가 명확해야 한다.

## Non-Goals

- Agent GUI 서버가 대상 프로젝트 component를 직접 import하지 않는다.
- Agent GUI review UI가 iframe HTML 구조를 해석하지 않는다.
- Preview Runtime이 production app routing을 대체하지 않는다.
- Preview Runtime이 테스트 runner나 full visual regression system이 되지 않는다.
- Runtime package가 대상 프로젝트 entry file 경로를 하드코딩하지 않는다.

## Open Design Questions

아직 더 정해야 하는 계약이다.

1. 표준 설치 위치를 정할지
   - `agent-gui-preview/`
   - `.agent-gui/preview/`
   - `tools/agent-gui-preview/`

2. config의 `entries` glob 기본값을 정할지
   - `src/agent-gui-previews/**/*.preview.tsx`
   - `agent-gui/previews/**/*.preview.tsx`
   - `.agent-gui/previews/**/*.preview.tsx`

3. preview state를 URL query로 표현할지

```txt
?preview=search-panel&state=empty
```

4. 여러 preset을 어떤 API로 제공할지

```tsx
<BeforeAfterPreview before={<Before />} after={<After />} />
```

5. 대상 프로젝트의 bundler alias, env, CSS, design system을 어떻게 연결할지

6. CLI가 config와 entry skeleton을 생성할지

## Minimum Next Implementation

현재 최소 구현:

1. `@agent-gui/preview-runtime` package를 제공한다.
2. `definePreviewConfig()`로 대상 프로젝트 설정을 선언한다.
3. `definePreview()`로 프로젝트-local entry contract를 선언한다.
4. Vite plugin이 config의 `entries` glob으로 `virtual:agent-gui-preview-registry`를 생성한다.
5. `PreviewHost`가 virtual registry에서 `?preview=<id>`를 찾아 렌더링한다.
6. 기본 preset 2개를 제공한다.
   - `SingleScreenPreview`
   - `BeforeAfterPreview`
7. `fixtures/preview-runtime-consumer`로 npm-style package boundary를 검증한다.
