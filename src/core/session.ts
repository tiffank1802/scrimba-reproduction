export const FILE_IDS = ["html", "css", "javascript"] as const;

export type FileId = (typeof FILE_IDS)[number];
export type PlaybackStatus = "idle" | "playing" | "paused";

export type EditorSelection = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

export type TextChange = {
  offset: number;
  deleteCount: number;
  insertText: string;
};

export type ProjectFile = {
  id: FileId;
  label: string;
  path: string;
  language: "html" | "css" | "javascript";
  content: string;
};

export type WorkspaceState = {
  files: Record<FileId, ProjectFile>;
  activeFileId: FileId;
  selections: Record<FileId, EditorSelection>;
};

export type EditEvent = {
  id: string;
  at: number;
  kind: "edit";
  fileId: FileId;
  changes: TextChange[];
};

export type SelectionEvent = {
  id: string;
  at: number;
  kind: "selection";
  fileId: FileId;
  selection: EditorSelection;
};

export type FileSwitchEvent = {
  id: string;
  at: number;
  kind: "file-switch";
  fileId: FileId;
};

export type ScrimEvent = EditEvent | SelectionEvent | FileSwitchEvent;

export type Snapshot = {
  at: number;
  eventIndex: number;
  workspace: WorkspaceState;
};

export type AudioMetadata = {
  blobId: string;
  mimeType: string;
  duration: number;
};

export type ScrimSession = {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  duration: number;
  initialWorkspace: WorkspaceState;
  events: ScrimEvent[];
  snapshots: Snapshot[];
  audio?: AudioMetadata;
};

export type LearnerBranch = {
  id: string;
  sessionId: string;
  parentBranchId?: string;
  createdAt: string;
  forkAt: number;
  baseSnapshot: Snapshot;
  operations: ScrimEvent[];
  label: string;
};

export const DEFAULT_SELECTION: EditorSelection = {
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 1,
  endColumn: 1,
};

export const fileDefinitions: Record<
  FileId,
  Omit<ProjectFile, "content">
> = {
  html: {
    id: "html",
    label: "index.html",
    path: "file:///index.html",
    language: "html",
  },
  css: {
    id: "css",
    label: "styles.css",
    path: "file:///styles.css",
    language: "css",
  },
  javascript: {
    id: "javascript",
    label: "app.js",
    path: "file:///app.js",
    language: "javascript",
  },
};

export function makeWorkspace(
  content: Partial<Record<FileId, string>> = {},
): WorkspaceState {
  const files = Object.fromEntries(
    FILE_IDS.map((id) => [
      id,
      { ...fileDefinitions[id], content: content[id] ?? "" },
    ]),
  ) as Record<FileId, ProjectFile>;

  const selections = Object.fromEntries(
    FILE_IDS.map((id) => [id, { ...DEFAULT_SELECTION }]),
  ) as Record<FileId, EditorSelection>;

  return { files, selections, activeFileId: "html" };
}

export function cloneWorkspace(workspace: WorkspaceState): WorkspaceState {
  return {
    activeFileId: workspace.activeFileId,
    files: Object.fromEntries(
      FILE_IDS.map((id) => [id, { ...workspace.files[id] }]),
    ) as Record<FileId, ProjectFile>,
    selections: Object.fromEntries(
      FILE_IDS.map((id) => [id, { ...workspace.selections[id] }]),
    ) as Record<FileId, EditorSelection>,
  };
}

export function createId(prefix = "evt"): string {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

/** Applies offsets that all reference the document before the event. */
export function applyTextChanges(text: string, changes: TextChange[]): string {
  return [...changes]
    .sort((left, right) => right.offset - left.offset)
    .reduce((value, change) => {
      const offset = Math.max(0, Math.min(change.offset, value.length));
      const deleteEnd = Math.max(offset, Math.min(offset + change.deleteCount, value.length));
      return `${value.slice(0, offset)}${change.insertText}${value.slice(deleteEnd)}`;
    }, text);
}

export function applyEvent(
  workspace: WorkspaceState,
  event: ScrimEvent,
): WorkspaceState {
  const next = cloneWorkspace(workspace);

  if (event.kind === "edit") {
    const file = next.files[event.fileId];
    next.files[event.fileId] = {
      ...file,
      content: applyTextChanges(file.content, event.changes),
    };
  }

  if (event.kind === "selection") {
    next.selections[event.fileId] = { ...event.selection };
  }

  if (event.kind === "file-switch") {
    next.activeFileId = event.fileId;
  }

  return next;
}

export function eventIndexAt(events: ScrimEvent[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle].at <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function stateAt(session: ScrimSession, time: number): WorkspaceState {
  const target = Math.max(0, Math.min(time, session.duration));
  let snapshot = session.snapshots[0];

  for (const candidate of session.snapshots) {
    if (candidate.at <= target) snapshot = candidate;
    else break;
  }

  let workspace = cloneWorkspace(snapshot?.workspace ?? session.initialWorkspace);
  const startIndex = snapshot?.eventIndex ?? 0;
  const endIndex = eventIndexAt(session.events, target);

  for (let index = startIndex; index < endIndex; index += 1) {
    workspace = applyEvent(workspace, session.events[index]);
  }

  return workspace;
}

export function compactEvents(events: ScrimEvent[]): ScrimEvent[] {
  const compacted: ScrimEvent[] = [];

  for (const event of events) {
    const previous = compacted.at(-1);

    if (
      previous?.kind === "edit" &&
      event.kind === "edit" &&
      previous.fileId === event.fileId &&
      event.at - previous.at <= 280 &&
      previous.changes.length === 1 &&
      event.changes.length === 1
    ) {
      const before = previous.changes[0];
      const after = event.changes[0];
      const areAdjacentInsertions =
        before.deleteCount === 0 &&
        after.deleteCount === 0 &&
        after.offset === before.offset + before.insertText.length;

      if (areAdjacentInsertions) {
        previous.changes = [
          { ...before, insertText: `${before.insertText}${after.insertText}` },
        ];
        continue;
      }
    }

    if (
      previous?.kind === "selection" &&
      event.kind === "selection" &&
      previous.fileId === event.fileId &&
      event.at - previous.at <= 180
    ) {
      compacted[compacted.length - 1] = event;
      continue;
    }

    compacted.push(event);
  }

  return compacted;
}

export function buildSnapshots(
  initialWorkspace: WorkspaceState,
  events: ScrimEvent[],
  duration: number,
  everyMilliseconds = 5_000,
  everyEvents = 100,
): Snapshot[] {
  const snapshots: Snapshot[] = [
    { at: 0, eventIndex: 0, workspace: cloneWorkspace(initialWorkspace) },
  ];
  let workspace = cloneWorkspace(initialWorkspace);
  let lastSnapshotAt = 0;

  events.forEach((event, index) => {
    workspace = applyEvent(workspace, event);
    const isInterval = event.at - lastSnapshotAt >= everyMilliseconds;
    const isEventBoundary = (index + 1) % everyEvents === 0;

    if (isInterval || isEventBoundary) {
      snapshots.push({
        at: event.at,
        eventIndex: index + 1,
        workspace: cloneWorkspace(workspace),
      });
      lastSnapshotAt = event.at;
    }
  });

  const finalSnapshot = snapshots.at(-1);
  if (!finalSnapshot || finalSnapshot.eventIndex !== events.length) {
    snapshots.push({
      at: duration,
      eventIndex: events.length,
      workspace: cloneWorkspace(workspace),
    });
  }

  return snapshots;
}

export function normaliseSession(session: ScrimSession): ScrimSession {
  const events = [...session.events].sort((left, right) => left.at - right.at);
  const duration = Math.max(session.duration, events.at(-1)?.at ?? 0);
  return {
    ...session,
    duration,
    events,
    snapshots: buildSnapshots(session.initialWorkspace, events, duration),
  };
}
