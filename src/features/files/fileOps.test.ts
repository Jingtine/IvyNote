import { beforeEach, expect, test, vi } from "vitest";

import { scanRoot } from "../workspace/workspaceApi";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import {
  createFolder,
  createMarkdown,
  deleteToTrash,
  movePath,
  renamePath,
} from "./fileApi";
import { createItem, deleteItem, moveItem, renameItem } from "./fileOps";
import type { FileTreeNode } from "./fileTypes";

vi.mock("./fileApi", () => ({
  createFolder: vi.fn(),
  createMarkdown: vi.fn(),
  renamePath: vi.fn(),
  movePath: vi.fn(),
  deleteToTrash: vi.fn(),
}));

vi.mock("../workspace/workspaceApi", () => ({
  createWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  listRecentWorkspaces: vi.fn(),
  scanRoot: vi.fn(),
}));

const createFolderMock = vi.mocked(createFolder);
const createMarkdownMock = vi.mocked(createMarkdown);
const renamePathMock = vi.mocked(renamePath);
const movePathMock = vi.mocked(movePath);
const deleteToTrashMock = vi.mocked(deleteToTrash);
const scanRootMock = vi.mocked(scanRoot);

const notesTree: FileTreeNode[] = [
  { name: "notes", path: "C:\\notes\\notes", kind: "directory", children: [] },
];

function setStoreState(treeByMount: Record<string, FileTreeNode[]>) {
  useWorkspaceStore.setState({
    workspace: {
      schemaVersion: 1,
      id: "ws-1",
      name: "Personal",
      mounts: [
        { path: "C:\\notes", permission: "read-write" },
        { path: "D:\\wiki", permission: "read-only" },
      ],
    },
    treeByMount,
    error: null,
  });
}

function treeForMount(mountPath: string, tree: FileTreeNode[]): Record<string, FileTreeNode[]> {
  return { [mountPath]: tree };
}

beforeEach(() => {
  createFolderMock.mockReset();
  createMarkdownMock.mockReset();
  renamePathMock.mockReset();
  movePathMock.mockReset();
  deleteToTrashMock.mockReset();
  scanRootMock.mockReset();
  useWorkspaceStore.setState({ workspace: null, treeByMount: {}, error: null });
});

test("createItem for markdown calls createMarkdown with exact args and reconciles the tree", async () => {
  setStoreState(treeForMount("C:\\notes", notesTree));
  createMarkdownMock.mockResolvedValue("C:\\notes\\notes\\idea.md");
  scanRootMock.mockResolvedValue([
    {
      name: "notes",
      path: "C:\\notes\\notes",
      kind: "directory",
      children: [{ name: "idea.md", path: "C:\\notes\\notes\\idea.md", kind: "markdown" }],
    },
  ]);

  const ok = await createItem("markdown", "C:\\notes\\notes", "idea.md");

  expect(ok).toBe(true);
  expect(createMarkdownMock).toHaveBeenCalledTimes(1);
  expect(createMarkdownMock).toHaveBeenCalledWith("ws-1", "C:\\notes\\notes", "idea.md");
  const state = useWorkspaceStore.getState();
  expect(state.treeByMount["C:\\notes"]).toEqual([
    {
      name: "notes",
      path: "C:\\notes\\notes",
      kind: "directory",
      children: [{ name: "idea.md", path: "C:\\notes\\notes\\idea.md", kind: "markdown" }],
    },
  ]);
  expect(state.error).toBeNull();
});

test("createItem for a folder calls createFolder with exact args", async () => {
  setStoreState(treeForMount("C:\\notes", notesTree));
  createFolderMock.mockResolvedValue("C:\\notes\\notes\\ideas");
  scanRootMock.mockResolvedValue([
    {
      name: "notes",
      path: "C:\\notes\\notes",
      kind: "directory",
      children: [{ name: "ideas", path: "C:\\notes\\notes\\ideas", kind: "directory" }],
    },
  ]);

  const ok = await createItem("folder", "C:\\notes\\notes", "ideas");

  expect(ok).toBe(true);
  expect(createFolderMock).toHaveBeenCalledWith("ws-1", "C:\\notes\\notes", "ideas");
});

test("renameItem calls renamePath with exact args and updates the tree to the new name", async () => {
  const before = [
    { name: "old.md", path: "C:\\notes\\old.md", kind: "markdown" } as const,
  ];
  setStoreState(treeForMount("C:\\notes", before as unknown as FileTreeNode[]));
  renamePathMock.mockResolvedValue("C:\\notes\\renamed.md");
  scanRootMock.mockResolvedValue([
    { name: "renamed.md", path: "C:\\notes\\renamed.md", kind: "markdown" },
  ]);

  const ok = await renameItem("C:\\notes\\old.md", "renamed.md");

  expect(ok).toBe(true);
  expect(renamePathMock).toHaveBeenCalledTimes(1);
  expect(renamePathMock).toHaveBeenCalledWith("ws-1", "C:\\notes\\old.md", "renamed.md");
  const state = useWorkspaceStore.getState();
  expect(state.treeByMount["C:\\notes"]).toEqual([
    { name: "renamed.md", path: "C:\\notes\\renamed.md", kind: "markdown" },
  ]);
  expect(state.error).toBeNull();
});

test("deleteItem calls deleteToTrash with the exact path and removes the node", async () => {
  const before = [
    { name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" } as const,
    { name: "b.md", path: "C:\\notes\\b.md", kind: "markdown" } as const,
  ];
  setStoreState(treeForMount("C:\\notes", before as unknown as FileTreeNode[]));
  deleteToTrashMock.mockResolvedValue(undefined);
  scanRootMock.mockResolvedValue([{ name: "b.md", path: "C:\\notes\\b.md", kind: "markdown" }]);

  const ok = await deleteItem("C:\\notes\\a.md");

  expect(ok).toBe(true);
  expect(deleteToTrashMock).toHaveBeenCalledTimes(1);
  expect(deleteToTrashMock).toHaveBeenCalledWith("ws-1", "C:\\notes\\a.md");
  const state = useWorkspaceStore.getState();
  expect(state.treeByMount["C:\\notes"]).toEqual([
    { name: "b.md", path: "C:\\notes\\b.md", kind: "markdown" },
  ]);
});

test("moveItem calls movePath with exact args and relocates the node within the mount", async () => {
  const before: FileTreeNode[] = [
    {
      name: "notes",
      path: "C:\\notes\\notes",
      kind: "directory",
      children: [{ name: "a.md", path: "C:\\notes\\notes\\a.md", kind: "markdown" }],
    },
    { name: "archive", path: "C:\\notes\\archive", kind: "directory", children: [] },
  ];
  setStoreState(treeForMount("C:\\notes", before));
  movePathMock.mockResolvedValue("C:\\notes\\archive\\a.md");
  scanRootMock.mockResolvedValue([
    { name: "notes", path: "C:\\notes\\notes", kind: "directory", children: [] },
    {
      name: "archive",
      path: "C:\\notes\\archive",
      kind: "directory",
      children: [{ name: "a.md", path: "C:\\notes\\archive\\a.md", kind: "markdown" }],
    },
  ]);

  const ok = await moveItem("C:\\notes\\notes\\a.md", "C:\\notes\\archive");

  expect(ok).toBe(true);
  expect(movePathMock).toHaveBeenCalledTimes(1);
  expect(movePathMock).toHaveBeenCalledWith(
    "ws-1",
    "C:\\notes\\notes\\a.md",
    "C:\\notes\\archive",
  );
  const state = useWorkspaceStore.getState();
  expect(state.treeByMount["C:\\notes"]).toEqual([
    { name: "notes", path: "C:\\notes\\notes", kind: "directory", children: [] },
    {
      name: "archive",
      path: "C:\\notes\\archive",
      kind: "directory",
      children: [{ name: "a.md", path: "C:\\notes\\archive\\a.md", kind: "markdown" }],
    },
  ]);
});

test("optimistic failure rolls back the prior tree and surfaces the error", async () => {
  const before = treeForMount("C:\\notes", notesTree);
  setStoreState(before);
  createFolderMock.mockRejectedValue(new Error("disk full"));

  const ok = await createItem("folder", "C:\\notes\\notes", "ideas");

  expect(ok).toBe(false);
  const state = useWorkspaceStore.getState();
  expect(state.treeByMount).toEqual(before);
  expect(state.error).toBe("disk full");
});

test("an op on a read-only mount is refused without calling the API", async () => {
  setStoreState(treeForMount("D:\\wiki", [{ name: "b.md", path: "D:\\wiki\\b.md", kind: "markdown" }]));

  const ok = await deleteItem("D:\\wiki\\b.md");

  expect(ok).toBe(false);
  expect(deleteToTrashMock).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().treeByMount["D:\\wiki"]).toEqual([
    { name: "b.md", path: "D:\\wiki\\b.md", kind: "markdown" },
  ]);
});

test("a cross-mount move is refused without calling the API", async () => {
  setStoreState({
    "C:\\notes": [{ name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" }],
    "D:\\wiki": [{ name: "b.md", path: "D:\\wiki\\b.md", kind: "markdown" }],
  });

  const ok = await moveItem("C:\\notes\\a.md", "D:\\wiki");

  expect(ok).toBe(false);
  expect(movePathMock).not.toHaveBeenCalled();
});
