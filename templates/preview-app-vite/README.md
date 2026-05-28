# Agent GUI Preview App Template

이 폴더는 npm 배포 전까지 다른 프로젝트에 임시로 복사해 쓰는 Preview Runtime template입니다.

프로토타입을 모아두는 위치가 아닙니다. 실제 PRD, spec, 화면 상태 prototype, preview entry는 이 template을 복사해 간 대상 프로젝트나 별도 fixture app이 소유합니다.

## Ownership

- 이 template은 재사용 가능한 shell component, preview registry, local Vite dev server 예시만 제공합니다.
- 이 폴더 자체에 기능별 prototype, PRD, spec fixture를 누적하지 않습니다.
- 이 폴더를 복사한 프로젝트가 실제 TSX entry, preview app 코드, 디자인시스템 연결, mock data, 상태 fixture를 소유합니다.
- Agent GUI는 복사된 preview app을 생성하거나 해석하지 않습니다.
- Agent GUI에는 복사된 preview app이 제공하는 local HTTP URL을 `GraphPlanNode.iframes[].url`로 등록합니다.
- URL을 만든 source entry 파일을 에이전트가 나중에 읽어야 한다면 `GraphPlanNode.iframes[].entryPath`에 workspace 기준 경로를 함께 등록합니다.

## Basic Flow

1. 이 폴더를 사용하는 프로젝트 안으로 복사합니다.
2. `src/previews/*.tsx`에 프로젝트별 preview/prototype TSX entry를 만듭니다.
3. `src/previews/registry.ts`에 preview id와 component를 등록합니다.
4. preview component 안에서 `PreviewShell`, `PreviewPanel`, 프로젝트 디자인시스템, 실제 컴포넌트를 사용합니다.
5. template dev server를 실행해 explicit port가 있는 local HTTP URL을 만듭니다.
6. Graph plan node에 iframe entry를 추가합니다.

복사 후 바로 확인하려면:

```bash
pnpm install
pnpm dev --host 127.0.0.1 --port 5173
```

```json
{
  "id": "iframe-project-preview",
  "description": "프로젝트 preview",
  "url": "http://127.0.0.1:5173/?preview=search-panel",
  "entryPath": "agent-gui-preview/src/previews/search-panel.tsx"
}
```

`entryPath`에는 파일 위치만 둡니다. 화면 상태의 의미, 검토 기준, scenario 설명은 `description`이나 preview 화면 안의 컨텐츠로 표현합니다.

## Injecting Preview TSX

```tsx
// src/previews/search-panel.tsx
import { PreviewPanel, PreviewShell } from "../host/PreviewShell";

export default function SearchPanelPreview() {
  return (
    <PreviewShell title="Search Panel Preview">
      <PreviewPanel title="Default state">...</PreviewPanel>
    </PreviewShell>
  );
}
```

```ts
// src/previews/registry.ts
import type { ComponentType } from "react";
import ExamplePreview from "./example";
import SearchPanelPreview from "./search-panel";

export const previewRegistry: Record<string, ComponentType> = {
  example: ExamplePreview,
  "search-panel": SearchPanelPreview,
};
```

## PreviewShell Shape

초기 template은 최소한의 library shape만 전제합니다.

- `PreviewShell`: page padding, title/header, responsive grid container
- `PreviewPanel`: title과 children
- `src/index.ts`: npm package로 회수하기 전의 임시 export entry
- `src/host/PreviewHost.tsx`: `?preview=<id>`를 읽고 registry component를 렌더링하는 local host
- `src/previews/registry.ts`: 명시적 주입 지점
- 실제 제품 컴포넌트와 디자인시스템은 panel children 안에서 직접 사용

`src/main.tsx`는 `PreviewHost`만 렌더링합니다. 기능별 prototype은 `src/previews`에 추가하고 registry에 등록하세요.

상태 매트릭스, 전후 비교, 체크리스트, 경로/목록 자동화 보조 기능은 기본 계약에 포함하지 않습니다. 반복해서 유용하다고 확인된 패턴만 나중에 template이나 package로 회수합니다.

## Do Not Use

- 이 template 폴더를 PRD/spec/prototype 예시 저장소로 사용하지 마세요.
- Agent GUI repo의 `docs/prototypes`를 실사용 preview 작성 위치로 사용하지 마세요.
- `file://` URL을 iframe URL로 등록하지 마세요.
- 원격 `https://` URL을 기본 contract로 가정하지 마세요.

현재 iframe URL contract는 `http://localhost:<port>/...` 또는 `http://127.0.0.1:<port>/...`입니다.
