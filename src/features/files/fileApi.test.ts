import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";

import type { SaveTextDocumentRequest, TextDocumentSnapshot } from "./fileTypes";
import { readMarkdownFile, saveMarkdownDocument } from "./fileApi";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

test("readMarkdownFile invokes read_markdown_file with the path argument shape", async () => {
  const snapshot: TextDocumentSnapshot = {
    path: "C:\\notes\\hello.md",
    content: "# Hello\n",
    modifiedAtMs: 1_700_000_000_000,
    size: 9,
    newline: "lf",
    hasUtf8Bom: false,
  };
  invokeMock.mockResolvedValue(snapshot);

  const result = await readMarkdownFile("C:\\notes\\hello.md");

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("read_markdown_file", {
    path: "C:\\notes\\hello.md",
  });
  expect(result).toEqual(snapshot);
});

test("readMarkdownFile propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("boom"));

  await expect(readMarkdownFile("C:\\missing.md")).rejects.toThrow("boom");
  expect(invokeMock).toHaveBeenCalledWith("read_markdown_file", {
    path: "C:\\missing.md",
  });
});

test("saveMarkdownDocument invokes save_markdown_file with the request argument shape", async () => {
  const request: SaveTextDocumentRequest = {
    path: "C:\\notes\\hello.md",
    content: "# Hello\nEdited\n",
    expectedModifiedAtMs: 1_700_000_000_000,
    expectedSize: 9,
    newline: "lf",
    hasUtf8Bom: false,
  };
  invokeMock.mockResolvedValue({ modifiedAtMs: 1_700_000_000_500, size: 16 });

  const result = await saveMarkdownDocument(request);

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("save_markdown_file", { request });
  expect(result).toEqual({ modifiedAtMs: 1_700_000_000_500, size: 16 });
});

test("saveMarkdownDocument propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("conflict"));

  await expect(
    saveMarkdownDocument({
      path: "C:\\notes\\hello.md",
      content: "# Hello\n",
      expectedModifiedAtMs: 1,
      expectedSize: 1,
      newline: "lf",
      hasUtf8Bom: false,
    }),
  ).rejects.toThrow("conflict");
});
