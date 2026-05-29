# Preview Runtime PRD

## Product Summary

Preview Runtime은 Agent GUI graph plan의 node iframe에 연결할 수 있는 local prototype preview server다.

목표는 대상 프로젝트 안에 실제 production app을 띄우지 않고도, 해당 프로젝트의 디자인시스템, token, CSS, mock data를 사용해 계획 판단에 필요한 화면 상태, before/after 비교, 체크리스트, prototype UI를 빠르게 제공하는 것이다.

Preview Runtime은 production feature component를 그대로 실행하기 위한 장치가 아니다. Agent GUI review 과정에서 사람이 판단할 수 있는 독립 prototype app을 만드는 장치다.

## Problem

채팅 기반 계획 검토는 화면 상태, UX 흐름, before/after 차이, 체크리스트 결과를 구체적으로 판단하기 어렵다. 반대로 대상 프로젝트의 실제 앱을 그대로 연결하려고 하면 routing, auth, API, app state, Vite 설정, workspace dependency가 얽혀 preview 작성 비용이 커진다.

Preview Runtime은 이 사이의 문제를 해결한다.

- Agent GUI는 plan review와 feedback/revision loop를 소유한다.
- 대상 프로젝트는 실제 화면과 유사한 prototype을 iframe URL로 제공한다.
- production app과 preview app은 분리한다.
- preview는 대상 프로젝트 안에 격리된 `.agent-gui` sandbox로 둔다.

## Users

- 사용자: Agent GUI 브라우저 UI에서 graph node와 연결된 iframe prototype을 보고 계획을 검토한다.
- 에이전트: graph plan node에 preview iframe URL과 `entryPath`를 연결하고, 피드백에 따라 preview entry를 수정한다.
- 대상 프로젝트: `.agent-gui` 아래에 preview config, preview entry, setup/CSS/mock data를 소유한다.

## Product Shape

설치와 구성은 두 영역으로 나뉜다.

```txt
target-project/
  .agents/
    skills/
      plan-gui-mcp/
        SKILL.md
        scripts/
          init-preview-runtime.mjs
        templates/
          preview-runtime/
            ...

  .agent-gui/
    preview.config.ts
    preview.setup.tsx
    previews/
      search-panel.preview.tsx
    preview-runtime/
      package.json
      src/
        ...
```

### Skill 영역

`.agents/skills/plan-gui-mcp`는 skill 설치로 들어오는 영역이다.

역할:

- Agent GUI MCP workflow 사용법을 안내한다.
- preview runtime sandbox를 생성하는 script와 template을 제공한다.
- `.agent-gui` 사용 규칙을 에이전트에게 알려준다.

이 영역은 사용자가 직접 prototype을 작성하는 곳이 아니다.

### .agent-gui 영역

`.agent-gui`는 대상 프로젝트의 Agent GUI 전용 sandbox다.

역할:

- preview runtime web server를 격리해 둔다.
- preview config를 둔다.
- preview entry files를 둔다.
- setup/CSS/mock data를 둔다.
- Agent GUI iframe `entryPath`가 가리키는 source를 제공한다.

`.agent-gui/preview-runtime`은 generated/vendor 영역이다. 사용자가 수정하는 기본 위치는 `.agent-gui/preview.config.ts`, `.agent-gui/preview.setup.tsx`, `.agent-gui/previews/`다.

## Core Concepts

### Preview Config

```txt
.agent-gui/preview.config.ts
```

Preview config는 preview runtime이 어떤 entry를 수집하고 어떤 디자인시스템 resource를 사용할지 선언한다.

예시:

```ts
export default {
  entries: [".agent-gui/previews/**/*.preview.tsx"],
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

Vite config를 직접 merge하지 않는다. 필요한 의도만 `entries`, `styles`, `aliases`, `publicDir`, `watch`, `devServer` 같은 고수준 옵션으로 표현한다.

### Preview Entry

```txt
.agent-gui/previews/*.preview.tsx
```

Preview entry는 iframe으로 렌더링할 prototype 단위다.

예시:

```tsx
import { SingleScreenPreview, definePreview } from "@agent-gui/preview-runtime";

export default definePreview({
  id: "search-panel",
  title: "Search Panel Prototype",
  description: "검색 패널 의사결정을 위한 prototype",
  component() {
    return (
      <SingleScreenPreview title="Default state">
        <SearchPanelMock />
      </SingleScreenPreview>
    );
  },
});
```

`id`는 preview URL의 `?preview=<id>`와 일치한다.

### Preview Runtime Sandbox

```txt
.agent-gui/preview-runtime
```

Preview Runtime Sandbox는 대상 프로젝트 root package/workspace와 분리된 local web app이다.

역할:

- `.agent-gui/preview.config.ts`를 읽는다.
- 내부 Vite app을 실행한다.
- preview entry glob을 virtual registry로 변환한다.
- `PreviewHost`를 렌더링한다.
- local explicit-port HTTP URL을 제공한다.
- root 화면에서 등록된 preview 목록과 source path를 보여준다.

## Workflow

1. 대상 프로젝트에 Agent GUI skill을 설치한다.

```bash
npx skills add https://github.com/Bearsharks/agent-gui/
```

2. 에이전트가 skill script로 `.agent-gui` sandbox를 생성한다.

```bash
node .agents/skills/plan-gui-mcp/scripts/init-preview-runtime.mjs
```

3. preview runtime sandbox dependency를 설치한다.

```bash
npm --prefix .agent-gui/preview-runtime install
```

4. preview server를 실행한다.

```bash
npm --prefix .agent-gui/preview-runtime run dev
```

5. 에이전트가 `.agent-gui/previews/*.preview.tsx` entry를 만들거나 수정한다.

6. graph plan node iframe에 preview URL과 entryPath를 연결한다.

```json
{
  "id": "iframe-search-panel",
  "description": "검색 패널 prototype",
  "url": "http://127.0.0.1:5174/?preview=search-panel",
  "entryPath": ".agent-gui/previews/search-panel.preview.tsx"
}
```

## Package Manager Boundary

Preview Runtime Sandbox는 대상 프로젝트의 root package manager와 workspace에 참여하지 않는다.

원칙:

- root `package.json`을 수정하지 않는다.
- root lockfile을 수정하지 않는다.
- root workspace 설정에 `.agent-gui/preview-runtime`을 추가하지 않는다.
- install/run은 항상 sandbox directory 기준으로 실행한다.

권장 실행:

```bash
npm --prefix .agent-gui/preview-runtime install
npm --prefix .agent-gui/preview-runtime run dev
```

이 방식은 대상 프로젝트가 npm, pnpm, yarn, monorepo, workspace 중 무엇을 사용하든 root dependency graph를 오염시키지 않기 위한 선택이다.

## Ownership

Skill owns:

- preview runtime template
- scaffold script
- usage guidance
- Agent GUI MCP workflow guidance

`.agent-gui` owns:

- project-local preview config
- project-local preview entries
- project-local setup/CSS/mock data
- generated preview runtime sandbox

Agent GUI MCP/web app owns:

- graph plan session
- review UI
- feedback/reply/revision events
- iframe target tracking

## Requirements

- Preview Runtime must serve previews through local explicit-port HTTP URLs.
- Preview Runtime must not require target projects to create `vite.config.ts`, `index.html`, `src/main.tsx`, or `registry.ts`.
- Preview Runtime must read config from `.agent-gui/preview.config.ts`.
- Preview Runtime must collect entries from config-defined glob patterns.
- Preview Runtime must show registered preview IDs and source paths when no preview id is selected.
- Preview entry `id` must be stable and must map to `?preview=<id>`.
- Agent GUI iframe `entryPath` must point to `.agent-gui/previews/*.preview.tsx`.
- User-owned files must not be overwritten by scaffold unless explicitly requested.
- Generated runtime files must be separated from user-authored config and entry files.

## Non-Goals

- Running the target project's production app.
- Reusing production feature components as a contract.
- Merging the target project's production `vite.config.ts`.
- Supporting arbitrary Vite plugins as a stable contract.
- Providing visual regression testing.
- Providing hosted preview infrastructure.
- Mutating target project root `package.json`, root lockfile, or workspace config.

## Risks And Constraints

### Dependency isolation

The sandbox has its own `package.json`, install command, and `node_modules`. This avoids root workspace conflicts but creates an extra install step.

### Runtime update

`.agent-gui/preview-runtime` is generated. The scaffold script needs an update policy such as `--force` or `--upgrade-runtime` so runtime updates do not overwrite user-authored config or entries.

### TypeScript alias visibility

The preview runtime can alias `@agent-gui/preview-runtime` inside its Vite app. External `tsc` runs may not know that alias unless a `.agent-gui/tsconfig.json` or root paths setting is added.

### Design system integration

The preview runtime only supports explicit design-system integration through config and setup files. Project-specific CSS pipelines, fonts, public assets, or Tailwind/PostCSS behavior may require explicit config.

## Success Criteria

- A target project can add `.agent-gui/preview.config.ts` and `.agent-gui/previews/*.preview.tsx` without touching root app code.
- A preview server can run without participating in the target project's root workspace.
- Agent GUI nodes can reference preview URLs with stable `?preview=<id>` values.
- Iframe source can be traced through `.agent-gui/previews/*.preview.tsx`.
- Preview entry authors can build visually similar prototypes using the target project's design system without depending on production app routing/auth/API state.
