import type {
  AgentReplyEvent,
  AgentRevisionEvent,
  FeedbackDisposition,
  PlanDraft,
  PlanEvent,
  PlanSession,
  PlanTarget,
  PrototypeChangeSummary,
  UserApprovalEvent,
  UserFeedbackEvent,
} from "@agent-gui/plan-schema";
import { planDraftSchema, planSessionSchema, planTargetSchema } from "@agent-gui/plan-schema";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = path.resolve(process.cwd(), "../..", "data", "sessions");

type CreateSessionResult = { sessionId: string; url: string; revision: number };

export type UpdatePlanRevisionInput = {
  sessionId: string;
  baseRevision: number;
  target?: PlanTarget;
  plan: PlanDraft;
  changeSummary: string[];
  prototypeChanges?: PrototypeChangeSummary[];
};

export class FileSessionStore {
  constructor(private readonly baseUrl = "http://localhost:8787") {}

  async createPlanSession(plan: PlanDraft): Promise<CreateSessionResult> {
    const parsed = planDraftSchema.parse(plan);
    const sessionId = `plan_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const session: PlanSession = {
      id: sessionId,
      status: "draft",
      revision: 1,
      plan: normalizePrototypeRevisions(parsed, 1),
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.writeSession(session);
    return { sessionId, url: `${this.baseUrl}/sessions/${sessionId}`, revision: session.revision };
  }

  async getPlanSession(sessionId: string): Promise<PlanSession> {
    const file = await readFile(this.sessionPath(sessionId), "utf8");
    return planSessionSchema.parse(JSON.parse(file));
  }

  async listPlanEvents(sessionId: string, afterEventId?: string): Promise<PlanEvent[]> {
    const session = await this.getPlanSession(sessionId);
    if (!afterEventId) return session.events;
    const index = session.events.findIndex((event) => event.id === afterEventId);
    return index === -1 ? session.events : session.events.slice(index + 1);
  }

  async postUserFeedback(input: {
    sessionId: string;
    target: PlanTarget;
    message: string;
    intent?: UserFeedbackEvent["intent"];
  }): Promise<UserFeedbackEvent> {
    const session = await this.getPlanSession(input.sessionId);
    const event: UserFeedbackEvent = {
      id: eventId("feedback"),
      type: "user.feedback",
      sessionId: session.id,
      revision: session.revision,
      target: planTargetSchema.parse(input.target),
      intent: input.intent,
      message: input.message,
      createdAt: new Date().toISOString(),
    };
    session.events.push(event);
    session.status = "needs_agent";
    session.updatedAt = event.createdAt;
    await this.writeSession(session);
    return event;
  }

  async postAgentReply(input: {
    sessionId: string;
    revision: number;
    replyToEventId: string;
    target: PlanTarget;
    body: string;
    disposition?: FeedbackDisposition;
  }): Promise<AgentReplyEvent> {
    const session = await this.getPlanSession(input.sessionId);
    const event: AgentReplyEvent = {
      id: eventId("reply"),
      type: "agent.reply",
      sessionId: session.id,
      revision: input.revision,
      replyToEventId: input.replyToEventId,
      target: planTargetSchema.parse(input.target),
      body: input.body,
      disposition: input.disposition,
      createdAt: new Date().toISOString(),
    };
    session.events.push(event);
    session.status = "agent_replied";
    session.updatedAt = event.createdAt;
    await this.writeSession(session);
    return event;
  }

  async updatePlanRevision(input: UpdatePlanRevisionInput): Promise<PlanSession> {
    const session = await this.getPlanSession(input.sessionId);
    if (session.revision !== input.baseRevision) {
      throw new Error(`baseRevision ${input.baseRevision} does not match current revision ${session.revision}`);
    }
    const nextRevision = session.revision + 1;
    const now = new Date().toISOString();
    const event: AgentRevisionEvent = {
      id: eventId("revision"),
      type: "agent.revision",
      sessionId: session.id,
      fromRevision: session.revision,
      toRevision: nextRevision,
      changeSummary: input.target
        ? [`Targeted update: ${input.target.type}${input.target.id ? `:${input.target.id}` : ""}`, ...input.changeSummary]
        : input.changeSummary,
      prototypeChanges: input.prototypeChanges,
      createdAt: now,
    };
    session.revision = nextRevision;
    session.plan = normalizePrototypeRevisions(planDraftSchema.parse(input.plan), nextRevision);
    session.events.push(event);
    session.status = "revision_ready";
    session.updatedAt = now;
    await this.writeSession(session);
    return session;
  }

  async markPlanApproved(input: {
    sessionId: string;
    revision: number;
    message?: string;
  }): Promise<PlanSession> {
    const session = await this.getPlanSession(input.sessionId);
    const now = new Date().toISOString();
    const event: UserApprovalEvent = {
      id: eventId("approval"),
      type: "user.approval",
      sessionId: session.id,
      revision: input.revision,
      message: input.message,
      createdAt: now,
    };
    session.events.push(event);
    session.status = "approved";
    session.updatedAt = now;
    await this.writeSession(session);
    return session;
  }

  async notify(sessionId: string): Promise<PlanSession> {
    const session = await this.getPlanSession(sessionId);
    session.status = "needs_agent";
    session.updatedAt = new Date().toISOString();
    await this.writeSession(session);
    return session;
  }

  private async writeSession(session: PlanSession): Promise<void> {
    const dir = path.dirname(this.sessionPath(session.id));
    await mkdir(dir, { recursive: true });
    await writeFile(this.sessionPath(session.id), JSON.stringify(session, null, 2));
  }

  private sessionPath(sessionId: string): string {
    return path.join(DATA_ROOT, sessionId, "session.json");
  }
}

function eventId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function normalizePrototypeRevisions(plan: PlanDraft, revision: number): PlanDraft {
  if (!plan.prototypes) return plan;
  return {
    ...plan,
    prototypes: plan.prototypes.map((prototype) => ({ ...prototype, revision })),
  };
}
