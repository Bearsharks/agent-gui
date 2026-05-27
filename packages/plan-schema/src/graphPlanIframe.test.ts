import { graphPlanDocumentSchema, type GraphPlanDocument } from "./graphPlan";
import { validateGraphPlanSemantics } from "./graphPlanSemanticValidator";

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
}

function basePlan(node: GraphPlanDocument["graphs"][number]["nodes"][number]): GraphPlanDocument {
  return graphPlanDocumentSchema.parse(rawPlan(node));
}

function rawPlan(node: unknown) {
  return {
    schemaVersion: "graph-plan/v1",
    id: "iframe-test-plan",
    title: "Iframe test plan",
    rootGraphId: "g-root",
    currentRevision: 1,
    graphs: [{ id: "g-root", title: "Root", nodes: [node], edges: [] }],
  };
}

function reviewNode(overrides: Partial<GraphPlanDocument["graphs"][number]["nodes"][number]> = {}) {
  return {
    id: "n-review",
    title: "Review",
    markdownDesc: "Review node",
    iframes: [{ id: "preview", description: "Fixture app preview", url: "http://localhost:8787/review" }],
    ...overrides,
  };
}

{
  const plan = basePlan(reviewNode());
  assertEqual(validateGraphPlanSemantics(plan).length, 0);
}

{
  const plan = basePlan(
    reviewNode({
      iframes: [{ id: "preview", description: "Fixture app preview", url: "http://localhost:8787/review", entryPath: "previews/review.tsx" }],
    }),
  );
  assertEqual(plan.graphs[0].nodes[0].iframes?.[0]?.entryPath, "previews/review.tsx");
}

{
  const plan = basePlan(
    reviewNode({
      iframes: [
        { id: "preview", description: "Fixture app preview", url: "http://localhost:8787/review" },
        { id: "preview", description: "Duplicate preview", url: "http://127.0.0.1:8787/review" },
      ],
    }),
  );
  assertEqual(validateGraphPlanSemantics(plan).some((issue) => issue.code === "duplicate_iframe_id"), true);
}

assertEqual(
  graphPlanDocumentSchema.safeParse(
    rawPlan(reviewNode({ iframes: [{ id: "preview", description: "External app", url: "https://example.com/review" }] })),
  ).success,
  false,
);

assertEqual(
  graphPlanDocumentSchema.safeParse(
    rawPlan(reviewNode({ iframes: [{ id: "preview", description: "Local file", url: "file:///tmp/review.html" }] })),
  ).success,
  false,
);

assertEqual(
  graphPlanDocumentSchema.safeParse(
    rawPlan(reviewNode({ iframes: [{ id: "preview", description: "Fixture app preview", url: "http://localhost:8787/review", entryPath: "" }] })),
  ).success,
  false,
);

{
  const plan = graphPlanDocumentSchema.parse({
    schemaVersion: "graph-plan/v1",
    id: "subgraph-test-plan",
    title: "Subgraph test plan",
    rootGraphId: "g-root",
    currentRevision: 1,
    graphs: [
      {
        id: "g-root",
        title: "Root",
        nodes: [{ id: "n-parent", title: "Parent", subGraphs: ["g-child"] }],
        edges: [],
      },
      {
        id: "g-child",
        title: "Child",
        parent: { graphId: "g-root", nodeId: "n-other" },
        nodes: [],
        edges: [],
      },
    ],
  });
  assertEqual(validateGraphPlanSemantics(plan).some((issue) => issue.code === "subgraph_parent_mismatch"), true);
}
