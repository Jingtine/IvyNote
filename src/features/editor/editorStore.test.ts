import { beforeEach, expect, test, vi } from "vitest";

import type { SaveTextDocumentRequest, TextDocumentSnapshot } from "../files/fileTypes";
import { readMarkdownFile, saveMarkdownDocument } from "../files/fileApi";
import { useEditorStore } from "./editorStore";

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
  expect(saveMarkdownDocumentMock).toHaveBeenCalledWith(expected);
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
