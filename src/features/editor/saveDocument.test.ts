import { beforeEach, expect, test, vi } from "vitest";

import type { TextDocumentSnapshot } from "../files/fileTypes";
import { saveMarkdownDocument } from "../files/fileApi";
import {
  buildSaveRequest,
  isExternalModificationConflict,
  saveDocument,
} from "./saveDocument";

vi.mock("../files/fileApi", () => ({
  saveMarkdownDocument: vi.fn(),
}));

const saveMarkdownDocumentMock = vi.mocked(saveMarkdownDocument);

function makeSnapshot(overrides: Partial<TextDocumentSnapshot> = {}): TextDocumentSnapshot {
  return {
    path: "C:\\notes\\hello.md",
    content: "# Hello\r\nWorld\r\n",
    modifiedAtMs: 1_700_000_000_000,
    size: 18,
    newline: "crlf",
    hasUtf8Bom: true,
    ...overrides,
  };
}

beforeEach(() => {
  saveMarkdownDocumentMock.mockReset();
});

test("buildSaveRequest uses the original snapshot metadata, not the draft", () => {
  const snapshot = makeSnapshot();

  const request = buildSaveRequest(snapshot, "# Hello\nWorld\nEdited\n");

  expect(request).toEqual({
    path: "C:\\notes\\hello.md",
    content: "# Hello\nWorld\nEdited\n",
    expectedModifiedAtMs: 1_700_000_000_000,
    expectedSize: 18,
    newline: "crlf",
    hasUtf8Bom: true,
  });
});

test("saveDocument delegates to saveMarkdownDocument with the built request", async () => {
  const snapshot = makeSnapshot();
  const result = { modifiedAtMs: 1_700_000_000_500, size: 22 };
  saveMarkdownDocumentMock.mockResolvedValue(result);

  const returned = await saveDocument(snapshot, "# Hello\nWorld\nEdited\n");

  expect(saveMarkdownDocumentMock).toHaveBeenCalledTimes(1);
  expect(saveMarkdownDocumentMock).toHaveBeenCalledWith({
    path: "C:\\notes\\hello.md",
    content: "# Hello\nWorld\nEdited\n",
    expectedModifiedAtMs: 1_700_000_000_000,
    expectedSize: 18,
    newline: "crlf",
    hasUtf8Bom: true,
  });
  expect(returned).toEqual(result);
});

test("saveDocument propagates rejection", async () => {
  saveMarkdownDocumentMock.mockRejectedValue(new Error("save failed"));

  await expect(saveDocument(makeSnapshot(), "# Draft\n")).rejects.toThrow("save failed");
});

test("isExternalModificationConflict matches the serialized Rust error code", () => {
  expect(
    isExternalModificationConflict({
      code: "externalModificationConflict",
      message: "File was modified externally: a.md",
      path: "a.md",
    }),
  ).toBe(true);
});

test("isExternalModificationConflict rejects other error shapes", () => {
  expect(isExternalModificationConflict(new Error("boom"))).toBe(false);
  expect(isExternalModificationConflict({ code: "io", message: "boom" })).toBe(false);
  expect(isExternalModificationConflict("externalModificationConflict")).toBe(false);
  expect(isExternalModificationConflict(null)).toBe(false);
});
