# Preview Runtime Requirements

## Purpose

Preview Runtime은 대상 프로젝트 안의 `.agent-gui` sandbox에서 실행되는 local HTTP preview server다.

목적은 Agent GUI graph plan node에 실제 화면 상태, prototype, before/after 비교, 체크리스트, 검토용 UI를 iframe으로 연결할 수 있게 하는 것이다.

Preview Runtime은 production app을 실행하거나 production feature component reuse를 보장하지 않는다. 대상 프로젝트의 디자인시스템, token, CSS, icon, mock data를 사용해 독립 prototype app을 빠르게 만드는 장치다.

## Product Position

Preview Runtime은 세 가지 소유 영역으로 나뉜다.

- Skill scaffold: `.agents/skills/plan-gui-mcp/scripts/init-preview-runtime.mjs`
- Target sandbox: `.agent-gui`
- Generated runtime: `.agent-gui/preview-runtime`

기본 구조:

```txt
target-project/
  .agents/skills/plan-gui-mcp/
    scripts/init-preview-runtime.mjs
    templates/preview-runtime/

  .agent-gui/
    preview.config.ts
    preview.setup.tsx
    previews/
      search-panel.preview.tsx
    preview-runtime/
      package.json
      src/
```

대상 프로젝트 root `package.json`, lockfile, workspace 설정은 수정하지 않는다.

## Core Requirements

### 1. Sandbox Scaffold

Skill script는 대상 프로젝트에 `.agent-gui` 구조를 만들 수 있어야 한다.

필수 조건:

- `.agent-gui/preview.config.ts`를 생성한다.
- `.agent-gui/tsconfig.preview.json`을 생성한다.
- `.agent-gui/preview-env.d.ts`를 생성한다.
- `.agent-gui/previews/example.preview.tsx`를 생성한다.
- `.agent-gui/preview-runtime`에 local web server template을 생성한다.
- 기존 user-authored config, preview tsconfig, preview entry는 기본적으로 덮어쓰지 않는다.
- generated runtime만 갱신할 수 있는 `--upgrade-runtime` 경로를 제공한다.
- 전체 overwrite가 필요할 때만 `--force`를 사용한다.

### 2. Entry Injection

대상 프로젝트는 TSX entry file만 추가해서 preview 화면을 만들 수 있어야 한다.

```txt
.agent-gui/previews/search-panel.preview.tsx
```

설정 예시:

```ts
export default {
  entries: [".agent-gui/previews/**/*.preview.tsx"],
  setup: ".agent-gui/preview.setup.tsx",
  styles: ["src/styles/tokens.css"],
  aliases: {
    "@": "./src",
  },
  devServer: {
    host: "127.0.0.1",
    port: 5174,
  },
};
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
- entry는 `id`, `title`, 선택 `description`, `component`를 가져야 한다.
- entry file은 대상 프로젝트의 디자인시스템, token, mock data를 import할 수 있어야 한다.
- entry file path는 Agent GUI iframe entry의 `entryPath`에 기록할 수 있어야 한다.
- 사람이 `registry.ts`, `vite.config.ts`, `index.html`, `src/main.tsx`를 직접 만들지 않아야 한다.
- Generated runtime은 `virtual:agent-gui-preview-registry`를 생성해야 한다.

### 3. Entry Typecheck

Preview entry typecheck는 generated runtime typecheck와 분리한다.

필수 조건:

- `npm --prefix .agent-gui/preview-runtime run typecheck`는 generated runtime source만 검사한다.
- `npm --prefix .agent-gui/preview-runtime run typecheck:entries`는 `.agent-gui/tsconfig.preview.json`으로 project-owned preview entry를 검사한다.
- `.agent-gui/tsconfig.preview.json`은 `.agent-gui/previews/**/*.preview.tsx`와 선택적 `.agent-gui/preview.setup.tsx`를 포함한다.
- `.agent-gui/tsconfig.preview.json`은 `@agent-gui/preview-runtime` path를 `.agent-gui/preview-runtime/src/index.ts`로 연결한다.
- 디자인시스템 alias를 사용하는 경우 `.agent-gui/preview.config.ts` `aliases`와 `.agent-gui/tsconfig.preview.json` `compilerOptions.paths`를 함께 맞춘다.
- Preview entry typecheck가 production app 전체를 compile하는 계약이 되어서는 안 된다.

### 4. Local HTTP URL

Preview Runtime은 Agent GUI iframe이 열 수 있는 local HTTP URL을 제공해야 한다.

허용 URL:

- `http://localhost:<port>/...`
- `http://127.0.0.1:<port>/...`

기본 URL:

```txt
http://127.0.0.1:5174/?preview=<preview-id>
```

필수 조건:

- explicit port를 사용해야 한다.
- 기본 dev server는 `strictPort`로 실행되어야 한다.
- 기본 port가 점유되어 있으면 자동 fallback하지 않고 실패해야 한다.
- `file://` URL을 사용하지 않는다.
- preview id가 없거나 잘못되면 등록된 preview 목록과 source path를 보여줘야 한다.

### 5. Design-System Prototype Support

Preview Runtime은 production `vite.config.ts` merge 없이 필요한 고수준 설정만 지원한다.

지원 설정:

- `styles`: 모든 preview에 먼저 import할 CSS file 목록
- `aliases`: 디자인시스템 import를 위한 path alias
- `setup`: 모든 preview를 감싸는 `.agent-gui/preview.setup.tsx` provider
- `publicDir`: static asset directory
- `watch`: Docker, WSL, network volume용 polling 설정
- `devServer`: host/port

### 6. Runtime Shell And Presets

Generated runtime은 모든 preview entry가 공유하는 web shell을 제공해야 한다.

필수 조건:

- `?preview=<id>`를 읽고 registry에서 component를 찾는다.
- 등록되지 않은 id는 fallback 화면으로 처리한다.
- root 화면에서 preview 목록과 source path를 보여준다.
- iframe 안에서 독립적으로 렌더링되어야 한다.
- Agent GUI review web UI와 React state를 공유하지 않아야 한다.
- `SingleScreenPreview`, `BeforeAfterPreview` 같은 기본 preset을 제공한다.

### 7. Source Traceability

Agent GUI에서 iframe preview를 보고 에이전트가 source를 다시 읽을 수 있어야 한다.

iframe entry 예시:

```json
{
  "id": "iframe-project-preview",
  "description": "프로젝트 preview",
  "url": "http://127.0.0.1:5174/?preview=search-panel",
  "entryPath": ".agent-gui/previews/search-panel.preview.tsx"
}
```

필수 조건:

- `entryPath`는 대상 프로젝트 workspace 기준 source entry file path를 가리킨다.
- `entryPath`에는 상태 설명이나 검토 기준을 넣지 않는다.
- 상태 의미, 검토 기준, 시나리오는 `description` 또는 preview 화면 안에서 표현한다.
- iframe target feedback이 들어오면 해당 node iframe의 `entryPath`를 따라 source를 수정할 수 있어야 한다.

## Non-Goals

- Agent GUI 서버가 대상 프로젝트 component를 직접 import하지 않는다.
- Agent GUI review UI가 iframe HTML 구조를 해석하지 않는다.
- Preview Runtime이 production app routing/auth/API state를 대체하지 않는다.
- Preview Runtime이 production feature component reuse를 보장하지 않는다.
- Preview Runtime이 테스트 runner나 visual regression system이 되지 않는다.
- Generated runtime이 production `vite.config.ts`를 merge하지 않는다.
- Target root `package.json`, lockfile, workspace 설정을 변경하지 않는다.

## Verification

현재 구현 검증은 [preview-runtime-sandbox-tasks.md](preview-runtime-sandbox-tasks.md)에 phase별로 기록한다.
