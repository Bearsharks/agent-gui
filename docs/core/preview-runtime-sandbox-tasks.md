# Preview Runtime Sandbox Tasks

이 문서는 Preview Runtime을 skill-scaffolded `.agent-gui` sandbox 모델로 전환하기 위한 작업 목록이다.

목표는 대상 프로젝트의 root package/workspace를 건드리지 않고, Agent GUI skill이 제공하는 script/template으로 `.agent-gui` 아래에 독립 preview runtime web server를 세팅하는 것이다. 사용자는 `.agent-gui/preview.config.ts`, `.agent-gui/previews/*.preview.tsx`, 선택적 `.agent-gui/preview.setup.tsx`만 관리한다.

## Phase 1: Scaffold Contract

완료조건:

- skill 안에 preview runtime scaffold script와 template 위치가 정해진다.
- scaffold script가 `.agent-gui` 구조를 생성할 수 있다.
- 사용자 작성 파일과 generated runtime 파일의 overwrite 정책이 문서화된다.

작업 목록:

- [x] `.agents/skills/plan-gui-mcp/scripts/init-preview-runtime.mjs` 추가
- [x] `.agents/skills/plan-gui-mcp/templates/preview-runtime/` template 추가
- [x] `.agent-gui/preview.config.ts` 기본 template 추가
- [x] `.agent-gui/previews/example.preview.tsx` 기본 template 추가
- [x] 기존 파일이 있을 때 덮어쓰지 않는 기본 정책 구현
- [x] `--force` 또는 `--upgrade-runtime` 같은 갱신 옵션 설계

검증:

- [x] 빈 대상 프로젝트에서 scaffold script 실행
- [x] `.agent-gui/preview.config.ts`가 생성되는지 확인
- [x] `.agent-gui/previews/example.preview.tsx`가 생성되는지 확인
- [x] 기존 preview entry가 있을 때 보존되는지 확인

## Phase 2: Isolated Runtime Server

완료조건:

- `.agent-gui/preview-runtime`이 대상 프로젝트 root workspace에 참여하지 않고 실행된다.
- preview server가 `.agent-gui/preview.config.ts`를 읽는다.
- preview server가 `.agent-gui/previews/**/*.preview.tsx`를 iframe URL로 제공한다.

작업 목록:

- [x] `.agent-gui/preview-runtime/package.json` template 구성
- [x] `.agent-gui/preview-runtime/pnpm-workspace.yaml` 또는 npm 고정 정책 결정
- [x] 내부 Vite app entry 구성
- [x] `PreviewHost`, `PreviewShell`, 기본 preset 포함
- [x] config loader가 project root 기준 path를 해석하도록 구현
- [x] `@agent-gui/preview-runtime` import alias를 sandbox Vite server에서 제공

검증:

- [x] `npm --prefix .agent-gui/preview-runtime install`
- [x] `npm --prefix .agent-gui/preview-runtime run dev`
- [x] `http://127.0.0.1:<port>/?preview=example` 렌더링 확인
- [x] root preview 목록에서 preview id와 entryPath 확인

검증 기록:

- 2026-05-29: `/private/tmp/agent-gui-phase2.ZBCrom`에 scaffold 후 `npm --prefix .agent-gui/preview-runtime install` 성공.
- 2026-05-29: generated runtime `npm --prefix .agent-gui/preview-runtime run typecheck` 성공.
- 2026-05-29: `npm --prefix .agent-gui/preview-runtime run dev`로 `http://127.0.0.1:5174/` 실행 확인.
- 2026-05-29: Agent Browser로 root 목록의 `example`, `Example Prototype`, `.agent-gui/previews/example.preview.tsx` 표시 확인.
- 2026-05-29: Agent Browser로 `http://127.0.0.1:5174/?preview=example` 렌더링 확인.

## Phase 3: Design-System Prototype Support

완료조건:

- preview entry가 production app routing/auth/API state 없이 독립 prototype을 작성할 수 있다.
- 대상 프로젝트 디자인시스템과 CSS/token을 명시적으로 연결할 수 있다.
- production `vite.config.ts` merge 없이 필요한 고수준 설정만 지원한다.

작업 목록:

- [ ] `styles` config를 generated setup module에 import
- [ ] `aliases` config를 Vite `resolve.alias`로 변환
- [ ] optional `.agent-gui/preview.setup.tsx` provider 지원
- [ ] `publicDir` config 지원
- [ ] watcher polling config 지원
- [ ] production feature component reuse가 non-goal임을 skill/README에 명시

검증:

- [ ] CSS token import가 모든 preview에 적용되는지 확인
- [ ] alias로 디자인시스템 component import가 되는지 확인
- [ ] setup provider가 preview를 감싸는지 확인
- [ ] production app `vite.config.ts` 없이 동작하는지 확인

## Phase 4: Agent GUI Integration

완료조건:

- 에이전트가 graph node iframe에 preview runtime URL과 `entryPath`를 안정적으로 연결할 수 있다.
- feedback/revision loop에서 preview entry source를 쉽게 찾을 수 있다.
- skill 문서가 에이전트에게 올바른 생성/수정 기준을 제공한다.

작업 목록:

- [ ] skill의 iframe 작성 규칙을 `.agent-gui/previews/*.preview.tsx` 기준으로 정리
- [ ] node iframe URL 예시를 `?preview=<id>` 기준으로 통일
- [ ] `entryPath` 예시를 `.agent-gui/previews/<id>.preview.tsx`로 통일
- [ ] preview runtime root 목록 화면에 source path를 표시
- [ ] feedback 처리 시 iframe target과 preview entry 수정 흐름을 문서화

검증:

- [ ] Agent GUI session에 preview iframe 연결
- [ ] browser review UI에서 iframe 렌더링 확인
- [ ] iframe target feedback 생성 후 entryPath를 따라 source 수정
- [ ] 수정 후 같은 preview URL에서 변경 확인

## Phase 5: Documentation And Handoff

완료조건:

- 제품 목적, 사용법, 제한사항, 운영 경계가 문서에 일관되게 반영된다.
- 다음 작업자가 implementation phase를 시작할 수 있을 만큼 task state가 명확하다.

작업 목록:

- [ ] `docs/core/preview-runtime-prd.md`와 구현 문서 동기화
- [ ] `docs/core/system-parts.md`에서 skill/scaffold/.agent-gui 책임 경계 반영
- [ ] `docs/core/preview-runtime-requirements.md`에서 최신 contract 반영
- [ ] `.agents/skills/plan-gui-mcp/SKILL.md` 사용법 갱신
- [ ] 완료된 phase마다 커밋

검증:

- [ ] 문서에서 npm package runtime과 skill-scaffold runtime 설명이 충돌하지 않는지 확인
- [ ] `rg`로 오래된 `agent-gui.preview.config.ts`, manual `vite.config.ts`, `registry.ts` 안내가 남아있지 않은지 확인
- [ ] 최종 검증 명령과 브라우저 확인 결과를 handoff에 남김

## Commit Policy

- 각 phase 완료 시 커밋한다.
- 사용자 작성 파일과 generated runtime 파일을 같은 커밋에 섞지 않는다.
- 삭제 작업은 별도 커밋으로 분리한다.
- 검증 실패 수정은 가능한 한 같은 phase 커밋 전에 정리한다.
- 예상 밖 변경이 보이면 즉시 `git status --short`로 확인하고, 사용자 변경이면 되돌리지 않는다.
