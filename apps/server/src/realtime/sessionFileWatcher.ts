import { watch } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { publishSessionEvent } from "./sessionStream";
import { SESSION_DATA_ROOT } from "../store/fileStore";

let watcherStarted = false;
const debounceTimers = new Map<string, NodeJS.Timeout>();
const watchedSessionDirs = new Set<string>();

export async function startSessionFileWatcher(): Promise<void> {
  if (watcherStarted) return;
  watcherStarted = true;

  await mkdir(SESSION_DATA_ROOT, { recursive: true });
  for (const sessionId of await existingSessionIds()) watchSessionDir(sessionId);

  const rootWatcher = watch(SESSION_DATA_ROOT, (_eventType, fileName) => {
    if (!fileName) return;
    const sessionId = path.basename(fileName.toString());
    if (sessionId) watchSessionDir(sessionId);
  });

  rootWatcher.on("error", (error) => {
    console.error("session file watcher failed", error);
  });
}

function watchSessionDir(sessionId: string): void {
  if (watchedSessionDirs.has(sessionId)) return;

  const sessionDir = path.join(SESSION_DATA_ROOT, sessionId);
  watchedSessionDirs.add(sessionId);

  try {
    const watcher = watch(sessionDir, (_eventType, fileName) => {
      if (fileName?.toString() === "session.json") scheduleSessionUpdate(sessionId);
    });
    watcher.on("error", (error) => {
      watchedSessionDirs.delete(sessionId);
      console.error(`session file watcher failed for ${sessionId}`, error);
    });
  } catch {
    watchedSessionDirs.delete(sessionId);
  }
}

function scheduleSessionUpdate(sessionId: string): void {
  const existingTimer = debounceTimers.get(sessionId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    debounceTimers.delete(sessionId);
    publishSessionEvent({ type: "session.updated", sessionId });
  }, 100);
  debounceTimers.set(sessionId, timer);
}

async function existingSessionIds(): Promise<string[]> {
  const entries = await readdir(SESSION_DATA_ROOT, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}
