import { graphPlanDocumentSchema, type GraphPlanDocument } from "./graphPlan";
import { validateGraphPlanSemantics, type GraphPlanValidationIssue } from "./graphPlanSemanticValidator";

export type AdversarialGraphPlanFixture = {
  id: string;
  title: string;
  document: GraphPlanDocument;
  expectedIssueCodes: string[];
  note: string;
};

const baseAdversarialDocument = graphPlanDocumentSchema.parse({
  schemaVersion: "graph-plan/v1",
  id: "fixture-adversarial-base",
  title: "Adversarial graph plan base",
  goal: "Provide a valid base document that negative fixtures can mutate.",
  rootGraphId: "g-root",
  currentRevision: 2,
  graphs: [
    {
      id: "g-root",
      title: "Root graph",
      layout: { mode: "dag", order: ["n-choice", "n-synthesis", "n-review"] },
      nodes: [
        {
          id: "n-choice",
          kind: "decision",
          title: "Choose option",
          ownedGraphIds: ["g-branch-a", "g-branch-b"],
          blocks: [
            {
              id: "b-choice",
              type: "choice_set",
              question: "Which branch should continue?",
              outputDefinitions: [{ key: "selectedOptionId", label: "Selected option", valueType: "single_choice", allowedValues: ["opt-a", "opt-b"] }],
              selectedOptionId: "opt-a",
              options: [
                {
                  id: "opt-a",
                  label: "Branch A",
                  status: "selected",
                  downstreamGraphId: "g-branch-a",
                  downstreamTarget: { type: "graph", graphId: "g-branch-a" },
                },
                {
                  id: "opt-b",
                  label: "Branch B",
                  status: "candidate",
                  downstreamGraphId: "g-branch-b",
                  downstreamTarget: { type: "graph", graphId: "g-branch-b" },
                },
              ],
            },
            {
              id: "b-branch-a",
              type: "graph_ref",
              graphId: "g-branch-a",
              relationship: "option_detail",
              ownership: "owned",
            },
            {
              id: "b-branch-b",
              type: "graph_ref",
              graphId: "g-branch-b",
              relationship: "option_detail",
              ownership: "owned",
            },
          ],
        },
        {
          id: "n-synthesis",
          kind: "checkpoint",
          title: "Synthesize evidence",
          blocks: [
            {
              id: "b-synthesis",
              type: "synthesis",
              joinPolicy: "all",
              sourceBranchRefs: [
                { type: "graph", graphId: "g-branch-a" },
                { type: "graph", graphId: "g-branch-b" },
              ],
              entries: [
                {
                  id: "finding-a",
                  finding: "Branch A evidence exists.",
                  evidenceRefs: [{ graphId: "g-branch-a", nodeId: "n-a", blockId: "b-a-evidence", itemId: "ev-a" }],
                },
                {
                  id: "finding-b",
                  finding: "Branch B evidence exists.",
                  evidenceRefs: [{ graphId: "g-branch-b", nodeId: "n-b", blockId: "b-b-evidence", itemId: "ev-b" }],
                },
              ],
            },
          ],
        },
        {
          id: "n-review",
          kind: "review",
          title: "Review changed targets",
          blocks: [
            {
              id: "b-changelog",
              type: "changelog",
              fromRevision: 1,
              toRevision: 2,
              entries: [
                {
                  id: "change-a",
                  summary: "Split branch A evidence into two targets.",
                  changedTargets: [{ type: "block", graphId: "g-branch-a", nodeId: "n-a", blockId: "b-a-evidence" }],
                  mappings: [
                    {
                      id: "map-a",
                      changeKind: "split",
                      previousTargets: [{ type: "block", graphId: "g-branch-a", nodeId: "n-a", blockId: "b-a-evidence" }],
                      newTargets: [
                        { type: "block_item", graphId: "g-branch-a", nodeId: "n-a", blockId: "b-a-evidence", itemId: "ev-a", itemType: "evidence" },
                        { type: "block", graphId: "g-branch-a", nodeId: "n-a", blockId: "b-a-risk" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      edges: [
        { id: "e-choice-synthesis", from: "n-choice", to: "n-synthesis", kind: "conditional" },
        { id: "e-synthesis-review", from: "n-synthesis", to: "n-review", kind: "sequence" },
      ],
    },
    {
      id: "g-branch-a",
      title: "Branch A",
      owner: { graphId: "g-root", nodeId: "n-choice", blockId: "b-branch-a" },
      nodes: [
        {
          id: "n-a",
          kind: "action",
          title: "Research A",
          blocks: [
            { id: "b-a-evidence", type: "evidence", items: [{ id: "ev-a", source: "agent-a", claim: "Branch A can work." }] },
            { id: "b-a-risk", type: "risk", risks: [{ id: "risk-a", title: "A risk", severity: "medium" }] },
          ],
        },
      ],
      edges: [],
    },
    {
      id: "g-branch-b",
      title: "Branch B",
      owner: { graphId: "g-root", nodeId: "n-choice", blockId: "b-branch-b" },
      nodes: [
        {
          id: "n-b",
          kind: "action",
          title: "Research B",
          blocks: [{ id: "b-b-evidence", type: "evidence", items: [{ id: "ev-b", source: "agent-b", claim: "Branch B can work." }] }],
        },
      ],
      edges: [],
    },
  ],
}) satisfies GraphPlanDocument;

function makeAdversarialDocument(mutator: (document: GraphPlanDocument) => void): GraphPlanDocument {
  const document = graphPlanDocumentSchema.parse(JSON.parse(JSON.stringify(baseAdversarialDocument))) satisfies GraphPlanDocument;
  mutator(document);
  return graphPlanDocumentSchema.parse(document) satisfies GraphPlanDocument;
}

export const adversarialGraphPlanFixtures: AdversarialGraphPlanFixture[] = [
  {
    id: "missing-root-graph",
    title: "Root graph id points to a missing graph",
    note: "Catches top-level navigation failures before UI rendering.",
    expectedIssueCodes: ["missing_root_graph"],
    document: makeAdversarialDocument((document) => {
      document.rootGraphId = "g-missing-root";
    }),
  },
  {
    id: "broken-edge-target",
    title: "Edge points to a missing node",
    note: "Catches graph topology drift after node deletion.",
    expectedIssueCodes: ["missing_edge_to"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].edges[0].to = "n-deleted";
    }),
  },
  {
    id: "owned-graph-owner-mismatch",
    title: "Owned graph owner points back to the wrong block",
    note: "Catches fractal ownership drift between graph_ref and child graph owner.",
    expectedIssueCodes: ["graph_ref_owner_mismatch"],
    document: makeAdversarialDocument((document) => {
      document.graphs[1].owner = { graphId: "g-root", nodeId: "n-choice", blockId: "b-branch-b" };
    }),
  },
  {
    id: "selected-choice-missing-and-status-drift",
    title: "Choice selectedOptionId is missing and visible status disagrees",
    note: "Catches branch activation inconsistency in decision plans.",
    expectedIssueCodes: ["missing_selected_option"],
    document: makeAdversarialDocument((document) => {
      const choice = document.graphs[0].nodes[0].blocks[0];
      if (choice.type !== "choice_set") return;
      choice.selectedOptionId = "opt-deleted";
      choice.options[0].status = "candidate";
    }),
  },
  {
    id: "comparison-score-broken-refs",
    title: "Comparison score references missing option, criterion, and evidence",
    note: "Catches option comparison rows that look valid but score the wrong entities.",
    expectedIssueCodes: ["missing_score_option", "missing_score_criterion", "missing_evidence_ref"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].nodes[0].blocks.push({
        id: "b-comparison",
        type: "comparison",
        selectedOptionId: "opt-a",
        criteria: [{ id: "crit-cost", label: "Cost", required: true, status: "pending" }],
        options: [{ id: "opt-a", label: "Branch A", status: "selected", activation: "selected" }],
        scores: [
          {
            id: "score-bad",
            optionId: "opt-deleted",
            criterionId: "crit-deleted",
            rating: "high",
            evidenceRefs: [{ graphId: "g-branch-a", nodeId: "n-a", blockId: "b-a-evidence", itemId: "ev-deleted" }],
          },
        ],
      });
    }),
  },
  {
    id: "synthesis-misses-required-branch-evidence",
    title: "Fan-in joinPolicy all does not cite every branch",
    note: "Catches fan-out/fan-in plans where one branch silently disappears from the synthesis.",
    expectedIssueCodes: ["synthesis_missing_branch_evidence"],
    document: makeAdversarialDocument((document) => {
      const synthesis = document.graphs[0].nodes[1].blocks[0];
      if (synthesis.type !== "synthesis") return;
      synthesis.entries = synthesis.entries.filter((entry) => entry.id !== "finding-b");
    }),
  },
  {
    id: "changelog-split-cardinality-and-missing-target",
    title: "Changelog split has too few new targets and points to a deleted target",
    note: "Catches review/revision target lineage that cannot explain what replaced what.",
    expectedIssueCodes: ["split_mapping_new_count", "missing_target_block"],
    document: makeAdversarialDocument((document) => {
      const changelog = document.graphs[0].nodes[2].blocks[0];
      if (changelog.type !== "changelog") return;
      const mapping = changelog.entries[0].mappings?.[0];
      if (!mapping) return;
      mapping.newTargets = [{ type: "block", graphId: "g-branch-a", nodeId: "n-a", blockId: "b-deleted" }];
    }),
  },
  {
    id: "investigation-experiment-broken-procedure",
    title: "Experiment references a missing hypothesis and procedure graph",
    note: "Catches debugging loops whose experiment no longer belongs to a valid hypothesis branch.",
    expectedIssueCodes: ["missing_experiment_hypothesis", "missing_experiment_procedure_graph", "missing_target_graph"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].nodes.push({
        id: "n-debug",
        kind: "action",
        title: "Debug failure",
        blocks: [
          {
            id: "b-investigation",
            type: "investigation",
            hypotheses: [{ id: "hyp-a", statement: "Failure comes from target drift.", status: "open" }],
            experiments: [
              {
                id: "exp-a",
                hypothesisId: "hyp-deleted",
                procedure: "Run nested inspection.",
                procedureGraphId: "g-missing-procedure",
                procedureTarget: { type: "graph", graphId: "g-missing-procedure" },
                result: "pending",
              },
            ],
            observations: [],
            outcomes: [],
            exitCondition: "A root cause is confirmed.",
          },
        ],
      });
    }),
  },
  {
    id: "migration-verification-target-missing",
    title: "Migration step verification target points to a missing check",
    note: "Catches migration plans whose rollout gate cannot be resolved.",
    expectedIssueCodes: ["missing_target_block_item"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].nodes.push({
        id: "n-migration",
        kind: "action",
        title: "Migrate",
        blocks: [
          {
            id: "b-migration",
            type: "migration",
            fromVersion: "step-plan/v1",
            toVersion: "graph-plan/v1",
            affectedSurfaces: ["review-ui"],
            compatibilityStrategy: "dual-read",
            rollbackScope: "phase",
            rollbackPlan: "Return to step projection.",
            verificationGate: "typecheck",
            steps: [
              {
                id: "mig-a",
                label: "Switch adapter",
                verificationTargets: [
                  {
                    type: "block_item",
                    graphId: "g-root",
                    nodeId: "n-migration",
                    blockId: "b-verification",
                    itemId: "v-missing",
                    itemType: "verification",
                  },
                ],
              },
            ],
          },
        ],
      });
    }),
  },
  {
    id: "prototype-piece-primary-target-missing",
    title: "Prototype piece validates a deleted block",
    note: "Catches prototype review feedback that cannot attach to a stable plan target.",
    expectedIssueCodes: ["missing_target_block"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].nodes[2].blocks.push({
        id: "b-prototype",
        type: "prototype",
        prototypeId: "proto-adversarial",
        tabs: [{ id: "tab-root", title: "Root", url: "http://localhost:8787" }],
        pieces: [
          {
            id: "piece-deleted",
            title: "Deleted target piece",
            kind: "panel",
            primaryTarget: { type: "block", graphId: "g-root", nodeId: "n-review", blockId: "b-deleted" },
            validates: [],
          },
        ],
      });
    }),
  },
  {
    id: "target-item-type-mismatch-and-untyped-evidence",
    title: "Target item type disagrees and evidence ref is untyped",
    note: "Catches subtle authoring errors that are still resolvable but semantically weak.",
    expectedIssueCodes: ["target_block_item_type_mismatch", "untyped_evidence_ref"],
    document: makeAdversarialDocument((document) => {
      const changelog = document.graphs[0].nodes[2].blocks[0];
      if (changelog.type !== "changelog") return;
      const mapping = changelog.entries[0].mappings?.[0];
      if (!mapping) return;
      mapping.newTargets = [
        {
          type: "block_item",
          graphId: "g-branch-a",
          nodeId: "n-a",
          blockId: "b-a-evidence",
          itemId: "ev-a",
          itemType: "risk",
        },
        { type: "block", graphId: "g-branch-a", nodeId: "n-a", blockId: "b-a-risk" },
      ];
      const synthesis = document.graphs[0].nodes[1].blocks[0];
      if (synthesis.type !== "synthesis") return;
      synthesis.entries[0].evidenceRefs.push("legacy-untyped-evidence-id");
    }),
  },
  {
    id: "condition-output-key-not-defined",
    title: "Conditional edge references an undefined block output",
    note: "Catches branch conditions that guess outputKey names instead of using block outputDefinitions.",
    expectedIssueCodes: ["missing_output_definition"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].edges[0].condition = {
        label: "Bad selected option output",
        source: { graphId: "g-root", nodeId: "n-choice", blockId: "b-choice", outputKey: "selectedOption" },
        operator: "equals",
        value: "opt-a",
      };
    }),
  },
  {
    id: "duplicate-output-definition",
    title: "Block declares the same output key twice",
    note: "Catches ambiguous output contracts before conditions depend on them.",
    expectedIssueCodes: ["duplicate_output_definition"],
    document: makeAdversarialDocument((document) => {
      const choice = document.graphs[0].nodes[0].blocks[0];
      if (choice.type !== "choice_set") return;
      choice.outputDefinitions = [
        { key: "selectedOptionId", valueType: "single_choice" },
        { key: "selectedOptionId", valueType: "string" },
      ];
    }),
  },
  {
    id: "artifact-range-invalid",
    title: "Artifact range has a reversed line range",
    note: "Catches file/document target ranges whose coordinates are internally invalid.",
    expectedIssueCodes: ["invalid_artifact_line_range"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].nodes[2].blocks.push({
        id: "b-artifact",
        type: "artifact",
        artifacts: [{ id: "artifact-a", kind: "file", title: "Schema", ref: "packages/plan-schema/src/graphPlan.ts" }],
        links: [
          {
            purpose: "explains",
            target: {
              type: "artifact_range",
              graphId: "g-root",
              nodeId: "n-review",
              blockId: "b-artifact",
              artifactId: "artifact-a",
              path: "packages/plan-schema/src/graphPlan.ts",
              lineStart: 20,
              lineEnd: 10,
            },
          },
        ],
      });
    }),
  },
  {
    id: "condition-value-not-allowed",
    title: "Condition compares against a value outside allowedValues",
    note: "Catches branch conditions that name an option not declared by the output contract.",
    expectedIssueCodes: ["condition_value_not_allowed"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].edges[0].condition = {
        source: { graphId: "g-root", nodeId: "n-choice", blockId: "b-choice", outputKey: "selectedOptionId" },
        operator: "equals",
        value: "opt-deleted",
      };
    }),
  },
  {
    id: "condition-operator-type-mismatch",
    title: "Numeric condition points at a single_choice output",
    note: "Catches invalid numeric comparisons before runtime evaluation.",
    expectedIssueCodes: ["condition_operator_type_mismatch"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].edges[0].condition = {
        source: { graphId: "g-root", nodeId: "n-choice", blockId: "b-choice", outputKey: "selectedOptionId" },
        operator: "greater_than",
        value: 0,
      };
    }),
  },
  {
    id: "graph-ref-binding-type-mismatch",
    title: "Graph ref binding source type does not match child input contract",
    note: "Catches child graph boundary bindings that resolve but pass the wrong value type.",
    expectedIssueCodes: ["graph_contract_binding_type_mismatch"],
    document: makeAdversarialDocument((document) => {
      document.graphs[1].contract = { inputs: [{ key: "selectedOptionId", valueType: "number", required: true }] };
      const graphRef = document.graphs[0].nodes[0].blocks[1];
      if (graphRef.type !== "graph_ref") return;
      graphRef.inputBindings = [
        {
          key: "selectedOptionId",
          source: { graphId: "g-root", nodeId: "n-choice", blockId: "b-choice", outputKey: "selectedOptionId" },
        },
      ];
    }),
  },
  {
    id: "empty-graph-contract-binding",
    title: "Graph ref binding declares a key but no source or target",
    note: "Catches boundary bindings that look explicit but do not actually bind data.",
    expectedIssueCodes: ["empty_graph_contract_binding"],
    document: makeAdversarialDocument((document) => {
      document.graphs[1].contract = { inputs: [{ key: "requiredInput", valueType: "string", required: true }] };
      const graphRef = document.graphs[0].nodes[0].blocks[1];
      if (graphRef.type !== "graph_ref") return;
      graphRef.inputBindings = [{ key: "requiredInput" }];
    }),
  },
  {
    id: "graph-contract-output-not-produced",
    title: "Graph contract declares an output with no internal producer",
    note: "Catches graph boundaries whose outputs are advertised but cannot be traced to a block output.",
    expectedIssueCodes: ["graph_contract_output_not_produced"],
    document: makeAdversarialDocument((document) => {
      document.graphs[1].contract = { outputs: [{ key: "branchReady", valueType: "boolean", required: true }] };
    }),
  },
  {
    id: "graph-ref-output-binding-target-output-missing",
    title: "Graph ref output binding targets a block that does not declare the mapped output",
    note: "Catches child output mappings that stop at a block but do not identify a compatible parent output slot.",
    expectedIssueCodes: ["graph_contract_binding_target_output_missing"],
    document: makeAdversarialDocument((document) => {
      document.graphs[1].contract = { outputs: [{ key: "branchReady", valueType: "boolean", required: true }] };
      const graphRef = document.graphs[0].nodes[0].blocks[1];
      if (graphRef.type !== "graph_ref") return;
      graphRef.outputBindings = [
        {
          key: "branchReady",
          target: { type: "block", graphId: "g-root", nodeId: "n-choice", blockId: "b-choice" },
        },
      ];
    }),
  },
  {
    id: "artifact-range-path-mismatch",
    title: "Artifact range path disagrees with artifact ref",
    note: "Catches artifact range targets that point at the right artifact id but a different file path.",
    expectedIssueCodes: ["artifact_range_path_mismatch"],
    document: makeAdversarialDocument((document) => {
      document.graphs[0].nodes[2].blocks.push({
        id: "b-artifact-path",
        type: "artifact",
        artifacts: [{ id: "artifact-path-a", kind: "file", title: "Schema", ref: "packages/plan-schema/src/graphPlan.ts" }],
        links: [
          {
            purpose: "explains",
            target: {
              type: "artifact_range",
              graphId: "g-root",
              nodeId: "n-review",
              blockId: "b-artifact-path",
              artifactId: "artifact-path-a",
              path: "packages/plan-schema/src/other.ts",
              lineStart: 1,
              lineEnd: 2,
            },
          },
        ],
      });
    }),
  },
];

export function validateAdversarialGraphPlanFixtures(): Array<{
  fixture: AdversarialGraphPlanFixture;
  issues: GraphPlanValidationIssue[];
}> {
  return adversarialGraphPlanFixtures.map((fixture) => {
    const issues = validateGraphPlanSemantics(fixture.document);
    const issueCodes = new Set(issues.map((issue) => issue.code));
    const missingCodes = fixture.expectedIssueCodes.filter((code) => !issueCodes.has(code));
    if (missingCodes.length > 0) {
      throw new Error(`Adversarial fixture '${fixture.id}' did not trigger expected issue codes: ${missingCodes.join(", ")}`);
    }
    return { fixture, issues };
  });
}

validateAdversarialGraphPlanFixtures();
