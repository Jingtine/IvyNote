import { beforeEach, expect, test, vi } from "vitest";

import type { TextDocumentSnapshot } from "../files/fileTypes";
import { readMarkdownFile } from "../files/fileApi";
import { useEditorStore } from "./editorStore";

vi.mock("../files/fileApi", () => ({
  readMarkdownFile: vi.fn(),
}));

const readMarkdownFileMock = vi.mocked(readMarkdownFile);

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

beforeEach(() => {
  readMarkdownFileMock.mockReset();
  useEditorStore.setState({
    document: null,
    draft: "",
    dirty: false,
    loading: false,
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
