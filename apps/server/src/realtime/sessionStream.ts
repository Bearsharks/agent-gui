import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

type SessionEvent = {
  type: "session.updated" | "event.created" | "revision.created" | "prototype.updated";
  sessionId: string;
  payload?: unknown;
};

const listeners = new Map<string, Set<(event: SessionEvent) => void>>();

export function publishSessionEvent(event: SessionEvent) {
  const sessionListeners = listeners.get(event.sessionId);
  if (!sessionListeners) return;
  for (const listener of sessionListeners) listener(event);
}

export function sessionEventStream(c: Context, sessionId: string) {
  return streamSSE(c, async (stream) => {
    const listener = async (event: SessionEvent) => {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    };
    const sessionListeners = listeners.get(sessionId) ?? new Set();
    sessionListeners.add(listener);
    listeners.set(sessionId, sessionListeners);
    await stream.writeSSE({ event: "connected", data: JSON.stringify({ sessionId }) });
    while (!stream.aborted) {
      await stream.sleep(15000);
      await stream.writeSSE({ event: "ping", data: "{}" });
    }
    sessionListeners.delete(listener);
  });
}
