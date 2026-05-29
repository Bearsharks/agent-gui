# Repository Structure

Agent GUI는 pnpm workspace 기반 monorepo입니다.

```txt
apps/server
  단일 로컬 서버, API, SSE, MCP stdio/http route, planctl

apps/review-web
  브라우저 graph plan review UI

packages/plan-schema
  GraphPlanDocument, GraphPlanTarget, PlanSession, PlanEvent schema

packages/preview-runtime
  npm-style iframe preview runtime package, Vite plugin, preview presets

packages/design-system
  공용 디자인 시스템 컴포넌트와 토큰

fixtures/review-target-app
  실제 리뷰 대상처럼 쓰는 작은 fixture app

fixtures/preview-runtime-consumer
  preview runtime package 주입 계약 검증용 fixture

fixtures/checklist-prototype
  checklist 기반 prototype fixture

fixtures/todo-list-prototype
  todo list prototype fixture

fixtures/todo-prd-spec-preview
  todo PRD/spec preview fixture

docs
  현재 제품 문서, core 사용자 문서, legacy 문서, prototype fixture

docs/core
  사용자 세팅, 개발 명령, repository structure 같은 핵심 운영 문서

docs/legacy
  이전 설계, handoff, research, graph migration 기록

docs/prototypes
  node iframe preview용 로컬 HTML fixture

data/sessions
  로컬 session JSON 저장소

data/seeds
  seed data 저장소
```
