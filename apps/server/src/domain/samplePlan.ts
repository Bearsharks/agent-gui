import type { PlanDraft } from "@agent-gui/plan-schema";

export function fixturePlan(): PlanDraft {
  return {
    title: "Review Target App UX Plan",
    goal: "Map user feedback, plan revisions, and prototype pieces for the review target app.",
    summary: "A realistic fixture plan for validating the browser-based plan review loop.",
    decisions: [
      {
        id: "decision-runtime",
        title: "Use session-scoped prototype artifacts",
        summary: "Prototype code and state live as session artifacts while plan JSON stores links and code refs.",
        rationale: "Keeps plan revisions traceable without bloating the plan document.",
      },
    ],
    phases: [
      {
        id: "phase-review",
        title: "Review workflow",
        summary: "Inspect the fixture app and refine the UX plan.",
        stepIds: ["step-inspect", "step-prototype", "step-verify"],
      },
    ],
    steps: [
      {
        id: "step-inspect",
        phaseId: "phase-review",
        title: "Inspect fixture review surface",
        kind: "research",
        summary: "Read the fixture app review surface and identify UX risks.",
        files: ["fixtures/review-target-app/src/ux/ReviewSurface.tsx"],
        verification: ["Confirm the request list and selected request panels are visible."],
      },
      {
        id: "step-prototype",
        phaseId: "phase-review",
        title: "Prototype approval action pieces",
        kind: "code",
        summary: "Create independent prototype pieces for the risk panel and approval action bar.",
        files: ["data/sessions/{sessionId}/prototypes/pieces/*"],
        risks: ["Prototype piece mapping can become unclear if links are not shown in both directions."],
        verification: ["Open the prototype iframe and confirm piece-to-step links are visible."],
      },
      {
        id: "step-verify",
        phaseId: "phase-review",
        title: "Verify feedback and revision loop",
        kind: "test",
        summary: "Use browser feedback, agent reply, targeted revision update, and approval.",
        verification: ["Feedback appears under the original target.", "Revision and prototype changes update without refresh."],
      },
    ],
    risks: [
      {
        id: "risk-mapping",
        title: "Prototype mapping ambiguity",
        severity: "medium",
        description: "Users may not understand which plan step a prototype piece validates.",
        mitigation: "Show prototype and piece links in both step details and the prototype panel.",
      },
    ],
    verification: ["Browser E2E with fixture project", "MCP event round trip", "Prototype iframe immediate update"],
    prototypes: [
      {
        id: "proto-review-actions",
        revision: 1,
        title: "Review action prototype",
        summary: "Composition of independent pieces for request risk and approval actions.",
        kind: "interaction",
        links: [{ target: { type: "step", id: "step-prototype" }, purpose: "validates" }],
        codeRef: { type: "session_artifact", path: "prototypes/proto-review-actions.tsx" },
        state: { selectedRequest: "req-191" },
        pieces: [
          {
            id: "piece-risk-panel",
            title: "Risk panel",
            kind: "panel",
            summary: "Explains why a selected request needs extra review.",
            links: [{ target: { type: "step", id: "step-prototype" }, purpose: "explains" }],
            codeRef: { type: "session_artifact", path: "prototypes/pieces/piece-risk-panel.tsx" },
            state: { severity: "high" },
          },
          {
            id: "piece-approval-actions",
            title: "Approval action bar",
            kind: "component",
            summary: "Independent action component for approve/request changes.",
            links: [{ target: { type: "decision", id: "decision-runtime" }, purpose: "validates" }],
            codeRef: { type: "session_artifact", path: "prototypes/pieces/piece-approval-actions.tsx" },
            state: { mode: "needs-review" },
          },
        ],
      },
    ],
  };
}
