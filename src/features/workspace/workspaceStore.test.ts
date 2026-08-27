import { beforeEach, expect, test, vi } from "vitest";

import type { FileTreeNode } from "../files/fileTypes";
import type { WorkspaceConfig } from "./workspaceConfig";
import {
  createWorkspace as createWorkspaceApi,
  listWorkspaces,
  openWorkspace as openWorkspaceApi,
  scanRoot,
} from "./workspaceApi";
import { useWorkspaceStore } from "./workspaceStore";

vi.mock("./workspaceApi", () => ({
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  openWorkspace: vi.fn(),
  scanRoot: vi.fn(),
}));

const createWorkspaceApiMock = vi.mocked(createWorkspaceApi);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const openWorkspaceApiMock = vi.mocked(openWorkspaceApi);
const scanRootMock = vi.mocked(scanRoot);

function makeWorkspace(overrides: Partial<WorkspaceConfig> = {}): WorkspaceConfig {
  return {
    schemaVersion: 1,
    id: "ws-1",
    name: "Personal",
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
    ],
    exclusions: [".git", "node_modules"],
    ...overrides,
  };
}

const notesTree: FileTreeNode[] = [{ name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" }];
const wikiTree: FileTreeNode[] = [{ name: "b.md", path: "D:\\wiki\\b.md", kind: "markdown" }];
const archiveTree: FileTreeNode[] = [
  { name: "old.md", path: "D:\\archive\\old.md", kind: "markdown" },
];

beforeEach(() => {
  createWorkspaceApiMock.mockReset();
  listWorkspacesMock.mockReset();
  openWorkspaceApiMock.mockReset();
  scanRootMock.mockReset();
  useWorkspaceStore.setState({ workspace: null, treeByMount: {}, error: null });
});

test("initial state has no workspace", () => {
  expect(useWorkspaceStore.getInitialState().workspace).toBeNull();
  expect(useWorkspaceStore.getInitialState().treeByMount).toEqual({});
  expect(useWorkspaceStore.getInitialState().error).toBeNull();
});

test("createWorkspace sets the workspace name and populates the initial mount tree", async () => {
  const created: WorkspaceConfig = { schemaVersion: 1, id: "ws-new", name: "Study", mounts: [] };
  createWorkspaceApiMock.mockResolvedValue(created);
  scanRootMock.mockResolvedValue(notesTree);

  await useWorkspaceStore.getState().createWorkspace("Study", "C:\\notes");

  expect(createWorkspaceApiMock).toHaveBeenCalledTimes(1);
  expect(createWorkspaceApiMock).toHaveBeenCalledWith("Study");
  expect(scanRootMock).toHaveBeenCalledWith(
    "C:\\notes",
    [".git", "node_modules", "dist", "build", "target", ".venv", "venv", ".cache", "coverage"],
  );
  const state = useWorkspaceStore.getState();
  expect(state.workspace?.id).toBe("ws-new");
  expect(state.workspace?.name).toBe("Study");
  expect(state.workspace?.mounts).toEqual([
    { path: "C:\\notes", permission: "read-write" },
  ]);
  expect(state.treeByMount["C:\\notes"]).toEqual(notesTree);
  expect(state.error).toBeNull();
});

test("createWorkspace with a failing scan keeps the prior workspace and records the error", async () => {
  const existing = makeWorkspace();
  useWorkspaceStore.setState({ workspace: existing, treeByMount: { "C:\\notes": notesTree } });
  createWorkspaceApiMock.mockResolvedValue({
    schemaVersion: 1,
    id: "ws-new",
    name: "Study",
    mounts: [],
  });
  scanRootMock.mockRejectedValue(new Error("scan failed"));

  await useWorkspaceStore.getState().createWorkspace("Study", "C:\\notes");

  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(existing);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree });
  expect(state.error).toBe("scan failed");
});

test("openWorkspace scans read-write and read-only mounts and skips excluded ones", async () => {
  const config = makeWorkspace();
  openWorkspaceApiMock.mockResolvedValue(config);
  scanRootMock.mockResolvedValueOnce(notesTree).mockResolvedValueOnce(wikiTree);

  await useWorkspaceStore.getState().openWorkspace("ws-1");

  expect(openWorkspaceApiMock).toHaveBeenCalledTimes(1);
  expect(openWorkspaceApiMock).toHaveBeenCalledWith("ws-1");
  expect(scanRootMock).toHaveBeenCalledTimes(2);
  expect(scanRootMock).toHaveBeenNthCalledWith(1, "C:\\notes", [".git", "node_modules"]);
  expect(scanRootMock).toHaveBeenNthCalledWith(2, "D:\\wiki", [".git", "node_modules"]);
  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(config);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree, "D:\\wiki": wikiTree });
  expect(state.treeByMount["D:\\archive"]).toBeUndefined();
});

test("openWorkspace applies the mount's own exclusions when present", async () => {
  const config = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write", exclusions: ["tmp"] },
      { path: "D:\\wiki", permission: "read-only" },
    ],
  });
  openWorkspaceApiMock.mockResolvedValue(config);
  scanRootMock.mockResolvedValue(notesTree).mockResolvedValue(wikiTree);

  await useWorkspaceStore.getState().openWorkspace("ws-1");

  expect(scanRootMock).toHaveBeenNthCalledWith(1, "C:\\notes", ["tmp"]);
  expect(scanRootMock).toHaveBeenNthCalledWith(2, "D:\\wiki", [".git", "node_modules"]);
});

test("a scanner error on open leaves the workspace untouched and records the error", async () => {
  const existing = makeWorkspace();
  useWorkspaceStore.setState({ workspace: existing, treeByMount: { "C:\\notes": notesTree } });
  const failing = makeWorkspace({ id: "ws-other", name: "Other" });
  openWorkspaceApiMock.mockResolvedValue(failing);
  scanRootMock.mockRejectedValue(new Error("scan failed"));

  await useWorkspaceStore.getState().openWorkspace("ws-other");

  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(existing);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree });
  expect(state.error).toBe("scan failed");
});

test("addMount appends the mount, scans it, and updates treeByMount", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });
  scanRootMock.mockResolvedValue(archiveTree);

  await useWorkspaceStore.getState().addMount("D:\\vault", "read-write");

  expect(scanRootMock).toHaveBeenCalledWith("D:\\vault", [".git", "node_modules"]);
  const state = useWorkspaceStore.getState();
  expect(state.workspace?.mounts).toEqual([
    { path: "C:\\notes", permission: "read-write" },
    { path: "D:\\wiki", permission: "read-only" },
    { path: "D:\\archive", permission: "excluded" },
    { path: "D:\\vault", permission: "read-write" },
  ]);
  expect(state.treeByMount["D:\\vault"]).toEqual(archiveTree);
  expect(state.treeByMount["C:\\notes"]).toEqual(notesTree);
});

test("addMount with a failing scan keeps the prior mounts and trees and records the error", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });
  scanRootMock.mockRejectedValue(new Error("scan failed"));

  await useWorkspaceStore.getState().addMount("D:\\vault", "read-write");

  const state = useWorkspaceStore.getState();
  expect(state.workspace?.mounts).toEqual(config.mounts);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree });
  expect(state.error).toBe("scan failed");
});

test("removeMount removes the mount and its tree", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });

  await useWorkspaceStore.getState().removeMount("D:\\wiki");

  const state = useWorkspaceStore.getState();
  expect(state.workspace?.mounts.map((mount) => mount.path)).toEqual([
    "C:\\notes",
    "D:\\archive",
  ]);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree });
});

test("setMountPermission updates the mount without rescansing", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });

  await useWorkspaceStore.getState().setMountPermission("C:\\notes", "read-only");

  expect(scanRootMock).not.toHaveBeenCalled();
  const state = useWorkspaceStore.getState();
  expect(state.workspace?.mounts[0]).toEqual({ path: "C:\\notes", permission: "read-only" });
  expect(state.workspace?.mounts[1]).toEqual({ path: "D:\\wiki", permission: "read-only" });
  expect(state.treeByMount["C:\\notes"]).toEqual(notesTree);
});

test("refreshTree rescans all read-write and read-only mounts", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  const refreshedNotes: FileTreeNode[] = [
    { name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" },
    { name: "c.md", path: "C:\\notes\\c.md", kind: "markdown" },
  ];
  scanRootMock.mockResolvedValueOnce(refreshedNotes).mockResolvedValueOnce(wikiTree);

  await useWorkspaceStore.getState().refreshTree();

  expect(scanRootMock).toHaveBeenCalledTimes(2);
  expect(scanRootMock).toHaveBeenNthCalledWith(1, "C:\\notes", [".git", "node_modules"]);
  expect(scanRootMock).toHaveBeenNthCalledWith(2, "D:\\wiki", [".git", "node_modules"]);
  const state = useWorkspaceStore.getState();
  expect(state.treeByMount["C:\\notes"]).toEqual(refreshedNotes);
  expect(state.treeByMount["D:\\wiki"]).toEqual(wikiTree);
  expect(state.error).toBeNull();
});

test("refreshTree error keeps the old trees and records the error", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  scanRootMock.mockRejectedValue(new Error("refresh failed"));

  await useWorkspaceStore.getState().refreshTree();

  const state = useWorkspaceStore.getState();
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree, "D:\\wiki": wikiTree });
  expect(state.workspace).toEqual(config);
  expect(state.error).toBe("refresh failed");
});

test("switchToWelcome clears the workspace and trees", () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });

  useWorkspaceStore.getState().switchToWelcome();

  const state = useWorkspaceStore.getState();
  expect(state.workspace).toBeNull();
  expect(state.treeByMount).toEqual({});
  expect(state.error).toBeNull();
});
