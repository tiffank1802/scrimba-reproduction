import { openDB, type DBSchema } from "idb";
import type { LearnerBranch, ScrimSession } from "../core/session";

interface ScrimDatabase extends DBSchema {
  sessions: {
    key: string;
    value: ScrimSession;
  };
  audio: {
    key: string;
    value: Blob;
  };
  branches: {
    key: string;
    value: LearnerBranch;
    indexes: { "by-session": string };
  };
}

const database = openDB<ScrimDatabase>("scrim-studio", 1, {
  upgrade(db) {
    db.createObjectStore("sessions", { keyPath: "id" });
    db.createObjectStore("audio");
    const branches = db.createObjectStore("branches", { keyPath: "id" });
    branches.createIndex("by-session", "sessionId");
  },
});

export async function saveSession(session: ScrimSession): Promise<void> {
  const db = await database;
  await db.put("sessions", session);
}

export async function getSession(id: string): Promise<ScrimSession | undefined> {
  const db = await database;
  return db.get("sessions", id);
}

export async function saveAudio(id: string, audio: Blob): Promise<void> {
  const db = await database;
  await db.put("audio", audio, id);
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  const db = await database;
  return db.get("audio", id);
}

export async function saveBranch(branch: LearnerBranch): Promise<void> {
  const db = await database;
  await db.put("branches", branch);
}

export async function listBranches(sessionId: string): Promise<LearnerBranch[]> {
  const db = await database;
  return db.getAllFromIndex("branches", "by-session", sessionId);
}

export async function deleteBranch(id: string): Promise<void> {
  const db = await database;
  await db.delete("branches", id);
}
