import { beforeEach, expect, test, vi } from "vitest";

import type {
  SaveTextDocumentRequest,
  SaveTextDocumentResult,
  TextDocumentSnapshot,
} from "../files/fileTypes";
import { readMarkdownFile, saveMarkdownDocument } from "../files/fileApi";
import { useEditorStore } from "./editorStore";
import { useWorkspaceStore } from "../workspace/workspaceStore";

vi.mock("../files/fileApi", () => ({
  readMarkdownFile: vi.fn(),
  saveMarkdownDocument: vi.fn(),
}));

const readMarkdownFileMock = vi.mocked(readMarkdownFile);
const saveMarkdownDocumentMock = vi.mocked(saveMarkdownDocument);

function makeSnapshot(overrides: Partial<TextDocumentSnapshot> = {}): TextDocumentSnapshot {
  return {
    path: "C:\\notes\\hello.md",
    content: "# Hello\n",
    modifiedAtMs: 1_700_000_000_000,
    size: 9,
    newline: "lf",
    hasUtf8Bom: false,
    ...overrides,
  };
}

function conflictError(): { code: string; message: string; path: string } {
  return {
    code: "externalModificationConflict",
    message: "File was modified externally: C:\\notes\\hello.md",
    path: "C:\\notes\\hello.md",
  };
}

beforeEach(() => {
  readMarkdownFileMock.mockReset();
  saveMarkdownDocumentMock.mockReset();
  useEditorStore.setState({
    document: null,
    draft: "",
    dirty: false,
    loading: false,
    error: null,
    saving: false,
    conflict: false,
    pendingPath: null,
    fileMissing: false,
  });
  useWorkspaceStore.setState({
    workspace: {
      schemaVersion: 1,
      id: "ws-1",
      name: "Personal",
      mounts: [{ path: "C:\\notes", permission: "read-write" }],
    },
    treeByMount: {},
    error: null,
  });
});

test("loading a file sets the snapshot and draft", async () => {
  const snapshot = makeSnapshot();
  readMarkdownFileMock.mockResolvedValue(snapshot);

  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  expect(readMarkdownFileMock).toHaveBeenCalledWith("C:\\notes\\hello.md");
  expect(useEditorStore.getState().document).toEqual(snapshot);
  expect(useEditorStore.getState().draft).toBe("# Hello\n");
  expect(useEditorStore.getState().loading).toBe(false);
});

test("draft equals the normalized snapshot content", async () => {
  readMarkdownFileMock.mockResolvedValue(
    makeSnapshot({ content: "# Hello\r\nWorld\r\n", newline: "crlf", size: 18 }),
  );

  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  expect(useEditorStore.getState().draft).toBe("# Hello\nWorld\n");
});

test("editing the draft marks the document dirty", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  useEditorStore.getState().setDraft("# Hello there\n");

  expect(useEditorStore.getState().dirty).toBe(true);
});

test("setting identical content does not mark the document dirty", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  useEditorStore.getState().setDraft("# Hello\n");

  expect(useEditorStore.getState().dirty).toBe(false);
});

test("loading a new document resets dirty", async () => {
  readMarkdownFileMock.mockResolvedValueOnce(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Changed\n");
  expect(useEditorStore.getState().dirty).toBe(true);

  const second = makeSnapshot({
    path: "C:\\notes\\other.md",
    content: "# Other\n",
    size: 8,
  });
  readMarkdownFileMock.mockResolvedValueOnce(second);
  await useEditorStore.getState().loadDocument("C:\\notes\\other.md");

  expect(useEditorStore.getState().document).toEqual(second);
  expect(useEditorStore.getState().draft).toBe("# Other\n");
  expect(useEditorStore.getState().dirty).toBe(false);
});

test("failed load preserves the previous document and exposes the error", async () => {
  const first = makeSnapshot();
  readMarkdownFileMock.mockResolvedValueOnce(first);
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");

  readMarkdownFileMock.mockRejectedValueOnce(new Error("read failed"));
  await useEditorStore.getState().loadDocument("C:\\notes\\missing.md");

  expect(useEditorStore.getState().document).toEqual(first);
  expect(useEditorStore.getState().draft).toBe("# Edited\n");
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(useEditorStore.getState().loading).toBe(false);
  expect(useEditorStore.getState().error).toBe("read failed");
});

test("editing after a failed load clears the error", async () => {
  readMarkdownFileMock.mockResolvedValueOnce(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  readMarkdownFileMock.mockRejectedValueOnce(new Error("read failed"));
  await useEditorStore.getState().loadDocument("C:\\notes\\missing.md");
  expect(useEditorStore.getState().error).toBe("read failed");

  useEditorStore.getState().setDraft("# Hello there\n");

  expect(useEditorStore.getState().error).toBeNull();
  expect(useEditorStore.getState().dirty).toBe(true);
});

test("setDraft with content identical to the document keeps the error", async () => {
  readMarkdownFileMock.mockResolvedValueOnce(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  readMarkdownFileMock.mockRejectedValueOnce(new Error("read failed"));
  await useEditorStore.getState().loadDocument("C:\\notes\\missing.md");

  useEditorStore.getState().setDraft("# Hello\n");

  expect(useEditorStore.getState().dirty).toBe(false);
  expect(useEditorStore.getState().error).toBe("read failed");
});

test("save sends a request built from the original snapshot metadata", async () => {
  readMarkdownFileMock.mockResolvedValue(
    makeSnapshot({
      content: "# Hello\r\nWorld\r\n",
      size: 18,
      newline: "crlf",
      hasUtf8Bom: true,
    }),
  );
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Hello\nWorld\nEdited\n");
  saveMarkdownDocumentMock.mockResolvedValue({ modifiedAtMs: 1_700_000_000_500, size: 22 });

  await useEditorStore.getState().save();

  const expected: SaveTextDocumentRequest = {
    path: "C:\\notes\\hello.md",
    content: "# Hello\nWorld\nEdited\n",
    expectedModifiedAtMs: 1_700_000_000_000,
    expectedSize: 18,
    newline: "crlf",
    hasUtf8Bom: true,
  };
  expect(saveMarkdownDocumentMock).toHaveBeenCalledTimes(1);
  expect(saveMarkdownDocumentMock).toHaveBeenCalledWith("ws-1", expected);
});

test("successful save updates snapshot metadata and clears dirty", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  saveMarkdownDocumentMock.mockResolvedValue({ modifiedAtMs: 1_700_000_000_500, size: 9 });

  await useEditorStore.getState().save();

  const state = useEditorStore.getState();
  expect(state.dirty).toBe(false);
  expect(state.saving).toBe(false);
  expect(state.document?.modifiedAtMs).toBe(1_700_000_000_500);
  expect(state.document?.size).toBe(9);
  expect(state.document?.content).toBe("# Edited\n");
  expect(state.draft).toBe("# Edited\n");
});

test("failed save keeps the draft and dirty flag and exposes the error", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  saveMarkdownDocumentMock.mockRejectedValue(new Error("disk full"));

  await useEditorStore.getState().save();

  const state = useEditorStore.getState();
  expect(state.dirty).toBe(true);
  expect(state.draft).toBe("# Edited\n");
  expect(state.saving).toBe(false);
  expect(state.error).toBe("disk full");
  expect(state.conflict).toBe(false);
});

test("conflict error shows the conflict state and keeps the draft", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  saveMarkdownDocumentMock.mockRejectedValue(conflictError());

  await useEditorStore.getState().save();

  const state = useEditorStore.getState();
  expect(state.conflict).toBe(true);
  expect(state.dirty).toBe(true);
  expect(state.draft).toBe("# Edited\n");
  expect(state.error).toBeNull();
});

test("dismissConflict clears the conflict state but keeps the draft", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  saveMarkdownDocumentMock.mockRejectedValue(conflictError());
  await useEditorStore.getState().save();
  expect(useEditorStore.getState().conflict).toBe(true);

  useEditorStore.getState().dismissConflict();

  const state = useEditorStore.getState();
  expect(state.conflict).toBe(false);
  expect(state.dirty).toBe(true);
  expect(state.draft).toBe("# Edited\n");
});

test("reload from disk via loadDocument clears the conflict state", async () => {
  readMarkdownFileMock.mockResolvedValueOnce(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  saveMarkdownDocumentMock.mockRejectedValue(conflictError());
  await useEditorStore.getState().save();
  expect(useEditorStore.getState().conflict).toBe(true);

  const fresh = makeSnapshot({ content: "# Externally changed\n", size: 20, modifiedAtMs: 42 });
  readMarkdownFileMock.mockResolvedValueOnce(fresh);
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  const state = useEditorStore.getState();
  expect(state.conflict).toBe(false);
  expect(state.draft).toBe("# Externally changed\n");
  expect(state.dirty).toBe(false);
});

test("save is a no-op when the document is not dirty", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  await useEditorStore.getState().save();

  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
});

test("save is a no-op without an open document", async () => {
  await useEditorStore.getState().save();

  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
});

test("save refuses to write and returns false while the file is missing on disk", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  useEditorStore.getState().setFileMissing(true);

  const saved = await useEditorStore.getState().save();

  expect(saved).toBe(false);
  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(useEditorStore.getState().draft).toBe("# Edited\n");
  expect(useEditorStore.getState().document?.path).toBe("C:\\notes\\hello.md");
});

test("save works again after the file is no longer missing", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  useEditorStore.getState().setFileMissing(true);
  useEditorStore.getState().setFileMissing(false);
  saveMarkdownDocumentMock.mockResolvedValue({ modifiedAtMs: 1_700_000_000_500, size: 9 });

  const saved = await useEditorStore.getState().save();

  expect(saved).toBe(true);
  expect(saveMarkdownDocumentMock).toHaveBeenCalledTimes(1);
});

test("loading another document resets the missing-on-disk state", async () => {
  useEditorStore.getState().setFileMissing(true);
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());

  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  expect(useEditorStore.getState().fileMissing).toBe(false);
});

test("handleWatcherRename follows a rename of the active document without losing the draft", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  useEditorStore.getState().setFileMissing(true);

  useEditorStore
    .getState()
    .handleWatcherRename("C:\\notes\\hello.md", "C:\\notes\\renamed.md");

  const state = useEditorStore.getState();
  expect(state.document?.path).toBe("C:\\notes\\renamed.md");
  expect(state.draft).toBe("# Edited\n");
  expect(state.dirty).toBe(true);
  expect(state.fileMissing).toBe(false);
});

test("handleWatcherRename leaves the document alone when the rename is for another file", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  useEditorStore
    .getState()
    .handleWatcherRename("C:\\notes\\other.md", "C:\\notes\\moved.md");

  const state = useEditorStore.getState();
  expect(state.document?.path).toBe("C:\\notes\\hello.md");
  expect(state.fileMissing).toBe(false);
});

test("handleWatcherRename is a no-op when no document is open", () => {
  useEditorStore.getState().handleWatcherRename("C:\\notes\\hello.md", "C:\\notes\\moved.md");
  expect(useEditorStore.getState().document).toBeNull();
});

test("saveAndOpenPending keeps the draft and the pending request when the file is missing on disk", async () => {
  readMarkdownFileMock.mockResolvedValueOnce(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  useEditorStore.getState().setFileMissing(true);

  useEditorStore.getState().requestOpenDocument("C:\\notes\\other.md");
  expect(useEditorStore.getState().pendingPath).toBe("C:\\notes\\other.md");

  await useEditorStore.getState().saveAndOpenPending();

  const state = useEditorStore.getState();
  expect(state.draft).toBe("# Edited\n");
  expect(state.dirty).toBe(true);
  expect(state.pendingPath).toBe("C:\\notes\\other.md");
  expect(state.document?.path).toBe("C:\\notes\\hello.md");
  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
  expect(readMarkdownFileMock).toHaveBeenCalledTimes(1);
});

test("saveAndOpenPending joins an in-flight save instead of dead-ending", async () => {
  readMarkdownFileMock.mockResolvedValueOnce(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");

  let resolveSave!: (result: SaveTextDocumentResult) => void;
  saveMarkdownDocumentMock.mockImplementation(
    () =>
      new Promise<SaveTextDocumentResult>((resolve) => {
        resolveSave = resolve;
      }),
  );

  const inFlight = useEditorStore.getState().save();
  expect(useEditorStore.getState().saving).toBe(true);

  readMarkdownFileMock.mockResolvedValueOnce(
    makeSnapshot({ path: "C:\\notes\\other.md", content: "# Other\n", size: 8 }),
  );
  useEditorStore.getState().requestOpenDocument("C:\\notes\\other.md");
  expect(useEditorStore.getState().pendingPath).toBe("C:\\notes\\other.md");

  const pending = useEditorStore.getState().saveAndOpenPending();

  resolveSave({ modifiedAtMs: 1_700_000_000_500, size: 9 });
  await inFlight;
  await pending;

  const state = useEditorStore.getState();
  expect(state.document?.path).toBe("C:\\notes\\other.md");
  expect(state.pendingPath).toBeNull();
  expect(state.saving).toBe(false);
  expect(saveMarkdownDocumentMock).toHaveBeenCalledTimes(1);
});

test("followRename updates the active document path, keeping content, draft, and dirty without reloading", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  useEditorStore.getState().setFileMissing(true);

  useEditorStore.getState().followRename("C:\\notes\\hello.md", "C:\\notes\\renamed.md");

  const state = useEditorStore.getState();
  expect(state.document?.path).toBe("C:\\notes\\renamed.md");
  expect(state.document?.content).toBe("# Hello\n");
  expect(state.draft).toBe("# Edited\n");
  expect(state.dirty).toBe(true);
  expect(state.fileMissing).toBe(false);
  expect(readMarkdownFileMock).toHaveBeenCalledTimes(1);
});

test("followRename leaves the document untouched when it does not match the source path", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setFileMissing(true);

  useEditorStore.getState().followRename("C:\\notes\\other.md", "C:\\notes\\moved.md");

  const state = useEditorStore.getState();
  expect(state.document?.path).toBe("C:\\notes\\hello.md");
  expect(state.fileMissing).toBe(true);
});

test("followRename is a no-op when no document is open", () => {
  useEditorStore.getState().followRename("C:\\notes\\hello.md", "C:\\notes\\moved.md");
  expect(useEditorStore.getState().document).toBeNull();
});

test("save on a document under a read-only mount is refused without calling the backend", async () => {
  useWorkspaceStore.setState({
    workspace: {
      schemaVersion: 1,
      id: "ws-1",
      name: "Personal",
      mounts: [{ path: "D:\\wiki", permission: "read-only" }],
    },
    treeByMount: {},
    error: null,
  });
  readMarkdownFileMock.mockResolvedValue(makeSnapshot({ path: "D:\\wiki\\b.md" }));
  await useEditorStore.getState().loadDocument("D:\\wiki\\b.md");
  useEditorStore.getState().setDraft("# Edited\n");

  const saved = await useEditorStore.getState().save();

  expect(saved).toBe(false);
  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(useEditorStore.getState().draft).toBe("# Edited\n");
  expect(useEditorStore.getState().error).toContain("read-only");
});

test("followRename remaps the document path when its parent directory is renamed", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot({ path: "C:\\notes\\sub\\a.md" }));
  await useEditorStore.getState().loadDocument("C:\\notes\\sub\\a.md");
  useEditorStore.getState().setDraft("# Edited\n");
  useEditorStore.getState().setFileMissing(true);

  useEditorStore.getState().followRename("C:\\notes\\sub", "C:\\notes\\renamed-sub");

  const state = useEditorStore.getState();
  expect(state.document?.path).toBe("C:\\notes\\renamed-sub\\a.md");
  expect(state.document?.content).toBe("# Hello\n");
  expect(state.draft).toBe("# Edited\n");
  expect(state.dirty).toBe(true);
  expect(state.fileMissing).toBe(false);
  expect(readMarkdownFileMock).toHaveBeenCalledTimes(1);
});

test("followRename remaps a pending open request under a renamed parent", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot({ path: "C:\\notes\\sub\\a.md" }));
  await useEditorStore.getState().loadDocument("C:\\notes\\sub\\a.md");
  useEditorStore.getState().setDraft("# Edited\n");
  useEditorStore.getState().requestOpenDocument("C:\\notes\\sub\\b.md");
  expect(useEditorStore.getState().pendingPath).toBe("C:\\notes\\sub\\b.md");

  useEditorStore.getState().followRename("C:\\notes\\sub", "C:\\notes\\renamed-sub");

  expect(useEditorStore.getState().pendingPath).toBe("C:\\notes\\renamed-sub\\b.md");
});

test("followRename leaves the document untouched when the rename only shares a sibling prefix", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setFileMissing(true);

  useEditorStore.getState().followRename("C:\\notes2", "C:\\notes2-renamed");

  const state = useEditorStore.getState();
  expect(state.document?.path).toBe("C:\\notes\\hello.md");
  expect(state.fileMissing).toBe(true);
});

test("closeIfInMount closes a clean document inside the mount and returns true", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  const closed = useEditorStore.getState().closeIfInMount("C:\\notes");

  expect(closed).toBe(true);
  const state = useEditorStore.getState();
  expect(state.document).toBeNull();
  expect(state.draft).toBe("");
  expect(state.dirty).toBe(false);
});

test("closeIfInMount keeps a dirty document and returns false", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");

  const closed = useEditorStore.getState().closeIfInMount("C:\\notes");

  expect(closed).toBe(false);
  const state = useEditorStore.getState();
  expect(state.document?.path).toBe("C:\\notes\\hello.md");
  expect(state.draft).toBe("# Edited\n");
  expect(state.dirty).toBe(true);
});

test("closeIfInMount returns true without closing when no document is open", () => {
  expect(useEditorStore.getState().closeIfInMount("C:\\notes")).toBe(true);
  expect(useEditorStore.getState().document).toBeNull();
});

test("closeIfInMount returns true without closing when the document is not inside the mount", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  const closed = useEditorStore.getState().closeIfInMount("D:\\wiki");

  expect(closed).toBe(true);
  expect(useEditorStore.getState().document?.path).toBe("C:\\notes\\hello.md");
});

test("closeIfInMount does not treat a sibling path prefix as inside the mount", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");

  const closed = useEditorStore.getState().closeIfInMount("C:\\notes2");

  expect(closed).toBe(true);
  expect(useEditorStore.getState().document?.path).toBe("C:\\notes\\hello.md");
});

test("clearDocument resets the document, draft, and dirty state", async () => {
  readMarkdownFileMock.mockResolvedValue(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  useEditorStore.getState().setFileMissing(true);
  useEditorStore.getState().requestOpenDocument("C:\\notes\\other.md");

  useEditorStore.getState().clearDocument();

  const state = useEditorStore.getState();
  expect(state.document).toBeNull();
  expect(state.draft).toBe("");
  expect(state.dirty).toBe(false);
  expect(state.fileMissing).toBe(false);
  expect(state.pendingPath).toBeNull();
  expect(state.error).toBeNull();
});

test("discardAndOpenPending clears the discarded draft even when the next load fails", async () => {
  readMarkdownFileMock.mockResolvedValueOnce(makeSnapshot());
  await useEditorStore.getState().loadDocument("C:\\notes\\hello.md");
  useEditorStore.getState().setDraft("# Edited\n");
  readMarkdownFileMock.mockRejectedValueOnce(new Error("read failed"));

  useEditorStore.getState().requestOpenDocument("C:\\notes\\other.md");
  await useEditorStore.getState().discardAndOpenPending();

  const state = useEditorStore.getState();
  expect(state.document).toBeNull();
  expect(state.draft).toBe("");
  expect(state.dirty).toBe(false);
  expect(state.pendingPath).toBeNull();
  expect(state.error).toBe("read failed");
});
