import type { GraphPlanDocument } from "@agent-gui/plan-schema";
import { prototypeReviewGraphPlanFixture } from "@agent-gui/plan-schema";

export function fixtureGraphPlan(): GraphPlanDocument {
  return structuredClone(prototypeReviewGraphPlanFixture);
}
