import {
  buildSnapshots,
  cloneWorkspace,
  compactEvents,
  createId,
  type EditorSelection,
  type FileId,
  type ScrimEvent,
  type ScrimSession,
  type TextChange,
  type WorkspaceState,
} from "./session";

/**
 * The recorder owns a logical clock. Its clock freezes when a recording is
 * paused, which keeps code events aligned with a paused MediaRecorder stream.
 */
export class SessionRecorder {
  private readonly initialWorkspace: WorkspaceState;
  private readonly title: string;
  private events: ScrimEvent[] = [];
  private startedAt = 0;
  private pausedAt: number | null = null;
  private pausedDuration = 0;
  private isStarted = false;

  constructor(initialWorkspace: WorkspaceState, title: string) {
    this.initialWorkspace = cloneWorkspace(initialWorkspace);
    this.title = title;
  }

  start(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    this.startedAt = performance.now();
  }

  pause(): void {
    if (!this.isStarted || this.pausedAt !== null) return;
    this.pausedAt = performance.now();
  }

  resume(): void {
    if (!this.isStarted || this.pausedAt === null) return;
    this.pausedDuration += performance.now() - this.pausedAt;
    this.pausedAt = null;
  }

  get active(): boolean {
    return this.isStarted && this.pausedAt === null;
  }

  get elapsed(): number {
    if (!this.isStarted) return 0;
    const now = this.pausedAt ?? performance.now();
    return Math.max(0, Math.round(now - this.startedAt - this.pausedDuration));
  }

  recordEdit(fileId: FileId, changes: TextChange[]): void {
    if (!this.active || changes.length === 0) return;
    this.events.push({
      id: createId("edit"),
      at: this.elapsed,
      kind: "edit",
      fileId,
      changes: changes.map((change) => ({ ...change })),
    });
  }

  recordSelection(fileId: FileId, selection: EditorSelection): void {
    if (!this.active) return;
    this.events.push({
      id: createId("selection"),
      at: this.elapsed,
      kind: "selection",
      fileId,
      selection: { ...selection },
    });
  }

  recordFileSwitch(fileId: FileId): void {
    if (!this.active) return;
    this.events.push({
      id: createId("file"),
      at: this.elapsed,
      kind: "file-switch",
      fileId,
    });
  }

  finish(finalWorkspace: WorkspaceState): ScrimSession {
    const events = compactEvents(this.events);
    const duration = Math.max(this.elapsed, events.at(-1)?.at ?? 0);
    const paddedDuration = duration === 0 ? 0 : duration + 350;

    return {
      version: 1,
      id: createId("scrim"),
      title: this.title.trim() || "Leçon sans titre",
      createdAt: new Date().toISOString(),
      duration: paddedDuration,
      initialWorkspace: cloneWorkspace(this.initialWorkspace),
      events,
      snapshots: buildSnapshots(this.initialWorkspace, events, paddedDuration),
    };
  }
}
