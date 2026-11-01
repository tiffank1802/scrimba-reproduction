import { describe, expect, it } from "vitest";
import {
  applyTextChanges,
  buildSnapshots,
  makeWorkspace,
  stateAt,
  type ScrimEvent,
  type ScrimSession,
} from "./session";

describe("scrim session engine", () => {
  it("applies simultaneous Monaco changes against their original offsets", () => {
    expect(
      applyTextChanges("abcdef", [
        { offset: 1, deleteCount: 2, insertText: "X" },
        { offset: 4, deleteCount: 1, insertText: "YZ" },
      ]),
    ).toBe("aXdYZf");
  });

  it("reconstructs a state from its nearest snapshot", () => {
    const initial = makeWorkspace({ html: "one" });
    const events: ScrimEvent[] = [
      {
        id: "first",
        at: 100,
        kind: "edit",
        fileId: "html",
        changes: [{ offset: 3, deleteCount: 0, insertText: " two" }],
      },
      { id: "switch", at: 5_300, kind: "file-switch", fileId: "css" },
      {
        id: "css",
        at: 5_400,
        kind: "edit",
        fileId: "css",
        changes: [{ offset: 0, deleteCount: 0, insertText: "body { color: red; }" }],
      },
    ];
    const session: ScrimSession = {
      version: 1,
      id: "test",
      title: "Test",
      createdAt: new Date().toISOString(),
      duration: 6_000,
      initialWorkspace: initial,
      events,
      snapshots: buildSnapshots(initial, events, 6_000, 5_000),
    };

    expect(stateAt(session, 90).files.html.content).toBe("one");
    expect(stateAt(session, 5_350).files.html.content).toBe("one two");
    expect(stateAt(session, 6_000).files.css.content).toBe("body { color: red; }");
    expect(stateAt(session, 6_000).activeFileId).toBe("css");
  });
});
