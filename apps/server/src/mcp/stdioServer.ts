import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type {
  AgentReplyEvent,
  GraphPlanDocument,
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
  graphPlanValidationModeSchema,
  normalizeGraphPlanForAuthoring,
  validationPolicySchema,
} from "@agent-gui/plan-schema";
import { FileSessionStore } from "../store/fileStore";
import {
  serverGraphPlanMutationOperationSchema,
  serverGraphPlanTargetSchema,
  type ServerGraphPlanMutationInput,
} from "../domain/graphPlanMutationSchemas";

const store = new FileSessionStore();
const graphStore = store as unknown as GraphPlanSessionStore;
const feedbackStatusSchema = z.enum(["open", "resolved", "all"]);

const server = new McpServer({
  name: "agent-gui-plan-review",
  version: "0.1.0",
});

server.registerTool(
  "create_graph_plan_session",
  {
    title: "Create graph plan session",
    description:
      "Create a browser review session from a GraphPlanDocument. Targets in the session use GraphPlanTarget kinds: plan, graph, node, edge, and iframe. Document, graph, and node markdownDesc fields are markdown; node markdownDesc is rendered in the right detail panel. The graph document is validated before it is stored.",
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
      "Read graph plan review events or events after a known event id. By default, this returns only open user feedback that has not been handled by a post_agent_reply disposition. Use feedbackStatus='all' for the full audit log.",
    inputSchema: { sessionId: z.string(), afterEventId: z.string().optional(), feedbackStatus: feedbackStatusSchema.default("open") },
  },
  async ({ sessionId, afterEventId, feedbackStatus }) => jsonResult(await graphStore.listPlanEvents(sessionId, { afterEventId, feedbackStatus })),
);

server.registerTool(
  "post_agent_reply",
  {
    title: "Post agent reply",
    description:
      "Reply to a user feedback thread on a GraphPlanTarget. Handling a feedback item requires posting this reply with a disposition; non-open dispositions hide that feedback from the default list_plan_events view.",
    inputSchema: {
      sessionId: z.string(),
      revision: z.number().int().positive(),
      replyToEventId: z.string(),
      target: serverGraphPlanTargetSchema,
      body: z.string(),
      disposition: feedbackDispositionSchema,
    },
  },
  async (input) => jsonResult(await graphStore.postAgentReply(input)),
);

server.registerTool(
  "mutate_graph_plan",
  {
    title: "Mutate graph plan",
    description:
      "Default tool for revising an existing graph plan. Apply targeted GraphPlanMutationOperation items atomically, including graph, node markdownDesc, edge, subgraph, and iframe add/update/remove operations. Prefer this over replace_graph_plan unless the whole document must be regenerated.",
    inputSchema: {
      sessionId: z.string(),
      baseRevision: z.number().int().positive(),
      mode: z.literal("atomic").default("atomic"),
      operations: z.array(serverGraphPlanMutationOperationSchema).min(1),
      changeSummary: graphPlanChangeSummarySchema,
      validationPolicy: validationPolicySchema.default("block_errors"),
    },
  },
  async (input) => jsonResult(await graphStore.mutateGraphPlan(input)),
);

server.registerTool(
  "replace_graph_plan",
  {
    title: "Replace graph plan",
    description:
      "Replace the full GraphPlanDocument only when targeted mutations would be misleading or unsafe, such as importing a regenerated document, redesigning most graphs, or intentionally remapping target identities. Do not use for adding nodes, edges, subgraphs, iframe entries, or updating a few fields; use mutate_graph_plan for those. Requires a concrete replacementRationale.",
    inputSchema: {
      sessionId: z.string(),
      baseRevision: z.number().int().positive(),
      graphPlan: graphPlanDocumentSchema,
      changeSummary: graphPlanChangeSummarySchema,
      replacementRationale: z.string().min(20),
      validationPolicy: validationPolicySchema.default("block_errors"),
    },
  },
  async (input) => jsonResult(await graphStore.replaceGraphPlan(input)),
);

server.registerTool(
  "normalize_graph_plan",
  {
    title: "Normalize graph plan",
    description:
      "Normalize common graph/html authoring shorthand before strict validation and return schema issues with hints. The current model is graph, node markdownDesc, edge, subGraphs, and node iframes.",
    inputSchema: {
      graphPlan: z.unknown(),
      mode: graphPlanValidationModeSchema.default("draft"),
    },
  },
  async ({ graphPlan, mode }) => jsonResult(normalizeGraphPlanForAuthoring(graphPlan, mode)),
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
  listPlanEvents(sessionId: string, options?: { afterEventId?: string; feedbackStatus?: "open" | "resolved" | "all" }): Promise<PlanEvent[]>;
  postAgentReply(input: {
    sessionId: string;
    revision: number;
    replyToEventId: string;
    target: unknown;
    body: string;
    disposition: unknown;
  }): Promise<AgentReplyEvent>;
  replaceGraphPlan(input: ReplaceGraphPlanInput): Promise<PlanSession>;
  mutateGraphPlan(input: ServerGraphPlanMutationInput): Promise<GraphPlanMutationResult>;
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
