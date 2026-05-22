import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type {
  AgentReplyEvent,
  GraphPlanDocument,
  GraphPlanMutationInput,
  GraphPlanMutationResult,
  GraphPlanValidationMode,
  GraphPlanValidationSummary,
  PlanEvent,
  PlanSession,
  ReplaceGraphPlanInput,
} from "@agent-gui/plan-schema";
import {
  feedbackDispositionSchema,
  graphPlanChangeSummarySchema,
  graphPlanDocumentSchema,
  graphPlanMutationOperationSchema,
  graphPlanTargetSchema,
  graphPlanValidationModeSchema,
  validationPolicySchema,
} from "@agent-gui/plan-schema";
import { FileSessionStore } from "../store/fileStore";

const store = new FileSessionStore();
const graphStore = store as unknown as GraphPlanSessionStore;

const server = new McpServer({
  name: "agent-gui-plan-review",
  version: "0.1.0",
});

server.registerTool(
  "create_graph_plan_session",
  {
    title: "Create graph plan session",
    description:
      "Create a browser review session from a GraphPlanDocument. Targets in the session use GraphPlanTarget kinds: plan, graph, node, block, block_item, edge, prototype_piece, and artifact_range. The graph document is validated before it is stored.",
    inputSchema: { graphPlan: graphPlanDocumentSchema },
  },
  async ({ graphPlan }) => jsonResult(await graphStore.createGraphPlanSession(graphPlan)),
);

server.registerTool(
  "get_graph_plan_session",
  {
    title: "Get graph plan session",
    description: "Read the latest graph-only session snapshot, including graphPlan, validation, revision, status, and events.",
    inputSchema: { sessionId: z.string() },
  },
  async ({ sessionId }) => jsonResult(await graphStore.getPlanSession(sessionId)),
);

server.registerTool(
  "list_plan_events",
  {
    title: "List plan events",
    description:
      "Read graph plan review events or events after a known event id. Event targets are GraphPlanTarget objects, so an agent can decide whether to reply, replace the full graph, or apply a targeted graph mutation.",
    inputSchema: { sessionId: z.string(), afterEventId: z.string().optional() },
  },
  async ({ sessionId, afterEventId }) => jsonResult(await graphStore.listPlanEvents(sessionId, afterEventId)),
);

server.registerTool(
  "post_agent_reply",
  {
    title: "Post agent reply",
    description:
      "Reply to a user feedback thread on a GraphPlanTarget. The target should match or narrow the original feedback target and may be plan, graph, node, block, block_item, edge, prototype_piece, or artifact_range.",
    inputSchema: {
      sessionId: z.string(),
      revision: z.number().int().positive(),
      replyToEventId: z.string(),
      target: graphPlanTargetSchema,
      body: z.string(),
      disposition: feedbackDispositionSchema.optional(),
    },
  },
  async (input) => jsonResult(await graphStore.postAgentReply(input)),
);

server.registerTool(
  "replace_graph_plan",
  {
    title: "Replace graph plan",
    description:
      "Replace the full GraphPlanDocument for a session. Use this for large structure changes; use mutate_graph_plan for targeted node, block, edge, prototype piece, or artifact range changes. Requires baseRevision and runs validation after replacement.",
    inputSchema: {
      sessionId: z.string(),
      baseRevision: z.number().int().positive(),
      graphPlan: graphPlanDocumentSchema,
      changeSummary: graphPlanChangeSummarySchema,
      validationPolicy: validationPolicySchema.default("block_errors"),
    },
  },
  async (input) => jsonResult(await graphStore.replaceGraphPlan(input)),
);

server.registerTool(
  "mutate_graph_plan",
  {
    title: "Mutate graph plan",
    description:
      "Apply GraphPlanMutationOperation items atomically to the current GraphPlanDocument. Use for targeted graph, node, block, edge, subgraph, prototype piece, or artifact range updates. Requires baseRevision and runs validation after mutation.",
    inputSchema: {
      sessionId: z.string(),
      baseRevision: z.number().int().positive(),
      mode: z.literal("atomic").default("atomic"),
      operations: z.array(graphPlanMutationOperationSchema).min(1),
      changeSummary: graphPlanChangeSummarySchema,
      validationPolicy: validationPolicySchema.default("block_errors"),
    },
  },
  async (input) => jsonResult(await graphStore.mutateGraphPlan(input)),
);

server.registerTool(
  "validate_graph_plan",
  {
    title: "Validate graph plan",
    description:
      "Validate a GraphPlanDocument without storing it. Use draft mode while authoring and publish mode before approval or replacement when issue codes are needed for repair strategy.",
    inputSchema: {
      graphPlan: graphPlanDocumentSchema,
      mode: graphPlanValidationModeSchema.default("draft"),
    },
  },
  async ({ graphPlan, mode }) => jsonResult(await graphStore.validateGraphPlanDocument(graphPlan, mode)),
);

server.registerTool(
  "mark_plan_approved",
  {
    title: "Mark plan approved",
    description:
      "Record approval for the current graph plan revision. Approval is expected to be blocked by publish validation errors; warnings do not block approval.",
    inputSchema: { sessionId: z.string(), revision: z.number().int().positive(), message: z.string().optional() },
  },
  async (input) => jsonResult(await graphStore.markPlanApproved(input)),
);

await server.connect(new StdioServerTransport());

type CreateGraphPlanSessionResult = {
  sessionId: string;
  url: string;
  revision: number;
  validation: GraphPlanValidationSummary;
};

type GraphPlanSessionStore = {
  createGraphPlanSession(graphPlan: GraphPlanDocument): Promise<CreateGraphPlanSessionResult>;
  getPlanSession(sessionId: string): Promise<PlanSession>;
  listPlanEvents(sessionId: string, afterEventId?: string): Promise<PlanEvent[]>;
  postAgentReply(input: {
    sessionId: string;
    revision: number;
    replyToEventId: string;
    target: unknown;
    body: string;
    disposition?: unknown;
  }): Promise<AgentReplyEvent>;
  replaceGraphPlan(input: ReplaceGraphPlanInput): Promise<PlanSession>;
  mutateGraphPlan(input: GraphPlanMutationInput): Promise<GraphPlanMutationResult>;
  validateGraphPlanDocument(
    graphPlan: GraphPlanDocument,
    mode?: GraphPlanValidationMode,
  ): Promise<GraphPlanValidationSummary>;
  markPlanApproved(input: { sessionId: string; revision: number; message?: string }): Promise<PlanSession>;
};

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
