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
  graphPlanDocumentSchema,
  graphPlanValidationModeSchema,
  normalizeGraphPlanForAuthoring,
  replaceGraphPlanInputSchema,
} from "@agent-gui/plan-schema";
import { Hono } from "hono";
import { ZodError } from "zod";
import { publishSessionEvent } from "../realtime/sessionStream";
import { store as sessionStore } from "../http/api";
import {
  serverGraphPlanMutationInputSchema,
  type ServerGraphPlanMutationInput,
} from "../domain/graphPlanMutationSchemas";

type ToolRequest = {
  tool: string;
  input?: Record<string, unknown>;
};

const store = sessionStore as unknown as GraphPlanSessionStore;

export function createMcpHttpRoutes() {
  const app = new Hono();

  app.get("/mcp/tools", (c) =>
    c.json({
      tools: [
        "create_graph_plan_session",
        "get_graph_plan_session",
        "list_plan_events",
        "post_agent_reply",
        "mutate_graph_plan",
        "replace_graph_plan",
        "normalize_graph_plan",
        "validate_graph_plan",
        "mark_plan_approved",
      ],
    }),
  );

  app.post("/mcp/call", async (c) => {
    try {
      const { tool, input = {} } = (await c.req.json()) as ToolRequest;
      switch (tool) {
        case "create_graph_plan_session": {
          const graphPlan = graphPlanDocumentSchema.parse(input.graphPlan);
          const result = await store.createGraphPlanSession(graphPlan);
          publishSessionEvent({ type: "session.updated", sessionId: result.sessionId });
          return c.json(result);
        }
        case "get_graph_plan_session":
          return c.json(await store.getPlanSession(input.sessionId as string));
        case "list_plan_events":
          return c.json(await store.listPlanEvents(input.sessionId as string, input.afterEventId as string | undefined));
        case "post_agent_reply": {
          const event = await store.postAgentReply({
            sessionId: input.sessionId as string,
            revision: input.revision as number,
            replyToEventId: input.replyToEventId as string,
            target: input.target,
            body: input.body as string,
            disposition: input.disposition,
          });
          publishSessionEvent({ type: "event.created", sessionId: event.sessionId, payload: event });
          publishSessionEvent({ type: "session.updated", sessionId: event.sessionId });
          return c.json(event);
        }
        case "mutate_graph_plan": {
          const result = await store.mutateGraphPlan(serverGraphPlanMutationInputSchema.parse(input));
          publishGraphRevisionEvents(result.session);
          return c.json(result);
        }
        case "replace_graph_plan": {
          const session = await store.replaceGraphPlan(replaceGraphPlanInputSchema.parse(input));
          publishGraphRevisionEvents(session);
          return c.json(session);
        }
        case "normalize_graph_plan": {
          const mode = graphPlanValidationModeSchema.default("draft").parse(input.mode);
          return c.json(normalizeGraphPlanForAuthoring(input.graphPlan, mode));
        }
        case "validate_graph_plan": {
          const graphPlan = graphPlanDocumentSchema.parse(input.graphPlan);
          const mode = graphPlanValidationModeSchema.default("draft").parse(input.mode);
          return c.json(await store.validateGraphPlanDocument(graphPlan, mode));
        }
        case "mark_plan_approved": {
          const session = await store.markPlanApproved({
            sessionId: input.sessionId as string,
            revision: input.revision as number,
            message: input.message as string | undefined,
          });
          publishSessionEvent({ type: "session.updated", sessionId: session.id });
          return c.json(session);
        }
        default:
          return c.json({ error: `Unknown tool: ${tool}` }, 404);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json({ error: "Invalid tool input", issues: error.issues }, 400);
      }
      throw error;
    }
  });

  return app;
}

function publishGraphRevisionEvents(session: PlanSession) {
  publishSessionEvent({ type: "revision.created", sessionId: session.id, payload: session.events.at(-1) });
  publishSessionEvent({ type: "session.updated", sessionId: session.id });
}

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
  mutateGraphPlan(input: ServerGraphPlanMutationInput): Promise<GraphPlanMutationResult>;
  validateGraphPlanDocument(
    graphPlan: GraphPlanDocument,
    mode?: GraphPlanValidationMode,
  ): Promise<GraphPlanValidationSummary>;
  markPlanApproved(input: { sessionId: string; revision: number; message?: string }): Promise<PlanSession>;
};
