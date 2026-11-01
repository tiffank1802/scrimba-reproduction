import { z } from "zod";
import { FILE_IDS, normaliseSession, type ScrimSession } from "./session";

const selection = z.object({
  startLineNumber: z.number().int().positive(),
  startColumn: z.number().int().positive(),
  endLineNumber: z.number().int().positive(),
  endColumn: z.number().int().positive(),
});

const projectFile = z.object({
  id: z.enum(FILE_IDS),
  label: z.string(),
  path: z.string(),
  language: z.enum(["html", "css", "javascript"]),
  content: z.string(),
});

const workspace = z.object({
  files: z.object({
    html: projectFile,
    css: projectFile,
    javascript: projectFile,
  }),
  activeFileId: z.enum(FILE_IDS),
  selections: z.object({ html: selection, css: selection, javascript: selection }),
});

const change = z.object({
  offset: z.number().int().nonnegative(),
  deleteCount: z.number().int().nonnegative(),
  insertText: z.string(),
});

const scrimEvent = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    at: z.number().nonnegative(),
    kind: z.literal("edit"),
    fileId: z.enum(FILE_IDS),
    changes: z.array(change),
  }),
  z.object({
    id: z.string(),
    at: z.number().nonnegative(),
    kind: z.literal("selection"),
    fileId: z.enum(FILE_IDS),
    selection,
  }),
  z.object({
    id: z.string(),
    at: z.number().nonnegative(),
    kind: z.literal("file-switch"),
    fileId: z.enum(FILE_IDS),
  }),
]);

const sessionSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  title: z.string(),
  createdAt: z.string(),
  duration: z.number().nonnegative(),
  initialWorkspace: workspace,
  events: z.array(scrimEvent),
  snapshots: z.array(
    z.object({
      at: z.number().nonnegative(),
      eventIndex: z.number().int().nonnegative(),
      workspace,
    }),
  ),
  audio: z
    .object({ blobId: z.string(), mimeType: z.string(), duration: z.number().nonnegative() })
    .optional(),
});

export function parseImportedSession(value: unknown): ScrimSession {
  return normaliseSession(sessionSchema.parse(value));
}
