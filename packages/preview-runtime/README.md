# @agent-gui/preview-runtime

Agent GUI iframe preview를 대상 프로젝트 안에서 실행하기 위한 local preview runtime package입니다.

Preview Runtime은 기존 프로젝트의 feature component를 그대로 실행하기 위한 장치가 아닙니다. 독립된 prototype app을 띄우고, 대상 프로젝트의 디자인시스템, token, CSS, mock data를 이용해 Agent GUI node 판단에 필요한 화면을 빠르게 만드는 것이 목적입니다.

## 핵심 요소

### 1. 설정

대상 프로젝트 루트의 `.agent-gui/preview.config.ts`가 preview runtime 설정입니다.

```ts
import { definePreviewConfig } from "@agent-gui/preview-runtime/config";

export default definePreviewConfig({
  entries: [".agent-gui/previews/**/*.preview.tsx"],
  styles: ["src/styles/tokens.css"],
  aliases: {
    "@": "./src",
  },
  devServer: {
    host: "127.0.0.1",
    port: 5174,
  },
});
```

- `entries`: preview entry로 수집할 파일 glob입니다.
- `styles`: 모든 preview에 먼저 import할 CSS 파일입니다.
- `aliases`: 디자인시스템 import를 위한 path alias입니다.
- `devServer`: Agent GUI iframe에서 접근할 local server 설정입니다.

### 2. 주입할 파일

`entries` glob 아래의 `*.preview.tsx` 파일이 preview entry입니다.

```tsx
import { SingleScreenPreview, definePreview } from "@agent-gui/preview-runtime";
import { Button } from "@/design-system";

export default definePreview({
  id: "search-panel",
  title: "Search Panel Prototype",
  description: "검색 패널 의사결정을 위한 prototype",
  component() {
    return (
      <SingleScreenPreview title="Default state">
        <Button>Search</Button>
      </SingleScreenPreview>
    );
  },
});
```

`id`는 URL의 `?preview=<id>`와 일치합니다.

### 3. 패키지 본체

`@agent-gui/preview-runtime`은 CLI와 runtime component를 제공합니다.

- `agent-gui-preview`: `.agent-gui/preview.config.ts`를 읽고 local preview server를 실행하는 CLI
- `PreviewHost`: iframe 안에서 preview를 렌더링하는 host component
- `definePreview()`, `definePreviewConfig()`: entry와 설정의 타입 계약
- `SingleScreenPreview`, `BeforeAfterPreview`: prototype 작성을 위한 기본 preset

사용자는 `vite.config.ts`, `index.html`, `src/main.tsx`, `registry.ts`를 만들지 않습니다. CLI가 내부 Vite app을 만들고 `entries` glob으로 virtual registry를 생성합니다.

연결 흐름:

```txt
.agent-gui/preview.config.ts
  -> agent-gui-preview dev
  -> internal Vite app
  -> entries glob
  -> virtual:agent-gui-preview-registry
  -> PreviewHost
  -> http://127.0.0.1:<port>/?preview=<id>
```

## Quickstart

### 1. Preview config 작성

```ts
// .agent-gui/preview.config.ts
import { definePreviewConfig } from "@agent-gui/preview-runtime/config";

export default definePreviewConfig({
  entries: [".agent-gui/previews/**/*.preview.tsx"],
  devServer: {
    host: "127.0.0.1",
    port: 5174,
  },
});
```

### 2. Preview entry 추가

```tsx
// .agent-gui/previews/search-panel.preview.tsx
import {
  BeforeAfterPreview,
  SingleScreenPreview,
  definePreview,
} from "@agent-gui/preview-runtime";

export default definePreview({
  id: "search-panel",
  title: "Search Panel Prototype",
  description: "검색 패널 상태 검토",
  component() {
    return (
      <>
        <SingleScreenPreview title="Default state">
          <SearchPanelMock />
        </SingleScreenPreview>

        <BeforeAfterPreview
          beforeTitle="Empty"
          afterTitle="With results"
          before={<SearchPanelMock state="empty" />}
          after={<SearchPanelMock state="results" />}
        />
      </>
    );
  },
});
```

### 3. Preview server 실행

```bash
agent-gui-preview dev
```

Preview URL:

```txt
http://127.0.0.1:5174/?preview=search-panel
```

preview id 없이 root URL을 열면 등록된 preview 목록과 source path를 볼 수 있습니다.

## 상세 가이드

### CLI 책임

`agent-gui-preview dev`는 다음을 수행합니다.

- `.agent-gui/preview.config.ts` 로드
- 내부 Vite app 생성
- `PreviewHost` 렌더링 entry 제공
- `entries` glob을 virtual registry로 주입
- local preview server 실행
- root 화면에서 preview 목록과 source path 표시

대상 프로젝트는 Vite config를 제공하지 않습니다.

### 설정 계약

```ts
export default definePreviewConfig({
  root: ".",
  entries: [".agent-gui/previews/**/*.preview.tsx"],
  setup: ".agent-gui/preview.setup.tsx",
  styles: ["src/styles/tokens.css", "src/styles/theme.css"],
  aliases: {
    "@": "./src",
  },
  publicDir: "public",
  devServer: {
    host: "127.0.0.1",
    port: 5174,
  },
  watch: {
    usePolling: false,
  },
});
```

- `root`: glob, setup, styles, aliases를 해석할 project root입니다. 기본값은 현재 작업 디렉토리입니다.
- `entries`: preview entry glob입니다. glob 밖 파일은 주입되지 않습니다.
- `setup`: 모든 preview를 감싸는 optional provider module입니다.
- `styles`: 모든 preview에 먼저 import할 CSS 파일 목록입니다.
- `aliases`: 디자인시스템 import를 위한 path alias입니다. Vite `resolve.alias`로 변환됩니다.
- `publicDir`: static asset directory입니다.
- `devServer`: local server host/port입니다.
- `watch`: 파일 감시 옵션입니다. Docker/WSL/네트워크 볼륨에서 polling을 켤 때 사용합니다.

Vite plugin이나 production `vite.config.ts`를 직접 merge하지 않습니다. 필요한 의도만 preview config의 고수준 옵션으로 표현합니다.

### Setup Provider

디자인시스템 provider나 global CSS가 필요하면 setup 파일을 둡니다.

```tsx
// .agent-gui/preview.setup.tsx
import type { ReactNode } from "react";
import "../src/styles/tokens.css";

export function PreviewProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

그리고 config에 연결합니다.

```ts
export default definePreviewConfig({
  entries: [".agent-gui/previews/**/*.preview.tsx"],
  setup: ".agent-gui/preview.setup.tsx",
});
```

### 주입 파일 계약

각 preview entry는 `definePreview()` 결과를 default export해야 합니다.

```tsx
export default definePreview({
  id: "search-panel",
  title: "Search Panel Prototype",
  description: "검색 패널 상태 검토",
  component() {
    return <SearchPanelPrototype />;
  },
});
```

필수 필드:

- `id`: stable preview id입니다. URL의 `?preview=<id>`와 일치합니다.
- `title`: runtime shell heading입니다.
- `component`: runtime shell 안에 렌더링할 React component입니다.

선택 필드:

- `description`: preview의 목적이나 검토 기준을 설명하는 metadata입니다.

Entry는 prototype code입니다. production feature component를 그대로 재사용하는 계약이 아니라, 디자인시스템과 mock data를 사용해 독립 prototype을 만드는 계약입니다.

### Dev server 중 새 entry 추가

Vite dev server 실행 중 새 `*.preview.tsx` 파일을 추가하면 glob HMR로 반영됩니다. Watcher가 파일 생성 이벤트를 놓치는 환경에서는 브라우저 새로고침이나 dev server 재시작이 필요할 수 있습니다.

### Agent GUI iframe 연결

Graph plan node의 iframe entry에는 runtime URL과 source entry path를 같이 기록합니다.

```json
{
  "id": "iframe-search-panel",
  "description": "검색 패널 preview",
  "url": "http://127.0.0.1:5174/?preview=search-panel",
  "entryPath": ".agent-gui/previews/search-panel.preview.tsx"
}
```

`entryPath`는 대상 프로젝트 workspace 기준 source file path입니다. 상태 의미, 검토 기준, 시나리오 설명은 iframe `description` 또는 preview 화면 안에 둡니다.

### Local Fixture

이 repo의 package boundary 검증 fixture:

```txt
fixtures/preview-runtime-consumer
```

주요 파일:

```txt
fixtures/preview-runtime-consumer/.agent-gui/preview.config.ts
fixtures/preview-runtime-consumer/.agent-gui/previews/search-panel.preview.tsx
fixtures/preview-runtime-consumer/.agent-gui/previews/status-card.preview.tsx
```
