import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, expect, test, vi } from "vitest";

import type { FileTreeNode } from "../files/fileTypes";
import { scanRoot } from "./workspaceApi";
import { useWorkspaceStore } from "./workspaceStore";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("./workspaceApi", () => ({
  scanRoot: vi.fn(),
}));

const openMock = vi.mocked(open);
const scanRootMock = vi.mocked(scanRoot);

const sampleTree: FileTreeNode[] = [
  {
    name: "notes",
    path: "C:\\notes",
    kind: "directory",
    children: [{ name: "hello.md", path: "C:\\notes\\hello.md", kind: "markdown" }],
  },
];

beforeEach(() => {
  openMock.mockReset();
  scanRootMock.mockReset();
  useWorkspaceStore.setState({ rootPath: null, tree: [], error: null });
});

test("initial root is null", () => {
  expect(useWorkspaceStore.getInitialState().rootPath).toBeNull();
});

test("selecting a folder stores the path", async () => {
  openMock.mockResolvedValue("C:\\notes");
  scanRootMock.mockResolvedValue(sampleTree);

  await useWorkspaceStore.getState().openRoot();

  expect(useWorkspaceStore.getState().rootPath).toBe("C:\\notes");
});

test("scanner result becomes the current tree", async () => {
  openMock.mockResolvedValue("C:\\notes");
  scanRootMock.mockResolvedValue(sampleTree);

  await useWorkspaceStore.getState().openRoot();

  expect(scanRootMock).toHaveBeenCalledWith("C:\\notes");
  expect(useWorkspaceStore.getState().tree).toEqual(sampleTree);
});

test("cancelling folder dialog does not mutate state", async () => {
  useWorkspaceStore.setState({ rootPath: "C:\\old", tree: sampleTree });
  openMock.mockResolvedValue(null);

  await useWorkspaceStore.getState().openRoot();

  expect(useWorkspaceStore.getState().rootPath).toBe("C:\\old");
  expect(useWorkspaceStore.getState().tree).toEqual(sampleTree);
  expect(scanRootMock).not.toHaveBeenCalled();
});

test("scanner error leaves previous root/tree untouched and records an error", async () => {
  useWorkspaceStore.setState({ rootPath: "C:\\old", tree: sampleTree });
  openMock.mockResolvedValue("C:\\notes");
  scanRootMock.mockRejectedValue(new Error("scan failed"));

  await useWorkspaceStore.getState().openRoot();

  expect(useWorkspaceStore.getState().rootPath).toBe("C:\\old");
  expect(useWorkspaceStore.getState().tree).toEqual(sampleTree);
  expect(useWorkspaceStore.getState().error).toBe("scan failed");
});

test("refreshTree rescans the current root", async () => {
  useWorkspaceStore.setState({ rootPath: "C:\\notes" });
  scanRootMock.mockResolvedValue(sampleTree);

  await useWorkspaceStore.getState().refreshTree();

  expect(scanRootMock).toHaveBeenCalledWith("C:\\notes");
  expect(useWorkspaceStore.getState().tree).toEqual(sampleTree);
});

test("refresh replaces a scanned tree while keeping the same root", async () => {
  const treeA: FileTreeNode[] = [{ name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" }];
  const treeB: FileTreeNode[] = [{ name: "b.md", path: "C:\\notes\\b.md", kind: "markdown" }];
  openMock.mockResolvedValue("C:\\notes");
  scanRootMock.mockResolvedValueOnce(treeA).mockResolvedValueOnce(treeB);

  await useWorkspaceStore.getState().openRoot();
  await useWorkspaceStore.getState().refreshTree();

  expect(scanRootMock).toHaveBeenCalledTimes(2);
  expect(scanRootMock).toHaveBeenNthCalledWith(2, "C:\\notes");
  expect(useWorkspaceStore.getState().tree).toEqual(treeB);
  expect(useWorkspaceStore.getState().rootPath).toBe("C:\\notes");
  expect(useWorkspaceStore.getState().error).toBeNull();
});

test("refresh error keeps the old tree visible and records the error", async () => {
  const treeA: FileTreeNode[] = [{ name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" }];
  useWorkspaceStore.setState({ rootPath: "C:\\notes", tree: treeA });
  scanRootMock.mockRejectedValue(new Error("refresh failed"));

  await useWorkspaceStore.getState().refreshTree();

  expect(useWorkspaceStore.getState().tree).toEqual(treeA);
  expect(useWorkspaceStore.getState().rootPath).toBe("C:\\notes");
  expect(useWorkspaceStore.getState().error).toBe("refresh failed");
});
