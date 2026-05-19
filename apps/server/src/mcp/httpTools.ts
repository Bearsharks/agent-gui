import type { PlanDraft, PlanTarget, PrototypeChangeSummary } from "@agent-gui/plan-schema";
import { Hono } from "hono";
import { publishSessionEvent } from "../realtime/sessionStream";
import { store } from "../http/api";

type ToolRequest = {
  tool: string;
  input?: Record<string, unknown>;
};

export function createMcpHttpRoutes() {
  const app = new Hono();

  app.get("/mcp/tools", (c) =>
    c.json({
      tools: [
        "create_plan_session",
        "get_plan_session",
        "list_plan_events",
        "post_agent_reply",
        "update_plan_revision",
        "mark_plan_approved",
      ],
    }),
  );

  app.post("/mcp/call", async (c) => {
    const { tool, input = {} } = (await c.req.json()) as ToolRequest;
    switch (tool) {
      case "create_plan_session": {
        const result = await store.createPlanSession(input.plan as PlanDraft);
        publishSessionEvent({ type: "session.updated", sessionId: result.sessionId });
        return c.json(result);
      }
      case "get_plan_session":
        return c.json(await store.getPlanSession(input.sessionId as string));
      case "list_plan_events":
        return c.json({
          events: await store.listPlanEvents(input.sessionId as string, input.afterEventId as string | undefined),
        });
      case "post_agent_reply": {
        const event = await store.postAgentReply({
          sessionId: input.sessionId as string,
          revision: input.revision as number,
          replyToEventId: input.replyToEventId as string,
          target: input.target as PlanTarget,
          body: input.body as string,
          disposition: input.disposition as never,
        });
        publishSessionEvent({ type: "event.created", sessionId: event.sessionId, payload: event });
        publishSessionEvent({ type: "session.updated", sessionId: event.sessionId });
        return c.json(event);
      }
      case "update_plan_revision": {
        const session = await store.updatePlanRevision({
          sessionId: input.sessionId as string,
          baseRevision: input.baseRevision as number,
          target: input.target as PlanTarget | undefined,
          plan: input.plan as PlanDraft,
          changeSummary: input.changeSummary as string[],
          prototypeChanges: input.prototypeChanges as PrototypeChangeSummary[] | undefined,
        });
        publishSessionEvent({ type: "revision.created", sessionId: session.id, payload: session.events.at(-1) });
        publishSessionEvent({ type: "prototype.updated", sessionId: session.id });
        publishSessionEvent({ type: "session.updated", sessionId: session.id });
        return c.json(session);
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
  });

  return app;
}
