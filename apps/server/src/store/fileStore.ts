import type {
  AgentReplyEvent,
  FeedbackDisposition,
  GraphPlanDocument,
  GraphPlanMutationResult,
  GraphPlanTarget,
  GraphPlanValidationMode,
  PlanEvent,
  PlanSession,
  UserApprovalEvent,
  UserFeedbackEvent,
} from "@agent-gui/plan-schema";
import {
  feedbackDispositionSchema,
  graphPlanDocumentSchema,
  planSessionSchema,
  replaceGraphPlanInputSchema,
  validateGraphPlan,
} from "@agent-gui/plan-schema";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyGraphPlanMutations } from "../domain/graphPlanMutations";
import {
  serverGraphPlanMutationInputSchema,
  serverGraphPlanTargetSchema,
  type ServerGraphPlanMutationInput,
  type ServerGraphPlanTarget,
} from "../domain/graphPlanMutationSchemas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");
export const SESSION_DATA_ROOT = path.join(REPO_ROOT, "data", "sessions");

type CreateSessionResult = {
  sessionId: string;
  url: string;
  revision: number;
  validation: PlanSession["validation"];
};

export type FeedbackEventStatus = "open" | "resolved" | "all";

export type ListPlanEventsOptions = {
  afterEventId?: string;
  feedbackStatus?: FeedbackEventStatus;
};

export type ReplaceGraphPlanInput = {
  sessionId: string;
  baseRevision: number;
  graphPlan: GraphPlanDocument;
  changeSummary: PlanSession["events"][number] extends infer Event
    ? Event extends { type: "agent.revision"; changeSummary: infer Summary }
      ? Summary
      : never
    : never;
  replacementRationale: string;
  validationPolicy?: "allow_all" | "block_errors";
  target?: GraphPlanTarget;
};

export class FileSessionStore {
  constructor(private readonly baseUrl = "http://localhost:8787") {}

  async createGraphPlanSession(graphPlan: GraphPlanDocument): Promise<CreateSessionResult> {
    const parsed = graphPlanDocumentSchema.parse(graphPlan);
    const validation = validateGraphPlan(parsed);
    const sessionId = `plan_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const session: PlanSession = {
      id: sessionId,
      status: "draft",
      revision: parsed.currentRevision,
      graphPlan: parsed,
      validation,
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.writeSession(session);
    return { sessionId, url: `${this.baseUrl}/sessions/${sessionId}`, revision: session.revision, validation };
  }

  async getPlanSession(sessionId: string): Promise<PlanSession> {
    const file = await readFile(this.sessionPath(sessionId), "utf8");
    return planSessionSchema.parse(JSON.parse(file));
  }

  async listPlanEvents(sessionId: string, options: ListPlanEventsOptions = {}): Promise<PlanEvent[]> {
    const session = await this.getPlanSession(sessionId);
    const events = eventsAfter(session.events, options.afterEventId);
    if (!options.feedbackStatus || options.feedbackStatus === "all") return events;
    return filterFeedbackEvents(session.events, events, options.feedbackStatus);
  }

  async validateGraphPlanDocument(graphPlan: GraphPlanDocument, mode: GraphPlanValidationMode = "draft"): Promise<PlanSession["validation"]> {
    return validateGraphPlan(graphPlanDocumentSchema.parse(graphPlan), { mode });
  }

  async postUserFeedback(input: {
    sessionId: string;
    target: ServerGraphPlanTarget;
    message: string;
    intent?: UserFeedbackEvent["intent"];
  }): Promise<UserFeedbackEvent> {
    const session = await this.getPlanSession(input.sessionId);
    const event: UserFeedbackEvent = {
      id: eventId("feedback"),
      type: "user.feedback",
      sessionId: session.id,
      revision: session.revision,
      target: serverGraphPlanTargetSchema.parse(input.target) as GraphPlanTarget,
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
    target: ServerGraphPlanTarget;
    body: string;
    disposition: FeedbackDisposition;
  }): Promise<AgentReplyEvent> {
    const session = await this.getPlanSession(input.sessionId);
    const disposition = feedbackDispositionSchema.parse(input.disposition);
    const event: AgentReplyEvent = {
      id: eventId("reply"),
      type: "agent.reply",
      sessionId: session.id,
      revision: input.revision,
      replyToEventId: input.replyToEventId,
      target: serverGraphPlanTargetSchema.parse(input.target) as GraphPlanTarget,
      body: input.body,
      disposition,
      createdAt: new Date().toISOString(),
    };
    session.events.push(event);
    session.status = "agent_replied";
    session.updatedAt = event.createdAt;
    await this.writeSession(session);
    return event;
  }

  async replaceGraphPlan(input: ReplaceGraphPlanInput): Promise<PlanSession> {
    const session = await this.getPlanSession(input.sessionId);
    const parsedInput = replaceGraphPlanInputSchema.parse({
      sessionId: input.sessionId,
      baseRevision: input.baseRevision,
      graphPlan: input.graphPlan,
      changeSummary: input.changeSummary,
      replacementRationale: input.replacementRationale,
      validationPolicy: input.validationPolicy ?? "block_errors",
    });
    if (session.revision !== parsedInput.baseRevision) {
      throw new Error(`baseRevision ${parsedInput.baseRevision} does not match current revision ${session.revision}`);
    }

    const validation = validateGraphPlan(parsedInput.graphPlan);
    if (parsedInput.validationPolicy === "block_errors" && validation.errorCount > 0) {
      throw validationBlockedError(validation);
    }

    return this.commitGraphPlanRevision({
      session,
      graphPlan: parsedInput.graphPlan,
      changeSummary: parsedInput.changeSummary,
      validation,
      target: input.target,
    });
  }

  async mutateGraphPlan(input: ServerGraphPlanMutationInput): Promise<GraphPlanMutationResult> {
    const session = await this.getPlanSession(input.sessionId);
    const parsedInput = serverGraphPlanMutationInputSchema.parse(input);
    if (session.revision !== parsedInput.baseRevision) {
      throw new Error(`baseRevision ${parsedInput.baseRevision} does not match current revision ${session.revision}`);
    }

    const graphPlan = applyGraphPlanMutations(session.graphPlan, parsedInput.operations);
    const validation = validateGraphPlan(graphPlan);
    if (parsedInput.validationPolicy === "block_errors" && validation.errorCount > 0) {
      throw validationBlockedError(validation);
    }

    const nextSession = await this.commitGraphPlanRevision({
      session,
      graphPlan,
      changeSummary: parsedInput.changeSummary,
      validation,
    });
    const revisionEvent = nextSession.events.at(-1);
    if (!revisionEvent || revisionEvent.type !== "agent.revision") {
      throw new Error("Expected graph mutation to create a revision event.");
    }
    return { session: nextSession, revisionEvent, validation };
  }

  async markPlanApproved(input: {
    sessionId: string;
    revision: number;
    message?: string;
  }): Promise<PlanSession> {
    const session = await this.getPlanSession(input.sessionId);
    const publishValidation = validateGraphPlan(session.graphPlan, { mode: "publish" });
    if (publishValidation.errorCount > 0) {
      throw validationBlockedError(publishValidation);
    }
    const now = new Date().toISOString();
    const event: UserApprovalEvent = {
      id: eventId("approval"),
      type: "user.approval",
      sessionId: session.id,
      revision: input.revision,
      message: input.message,
      createdAt: now,
    };
    session.validation = publishValidation;
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

  private async commitGraphPlanRevision(input: {
    session: PlanSession;
    graphPlan: GraphPlanDocument;
    changeSummary: Extract<PlanEvent, { type: "agent.revision" }>["changeSummary"];
    validation: PlanSession["validation"];
    target?: GraphPlanTarget;
  }): Promise<PlanSession> {
    const nextRevision = input.session.revision + 1;
    const now = new Date().toISOString();
    const graphPlan = { ...input.graphPlan, currentRevision: nextRevision };
    const event: Extract<PlanEvent, { type: "agent.revision" }> = {
      id: eventId("revision"),
      type: "agent.revision",
      sessionId: input.session.id,
      fromRevision: input.session.revision,
      toRevision: nextRevision,
      target: input.target,
      changeSummary: input.changeSummary,
      validation: input.validation,
      createdAt: now,
    };
    input.session.revision = nextRevision;
    input.session.graphPlan = graphPlan;
    input.session.validation = input.validation;
    input.session.events.push(event);
    input.session.status = "revision_ready";
    input.session.updatedAt = now;
    await this.writeSession(input.session);
    return input.session;
  }

  private async writeSession(session: PlanSession): Promise<void> {
    const dir = path.dirname(this.sessionPath(session.id));
    await mkdir(dir, { recursive: true });
    await writeFile(this.sessionPath(session.id), JSON.stringify(session, null, 2));
  }

  private sessionPath(sessionId: string): string {
    return path.join(SESSION_DATA_ROOT, sessionId, "session.json");
  }
}

function eventsAfter(events: PlanEvent[], afterEventId?: string): PlanEvent[] {
  if (!afterEventId) return events;
  const index = events.findIndex((event) => event.id === afterEventId);
  return index === -1 ? events : events.slice(index + 1);
}

function filterFeedbackEvents(allEvents: PlanEvent[], candidateEvents: PlanEvent[], status: Exclude<FeedbackEventStatus, "all">): PlanEvent[] {
  const handledFeedbackIds = new Set<string>();
  for (const event of allEvents) {
    if (event.type === "agent.reply" && event.disposition && event.disposition !== "open") {
      handledFeedbackIds.add(event.replyToEventId);
    }
  }
  return candidateEvents.filter((event) => {
    if (event.type !== "user.feedback") return false;
    const isHandled = handledFeedbackIds.has(event.id);
    return status === "resolved" ? isHandled : !isHandled;
  });
}

function eventId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function validationBlockedError(validation: PlanSession["validation"]): Error {
  const error = new Error(`validation_blocked: graph plan has ${validation.errorCount} validation error(s).`);
  Object.assign(error, { code: "validation_blocked", validation });
  return error;
}
