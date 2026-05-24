import { graphPlanFixtures } from "./graphPlanFixtures";
import { validateGraphPlanSemantics, type GraphPlanValidationIssue } from "./graphPlanSemanticValidator";

export type GraphPlanAdversarialFixture = {
  id: string;
  note: string;
  expectedIssueCodes: string[];
  issues: GraphPlanValidationIssue[];
};

export const graphPlanAdversarialFixtures: GraphPlanAdversarialFixture[] = [
  {
    id: "missing-subgraph",
    note: "Catches node.subGraphs references that do not resolve.",
    expectedIssueCodes: ["missing_subgraph"],
    issues: validateGraphPlanSemantics({
      ...structuredClone(graphPlanFixtures.linear),
      graphs: [
        {
          ...graphPlanFixtures.linear.graphs[0],
          nodes: [{ ...graphPlanFixtures.linear.graphs[0].nodes[0], subGraphs: ["g-missing"] }],
        },
      ],
    }),
  },
];
