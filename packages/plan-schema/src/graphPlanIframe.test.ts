import { graphPlanDocumentSchema, type GraphPlanDocument } from "./graphPlan";
import { validateGraphPlanSemantics } from "./graphPlanSemanticValidator";

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function planWithNode(node: GraphPlanDocument["graphs"][number]["nodes"][number]): GraphPlanDocument {
  return graphPlanDocumentSchema.parse({
    schemaVersion: "graph-plan/v1",
    id: "iframe-test-plan",
    title: "Iframe test plan",
    goal: "Validate iframe schema and targets",
    rootGraphId: "g-root",
    currentRevision: 1,
    graphs: [
      {
        id: "g-root",
        title: "Root",
        nodes: [node],
        edges: [],
      },
    ],
  });
}

function nodeWithIframe(overrides: Partial<GraphPlanDocument["graphs"][number]["nodes"][number]> = {}): GraphPlanDocument["graphs"][number]["nodes"][number] {
  return {
    id: "n-review",
    kind: "review",
    title: "Review",
    iframes: [{ id: "preview", description: "Fixture app preview", url: "http://localhost:8787/review" }],
    blocks: [
      {
        id: "b-task",
        type: "task_list",
        items: [{ id: "t-preview", label: "Review preview", target: { type: "iframe", graphId: "g-root", nodeId: "n-review", iframeId: "preview" } }],
      },
    ],
    ...overrides,
  };
}

function rawPlanWithNode(node: GraphPlanDocument["graphs"][number]["nodes"][number]): unknown {
  return {
    schemaVersion: "graph-plan/v1",
    id: "iframe-test-plan",
    title: "Iframe test plan",
    goal: "Validate iframe schema and targets",
    rootGraphId: "g-root",
    currentRevision: 1,
    graphs: [
      {
        id: "g-root",
        title: "Root",
        nodes: [node],
        edges: [],
      },
    ],
  };
}

{
  const plan = planWithNode(nodeWithIframe());
  assertEqual(validateGraphPlanSemantics(plan).length, 0);
}

{
  const plan = planWithNode(
    nodeWithIframe({
      iframes: [
        { id: "preview", description: "Fixture app preview", url: "http://localhost:8787/review" },
        { id: "preview", description: "Duplicate preview", url: "http://127.0.0.1:8787/review" },
      ],
    }),
  );
  assertEqual(validateGraphPlanSemantics(plan).some((issue) => issue.code === "duplicate_iframe_id"), true);
}

assertEqual(
  graphPlanDocumentSchema.safeParse(rawPlanWithNode(nodeWithIframe({ iframes: [{ id: "preview", description: "External app", url: "https://example.com/review" }] }))).success,
  false,
);

assertEqual(
  graphPlanDocumentSchema.safeParse(rawPlanWithNode(nodeWithIframe({ iframes: [{ id: "preview", description: "Local file", url: "file:///tmp/review.html" }] }))).success,
  false,
);

{
  const plan = planWithNode(
    nodeWithIframe({
      blocks: [
        {
          id: "b-task",
          type: "task_list",
          items: [{ id: "t-preview", label: "Review preview", target: { type: "iframe", graphId: "g-root", nodeId: "n-review", iframeId: "missing" } }],
        },
      ],
    }),
  );
  assertEqual(validateGraphPlanSemantics(plan).some((issue) => issue.code === "missing_target_iframe"), true);
}
