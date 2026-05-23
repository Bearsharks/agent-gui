import { graphPlanDocumentSchema, type GraphPlanBlock, type GraphPlanDocument } from "./graphPlan";
import { assertGraphPlanSemantics } from "./graphPlanSemanticValidator";

const blockCatalogTarget = (blockId: string) => ({ type: "block" as const, graphId: "g-prototype-review", nodeId: "n-block-catalog", blockId });

const blockCatalogBlocks: GraphPlanBlock[] = [
  {
    id: "b-catalog-text",
    type: "text",
    title: "텍스트 블록",
    summary: "긴 설명, 맥락, 결론을 문단으로 담는 기본 블록",
    body: [
      "이 블록은 단일 본문 필드에 계획의 배경, 사용자의 의도, 현재 판단, 후속 조치까지 모두 적을 수 있는 가장 단순한 블록이다.",
      "짧은 노트부터 긴 분석까지 수용하며 다른 구조화 블록으로 분리하기 전의 초안 역할도 한다.",
      "그래프 리뷰 화면에서는 노드를 클릭했을 때 본문 전체가 오버레이 카드 안에 그대로 표시되어야 한다.",
    ].join("\n\n"),
  },
  {
    id: "b-catalog-graph-ref",
    type: "graph_ref",
    title: "하위 그래프 참조 블록",
    summary: "노드가 다른 그래프와 어떤 관계를 갖는지 연결한다",
    graphId: "g-prototype-states",
    relationship: "related_context",
    ownership: "referenced",
    links: Array.from({ length: 10 }, (_, index) => ({
      target: { type: "node", graphId: "g-prototype-states", nodeId: ["n-default", "n-tab-selected", "n-commenting"][index % 3] },
      purpose: index % 2 === 0 ? "explains" : "shows_state",
    })),
  },
  {
    id: "b-catalog-task-list",
    type: "task_list",
    title: "작업 목록 블록",
    summary: "실행해야 할 작업을 개별 항목으로 관리한다",
    items: Array.from({ length: 10 }, (_, index) => ({
      id: `task-${index + 1}`,
      label: `블록 카탈로그 작업 ${index + 1}을 완료한다`,
      status: index < 3 ? "complete" : index < 7 ? "open" : "needs_revision",
      target: blockCatalogTarget("b-catalog-task-list"),
    })),
  },
  {
    id: "b-catalog-checklist",
    type: "checklist",
    title: "체크리스트 블록",
    summary: "검토자가 빠짐없이 확인해야 하는 조건을 나열한다",
    items: Array.from({ length: 10 }, (_, index) => ({
      id: `check-${index + 1}`,
      label: `체크 항목 ${index + 1}: 화면과 데이터가 같은 대상을 가리킨다`,
      required: index % 5 !== 4,
      status: index < 4 ? "checked" : index === 8 ? "blocked" : "unchecked",
      owner: index % 2 === 0 ? "agent" : "user",
    })),
  },
  {
    id: "b-catalog-criteria",
    type: "criteria",
    title: "완료 기준 블록",
    summary: "승인 여부를 판단하는 명시적 기준",
    criteria: Array.from({ length: 10 }, (_, index) => ({
      id: `criterion-${index + 1}`,
      label: `완료 기준 ${index + 1}: 주요 흐름이 회귀 없이 동작한다`,
      required: index < 8,
      status: index < 5 ? "passed" : index === 9 ? "waived" : "pending",
    })),
  },
  {
    id: "b-catalog-review-bundle",
    type: "review_bundle",
    title: "리뷰 번들 블록",
    summary: "리뷰 질문, 연결 대상, 승인 기준을 함께 묶는다",
    prompt: "모든 블록 타입이 그래프 노드 오버레이에서 충분한 정보를 보여주는가?",
    linkedTargets: ["b-catalog-text", "b-catalog-checklist", "b-catalog-prototype", "b-catalog-migration"].map(blockCatalogTarget),
    acceptanceCriteria: Array.from({ length: 10 }, (_, index) => ({
      id: `review-criterion-${index + 1}`,
      label: `리뷰 기준 ${index + 1}: 블록의 핵심 필드가 누락 없이 보인다`,
      required: true,
      status: index < 6 ? "passed" : "pending",
    })),
    prototypeRef: {
      prototypeId: "proto-block-catalog",
      blockId: "b-catalog-prototype",
      target: blockCatalogTarget("b-catalog-prototype"),
    },
  },
  {
    id: "b-catalog-prototype",
    type: "prototype",
    title: "프로토타입 블록",
    summary: "탭이 어떤 그래프 대상과 연관되는지 연결한다",
    prototypeId: "proto-block-catalog",
    revision: 1,
    contentHash: "sha256:block-catalog-demo",
    tabs: Array.from({ length: 10 }, (_, index) => ({
      id: `tab-${index + 1}`,
      title: `프로토타입 탭 ${index + 1}`,
      url: `http://localhost:8787/?catalogTab=${index + 1}`,
      summary: `탭 ${index + 1}은 블록 타입별 표시 상태를 검증한다.`,
      relatedTargets: [
        {
          target: blockCatalogTarget(index % 2 === 0 ? "b-catalog-review-bundle" : "b-catalog-prototype"),
          purpose: index % 2 === 0 ? "validates" : "shows_state",
          note: `탭 ${index + 1}은 선택, 피드백, 표시 상태 중 하나를 검증한다.`,
        },
        {
          target: blockCatalogTarget("b-catalog-prototype"),
          purpose: "tests_interaction",
        },
      ],
      context: { graphId: "g-prototype-review", nodeId: "n-block-catalog", blockId: "b-catalog-prototype", itemId: `tab-${index + 1}` },
    })),
  },
  {
    id: "b-catalog-choice-set",
    type: "choice_set",
    title: "선택지 블록",
    summary: "여러 대안 중 하나를 선택하거나 보류한다",
    question: "블록 오버레이에서 어떤 정보 밀도를 기본값으로 둘 것인가?",
    selectedOptionId: "option-3",
    options: Array.from({ length: 10 }, (_, index) => ({
      id: `option-${index + 1}`,
      label: `선택지 ${index + 1}: ${index % 2 === 0 ? "압축형" : "상세형"} 표시`,
      summary: `선택지 ${index + 1}의 장단점과 적용 범위`,
      status: index === 2 ? "selected" : index < 5 ? "candidate" : index < 8 ? "deferred" : "rejected",
      rationale: `사용자가 좁은 화면에서 정보를 비교할 때 선택지 ${index + 1}이 주는 효과를 검토한다.`,
      downstreamTarget: blockCatalogTarget("b-catalog-comparison"),
      activation: index === 2 ? "selected" : "candidate",
    })),
  },
  {
    id: "b-catalog-comparison",
    type: "comparison",
    title: "비교 블록",
    summary: "기준별로 대안을 비교하고 추천안을 남긴다",
    criteria: Array.from({ length: 10 }, (_, index) => ({
      id: `compare-criterion-${index + 1}`,
      label: `비교 기준 ${index + 1}`,
      required: index < 7,
      status: index < 6 ? "passed" : "pending",
    })),
    options: Array.from({ length: 10 }, (_, index) => ({
      id: `compare-option-${index + 1}`,
      label: `비교 대안 ${index + 1}`,
      status: index === 1 ? "selected" : index < 6 ? "candidate" : "deferred",
      rationale: `대안 ${index + 1}은 정보량과 조작성의 균형을 검토하기 위한 샘플이다.`,
      downstreamTarget: blockCatalogTarget("b-catalog-synthesis"),
      activation: index === 1 ? "selected" : "candidate",
    })),
    scores: Array.from({ length: 10 }, (_, index) => ({
      id: `score-${index + 1}`,
      optionId: `compare-option-${(index % 10) + 1}`,
      criterionId: `compare-criterion-${(index % 10) + 1}`,
      rating: index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low",
      note: `점수 ${index + 1}은 샘플 평가 근거를 표시한다.`,
    })),
    selectedOptionId: "compare-option-2",
    recommendation: "대안 2를 기본으로 채택한다.",
    recommendationRationale: "좁은 화면에서도 정보가 충분히 보이고 상호작용 비용이 낮다.",
  },
  {
    id: "b-catalog-evidence",
    type: "evidence",
    title: "근거 블록",
    summary: "판단에 사용한 관찰과 출처를 정리한다",
    items: Array.from({ length: 10 }, (_, index) => ({
      id: `evidence-${index + 1}`,
      source: `검증 세션 ${index + 1}`,
      claim: `근거 ${index + 1}: 노드 클릭 시 블록 세부 정보가 유지된다.`,
      confidence: index < 6 ? "high" : index < 8 ? "medium" : "low",
      sourcePointer: { graphId: "g-prototype-review", nodeId: "n-block-catalog", blockId: "b-catalog-evidence", itemId: `evidence-${index + 1}` },
    })),
  },
  {
    id: "b-catalog-synthesis",
    type: "synthesis",
    title: "종합 블록",
    summary: "여러 근거를 묶어 결론을 만든다",
    entries: Array.from({ length: 10 }, (_, index) => ({
      id: `finding-${index + 1}`,
      finding: `종합 발견 ${index + 1}: 블록별 정보 구조가 다르므로 공통 헤더와 타입별 본문이 함께 필요하다.`,
      evidenceRefs: [{ graphId: "g-prototype-review", nodeId: "n-block-catalog", blockId: "b-catalog-evidence", itemId: `evidence-${index + 1}` }],
    })),
    sourceBranchRefs: [blockCatalogTarget("b-catalog-evidence"), blockCatalogTarget("b-catalog-comparison")],
    joinPolicy: "manual",
    conclusion: "블록 카탈로그 노드는 표시 누락과 정보 밀도 문제를 동시에 검증하는 fixture로 사용한다.",
    conclusionEvidenceRefs: [{ graphId: "g-prototype-review", nodeId: "n-block-catalog", blockId: "b-catalog-evidence", itemId: "evidence-1" }],
    unresolvedQuestions: Array.from({ length: 10 }, (_, index) => `미해결 질문 ${index + 1}: 이 타입을 더 압축해서 보여도 되는가?`),
  },
  {
    id: "b-catalog-risk",
    type: "risk",
    title: "위험 블록",
    summary: "계획이나 구현의 리스크와 완화책",
    risks: Array.from({ length: 10 }, (_, index) => ({
      id: `risk-${index + 1}`,
      title: `위험 ${index + 1}: 블록 정보가 오버레이에서 과도하게 길어질 수 있음`,
      severity: index < 3 ? "high" : index < 7 ? "medium" : "low",
      mitigation: `완화책 ${index + 1}: 목록 높이와 텍스트 줄바꿈을 제한하고 상세 정보는 스크롤로 제공한다.`,
      evidenceRefs: [{ graphId: "g-prototype-review", nodeId: "n-block-catalog", blockId: "b-catalog-evidence", itemId: `evidence-${(index % 10) + 1}` }],
    })),
  },
  {
    id: "b-catalog-verification",
    type: "verification",
    title: "검증 블록",
    summary: "명령, 테스트, 수동 확인 항목",
    checks: Array.from({ length: 10 }, (_, index) => ({
      id: `verification-${index + 1}`,
      label: `검증 ${index + 1}: 블록 ${index + 1}의 표시 상태를 확인한다`,
      mode: ["manual", "command", "test", "metric"][index % 4] as "manual" | "command" | "test" | "metric",
      expected: `예상 결과 ${index + 1}: 모든 핵심 필드가 화면에 보인다.`,
      outcome: index < 4 ? "passed" : index < 8 ? "pending" : "failed",
    })),
  },
  {
    id: "b-catalog-checkpoint-outcome",
    type: "checkpoint_outcome",
    title: "체크포인트 결과 블록",
    summary: "검증 게이트의 최종 판정",
    result: "pending",
    determiningRefs: Array.from({ length: 10 }, (_, index) => ({
      type: "block_item" as const,
      graphId: "g-prototype-review",
      nodeId: "n-block-catalog",
      blockId: "b-catalog-verification",
      itemId: `verification-${index + 1}`,
      itemType: "verification" as const,
    })),
    decidedAt: "2026-05-23T09:00:00.000Z",
    decidedBy: "agent",
    sourceEventIds: Array.from({ length: 10 }, (_, index) => `event-${index + 1}`),
  },
  {
    id: "b-catalog-artifact",
    type: "artifact",
    title: "산출물 블록",
    summary: "파일, URL, 코드 참조, 생성물을 연결한다",
    artifacts: Array.from({ length: 10 }, (_, index) => ({
      id: `artifact-${index + 1}`,
      kind: ["file", "url", "code_ref", "generated_output"][index % 4] as "file" | "url" | "code_ref" | "generated_output",
      title: `산출물 ${index + 1}`,
      ref: index % 4 === 1 ? `https://example.com/artifacts/${index + 1}` : `packages/plan-schema/src/graphPlan.ts#artifact-${index + 1}`,
    })),
  },
  {
    id: "b-catalog-changelog",
    type: "changelog",
    title: "변경 이력 블록",
    summary: "revision 사이의 변경과 target mapping",
    fromRevision: 1,
    toRevision: 2,
    entries: Array.from({ length: 10 }, (_, index) => ({
      id: `change-${index + 1}`,
      summary: `변경 ${index + 1}: 블록 타입 ${index + 1}의 샘플 데이터를 보강했다`,
      previousTargets: [blockCatalogTarget("b-catalog-text")],
      changedTargets: [blockCatalogTarget(index % 2 === 0 ? "b-catalog-prototype" : "b-catalog-verification")],
      mappings: [
        {
          id: `mapping-${index + 1}`,
          changeKind: index % 3 === 0 ? "create" : index % 3 === 1 ? "replace" : "move",
          previousTargets: [blockCatalogTarget("b-catalog-text")],
          newTargets: [blockCatalogTarget(index % 2 === 0 ? "b-catalog-prototype" : "b-catalog-verification")],
        },
      ],
      sourceEventIds: [`event-${index + 1}`],
    })),
    reviewTrace: {
      sourceEventIds: Array.from({ length: 10 }, (_, index) => `event-${index + 1}`),
      resolution: "addressed",
      changedTargets: [blockCatalogTarget("b-catalog-changelog")],
    },
  },
  {
    id: "b-catalog-investigation",
    type: "investigation",
    title: "조사 블록",
    summary: "가설, 실험, 관찰, 결과를 묶는다",
    hypotheses: Array.from({ length: 10 }, (_, index) => ({
      id: `hypothesis-${index + 1}`,
      statement: `가설 ${index + 1}: 블록별 전용 렌더링이 많을수록 리뷰 판단 시간이 줄어든다.`,
      status: ["open", "testing", "confirmed", "falsified", "superseded"][index % 5] as "open" | "testing" | "confirmed" | "falsified" | "superseded",
      evidenceRefs: [{ graphId: "g-prototype-review", nodeId: "n-block-catalog", blockId: "b-catalog-evidence", itemId: `evidence-${(index % 10) + 1}` }],
    })),
    experiments: Array.from({ length: 10 }, (_, index) => ({
      id: `experiment-${index + 1}`,
      hypothesisId: `hypothesis-${(index % 10) + 1}`,
      procedure: `실험 ${index + 1}: 같은 노드에서 블록 타입별 표시를 비교한다.`,
      procedureTarget: blockCatalogTarget("b-catalog-prototype"),
      result: ["pending", "supports", "refutes", "inconclusive"][index % 4] as "pending" | "supports" | "refutes" | "inconclusive",
      artifactRefs: [`artifact-${(index % 10) + 1}`],
    })),
    observations: Array.from({ length: 10 }, (_, index) => ({
      id: `observation-${index + 1}`,
      note: `관찰 ${index + 1}: 긴 목록은 카드 내부 스크롤과 압축 메타 정보가 필요하다.`,
      evidenceRefs: [{ graphId: "g-prototype-review", nodeId: "n-block-catalog", blockId: "b-catalog-evidence", itemId: `evidence-${(index % 10) + 1}` }],
    })),
    outcomes: Array.from({ length: 10 }, (_, index) => ({
      id: `outcome-${index + 1}`,
      summary: `조사 결과 ${index + 1}: 표시 정책을 타입별로 다르게 둔다.`,
      nextAction: `후속 조치 ${index + 1}: 렌더링 누락 여부를 검증한다.`,
    })),
    exitCondition: "모든 블록 타입의 필수 정보가 노드 오버레이에서 확인되면 종료한다.",
  },
  {
    id: "b-catalog-migration",
    type: "migration",
    title: "마이그레이션 블록",
    summary: "버전 전환, 호환성, 롤백, 검증 게이트",
    fromVersion: "graph-plan/v0",
    toVersion: "graph-plan/v1",
    affectedSurfaces: Array.from({ length: 10 }, (_, index) => `영향 영역 ${index + 1}`),
    compatibilityStrategy: "기존 세션은 읽기 호환을 유지하고 신규 세션은 graph-plan/v1만 생성한다.",
    compatibility: {
      readCompatibility: "v0 세션은 어댑터로 읽는다.",
      writeCompatibility: "신규 쓰기는 v1 블록 스키마만 허용한다.",
      legacySessionPolicy: "기존 세션은 승인 또는 폐기 전까지 보존한다.",
      items: Array.from({ length: 10 }, (_, index) => ({
        id: `compat-${index + 1}`,
        kind: ["read", "write", "legacy_session", "interop"][index % 4] as "read" | "write" | "legacy_session" | "interop",
        policy: `호환 정책 ${index + 1}: 경계 조건을 명시적으로 검증한다.`,
        status: index < 4 ? "passed" : index < 7 ? "active" : "pending",
      })),
    },
    rollbackScope: "phase",
    rollbackTargets: [blockCatalogTarget("b-catalog-migration")],
    rollbackPlan: "블록 카탈로그 fixture를 이전 revision으로 되돌리고 검증 fixture를 재생성한다.",
    rollbackPlans: Array.from({ length: 10 }, (_, index) => ({
      id: `rollback-${index + 1}`,
      scope: index % 3 === 0 ? "global" : index % 3 === 1 ? "phase" : "step",
      plan: `롤백 계획 ${index + 1}: 변경된 블록 타입 샘플을 이전 상태로 되돌린다.`,
      targets: [blockCatalogTarget("b-catalog-migration")],
    })),
    verificationGate: "typecheck, build, 브라우저 fixture 확인을 모두 통과해야 한다.",
    steps: Array.from({ length: 10 }, (_, index) => ({
      id: `migration-step-${index + 1}`,
      label: `마이그레이션 단계 ${index + 1}`,
      rollbackScope: index % 2 === 0 ? "step" : "phase",
      verificationRefs: [`verification-${(index % 10) + 1}`],
      verificationTargets: [blockCatalogTarget("b-catalog-verification")],
    })),
  },
];

export const linearPhaseGraphPlanFixture = graphPlanDocumentSchema.parse({
  schemaVersion: "graph-plan/v1",
  id: "fixture-linear-phase",
  title: "Graph schema rollout",
  goal: "Introduce graph/block plans as the only active review session model.",
  rootGraphId: "g-rollout",
  currentRevision: 1,
  graphs: [
    {
      id: "g-rollout",
      title: "Rollout phases",
      layout: { mode: "linear", order: ["n-discovery", "n-implementation", "n-verification"] },
      nodes: [
        {
          id: "n-discovery",
          kind: "section",
          title: "Discovery",
          blocks: [{ id: "b-discovery", type: "task_list", items: [{ id: "t-assumptions", label: "Map current review assumptions to graph targets" }] }],
        },
        {
          id: "n-implementation",
          kind: "section",
          title: "Implementation",
          ownedGraphIds: ["g-implementation"],
          blocks: [{ id: "b-implementation-detail", type: "graph_ref", graphId: "g-implementation", relationship: "phase_detail", ownership: "owned" }],
        },
        {
          id: "n-verification",
          kind: "checkpoint",
          title: "Verification gate",
          blocks: [
            {
              id: "b-verification",
              type: "verification",
              checks: [{ id: "v-old-new", label: "Old and graph sessions both load", mode: "test", outcome: "pending" }],
            },
            {
              id: "b-outcome",
              type: "checkpoint_outcome",
              result: "pending",
              determiningRefs: [
                {
                  type: "block_item",
                  graphId: "g-rollout",
                  nodeId: "n-verification",
                  blockId: "b-verification",
                  itemId: "v-old-new",
                  itemType: "verification",
                },
              ],
            },
          ],
        },
      ],
      edges: [
        { id: "e-discovery-implementation", from: "n-discovery", to: "n-implementation", kind: "sequence" },
        { id: "e-implementation-verification", from: "n-implementation", to: "n-verification", kind: "sequence" },
      ],
    },
    {
      id: "g-implementation",
      title: "Implementation detail",
      owner: { graphId: "g-rollout", nodeId: "n-implementation", blockId: "b-implementation-detail" },
      layout: { mode: "linear", order: ["n-schema", "n-adapter", "n-ui"] },
      nodes: [
        {
          id: "n-schema",
          kind: "action",
          title: "Add graph schema",
          blocks: [{ id: "b-schema-artifact", type: "artifact", artifacts: [{ id: "a-schema", kind: "file", title: "Graph plan schema", ref: "packages/plan-schema/src/graphPlan.ts" }] }],
        },
        {
          id: "n-adapter",
          kind: "action",
          title: "Add compatibility adapter",
          blocks: [{ id: "b-adapter-risk", type: "risk", risks: [{ id: "r-target-drift", title: "Feedback target drift", severity: "high", mitigation: "Preserve stable target ids" }] }],
        },
        {
          id: "n-ui",
          kind: "action",
          title: "Update target UI",
          blocks: [{ id: "b-ui-tasks", type: "task_list", items: [{ id: "t-target-labels", label: "Render graph target labels" }] }],
        },
      ],
      edges: [
        { id: "e-schema-adapter", from: "n-schema", to: "n-adapter", kind: "sequence" },
        { id: "e-adapter-ui", from: "n-adapter", to: "n-ui", kind: "sequence" },
      ],
    },
  ],
}) satisfies GraphPlanDocument;

export const prototypeReviewGraphPlanFixture = graphPlanDocumentSchema.parse({
  schemaVersion: "graph-plan/v1",
  id: "fixture-prototype-review",
  title: "대상 맥락을 드러내는 프로토타입 리뷰",
  goal: "프로토타입 탭 피드백이 그래프 대상 맥락과 함께 유지되는지 검증한다.",
  rootGraphId: "g-prototype-review",
  currentRevision: 1,
  graphs: [
    {
      id: "g-prototype-review",
      title: "프로토타입 리뷰",
      layout: { mode: "linear", order: ["n-review", "n-block-catalog", "n-accept"] },
      nodes: [
        {
          id: "n-review",
          kind: "review",
          title: "프로토타입 검토",
          ownedGraphIds: ["g-prototype-states"],
          blocks: [
            {
              id: "b-review",
              type: "review_bundle",
              prompt: "각 프로토타입 탭이 자신이 검증하는 그래프 대상을 드러내는가?",
              linkedTargets: [{ type: "node", graphId: "g-prototype-review", nodeId: "n-review" }],
              acceptanceCriteria: [{ id: "crit-context", label: "대상 맥락이 보인다" }],
              prototypeRef: {
                prototypeId: "proto-target-context",
                blockId: "b-prototype",
                target: { type: "block", graphId: "g-prototype-review", nodeId: "n-review", blockId: "b-prototype" },
              },
            },
            {
              id: "b-prototype",
              type: "prototype",
              prototypeId: "proto-target-context",
              revision: 1,
              tabs: [
                {
                  id: "tab-review",
                  title: "리뷰 UI",
                  url: "http://localhost:8787",
                  relatedTargets: [
                    {
                      target: { type: "block", graphId: "g-prototype-review", nodeId: "n-review", blockId: "b-review" },
                      purpose: "shows_state",
                      note: "대상 사이드바가 선택 target의 맥락을 보여준다.",
                    },
                    { target: { type: "node", graphId: "g-prototype-review", nodeId: "n-review" }, purpose: "validates" },
                  ],
                  context: { graphId: "g-prototype-review", nodeId: "n-review", blockId: "b-review" },
                },
              ],
            },
            {
              id: "b-state-flow",
              type: "graph_ref",
              graphId: "g-prototype-states",
              relationship: "prototype_state_flow",
              ownership: "owned",
            },
          ],
        },
        {
          id: "n-block-catalog",
          kind: "artifact",
          title: "전체 블록 카탈로그",
          summary: "가능한 모든 블록 타입과 채워진 샘플 컨텐츠",
          blocks: blockCatalogBlocks,
        },
        {
          id: "n-accept",
          kind: "checkpoint",
          title: "프로토타입 방향 승인",
          blocks: [{ id: "b-accept", type: "criteria", criteria: [{ id: "crit-thread", label: "탭 피드백 대화가 대상에 유지된다" }] }],
        },
      ],
      edges: [
        { id: "e-review-catalog", from: "n-review", to: "n-block-catalog", kind: "sequence" },
        { id: "e-catalog-accept", from: "n-block-catalog", to: "n-accept", kind: "sequence" },
      ],
    },
    {
      id: "g-prototype-states",
      title: "프로토타입 상태",
      owner: { graphId: "g-prototype-review", nodeId: "n-review", blockId: "b-state-flow" },
      layout: { mode: "linear", order: ["n-default", "n-tab-selected", "n-commenting"] },
      nodes: [
        { id: "n-default", kind: "artifact", title: "기본 상태", blocks: [{ id: "b-default", type: "text", body: "선택된 프로토타입 탭이 없다." }] },
        { id: "n-tab-selected", kind: "artifact", title: "탭 선택 상태", blocks: [{ id: "b-selected", type: "text", body: "사이드바가 탭의 연결 대상 경로를 표시한다." }] },
        {
          id: "n-commenting",
          kind: "review",
          title: "댓글 작성 상태",
          ownedGraphIds: ["g-comment-thread"],
          blocks: [
            { id: "b-commenting", type: "text", body: "피드백 작성기가 프로토타입 탭을 대상으로 삼는다." },
            {
              id: "b-comment-thread-flow",
              type: "graph_ref",
              graphId: "g-comment-thread",
              relationship: "decomposes_node",
              ownership: "owned",
            },
          ],
        },
      ],
      edges: [
        { id: "e-default-selected", from: "n-default", to: "n-tab-selected", kind: "conditional", label: "탭 클릭" },
        { id: "e-selected-commenting", from: "n-tab-selected", to: "n-commenting", kind: "conditional", label: "댓글 열림" },
      ],
    },
    {
      id: "g-comment-thread",
      title: "댓글 스레드 작성",
      owner: { graphId: "g-prototype-states", nodeId: "n-commenting", blockId: "b-comment-thread-flow" },
      layout: { mode: "linear", order: ["n-draft-comment", "n-submit-comment", "n-thread-visible"] },
      nodes: [
        {
          id: "n-draft-comment",
          kind: "action",
          title: "댓글 초안 작성",
          blocks: [
            { id: "b-draft-copy", type: "text", body: "선택된 프로토타입 탭과 그래프 target을 보면서 피드백 문장을 작성한다." },
            { id: "b-draft-checks", type: "checklist", items: [{ id: "check-target-visible", label: "작성 중 target breadcrumb가 보인다", required: true }] },
          ],
        },
        {
          id: "n-submit-comment",
          kind: "action",
          title: "댓글 제출",
          blocks: [{ id: "b-submit-task", type: "task_list", items: [{ id: "task-submit", label: "현재 선택 target으로 feedback event를 저장한다" }] }],
        },
        {
          id: "n-thread-visible",
          kind: "checkpoint",
          title: "스레드 표시 확인",
          blocks: [{ id: "b-thread-criteria", type: "criteria", criteria: [{ id: "crit-thread-target", label: "저장된 댓글이 같은 target thread 아래에 보인다" }] }],
        },
      ],
      edges: [
        { id: "e-draft-submit", from: "n-draft-comment", to: "n-submit-comment", kind: "sequence" },
        { id: "e-submit-visible", from: "n-submit-comment", to: "n-thread-visible", kind: "sequence" },
      ],
    },
  ],
}) satisfies GraphPlanDocument;

export const decisionBranchGraphPlanFixture = graphPlanDocumentSchema.parse({
  schemaVersion: "graph-plan/v1",
  id: "fixture-decision-branch",
  title: "Choose migration path",
  goal: "Select a migration path and expand the selected branch as a child graph.",
  rootGraphId: "g-decision",
  currentRevision: 1,
  graphs: [
    {
      id: "g-decision",
      title: "Migration decision",
      layout: { mode: "tree", order: ["n-choice", "n-adapter", "n-native"] },
      nodes: [
        {
          id: "n-choice",
          kind: "decision",
          title: "Choose strategy",
          blocks: [
            {
              id: "b-choice",
              type: "choice_set",
              question: "Which migration path should be expanded?",
              outputDefinitions: [{ key: "selectedOptionId", label: "Selected option", valueType: "single_choice" }],
              selectedOptionId: "opt-adapter",
              options: [
                {
                  id: "opt-adapter",
                  label: "Adapter first",
                  status: "selected",
                  downstreamGraphId: "g-adapter-plan",
                  downstreamTarget: { type: "graph", graphId: "g-adapter-plan" },
                },
                { id: "opt-native", label: "Native graph UI first", status: "candidate" },
              ],
            },
          ],
        },
        {
          id: "n-adapter",
          kind: "section",
          title: "Adapter-first branch",
          ownedGraphIds: ["g-adapter-plan"],
          blocks: [{ id: "b-adapter-plan", type: "graph_ref", graphId: "g-adapter-plan", relationship: "option_detail", ownership: "owned" }],
        },
        {
          id: "n-native",
          kind: "section",
          title: "Native graph UI branch",
          blocks: [{ id: "b-native-risk", type: "risk", risks: [{ id: "r-ui-churn", title: "UI churn", severity: "high" }] }],
        },
      ],
      edges: [
        {
          id: "e-choice-adapter",
          from: "n-choice",
          to: "n-adapter",
          kind: "conditional",
          label: "adapter selected",
          condition: {
            label: "selected option is adapter",
            source: { graphId: "g-decision", nodeId: "n-choice", blockId: "b-choice", outputKey: "selectedOptionId" },
            operator: "equals",
            value: "opt-adapter",
          },
        },
        { id: "e-choice-native", from: "n-choice", to: "n-native", kind: "conditional", label: "native selected" },
      ],
    },
    {
      id: "g-adapter-plan",
      title: "Adapter-first detail",
      owner: { graphId: "g-decision", nodeId: "n-adapter", blockId: "b-adapter-plan" },
      layout: { mode: "linear", order: ["n-map", "n-project", "n-roundtrip"] },
      nodes: [
        { id: "n-map", kind: "action", title: "Normalize graph targets", blocks: [{ id: "b-map", type: "task_list", items: [{ id: "t-graph-node", label: "Represent review work as graph nodes and blocks" }] }] },
        { id: "n-project", kind: "action", title: "Project graph to review UI", blocks: [{ id: "b-project", type: "task_list", items: [{ id: "t-project", label: "Render graph overview and node detail" }] }] },
        {
          id: "n-roundtrip",
          kind: "checkpoint",
          title: "Round-trip verification",
          blocks: [{ id: "b-roundtrip", type: "verification", checks: [{ id: "v-roundtrip", label: "Graph fixture round trips", mode: "test" }] }],
        },
      ],
      edges: [
        { id: "e-map-project", from: "n-map", to: "n-project", kind: "sequence" },
        { id: "e-project-roundtrip", from: "n-project", to: "n-roundtrip", kind: "sequence" },
      ],
    },
  ],
}) satisfies GraphPlanDocument;

export const graphPlanFixtures = [
  linearPhaseGraphPlanFixture,
  prototypeReviewGraphPlanFixture,
  decisionBranchGraphPlanFixture,
];

graphPlanFixtures.forEach(assertGraphPlanSemantics);
