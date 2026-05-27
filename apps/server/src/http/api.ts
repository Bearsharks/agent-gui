import type { GraphPlanDocument, GraphPlanValidationMode } from "@agent-gui/plan-schema";
import { Hono } from "hono";
import type { ServerGraphPlanTarget } from "../domain/graphPlanMutationSchemas";
import { fixtureGraphPlan } from "../domain/samplePlan";
import { publishSessionEvent, sessionEventStream } from "../realtime/sessionStream";
import { FileSessionStore } from "../store/fileStore";

export const store = new FileSessionStore();

export function createApi() {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/fixture-session", async (c) => {
    const body = await readOptionalJson<{ scenario?: string }>(c.req);
    const scenario = c.req.query("scenario") ?? body?.scenario ?? "prototype";
    const result = await store.createGraphPlanSession(fixtureGraphPlan(scenario));
    publishSessionEvent({ type: "session.updated", sessionId: result.sessionId });
    return c.json(result);
  });

  app.post("/api/sessions", async (c) => {
    const body = (await c.req.json()) as { graphPlan: GraphPlanDocument };
    const result = await store.createGraphPlanSession(body.graphPlan);
    publishSessionEvent({ type: "session.updated", sessionId: result.sessionId });
    return c.json(result);
  });

  app.get("/api/sessions", async (c) => {
    return c.json({ sessions: await store.listPlanSessions() });
  });

  app.get("/api/sessions/:sessionId", async (c) => {
    return c.json(await store.getPlanSession(c.req.param("sessionId")));
  });

  app.delete("/api/sessions/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    await store.deletePlanSession(sessionId);
    publishSessionEvent({ type: "session.updated", sessionId });
    return c.json({ sessionId, deleted: true });
  });

  app.get("/api/sessions/:sessionId/events", async (c) => {
    const sessionId = c.req.param("sessionId");
    const afterEventId = c.req.query("afterEventId");
    const feedbackStatus = parseFeedbackStatus(c.req.query("feedbackStatus"));
    return c.json({ events: await store.listPlanEvents(sessionId, { afterEventId, feedbackStatus }) });
  });

  app.post("/api/graph-plan/validate", async (c) => {
    const body = (await c.req.json()) as { graphPlan: GraphPlanDocument; mode?: GraphPlanValidationMode };
    return c.json(await store.validateGraphPlanDocument(body.graphPlan, body.mode ?? "draft"));
  });

  app.post("/api/sessions/:sessionId/feedback", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = (await c.req.json()) as { target: ServerGraphPlanTarget; message: string; intent?: never };
    const event = await store.postUserFeedback({ sessionId, ...body });
    publishSessionEvent({ type: "event.created", sessionId, payload: event });
    publishSessionEvent({ type: "session.updated", sessionId });
    return c.json(event);
  });

  app.post("/api/sessions/:sessionId/notify", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await store.notify(sessionId);
    publishSessionEvent({ type: "session.updated", sessionId });
    return c.json({ sessionId, status: session.status, notifiedAt: session.updatedAt });
  });

  app.post("/api/sessions/:sessionId/agent-replies", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await c.req.json();
    const event = await store.postAgentReply({ sessionId, ...body });
    publishSessionEvent({ type: "event.created", sessionId, payload: event });
    publishSessionEvent({ type: "session.updated", sessionId });
    return c.json(event);
  });

  app.put("/api/sessions/:sessionId/graph-plan", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await c.req.json();
    const session = await store.replaceGraphPlan({ sessionId, ...body });
    publishSessionEvent({ type: "revision.created", sessionId, payload: session.events.at(-1) });
    publishSessionEvent({ type: "session.updated", sessionId });
    return c.json(session);
  });

  app.post("/api/sessions/:sessionId/graph-plan/mutations", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await c.req.json();
    const result = await store.mutateGraphPlan({ sessionId, ...body });
    publishSessionEvent({ type: "revision.created", sessionId, payload: result.revisionEvent });
    publishSessionEvent({ type: "session.updated", sessionId });
    return c.json(result);
  });

  app.post("/api/sessions/:sessionId/approve", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = (await c.req.json()) as { revision: number; message?: string };
    const session = await store.markPlanApproved({ sessionId, ...body });
    publishSessionEvent({ type: "event.created", sessionId, payload: session.events.at(-1) });
    publishSessionEvent({ type: "session.updated", sessionId });
    return c.json(session);
  });

  app.get("/events/sessions/:sessionId", (c) => sessionEventStream(c, c.req.param("sessionId")));

  return app;
}

function parseFeedbackStatus(value: string | undefined) {
  return value === "open" || value === "resolved" || value === "all" ? value : "all";
}

async function readOptionalJson<T>(request: { json: () => Promise<unknown> }): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
