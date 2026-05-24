import { graphPlanDocumentSchema, type GraphPlanDocument } from "./graphPlan";
import { assertGraphPlanSemantics } from "./graphPlanSemanticValidator";

const prototypeBaseUrl = "http://localhost:8787/prototypes";

export const linearPhaseGraphPlanFixture = graphPlanDocumentSchema.parse({
  schemaVersion: "graph-plan/v1",
  id: "fixture-linear-phase",
  title: "블로그 검색 경험 개선 계획",
  markdownDesc: "요구 확인부터 배포 준비까지 검색 경험 개선 흐름을 검토한다.",
  rootGraphId: "g-search-plan",
  currentRevision: 1,
  graphs: [
    {
      id: "g-search-plan",
      title: "검색 개선 전체 흐름",
      markdownDesc: "요구 확인, 설계, 구현, 검증, 배포 준비 단계",
      nodes: [
        node("n-requirements", "요구 확인", "검색 사용자의 현재 문제와 개선 목표를 확인한다.", "linear-requirements.html"),
        node("n-design", "설계", "검색 입력, 결과 표시, 필터, 빈 상태의 설계를 정리한다.", "linear-design.html"),
        {
          ...node("n-implementation", "구현", "검색 UI와 동작을 구현한다.", "linear-implementation.html"),
          subGraphs: ["g-search-implementation"],
        },
        node("n-verification", "검증", "검색 흐름, 접근성, 빈 상태, 회귀 테스트를 확인한다.", "linear-verification.html"),
        node("n-release", "배포 준비", "릴리즈 노트와 롤백 기준을 정리한다.", "linear-release.html"),
      ],
      edges: [
        edge("e-requirements-design", "n-requirements", "n-design"),
        edge("e-design-implementation", "n-design", "n-implementation"),
        edge("e-implementation-verification", "n-implementation", "n-verification"),
        edge("e-verification-release", "n-verification", "n-release"),
      ],
    },
    {
      id: "g-search-implementation",
      title: "구현 세부 작업",
      markdownDesc: "검색 구현 노드의 하위 작업 흐름",
      parent: { graphId: "g-search-plan", nodeId: "n-implementation" },
      nodes: [
        node("n-search-input", "검색 입력 UI", "검색어 입력, clear action, focus 상태를 구현한다.", "linear-input.html"),
        node("n-result-filtering", "결과 필터링", "카테고리와 정렬 필터를 검색 결과와 연결한다.", "linear-filtering.html"),
        node("n-empty-state", "빈 상태", "결과 없음 안내와 다음 행동을 제공한다.", "linear-empty-state.html"),
        node("n-accessibility", "접근성 점검", "키보드 이동, label, live region을 확인한다.", "linear-accessibility.html"),
      ],
      edges: [
        edge("e-input-filtering", "n-search-input", "n-result-filtering"),
        edge("e-filtering-empty", "n-result-filtering", "n-empty-state"),
        edge("e-empty-accessibility", "n-empty-state", "n-accessibility"),
      ],
    },
  ],
});

export const prototypeReviewGraphPlanFixture = graphPlanDocumentSchema.parse({
  schemaVersion: "graph-plan/v1",
  id: "fixture-prototype-review",
  title: "새 검색 패널 프로토타입 리뷰",
  markdownDesc: "검색 패널 프로토타입을 상태별로 검토하고 피드백을 수집한다.",
  rootGraphId: "g-prototype-review",
  currentRevision: 1,
  graphs: [
    {
      id: "g-prototype-review",
      title: "프로토타입 리뷰 흐름",
      markdownDesc: "리뷰 목표, 프로토타입 확인, 피드백 수집, 승인 여부 결정",
      nodes: [
        node("n-review-goal", "리뷰 목표", "검색 패널 프로토타입에서 확인할 질문과 승인 기준을 정한다.", "prototype-goal.html"),
        {
          ...node("n-prototype-check", "프로토타입 확인", "검색 패널 상태별 화면을 확인한다.", "prototype-panel.html"),
          subGraphs: ["g-prototype-states"],
        },
        node("n-feedback", "피드백 수집", "사용자가 상태별로 남긴 피드백을 정리한다.", "prototype-feedback.html"),
        node("n-approval", "승인 여부 결정", "승인, 보류, 재수정 중 다음 결정을 내린다.", "prototype-approval.html"),
      ],
      edges: [
        edge("e-goal-check", "n-review-goal", "n-prototype-check"),
        edge("e-check-feedback", "n-prototype-check", "n-feedback"),
        edge("e-feedback-approval", "n-feedback", "n-approval"),
      ],
    },
    {
      id: "g-prototype-states",
      title: "검색 패널 상태",
      markdownDesc: "리뷰 가능한 검색 패널 화면 상태",
      parent: { graphId: "g-prototype-review", nodeId: "n-prototype-check" },
      nodes: [
        node("n-default-state", "기본 상태", "검색 전 기본 패널 상태를 검토한다.", "prototype-default.html"),
        node("n-query-state", "검색어 입력 상태", "검색어가 입력된 상태와 suggestion 표시를 검토한다.", "prototype-query.html"),
        node("n-results-state", "결과 있음 상태", "검색 결과 밀도, 필터, 정렬 상태를 검토한다.", "prototype-results.html"),
        node("n-empty-state", "결과 없음 상태", "빈 상태 설명과 다음 행동을 검토한다.", "prototype-empty.html"),
      ],
      edges: [
        edge("e-default-query", "n-default-state", "n-query-state"),
        edge("e-query-results", "n-query-state", "n-results-state", "conditional", "검색 결과 있음"),
        edge("e-query-empty", "n-query-state", "n-empty-state", "conditional", "검색 결과 없음"),
      ],
    },
  ],
});

export const reviewRevisionLoopGraphPlanFixture = graphPlanDocumentSchema.parse({
  schemaVersion: "graph-plan/v1",
  id: "fixture-review-revision-loop",
  title: "검색 패널 피드백 수정 루프",
  markdownDesc: "결과 밀도와 빈 상태 설명 피드백을 반영하고 재검토한다.",
  rootGraphId: "g-revision-loop",
  currentRevision: 1,
  graphs: [
    {
      id: "g-revision-loop",
      title: "리뷰/수정 루프",
      markdownDesc: "피드백 접수부터 승인 또는 재수정까지 반복되는 흐름",
      nodes: [
        node("n-feedback-received", "피드백 접수", "결과가 조밀하고 빈 상태 설명이 부족하다는 피드백을 접수한다.", "revision-feedback.html"),
        node("n-impact-analysis", "영향 분석", "결과 밀도, 빈 상태 카피, 프로토타입 HTML 영향 범위를 확인한다.", "revision-impact.html"),
        {
          ...node("n-revision-draft", "수정안 작성", "결과 밀도와 빈 상태 설명을 반영한 수정안을 만든다.", "revision-draft.html"),
          subGraphs: ["g-revision-work"],
        },
        node("n-revision-review", "수정 결과 리뷰", "이전/이후 비교와 남은 리뷰 질문을 확인한다.", "revision-review.html"),
        node("n-approval-or-rework", "승인 또는 재수정", "승인하거나 수정안 작성으로 되돌린다.", "revision-decision.html"),
      ],
      edges: [
        edge("e-feedback-impact", "n-feedback-received", "n-impact-analysis"),
        edge("e-impact-draft", "n-impact-analysis", "n-revision-draft"),
        edge("e-draft-review", "n-revision-draft", "n-revision-review"),
        edge("e-review-decision", "n-revision-review", "n-approval-or-rework"),
        edge("e-rework-draft", "n-approval-or-rework", "n-revision-draft", "loop", "needs revision", "사용자가 추가 수정을 요청함"),
      ],
    },
    {
      id: "g-revision-work",
      title: "수정안 작성 세부 작업",
      markdownDesc: "피드백 반영을 위한 세부 작업 흐름",
      parent: { graphId: "g-revision-loop", nodeId: "n-revision-draft" },
      nodes: [
        node("n-density", "결과 밀도 조정", "검색 결과 간격과 정보 밀도를 조정한다.", "revision-density.html"),
        node("n-empty-copy", "빈 상태 카피 개선", "결과 없음 설명과 다음 행동 문구를 개선한다.", "revision-empty-copy.html"),
        node("n-html-update", "프로토타입 HTML 갱신", "상태별 프로토타입 HTML을 수정한다.", "revision-html-update.html"),
        node("n-regression", "회귀 확인", "수정 후 기본/결과/빈 상태가 깨지지 않는지 확인한다.", "revision-regression.html"),
      ],
      edges: [
        edge("e-density-copy", "n-density", "n-empty-copy"),
        edge("e-copy-html", "n-empty-copy", "n-html-update"),
        edge("e-html-regression", "n-html-update", "n-regression"),
      ],
    },
  ],
});

export const graphPlanFixtures = {
  linear: linearPhaseGraphPlanFixture,
  prototype: prototypeReviewGraphPlanFixture,
  revision: reviewRevisionLoopGraphPlanFixture,
} satisfies Record<string, GraphPlanDocument>;

for (const fixture of Object.values(graphPlanFixtures)) assertGraphPlanSemantics(fixture);

function node(id: string, title: string, markdownDesc: string, htmlFile: string) {
  const previewFile = htmlFile.startsWith("linear")
    ? "graph-linear-rollout.html"
    : htmlFile.startsWith("prototype")
      ? "graph-prototype-target-context.html"
      : "graph-revision-loop.html";
  return {
    id,
    title,
    markdownDesc: nodeMarkdownDesc(markdownDesc),
    iframes: [
      {
        id: `iframe-${id.replace(/^n-/, "")}`,
        description: `${title} 상세 화면`,
        url: `${prototypeBaseUrl}/${previewFile}?node=${id}`,
      },
    ],
  };
}

function nodeMarkdownDesc(summary: string): string {
  return [
    summary,
    "",
    "### 확인할 내용",
    "",
    "- 그래프의 현재 단계와 다음 흐름이 자연스러운지 확인한다.",
    "- 연결된 iframe 상세 화면에서 판단에 필요한 화면 상태를 검토한다.",
    "- 피드백이 필요하면 node 또는 iframe target에 남긴다.",
  ].join("\n");
}

function edge(id: string, from: string, to: string, kind: "sequence" | "conditional" | "loop" | "dependency" = "sequence", label?: string, condition?: string) {
  return { id, from, to, kind, label, condition };
}
