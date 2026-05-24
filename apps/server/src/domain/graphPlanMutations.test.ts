import assert from "node:assert/strict";
import { fixtureGraphPlan } from "./samplePlan";
import { applyGraphPlanMutations } from "./graphPlanMutations";

const basePlan = fixtureGraphPlan("linear");

const withIframe = applyGraphPlanMutations(basePlan, [
  {
    op: "add_iframe",
    target: { type: "node", graphId: "g-search-plan", nodeId: "n-design" },
    iframe: { id: "iframe-test", description: "Test iframe", url: "http://localhost:8787/prototypes/test.html" },
  },
]);

const designNode = withIframe.graphs[0].nodes.find((node) => node.id === "n-design");
assert.equal(designNode?.iframes?.some((iframe) => iframe.id === "iframe-test"), true);

const updated = applyGraphPlanMutations(withIframe, [
  {
    op: "update_iframe",
    target: { type: "iframe", graphId: "g-search-plan", nodeId: "n-design", iframeId: "iframe-test" },
    fields: { description: "Updated test iframe" },
  },
]);

assert.equal(
  updated.graphs[0].nodes.find((node) => node.id === "n-design")?.iframes?.find((iframe) => iframe.id === "iframe-test")?.description,
  "Updated test iframe",
);

const detached = applyGraphPlanMutations(updated, [
  {
    op: "detach_subgraph",
    parent: { graphId: "g-search-plan", nodeId: "n-implementation" },
    graphId: "g-search-implementation",
  },
]);

assert.equal(detached.graphs.find((graph) => graph.id === "g-search-implementation")?.parent, undefined);
