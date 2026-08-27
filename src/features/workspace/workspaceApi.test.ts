import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";

import type { FileTreeNode } from "../files/fileTypes";
import { scanRoot } from "./workspaceApi";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

test("scanRoot invokes scan_root with the root argument shape", async () => {
  const tree: FileTreeNode[] = [
    {
      name: "Notes",
      path: "C:\\notes",
      kind: "directory",
      children: [{ name: "hello.md", path: "C:\\notes\\hello.md", kind: "markdown" }],
    },
  ];
  invokeMock.mockResolvedValue(tree);

  const result = await scanRoot("C:\\notes");

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("scan_root", { root: "C:\\notes" });
  expect(result).toEqual(tree);
});

test("scanRoot propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("boom"));

  await expect(scanRoot("C:\\missing")).rejects.toThrow("boom");
  expect(invokeMock).toHaveBeenCalledWith("scan_root", { root: "C:\\missing" });
});
