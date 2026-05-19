import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { PlanDraft, PlanTarget, PrototypeChangeSummary } from "@agent-gui/plan-schema";
import { FileSessionStore } from "../store/fileStore";

const store = new FileSessionStore();

const server = new McpServer({
  name: "agent-gui-plan-review",
  version: "0.1.0",
});

server.registerTool(
  "create_plan_session",
  {
    title: "Create plan session",
    description: "Create a browser review session from a PlanDraft.",
    inputSchema: { plan: z.record(z.string(), z.unknown()) },
  },
  async ({ plan }) => jsonResult(await store.createPlanSession(plan as PlanDraft)),
);

server.registerTool(
  "get_plan_session",
  {
    title: "Get plan session",
    description: "Read the latest session state, plan, and events.",
    inputSchema: { sessionId: z.string() },
  },
  async ({ sessionId }) => jsonResult(await store.getPlanSession(sessionId)),
);

server.registerTool(
  "list_plan_events",
  {
    title: "List plan events",
    description: "Read all session events or events after a known event id.",
    inputSchema: { sessionId: z.string(), afterEventId: z.string().optional() },
  },
  async ({ sessionId, afterEventId }) => jsonResult({ events: await store.listPlanEvents(sessionId, afterEventId) }),
);

server.registerTool(
  "post_agent_reply",
  {
    title: "Post agent reply",
    description: "Reply to a user feedback event.",
    inputSchema: {
      sessionId: z.string(),
      revision: z.number(),
      replyToEventId: z.string(),
      target: z.record(z.string(), z.unknown()),
      body: z.string(),
      disposition: z
        .enum(["open", "answered", "incorporated_in_revision", "rejected", "needs_user_clarification"])
        .optional(),
    },
  },
  async (input) =>
    jsonResult(
      await store.postAgentReply({
        ...input,
        target: input.target as PlanTarget,
      }),
    ),
);

server.registerTool(
  "update_plan_revision",
  {
    title: "Update plan revision",
    description: "Store a new full PlanDraft revision, optionally focused on a target.",
    inputSchema: {
      sessionId: z.string(),
      baseRevision: z.number(),
      target: z.record(z.string(), z.unknown()).optional(),
      plan: z.record(z.string(), z.unknown()),
      changeSummary: z.array(z.string()),
      prototypeChanges: z.array(z.record(z.string(), z.unknown())).optional(),
    },
  },
  async (input) =>
    jsonResult(
      await store.updatePlanRevision({
        sessionId: input.sessionId,
        baseRevision: input.baseRevision,
        target: input.target as PlanTarget | undefined,
        plan: input.plan as PlanDraft,
        changeSummary: input.changeSummary,
        prototypeChanges: input.prototypeChanges as PrototypeChangeSummary[] | undefined,
      }),
    ),
);

server.registerTool(
  "mark_plan_approved",
  {
    title: "Mark plan approved",
    description: "Record approval for a plan revision.",
    inputSchema: { sessionId: z.string(), revision: z.number(), message: z.string().optional() },
  },
  async (input) => jsonResult(await store.markPlanApproved(input)),
);

await server.connect(new StdioServerTransport());

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
