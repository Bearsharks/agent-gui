import type { GraphPlanDocument } from "@agent-gui/plan-schema";
import { graphPlanFixtures } from "@agent-gui/plan-schema";

export type FixtureScenario = keyof typeof graphPlanFixtures;

export function fixtureGraphPlan(scenario: string = "prototype"): GraphPlanDocument {
  const key = scenario in graphPlanFixtures ? (scenario as FixtureScenario) : "prototype";
  return structuredClone(graphPlanFixtures[key]);
}
