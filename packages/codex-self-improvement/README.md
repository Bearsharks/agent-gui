# Codex Self-Improvement

Codex 전역에서 동작하는 수동 승인형 스킬 자가개선 런타임입니다.

목표는 Hermes의 백그라운드 리뷰와 큐레이션 아이디어를 Codex 단독 구조로 옮기되, 자동 post-turn 수정은 제거하는 것입니다. 스킬 변경은 사용자가 명시적으로 요청하고 승인한 경우에만 수행합니다.

## 구성 요소

설치 시 다음 항목을 등록합니다.

- MCP 서버: `codex-self-improvement`
- MCP 도구:
  - `skill_list`
  - `skill_view`
  - `skill_manage`
- Codex 훅:
  - `SessionStart`: 세션 시작 시 현재 사용 가능한 스킬 인덱스만 짧게 주입
  - `UserPromptSubmit`: 세션별 이전 스킬 인덱스와 현재 인덱스를 비교해 변경점만 주입
- Codex 스킬:
  - `codex-self-improvement`: 세션 리뷰 기반 스킬 생성/수정
  - `codex-skill-curation`: 스킬 병합, 통합, stale/archive 정리

`Stop` hook 기반 자동 리뷰는 설치하지 않습니다. 전체 대화 이력이 보장되지 않는 상태에서 자동으로 스킬을 수정하지 않기 위한 선택입니다.

## 설치

레포 루트에서 실행합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement install:codex
```

설치 시 다음 파일과 디렉터리가 갱신됩니다.

- `~/.codex/config.toml`
- `~/.codex/hooks.json`
- `~/.codex/self-improvement/codex_self_improvement.py`
- `~/.codex/skills/codex-self-improvement/SKILL.md`
- `~/.codex/skills/codex-skill-curation/SKILL.md`

설치 스크립트는 `config.toml`의 관리 블록만 교체하고, `hooks.json`에서는 `codex_self_improvement.py`를 가리키는 기존 self-improvement 훅만 교체합니다. 이전 실험용 `codex-manual-skill-update` 스킬은 제거합니다.

## 설치 확인

MCP 서버가 등록됐는지 확인합니다.

```bash
codex mcp list | rg codex-self-improvement
```

패키지 검증은 다음 명령으로 실행합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement test
```

실제 Codex 세션에서 훅 주입을 확인하려면 테스트 세션을 실행합니다.

```bash
codex --dangerously-bypass-hook-trust --enable hooks --no-alt-screen
```

세션 시작 시 `SessionStart hook (completed)` 메시지와 `<codex_self_improvement>` 컨텍스트가 보이면 정상입니다.

## 역할 분리

### MCP 런타임

MCP 런타임은 세 도구만 제공합니다.

- `skill_list`: 스킬 목록과 telemetry 조회
- `skill_view`: 스킬 본문 또는 연결 파일 조회, view/use telemetry 갱신
- `skill_manage`: 스킬 생성, 전체 수정, 부분 패치, support file 작성

`skill_manage`는 생성/수정 전용입니다. archive, restore, pin, unpin, delete, merge, curation은 MCP에서 하지 않습니다.

Telemetry는 `~/.codex/self-improvement/skills/.usage.json`에 저장됩니다. MCP는 `skill_list`, `skill_view`, `skill_manage` 동작 중 사용량과 변경 정보를 계속 기록합니다.

### 훅

`SessionStart` 훅은 세션 ID별 snapshot을 만들고 현재 스킬 인덱스만 주입합니다. 스킬 본문은 주입하지 않습니다.

`UserPromptSubmit` 훅은 같은 세션의 이전 snapshot과 현재 스킬 인덱스를 비교합니다. 변경이 없으면 아무것도 주입하지 않고, 변경이 있으면 다음 항목만 짧게 주입합니다.

- 새 스킬
- 제거되거나 archive로 이동된 스킬
- version 변경
- `purpose_hash` 변경
- description 변경
- state/pinned/content hash 변경

스킬이 변경된 같은 세션에서 사용자가 다음 질문을 하면, 이 훅이 변경점을 알려주고 Codex가 `skill_view`로 다시 확인하게 합니다.

### `codex-self-improvement` 스킬

사용자가 “이번 세션을 스킬에 반영”처럼 명시적으로 요청했을 때 사용합니다.

이 스킬은 반드시 MCP를 사용합니다. 직접 파일을 수정하지 않습니다. 담당 범위는 다음뿐입니다.

- 새 class-level 스킬 생성
- 기존 스킬 패치
- 기존 스킬 전체 수정
- references/templates/scripts 같은 support file 작성

병합, 통합, stale/archive 정리가 필요하면 직접 수행하지 않고 `codex-skill-curation` 사용을 제안합니다.

### `codex-skill-curation` 스킬

사용자가 명시적으로 스킬 정리, 병합, 통합, archive를 요청했을 때 사용합니다.

큐레이션은 MCP를 쓰지 않습니다. `~/.codex/self-improvement/skills` 아래 파일을 직접 다루며, `.usage.json` telemetry sidecar와 `changes.jsonl` 변경 이력을 함께 갱신합니다.

큐레이션 범위는 다음을 포함합니다.

- agent-created 스킬의 stale/archive 판단
- prefix/domain cluster 분석
- 기존 umbrella 스킬로 병합
- 새 umbrella 스킬 생성
- narrow skill 내용을 references/templates/scripts로 demotion
- source skill directory를 `.archive`로 이동
- `absorbed_into` 기반 결과 분류
- `run.json`과 `REPORT.md` 작성

현재 Codex 구조에는 Hermes cron job이 없으므로 cron reference rewrite 단계는 포함하지 않습니다.

## 저장소

설치 후 상태 파일은 다음 위치에 저장됩니다.

```text
~/.codex/self-improvement/
  skills/
  skills/.archive/
  skills/.usage.json
  changes.jsonl
  logs/
  session-state/
```

## 제거

기본 제거는 MCP 등록, 훅 등록, 설치된 스킬 사본만 제거합니다. `~/.codex/self-improvement`의 telemetry와 runtime 상태는 보존합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement uninstall:codex
```

실행 전 변경 내용을 확인하려면 다음을 사용합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement exec python3 scripts/uninstall.py --dry-run
```

runtime 상태까지 모두 삭제하려면 `--purge`를 사용합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement exec python3 scripts/uninstall.py --purge
```

`--purge`는 `~/.codex/self-improvement` 전체를 삭제하므로 `.usage.json`, `changes.jsonl`, `session-state/`, archive 등을 함께 제거합니다.
