import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";

import type { TextDocumentSnapshot } from "./fileTypes";
import { readMarkdownFile } from "./fileApi";

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
