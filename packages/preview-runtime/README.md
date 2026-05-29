# Preview Runtime Template

이 패키지는 최종 사용자가 직접 설치하는 npm package라기보다, `plan-gui-mcp` skill이 `.agent-gui/preview-runtime`으로 복사하는 preview runtime source/template입니다.

목표는 대상 프로젝트 root package/workspace를 건드리지 않고, Agent GUI node iframe에 연결할 독립 prototype web server를 `.agent-gui` 아래에서 실행하는 것입니다.

Preview Runtime은 production feature component를 그대로 실행하기 위한 장치가 아닙니다. 대상 프로젝트의 디자인시스템, token, CSS, icon, mock data를 사용해 독립 prototype app을 빠르게 만드는 장치입니다.

## 핵심 요소

### 1. 설정

대상 프로젝트의 `.agent-gui/preview.config.ts`가 preview runtime 설정입니다.

```ts
export default {
  entries: [".agent-gui/previews/**/*.preview.tsx"],
  setup: ".agent-gui/preview.setup.tsx",
  styles: ["src/styles/tokens.css"],
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
};
```

- `entries`: preview entry로 수집할 file glob입니다.
- `setup`: 모든 preview를 감싸는 optional provider module입니다.
- `styles`: 모든 preview에 먼저 import할 CSS file 목록입니다.
- `aliases`: 디자인시스템 import를 위한 path alias입니다.
- `publicDir`: static asset directory입니다.
- `devServer`: Agent GUI iframe에서 접근할 local server 설정입니다.
- `watch`: file watcher polling 설정입니다.

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

`.agent-gui/preview-runtime`은 generated/vendor 영역입니다.

- 내부 Vite app
- `PreviewHost`
- `definePreview()`
- `SingleScreenPreview`, `BeforeAfterPreview`
- virtual registry 생성
- local preview server 실행 script

사용자는 `vite.config.ts`, `index.html`, `src/main.tsx`, `registry.ts`를 만들지 않습니다.

연결 흐름:

```txt
.agent-gui/preview.config.ts
  -> npm --prefix .agent-gui/preview-runtime run dev
  -> internal Vite app
  -> entries glob
  -> virtual:agent-gui-preview-registry
  -> PreviewHost
  -> http://127.0.0.1:<port>/?preview=<id>
```

## Quickstart

대상 프로젝트 root에서 실행합니다.

```bash
node .agents/skills/plan-gui-mcp/scripts/init-preview-runtime.mjs
npm --prefix .agent-gui/preview-runtime install
npm --prefix .agent-gui/preview-runtime run dev
```

preview URL:

```txt
http://127.0.0.1:5174/?preview=example
```

preview id 없이 root URL을 열면 등록된 preview 목록과 source path를 볼 수 있습니다.

## 상세 가이드

### Scaffold 책임

`init-preview-runtime.mjs`는 다음을 생성합니다.

- `.agent-gui/preview.config.ts`
- `.agent-gui/previews/example.preview.tsx`
- `.agent-gui/preview-runtime`

기본 정책은 user-authored file을 덮어쓰지 않는 것입니다.

- `--upgrade-runtime`: generated runtime만 다시 복사합니다.
- `--force`: config, example entry, runtime을 모두 다시 씁니다.

### Runtime 책임

`.agent-gui/preview-runtime`은 다음을 수행합니다.

- `.agent-gui/preview.config.ts` 로드
- 내부 Vite app 생성
- `PreviewHost` 렌더링 entry 제공
- `entries` glob을 virtual registry로 주입
- local preview server 실행
- root 화면에서 preview 목록과 source path 표시

대상 프로젝트는 production Vite config를 제공하지 않습니다.

### Setup Provider

디자인시스템 provider가 필요하면 `.agent-gui/preview.setup.tsx`를 둡니다.

```tsx
import type { ReactNode } from "react";

export function PreviewProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

그리고 config에 연결합니다.

```ts
export default {
  entries: [".agent-gui/previews/**/*.preview.tsx"],
  setup: ".agent-gui/preview.setup.tsx",
};
```

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

iframe target feedback이 들어오면 해당 node iframe의 `entryPath`를 따라 preview entry를 수정합니다. URL은 안정적으로 유지하고, dev server HMR이나 브라우저 refresh로 변경을 확인합니다.

### Package Manager Boundary

설치와 실행은 항상 sandbox directory 기준으로 합니다.

```bash
npm --prefix .agent-gui/preview-runtime install
npm --prefix .agent-gui/preview-runtime run dev
```

대상 프로젝트 root `package.json`, root lockfile, workspace 설정은 수정하지 않습니다.
