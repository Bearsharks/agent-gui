import { graphPlanDocumentSchema, type GraphPlanDocument } from "./graphPlan";
import { assertGraphPlanSemantics } from "./graphPlanSemanticValidator";

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
  goal: "프로토타입 조각 피드백이 그래프 대상 맥락과 함께 유지되는지 검증한다.",
  rootGraphId: "g-prototype-review",
  currentRevision: 1,
  graphs: [
    {
      id: "g-prototype-review",
      title: "프로토타입 리뷰",
      layout: { mode: "linear", order: ["n-review", "n-accept"] },
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
              prompt: "각 프로토타입 조각이 자신이 검증하는 그래프 대상을 드러내는가?",
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
              tabs: [{ id: "tab-review", title: "리뷰 UI", url: "http://localhost:8787" }],
              pieces: [
                {
                  id: "piece-target-sidebar",
                  title: "대상 사이드바",
                  kind: "panel",
                  primaryTarget: { type: "block", graphId: "g-prototype-review", nodeId: "n-review", blockId: "b-review" },
                  validates: [{ type: "node", graphId: "g-prototype-review", nodeId: "n-review" }],
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
          id: "n-accept",
          kind: "checkpoint",
          title: "프로토타입 방향 승인",
          blocks: [{ id: "b-accept", type: "criteria", criteria: [{ id: "crit-thread", label: "조각 피드백 대화가 대상에 유지된다" }] }],
        },
      ],
      edges: [{ id: "e-review-accept", from: "n-review", to: "n-accept", kind: "sequence" }],
    },
    {
      id: "g-prototype-states",
      title: "프로토타입 상태",
      owner: { graphId: "g-prototype-review", nodeId: "n-review", blockId: "b-state-flow" },
      layout: { mode: "linear", order: ["n-default", "n-piece-selected", "n-commenting"] },
      nodes: [
        { id: "n-default", kind: "artifact", title: "기본 상태", blocks: [{ id: "b-default", type: "text", body: "선택된 프로토타입 조각이 없다." }] },
        { id: "n-piece-selected", kind: "artifact", title: "조각 선택 상태", blocks: [{ id: "b-selected", type: "text", body: "사이드바가 조각의 대상 경로를 표시한다." }] },
        { id: "n-commenting", kind: "review", title: "댓글 작성 상태", blocks: [{ id: "b-commenting", type: "text", body: "피드백 작성기가 프로토타입 조각을 대상으로 삼는다." }] },
      ],
      edges: [
        { id: "e-default-selected", from: "n-default", to: "n-piece-selected", kind: "conditional", label: "조각 클릭" },
        { id: "e-selected-commenting", from: "n-piece-selected", to: "n-commenting", kind: "conditional", label: "댓글 열림" },
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
