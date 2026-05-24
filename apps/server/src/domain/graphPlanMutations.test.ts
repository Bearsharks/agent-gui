import assert from "node:assert/strict";
import { fixtureGraphPlan } from "./samplePlan";
import { applyGraphPlanMutations } from "./graphPlanMutations";
import { serverGraphPlanTargetSchema } from "./graphPlanMutationSchemas";

const basePlan = fixtureGraphPlan();
const graphId = basePlan.rootGraphId;
const nodeId = basePlan.graphs.find((graph) => graph.id === graphId)?.nodes[0]?.id;

assert.ok(nodeId, "fixture must include a root graph node");

const getNode = (plan: typeof basePlan) => plan.graphs.find((graph) => graph.id === graphId)?.nodes.find((node) => node.id === nodeId);

const added = applyGraphPlanMutations(basePlan, [
  {
    op: "add_iframe",
    target: { type: "node", graphId, nodeId },
    iframe: {
      id: "iframe-test",
      description: "Iframe mutation test",
      url: "http://localhost:8787/prototypes/test.html",
    },
  },
]);

assert.equal(getNode(added)?.iframes?.some((iframe) => iframe.id === "iframe-test"), true);

const updated = applyGraphPlanMutations(added, [
  {
    op: "update_iframe",
    target: { type: "iframe", graphId, nodeId, iframeId: "iframe-test" },
    fields: { description: "Updated iframe mutation test" },
  },
]);

assert.equal(
  getNode(updated)?.iframes?.find((iframe) => iframe.id === "iframe-test")?.description,
  "Updated iframe mutation test",
);

const removed = applyGraphPlanMutations(updated, [
  {
    op: "remove_iframe",
    target: { type: "iframe", graphId, nodeId, iframeId: "iframe-test" },
  },
]);

assert.equal(getNode(removed)?.iframes?.some((iframe) => iframe.id === "iframe-test"), false);

const iframeTarget = serverGraphPlanTargetSchema.parse({
  type: "iframe",
  graphId,
  nodeId,
  iframeId: "iframe-target-context",
});

assert.equal(iframeTarget.type, "iframe");
