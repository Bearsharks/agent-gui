import type { PlanDraft, PlanTarget } from "@agent-gui/plan-schema";
import { Hono } from "hono";
import { FileSessionStore } from "../store/fileStore";
import { publishSessionEvent, sessionEventStream } from "../realtime/sessionStream";
import { fixturePlan } from "../domain/samplePlan";

export const store = new FileSessionStore();

export function createApi() {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/fixture-session", async (c) => {
    const result = await store.createPlanSession(fixturePlan());
    publishSessionEvent({ type: "session.updated", sessionId: result.sessionId });
    return c.json(result);
  });

  app.post("/api/sessions", async (c) => {
    const body = (await c.req.json()) as { plan: PlanDraft };
    const result = await store.createPlanSession(body.plan);
    publishSessionEvent({ type: "session.updated", sessionId: result.sessionId });
    return c.json(result);
  });

  app.get("/api/sessions/:sessionId", async (c) => {
    return c.json(await store.getPlanSession(c.req.param("sessionId")));
  });

  app.get("/api/sessions/:sessionId/events", async (c) => {
    const sessionId = c.req.param("sessionId");
    const afterEventId = c.req.query("afterEventId");
    return c.json({ events: await store.listPlanEvents(sessionId, afterEventId) });
  });

  app.post("/api/sessions/:sessionId/feedback", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = (await c.req.json()) as { target: PlanTarget; message: string; intent?: never };
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

  app.post("/api/sessions/:sessionId/revisions", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await c.req.json();
    const session = await store.updatePlanRevision({ sessionId, ...body });
    publishSessionEvent({ type: "revision.created", sessionId, payload: session.events.at(-1) });
    publishSessionEvent({ type: "prototype.updated", sessionId });
    publishSessionEvent({ type: "session.updated", sessionId });
    return c.json(session);
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
